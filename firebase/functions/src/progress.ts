import { Timestamp } from 'firebase-admin/firestore';
import {
  applyRun,
  mergeProgress,
  readProgress,
  type ProgressSummary,
} from '../../../packages/shared/src/progress';
import { db } from './admin';
import { liveCategories, type LeaderboardGame } from './games';
import type { BoardOutcome, ScoreHook } from './leaderboards';

// Achievements, XP and levels (docs/adr/0016-achievements-and-xp.md). Awarded only here, inside
// the transaction that accepts a score in finishSession; flagged and rejected sessions earn
// nothing. users/{uid}/progress/summary is written by the functions only, and xp and level are
// mirrored onto users/{uid} for the header.

export const progressRef = (uid: string) => db().doc(`users/${uid}/progress/summary`);

/** What finishSession returns about progress. */
export type ProgressResult = {
  xpGained: number;
  xp: number;
  level: number;
  levelUp: boolean;
  unlocked: string[];
};

function toDoc(summary: ProgressSummary) {
  return {
    ...summary,
    achievements: Object.fromEntries(
      Object.entries(summary.achievements).map(([id, time]) => [id, Timestamp.fromMillis(time)]),
    ),
  };
}

function write(
  tx: FirebaseFirestore.Transaction,
  uid: string,
  summary: ProgressSummary,
  profileExists: boolean,
) {
  tx.set(progressRef(uid), toDoc(summary));
  // Only an existing profile gets the copy: the client creates profiles with a fixed key set.
  if (profileExists) {
    tx.update(db().doc(`users/${uid}`), { xp: summary.xp, level: summary.level });
  }
}

/**
 * The score hook that awards progress for an accepted session. `onResult` receives what the
 * session earned (on every transaction attempt; the last one is the one that committed).
 */
export function awardProgress(options: {
  uid: string;
  game: LeaderboardGame;
  seconds: number;
  now: number;
  onResult: (result: ProgressResult) => void;
}): ScoreHook {
  const { uid, game, seconds, now, onResult } = options;
  return async (tx) => {
    const [stored, profile] = await Promise.all([
      tx.get(progressRef(uid)),
      tx.get(db().doc(`users/${uid}`)),
    ]);
    return (outcomes: BoardOutcome[]) => {
      const all = outcomes.find((outcome) => outcome.board === 'all');
      const season = outcomes.find((outcome) => outcome.board === 'season');
      const award = applyRun(
        readProgress(stored.data()),
        {
          gameId: game.gameId,
          categories: game.categories,
          seconds,
          // A beaten previous best; the first score of a game earns the first-play bonus instead.
          personalBest: all !== undefined && all.improved && all.previous !== null,
          weeklyPlaceBefore: season?.previousPlace ?? null,
          weeklyPlace: season?.place ?? null,
          now,
        },
        { categories: liveCategories() },
      );
      write(tx, uid, award.summary, profile.exists);
      onResult({
        xpGained: award.xpGained,
        xp: award.summary.xp,
        level: award.summary.level,
        levelUp: award.levelUp,
        unlocked: award.unlocked,
      });
    };
  };
}

/** Guest merge: the guest's progress joins the account's. The guest's own copy is deleted later. */
export async function moveProgress(guestUid: string, uid: string) {
  await db().runTransaction(async (tx) => {
    const [guest, account, profile] = await Promise.all([
      tx.get(progressRef(guestUid)),
      tx.get(progressRef(uid)),
      tx.get(db().doc(`users/${uid}`)),
    ]);
    if (!guest.exists) return;
    const merged = mergeProgress(readProgress(account.data()), readProgress(guest.data()));
    write(tx, uid, merged, profile.exists);
  });
}
