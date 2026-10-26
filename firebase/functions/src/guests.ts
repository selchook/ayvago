import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { fail } from './errors';
import { logger } from 'firebase-functions';
import {
  EMPTY_LIBRARY,
  mergeLibraries,
  sanitizeLibrary,
} from '../../../packages/shared/src/library';
import { auth, db } from './admin';
import { moveScores, syncPlayerRows } from './leaderboards';

/** Firestore documents that belong to a player; deleted together with the account. */
export async function deletePlayerData(uid: string) {
  await syncPlayerRows(uid, null);
  const key = (await db().doc(`users/${uid}`).get()).get('usernameKey') as string | undefined;
  const batch = db().batch();
  batch.delete(db().doc(`users/${uid}/library/state`));
  batch.delete(db().doc(`users/${uid}`));
  if (key) batch.delete(db().doc(`usernames/${key}`));
  await batch.commit();
}

/**
 * mergeGuestAccount({ guestIdToken }): after a guest signs in with a Google account that already
 * exists, the client calls this as that account with the guest's ID token (taken before switching)
 * as proof of ownership. The guest's library joins the account's and the guest account is deleted.
 */
export async function mergeGuestAccount(request: CallableRequest<unknown>) {
  const caller = request.auth;
  if (!caller) throw fail('unauthenticated', 'signed-out');
  if (caller.token.firebase?.sign_in_provider === 'anonymous') {
    throw fail('failed-precondition', 'registered-only');
  }
  const data = request.data as { guestIdToken?: unknown } | null;
  if (typeof data?.guestIdToken !== 'string') throw fail('invalid-argument', 'token');

  let guestUid: string;
  try {
    const decoded = await auth().verifyIdToken(data.guestIdToken);
    if (decoded.firebase.sign_in_provider !== 'anonymous') {
      throw fail('failed-precondition', 'not-a-guest');
    }
    guestUid = decoded.uid;
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw fail('permission-denied', 'invalid-token');
  }
  if (guestUid === caller.uid) return { merged: false };

  // The token may be up to an hour old; make sure the account is still an unlinked guest.
  const guest = await auth()
    .getUser(guestUid)
    .catch(() => null);
  if (!guest) return { merged: false };
  if (guest.providerData.length > 0) throw fail('failed-precondition', 'not-a-guest');

  const guestLibraryRef = db().doc(`users/${guestUid}/library/state`);
  const libraryRef = db().doc(`users/${caller.uid}/library/state`);
  await db().runTransaction(async (tx) => {
    const [guestLibrary, library] = await Promise.all([
      tx.get(guestLibraryRef),
      tx.get(libraryRef),
    ]);
    if (!guestLibrary.exists) return;
    const merged = mergeLibraries(
      library.exists ? sanitizeLibrary(library.data()) : EMPTY_LIBRARY,
      sanitizeLibrary(guestLibrary.data()),
    );
    tx.set(libraryRef, { ...merged, updatedAt: FieldValue.serverTimestamp() });
  });
  await moveScores(guestUid, caller.uid);
  await deletePlayerData(guestUid);
  await auth().deleteUser(guestUid);
  logger.info('Merged guest into account', { guestUid, uid: caller.uid });
  return { merged: true };
}

/**
 * Deletes guest (anonymous) accounts that have not been active since `cutoffMs`, with their data.
 * Registered accounts are never touched.
 */
export async function deleteInactiveGuests(cutoffMs: number): Promise<number> {
  let deleted = 0;
  let pageToken: string | undefined;
  do {
    const page = await auth().listUsers(1000, pageToken);
    pageToken = page.pageToken;
    const stale = page.users.filter((user) => {
      if (user.providerData.length > 0) return false;
      const { lastRefreshTime, lastSignInTime, creationTime } = user.metadata;
      const lastActive = Date.parse(lastRefreshTime ?? lastSignInTime ?? creationTime);
      return Number.isFinite(lastActive) && lastActive < cutoffMs;
    });
    for (const user of stale) await deletePlayerData(user.uid);
    if (stale.length > 0) {
      const result = await auth().deleteUsers(stale.map((user) => user.uid));
      deleted += result.successCount;
      if (result.failureCount > 0) logger.warn('Some guests could not be deleted', result.errors);
    }
  } while (pageToken);
  return deleted;
}
