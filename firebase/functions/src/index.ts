// Ayvago Cloud Functions. Region and limits apply to every function in this codebase.
import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from './admin';
import { fail } from './errors';
import { deleteInactiveGuests, mergeGuestAccount as mergeGuest } from './guests';
import { closeSeasons, playerCard, syncPlayerRows } from './leaderboards';
import { finishSession as finish, startSession as start } from './sessions';
import { reserveUsername as reserve } from './usernames';

setGlobalOptions({ region: 'europe-west1', maxInstances: 10 });

/** Guests unused for this long are deleted with their data (docs/specs/accounts.md §2). */
const GUEST_RETENTION_DAYS = 30;
/** Finished and abandoned score sessions are kept this long for review, then deleted. */
const SESSION_RETENTION_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export const reserveUsername = onCall(reserve);

export const mergeGuestAccount = onCall(mergeGuest);

export const startSession = onCall(start);

export const finishSession = onCall(finish);

/**
 * syncLeaderboardProfile({ remove? }): copies the caller's current name and avatar into their
 * leaderboard rows (after an avatar change), or removes the rows (before account deletion).
 */
export const syncLeaderboardProfile = onCall(async (request) => {
  if (!request.auth) throw fail('unauthenticated', 'signed-out');
  const uid = request.auth.uid;
  const remove = (request.data as { remove?: unknown } | null)?.remove === true;
  const card = remove ? null : playerCard((await db().doc(`users/${uid}`).get()).data());
  return { boards: await syncPlayerRows(uid, card) };
});

export const cleanupGuests = onSchedule(
  { schedule: 'every day 03:30', timeZone: 'Europe/Istanbul' },
  async () => {
    const cutoff = Date.now() - GUEST_RETENTION_DAYS * DAY_MS;
    const deleted = await deleteInactiveGuests(cutoff);
    logger.info('Inactive guests deleted', { deleted });
  },
);

export const cleanupSessions = onSchedule(
  { schedule: 'every day 04:00', timeZone: 'Europe/Istanbul' },
  async () => {
    const old = db()
      .collection('sessions')
      .where('startedAt', '<', Timestamp.fromMillis(Date.now() - SESSION_RETENTION_DAYS * DAY_MS))
      .limit(400);
    let deleted = 0;
    for (;;) {
      const page = await old.get();
      if (page.empty) break;
      const batch = db().batch();
      page.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
      deleted += page.size;
    }
    logger.info('Old score sessions deleted', { deleted });
  },
);

/** Weekly seasons end on Monday at 09:00 UTC (docs/specs/leaderboards.md §8). */
export const closeLeaderboardSeason = onSchedule(
  { schedule: '0 9 * * 1', timeZone: 'Etc/UTC' },
  async () => {
    const archived = await closeSeasons();
    logger.info('Leaderboard season closed', { archived });
  },
);
