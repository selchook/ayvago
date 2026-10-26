import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import {
  BOARD_KEYS,
  isBetterScore,
  periodKey,
  upsertRow,
  type BoardKey,
  type BoardRow,
} from '../../../packages/shared/src/leaderboard';
import type { ScoreOrder } from '../../../packages/shared/src/library';
import { db } from './admin';
import { leaderboardGames, type LeaderboardGame } from './games';

// Board documents and entries (docs/specs/leaderboards.md §9):
//   leaderboards/{gameId}/boards/{season|all}              { periodKey, order, top[100], updatedAt }
//   leaderboards/{gameId}/boards/{season|all}/entries/{uid} { score, achievedAt, periodKey, continued, sessionId }
//   leaderboards/{gameId}/seasons/{seasonKey}               { periodKey, order, top, closedAt }
// Entries only ever hold accepted scores; flagged scores wait in scoreFlags/ for review.

export const boardRef = (gameId: string, board: BoardKey) =>
  db().doc(`leaderboards/${gameId}/boards/${board}`);
export const entryRef = (gameId: string, board: BoardKey, uid: string) =>
  db().doc(`leaderboards/${gameId}/boards/${board}/entries/${uid}`);
const archiveRef = (gameId: string, season: string) =>
  db().doc(`leaderboards/${gameId}/seasons/${season}`);

type Entry = { score: number; achievedAt: Timestamp; periodKey: string };

/** The public part of a profile shown on boards. */
export type PlayerCard = Pick<BoardRow, 'username' | 'avatarId' | 'isGuest'>;

export function playerCard(data: FirebaseFirestore.DocumentData | undefined): PlayerCard {
  return {
    username: typeof data?.username === 'string' ? data.username : '?',
    avatarId: typeof data?.avatarId === 'string' ? data.avatarId : null,
    isGuest: data?.isGuest === true,
  };
}

function rows(data: FirebaseFirestore.DocumentData | undefined): BoardRow[] {
  return Array.isArray(data?.top) ? (data.top as BoardRow[]) : [];
}

export type BoardOutcome = {
  board: BoardKey;
  improved: boolean;
  best: number;
  /** The player's previous best in this period, if any. */
  previous: number | null;
  achievedAt: number;
};

/**
 * Writes an accepted score: for each board, the player's entry and the cached top list change
 * only when the score beats their best in the current period. A season board still holding last
 * week's list is archived and reset here, so it never depends on the weekly job having run.
 */
export async function applyScore(options: {
  game: LeaderboardGame;
  uid: string;
  score: number;
  continued: boolean;
  sessionId: string;
  now: number;
  /** When the score was reached; defaults to `now` (an approved flag keeps its original time). */
  achievedAt?: number;
  /** Boards to write; defaults to both. */
  boards?: readonly BoardKey[];
}): Promise<BoardOutcome[]> {
  const { game, uid, score, continued, sessionId, now } = options;
  const achievedAt = options.achievedAt ?? now;
  const keys = options.boards ?? BOARD_KEYS;
  const order = game.scoring.order;
  return db().runTransaction(async (tx) => {
    const profile = await tx.get(db().doc(`users/${uid}`));
    const card = playerCard(profile.data());
    const reads = await Promise.all(
      keys.map(async (board) => {
        const [boardDoc, entry] = await Promise.all([
          tx.get(boardRef(game.gameId, board)),
          tx.get(entryRef(game.gameId, board, uid)),
        ]);
        return { board, boardDoc, entry };
      }),
    );
    const archives = await Promise.all(
      reads.map(async ({ board, boardDoc }) => {
        const stale = staleSeason(board, boardDoc.data(), now);
        return stale
          ? { board, stale, exists: (await tx.get(archiveRef(game.gameId, stale))).exists }
          : null;
      }),
    );

    return reads.map(({ board, boardDoc, entry }, i): BoardOutcome => {
      const period = periodKey(board, now);
      const archive = archives[i];
      let top = rows(boardDoc.data());
      if (archive) {
        if (!archive.exists) writeArchive(tx, game.gameId, archive.stale, boardDoc.data(), order);
        top = [];
      }
      const old = entry.data() as Entry | undefined;
      const previous = old && old.periodKey === period ? old.score : null;
      const improved = previous === null || isBetterScore(score, previous, order);
      if (!improved) {
        if (archive) writeBoard(tx, game.gameId, board, period, order, top);
        return {
          board,
          improved,
          best: previous,
          previous,
          achievedAt: old!.achievedAt.toMillis(),
        };
      }
      tx.set(entryRef(game.gameId, board, uid), {
        score,
        achievedAt: Timestamp.fromMillis(achievedAt),
        periodKey: period,
        continued,
        sessionId,
      });
      top = upsertRow(top, { uid, ...card, score, achievedAt, continued }, order);
      writeBoard(tx, game.gameId, board, period, order, top);
      return { board, improved, best: score, previous, achievedAt };
    });
  });
}

function staleSeason(
  board: BoardKey,
  data: FirebaseFirestore.DocumentData | undefined,
  now: number,
): string | null {
  if (board !== 'season' || typeof data?.periodKey !== 'string') return null;
  return data.periodKey === periodKey('season', now) ? null : data.periodKey;
}

function writeBoard(
  tx: FirebaseFirestore.Transaction,
  gameId: string,
  board: BoardKey,
  period: string,
  order: ScoreOrder,
  top: BoardRow[],
) {
  tx.set(boardRef(gameId, board), {
    periodKey: period,
    order,
    top,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

function writeArchive(
  tx: FirebaseFirestore.Transaction,
  gameId: string,
  season: string,
  data: FirebaseFirestore.DocumentData | undefined,
  order: ScoreOrder,
) {
  tx.set(archiveRef(gameId, season), {
    periodKey: season,
    order,
    top: rows(data),
    closedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * 1-based rank of a score among the period's entries: players with a better score, plus players
 * with the same score reached earlier, plus one. Uses count() queries (composite indexes in
 * firestore.indexes.json).
 */
export async function rankOf(
  gameId: string,
  board: BoardKey,
  order: ScoreOrder,
  score: number,
  achievedAt: number,
  now = Date.now(),
): Promise<number> {
  const entries = db()
    .collection(`leaderboards/${gameId}/boards/${board}/entries`)
    .where('periodKey', '==', periodKey(board, now));
  const [better, tied] = await Promise.all([
    entries
      .where('score', order === 'desc' ? '>' : '<', score)
      .count()
      .get(),
    entries
      .where('score', '==', score)
      .where('achievedAt', '<', Timestamp.fromMillis(achievedAt))
      .count()
      .get(),
  ]);
  return better.data().count + tied.data().count + 1;
}

/** Board documents that contain a row for `uid`, found through the player's entries. */
async function boardsWithPlayer(
  uid: string,
): Promise<{ game: LeaderboardGame; board: BoardKey }[]> {
  const targets = leaderboardGames().flatMap((game) =>
    BOARD_KEYS.map((board) => ({ game, board, ref: entryRef(game.gameId, board, uid) })),
  );
  if (targets.length === 0) return [];
  const snapshots = await db().getAll(...targets.map((target) => target.ref));
  return targets.filter((_, i) => snapshots[i]!.exists);
}

/**
 * Keeps the player's rows in the cached top lists in step with their profile: a new username or
 * avatar is copied into every row; `null` (account deleted) removes the rows and the entries.
 */
export async function syncPlayerRows(uid: string, card: PlayerCard | null): Promise<number> {
  const boards = await boardsWithPlayer(uid);
  for (const { game, board } of boards) {
    const ref = boardRef(game.gameId, board);
    await db().runTransaction(async (tx) => {
      const top = rows((await tx.get(ref)).data());
      if (top.some((row) => row.uid === uid)) {
        tx.update(ref, {
          top: card
            ? top.map((row) => (row.uid === uid ? { ...row, ...card } : row))
            : top.filter((row) => row.uid !== uid),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      if (!card) tx.delete(entryRef(game.gameId, board, uid));
    });
  }
  return boards.length;
}

/**
 * Guest merge: the guest's best scores in the current periods move to the account when they are
 * better than the account's own. The guest's rows are removed afterwards with syncPlayerRows.
 */
export async function moveScores(guestUid: string, uid: string, now = Date.now()) {
  const boards = await boardsWithPlayer(guestUid);
  for (const { game, board } of boards) {
    const order = game.scoring.order;
    const period = periodKey(board, now);
    await db().runTransaction(async (tx) => {
      const [guestEntry, entry, boardDoc, profile] = await Promise.all([
        tx.get(entryRef(game.gameId, board, guestUid)),
        tx.get(entryRef(game.gameId, board, uid)),
        tx.get(boardRef(game.gameId, board)),
        tx.get(db().doc(`users/${uid}`)),
      ]);
      const moved = guestEntry.data() as (Entry & { continued?: boolean }) | undefined;
      if (!moved || moved.periodKey !== period || boardDoc.get('periodKey') !== period) return;
      const own = entry.data() as Entry | undefined;
      if (own && own.periodKey === period && !isBetterScore(moved.score, own.score, order)) return;
      tx.set(entry.ref, guestEntry.data()!);
      const row: BoardRow = {
        uid,
        ...playerCard(profile.data()),
        score: moved.score,
        achievedAt: moved.achievedAt.toMillis(),
        continued: moved.continued === true,
      };
      tx.update(boardDoc.ref, {
        top: upsertRow(rows(boardDoc.data()), row, order),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  }
}

/**
 * Weekly job (Monday 09:00 UTC): archives every season board still holding last week's list,
 * starts the new season and deletes entries from finished seasons. Returns the archived count.
 */
export async function closeSeasons(now = Date.now()): Promise<number> {
  const current = periodKey('season', now);
  let archived = 0;
  for (const game of leaderboardGames()) {
    const ref = boardRef(game.gameId, 'season');
    const closed = await db().runTransaction(async (tx) => {
      const boardDoc = await tx.get(ref);
      const stale = staleSeason('season', boardDoc.data(), now);
      if (!stale) return false;
      const archive = await tx.get(archiveRef(game.gameId, stale));
      if (!archive.exists) {
        writeArchive(tx, game.gameId, stale, boardDoc.data(), game.scoring.order);
      }
      writeBoard(tx, game.gameId, 'season', current, game.scoring.order, []);
      return true;
    });
    if (closed) archived++;
    await deleteOldEntries(game.gameId, current);
  }
  return archived;
}

async function deleteOldEntries(gameId: string, current: string) {
  const old = db()
    .collection(`leaderboards/${gameId}/boards/season/entries`)
    .where('periodKey', '<', current)
    .limit(400);
  for (;;) {
    const page = await old.get();
    if (page.empty) return;
    const batch = db().batch();
    page.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    logger.info('Deleted finished season entries', { gameId, count: page.size });
  }
}
