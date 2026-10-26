import type { CallableRequest } from 'firebase-functions/v2/https';
import { fail } from './errors';

/**
 * App Check is verified by the callable runtime whenever the client sends a token; this switch
 * decides whether calls without a valid token are refused. Keep it false until the web app ships
 * the App Check provider and the console shows nearly all sessions verified
 * (docs/setup/phase-2.md), then flip it in a commit.
 */
export const APP_CHECK_ENFORCED = false;

/** The signed-in, non-banned caller of a player-facing callable (guests included). */
export function signedInPlayer(request: CallableRequest<unknown>) {
  const caller = request.auth;
  if (!caller) throw fail('unauthenticated', 'signed-out');
  if (caller.token.banned === true) throw fail('permission-denied', 'banned');
  if (APP_CHECK_ENFORCED && !request.app) throw fail('failed-precondition', 'app-check');
  return caller;
}
