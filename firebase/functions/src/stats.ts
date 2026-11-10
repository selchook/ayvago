import { FieldValue, Timestamp, type Transaction, type WriteBatch } from 'firebase-admin/firestore';
import type { Match } from '../../../packages/shared/src/presence';
import { db } from './admin';
import { leaderboardGame } from './games';

// Play statistics, written by the server only (never from the client):
//
//   users/{uid}/stats/{gameId}
//     plays, playSeconds   finished solo runs (GHA_END) and their time   vote eligibility
//     lastPlayedAt         the last start, finish, abandoned run or online match
//     starts               solo runs started (slice 5.22)
//     abandonedSeconds     time of solo runs left without GHA_END (slice 5.22)
//     onlinePlays          online matches (tables, rooms) the player sat in (slice 5.22)
//     lastOnlineMatch      key of the last online match counted, so a trigger repeat counts once
//
//   games/{gameId}/daily/{YYYY-MM-DD}
//     started, finished, playSeconds   solo runs                     catalog ranking
//     abandonedSeconds                 left solo runs (slice 5.22)   report only
//     onlineStarted                    online matches (slice 5.22)   report only
//
// The fields added by slice 5.22 never feed leaderboards, XP, achievements, vote eligibility or
// the catalog ranking (docs/adr/0022-started-abandoned-and-online-play.md). Online play time is
// not counted: the server cannot tell when an online match ends.

/** Longest run counted towards play time, so a forgotten tab does not inflate the stats. */
export const MAX_COUNTED_RUN_MS = 3 * 60 * 60 * 1000;

export const dayKey = (time: number) => new Date(time).toISOString().slice(0, 10);

const dailyRef = (gameId: string, time: number) =>
  db().doc(`games/${gameId}/daily/${dayKey(time)}`);

export const statsRef = (uid: string, gameId: string) => db().doc(`users/${uid}/stats/${gameId}`);

/** Whole seconds of a run length, capped at MAX_COUNTED_RUN_MS. */
export const countedSeconds = (ms: number) =>
  Math.round(Math.min(Math.max(ms, 0), MAX_COUNTED_RUN_MS) / 1000);

/** A run started: added to the batch that creates its score session. */
export function countStart(batch: WriteBatch, uid: string, gameId: string, now: number) {
  batch.set(dailyRef(gameId, now), { started: FieldValue.increment(1) }, { merge: true });
  batch.set(
    statsRef(uid, gameId),
    { starts: FieldValue.increment(1), lastPlayedAt: Timestamp.fromMillis(now) },
    { merge: true },
  );
}

/**
 * Records a finished run; called for every run that reached GHA_END, accepted or not, practice
 * runs (difficulty Easy, docs/adr/0018-difficulty-easy-is-practice.md) included.
 */
export async function countFinish(uid: string, gameId: string, runMs: number, now: number) {
  const seconds = countedSeconds(runMs);
  const batch = db().batch();
  batch.set(
    statsRef(uid, gameId),
    {
      plays: FieldValue.increment(1),
      playSeconds: FieldValue.increment(seconds),
      lastPlayedAt: Timestamp.fromMillis(now),
    },
    { merge: true },
  );
  batch.set(
    dailyRef(gameId, now),
    { finished: FieldValue.increment(1), playSeconds: FieldValue.increment(seconds) },
    { merge: true },
  );
  await batch.commit();
}

/**
 * A solo run left without GHA_END (abandonSession): its time only, never a play. Written in the
 * transaction that closes the session, so a run is counted once, as finished or as abandoned.
 */
export function countAbandon(
  tx: Transaction,
  uid: string,
  gameId: string,
  seconds: number,
  now: number,
) {
  tx.set(
    statsRef(uid, gameId),
    { abandonedSeconds: FieldValue.increment(seconds), lastPlayedAt: Timestamp.fromMillis(now) },
    { merge: true },
  );
  tx.set(
    dailyRef(gameId, now),
    { abandonedSeconds: FieldValue.increment(seconds) },
    { merge: true },
  );
}

/**
 * An online match started (a table turned `playing`, a room got its second player): one online
 * play for every human in it and one match for the game's day. Never ranked. A repeated event
 * for the same match (its key, as for recent players) counts nothing. Games outside the live
 * catalog are skipped, so a made-up table cannot add games to the stats. Returns the players
 * counted.
 */
export async function countOnlineMatch(match: Match, now = Date.now()): Promise<number> {
  if (match.players.length === 0 || !leaderboardGame(match.gameId)) return 0;
  const refs = match.players.map((player) => statsRef(player.uid, match.gameId));
  return db().runTransaction(async (tx) => {
    const docs = await tx.getAll(...refs);
    let counted = 0;
    docs.forEach((doc, index) => {
      if (doc.get('lastOnlineMatch') === match.key) return;
      tx.set(
        refs[index]!,
        {
          onlinePlays: FieldValue.increment(1),
          lastPlayedAt: Timestamp.fromMillis(now),
          lastOnlineMatch: match.key,
        },
        { merge: true },
      );
      counted++;
    });
    // Every player is counted in the same transaction, so a match that counts nobody new was
    // already counted as a whole.
    if (counted > 0) {
      tx.set(
        dailyRef(match.gameId, now),
        { onlineStarted: FieldValue.increment(1) },
        { merge: true },
      );
    }
    return counted;
  });
}
