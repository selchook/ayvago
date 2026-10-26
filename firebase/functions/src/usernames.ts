import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { fail } from './errors';
import {
  USERNAME_COOLDOWN_DAYS,
  usernameKey,
  usernameProblem,
} from '../../../packages/shared/src/profile';
import { db } from './admin';
import { playerCard, syncPlayerRows } from './leaderboards';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * reserveUsername({ username }): registered players choose a unique username.
 * - usernames/{key} holds the reservation, key = usernameKey(name) (case and Turkish letters
 *   folded), so look-alikes collide.
 * - One change per USERNAME_COOLDOWN_DAYS; a change that keeps the same key (only letter case or
 *   Turkish letters differ) is always allowed and does not restart the cooldown.
 * Errors carry a machine-readable message the client maps to localized text.
 */
export async function reserveUsername(request: CallableRequest<unknown>) {
  const caller = request.auth;
  if (!caller) throw fail('unauthenticated', 'signed-out');
  if (caller.token.firebase?.sign_in_provider === 'anonymous') {
    throw fail('failed-precondition', 'registered-only');
  }
  if (caller.token.banned === true) throw fail('permission-denied', 'banned');

  const data = request.data as { username?: unknown } | null;
  const username = typeof data?.username === 'string' ? data.username.trim() : '';
  const problem = usernameProblem(username);
  if (problem) throw fail('invalid-argument', problem);

  const key = usernameKey(username);
  const userRef = db().doc(`users/${caller.uid}`);
  const nameRef = db().doc(`usernames/${key}`);

  const result = await db().runTransaction(async (tx) => {
    const [user, reservation] = await Promise.all([tx.get(userRef), tx.get(nameRef)]);
    if (!user.exists) throw fail('failed-precondition', 'no-profile');
    if (reservation.exists && reservation.get('uid') !== caller.uid) {
      throw fail('already-exists', 'taken');
    }

    const previousKey = user.get('usernameKey') as string | undefined;
    const changedAt = user.get('usernameChangedAt') as Timestamp | undefined;
    const sameKey = previousKey === key;
    if (changedAt && !sameKey) {
      const availableAt = changedAt.toMillis() + USERNAME_COOLDOWN_DAYS * DAY_MS;
      if (Date.now() < availableAt) {
        throw fail('resource-exhausted', 'cooldown', { availableAt });
      }
    }

    if (previousKey && !sameKey) tx.delete(db().doc(`usernames/${previousKey}`));
    tx.set(nameRef, { uid: caller.uid, username, reservedAt: FieldValue.serverTimestamp() });
    tx.update(userRef, {
      username,
      usernameKey: key,
      usernameChangedAt: sameKey && changedAt ? changedAt : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { username };
  });
  // Leaderboard rows carry the name; refresh them outside the transaction.
  const profile = await userRef.get();
  await syncPlayerRows(caller.uid, playerCard(profile.data()));
  return result;
}
