import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import {
  NEW_GAME_DAYS,
  computeScores,
  todayScore,
  type CatalogRankings,
  type EngagementInput,
} from '../../../packages/shared/src/ranking';
import { FIXTURE_GAME, SEED_GAMES } from '../../../packages/shared/src/seed-catalog';
import { db } from './admin';
import { leaderboardGames } from './games';
import { dayKey } from './stats';

const DAY_MS = 24 * 60 * 60 * 1000;

type Daily = { started?: number; finished?: number; playSeconds?: number };

/** Days of daily counters each run reads (the ranking window). */
const WINDOW_DAYS = 10;

/**
 * Finished runs of every day up to and including `through` (a day key older than the window),
 * kept on games/{gameId} so the all-time count never re-reads old days (slice 5.27).
 */
export type PlaysArchive = { through: string; finished: number };

function readArchive(value: unknown): PlaysArchive | null {
  const archive = value as Partial<PlaysArchive> | undefined;
  return typeof archive?.through === 'string' &&
    typeof archive.finished === 'number' &&
    Number.isFinite(archive.finished)
    ? { through: archive.through, finished: archive.finished }
    : null;
}

/**
 * Brings a game's archive up to `cutoff`, the newest day outside the window. Daily documents
 * that old are never written again (runs count on the current UTC day), so each day is added
 * once. Cost: nothing while the archive is current, one query a day afterwards (one read, or
 * the documents it returns), and a single read of every older day the first time (backfill).
 * An archive ahead of the cutoff (a clock set back) is rebuilt.
 */
async function updateArchive(
  gameId: string,
  archive: PlaysArchive | null,
  cutoff: string,
): Promise<PlaysArchive> {
  if (archive && archive.through === cutoff) return archive;
  const from = archive && archive.through < cutoff ? archive : null;
  let query = db().collection(`games/${gameId}/daily`).where(FieldPath.documentId(), '<=', cutoff);
  if (from) query = query.where(FieldPath.documentId(), '>', from.through);
  const snapshot = await query.get();
  const added = snapshot.docs.reduce((total, doc) => {
    const finished = doc.get('finished');
    return total + (typeof finished === 'number' && finished > 0 ? finished : 0);
  }, 0);
  return { through: cutoff, finished: (from?.finished ?? 0) + added };
}

function addedAt(gameId: string): number {
  const seed = [FIXTURE_GAME, ...SEED_GAMES].find((game) => game.manifest.id === gameId);
  return seed ? Date.parse(seed.addedAt) : 0;
}

/**
 * Recomputes the ranking scores of every live game from its votes and the last 10 days of play
 * (docs/specs/voting.md §4) and writes them to games/{gameId} and to rankings/catalog, the single
 * document the web app reads for shelves, like percentages and the home spotlight ("trending
 * today", `todayScore` from today's and yesterday's daily counters) and the "Most played" page
 * (`plays7d`, and `playsTotal`: the window plus the archive of older days). Returns the number
 * of games.
 */
export async function recomputeGameScores(now = Date.now()): Promise<number> {
  const games = leaderboardGames();
  const days = Array.from({ length: WINDOW_DAYS }, (_, i) => dayKey(now - i * DAY_MS));
  const cutoff = dayKey(now - WINDOW_DAYS * DAY_MS);
  const inputs: (EngagementInput & {
    todayScore: number;
    archive: PlaysArchive;
    playsTotal: number;
  })[] = await Promise.all(
    games.map(async ({ gameId }) => {
      const [game, ...daily] = await db().getAll(
        db().doc(`games/${gameId}`),
        ...days.map((day) => db().doc(`games/${gameId}/daily/${day}`)),
      );
      const values = daily.map((doc) => (doc!.data() ?? {}) as Daily);
      const sum = (from: number, to: number, key: keyof Daily) =>
        values.slice(from, to).reduce((total, day) => total + (day[key] ?? 0), 0);
      const plays7d = sum(0, 7, 'finished');
      const started7d = sum(0, 7, 'started');
      const likes = (game!.get('likes') as number | undefined) ?? 0;
      const dislikes = (game!.get('dislikes') as number | undefined) ?? 0;
      const archive = await updateArchive(gameId, readArchive(game!.get('playsArchive')), cutoff);
      return {
        gameId,
        likes,
        dislikes,
        plays7d,
        avgSessionSeconds: plays7d > 0 ? sum(0, 7, 'playSeconds') / plays7d : 0,
        completionRate: started7d > 0 ? Math.min(1, plays7d / started7d) : 0,
        plays3d: sum(0, 3, 'finished'),
        playsPrev7d: sum(3, 10, 'finished'),
        isNew: now - addedAt(gameId) < NEW_GAME_DAYS * DAY_MS,
        todayScore: todayScore(
          {
            finishedToday: sum(0, 1, 'finished'),
            finishedYesterday: sum(1, 2, 'finished'),
            likes,
            dislikes,
          },
          now,
        ),
        archive,
        playsTotal: archive.finished + sum(0, WINDOW_DAYS, 'finished'),
      };
    }),
  );

  const scores = computeScores(inputs);
  const rankings: CatalogRankings = { games: {} };
  const batch = db().batch();
  for (const input of inputs) {
    const score = scores.get(input.gameId)!;
    batch.set(
      db().doc(`games/${input.gameId}`),
      {
        ...score,
        todayScore: input.todayScore,
        plays7d: input.plays7d,
        playsTotal: input.playsTotal,
        playsArchive: input.archive,
        scoresUpdatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    rankings.games[input.gameId] = {
      likes: input.likes,
      dislikes: input.dislikes,
      qualityScore: score.qualityScore,
      trendScore: score.trendScore,
      todayScore: input.todayScore,
      plays7d: input.plays7d,
      playsTotal: input.playsTotal,
    };
  }
  batch.set(db().doc('rankings/catalog'), {
    ...rankings,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();
  return inputs.length;
}
