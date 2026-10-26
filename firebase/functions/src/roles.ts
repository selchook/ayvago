import type { CallableRequest } from 'firebase-functions/v2/https';
import { fail } from './errors';

/** The caller of an admin-panel callable; needs the `admin` custom claim. */
export function requireAdmin(request: CallableRequest<unknown>) {
  const caller = request.auth;
  if (!caller) throw fail('unauthenticated', 'signed-out');
  if (caller.token.admin !== true) throw fail('permission-denied', 'admin-only');
  return caller;
}
