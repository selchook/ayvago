import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db } from './admin';

// Play statistics from score sessions (never from the client):
//   users/{uid}/stats/{gameId}      { plays, playSeconds, lastPlayedAt }  vote eligibility, profile
//   games/{gameId}/daily/{YYYY-MM-DD} { started, finished, playSeconds }   catalog ranking

/** Longest run counted towards play time, so a forgotten tab does not inflate the stats. */
const MAX_COUNTED_RUN_MS = 3 * 60 * 60 * 1000;

export const dayKey = (time: number) => new Date(time).toISOString().slice(0, 10);

const dailyRef = (gameId: string, time: number) =>
  db().doc(`games/${gameId}/daily/${dayKey(time)}`);

export const statsRef = (uid: string, gameId: string) => db().doc(`users/${uid}/stats/${gameId}`);

export async function countStart(gameId: string, now: number) {
  await dailyRef(gameId, now).set({ started: FieldValue.increment(1) }, { merge: true });
}

/** Records a finished run; called for every run that reached GHA_END, accepted or not. */
export async function countFinish(uid: string, gameId: string, runMs: number, now: number) {
  const seconds = Math.round(Math.min(Math.max(runMs, 0), MAX_COUNTED_RUN_MS) / 1000);
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
