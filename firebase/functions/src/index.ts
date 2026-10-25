// Ayvago Cloud Functions. Region and limits apply to every function in this codebase.
import { logger } from 'firebase-functions';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { deleteInactiveGuests, mergeGuestAccount as mergeGuest } from './guests';
import { reserveUsername as reserve } from './usernames';

setGlobalOptions({ region: 'europe-west1', maxInstances: 10 });

/** Guests unused for this long are deleted with their data (docs/specs/accounts.md §2). */
const GUEST_RETENTION_DAYS = 30;

export const reserveUsername = onCall(reserve);

export const mergeGuestAccount = onCall(mergeGuest);

export const cleanupGuests = onSchedule(
  { schedule: 'every day 03:30', timeZone: 'Europe/Istanbul' },
  async () => {
    const cutoff = Date.now() - GUEST_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const deleted = await deleteInactiveGuests(cutoff);
    logger.info('Inactive guests deleted', { deleted });
  },
);
