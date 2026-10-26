import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { db } from './admin';
import { fail } from './errors';
import { requireAdmin } from './roles';

// App Check rollout (docs/plan/phase-2.md §2.4). The callable runtime verifies App Check tokens
// whenever the web app sends one; config/appCheck decides what happens to calls without one:
//   monitor  accepted (the default); each score session records whether it was verified
//   enforce  refused with "app-check"
// Admins switch the mode in the admin panel, where the verified share of recent sessions is shown,
// so turning it on or back off needs no deploy.

export type AppCheckMode = 'monitor' | 'enforce';

const configRef = () => db().doc('config/appCheck');

/** Enforcing needs this share of verified sessions over the window, unless forced. */
export const READY_SHARE = 0.95;
const READY_MIN_SESSIONS = 20;
const WINDOW_MS = 24 * 60 * 60 * 1000;

// Each function instance re-reads the mode at most once a minute (always in the emulator).
const CACHE_MS = process.env.FUNCTIONS_EMULATOR === 'true' ? 0 : 60_000;
let cached: { mode: AppCheckMode; at: number } | null = null;

export async function appCheckMode(): Promise<AppCheckMode> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.mode;
  const mode = (await configRef().get()).get('mode') === 'enforce' ? 'enforce' : 'monitor';
  cached = { mode, at: Date.now() };
  return mode;
}

/** The signed-in, non-banned caller of a player-facing callable (guests included). */
export async function requirePlayer(request: CallableRequest<unknown>) {
  const caller = request.auth;
  if (!caller) throw fail('unauthenticated', 'signed-out');
  if (caller.token.banned === true) throw fail('permission-denied', 'banned');
  if (!request.app && (await appCheckMode()) === 'enforce') {
    throw fail('failed-precondition', 'app-check');
  }
  return caller;
}

export type AppCheckStatus = {
  mode: AppCheckMode;
  /** Score sessions started in the last 24 hours, and how many carried a verified token. */
  sessions: number;
  verified: number;
  ready: boolean;
};

export async function appCheckStatus(now = Date.now()): Promise<AppCheckStatus> {
  const recent = db()
    .collection('sessions')
    .where('startedAt', '>', Timestamp.fromMillis(now - WINDOW_MS));
  const [mode, all, verified] = await Promise.all([
    appCheckMode(),
    recent.count().get(),
    recent.where('appCheck', '==', true).count().get(),
  ]);
  const sessions = all.data().count;
  const ok = verified.data().count;
  return {
    mode,
    sessions,
    verified: ok,
    ready: sessions >= READY_MIN_SESSIONS && ok / sessions >= READY_SHARE,
  };
}

/** getAppCheckStatus() → AppCheckStatus (admins). */
export async function getAppCheckStatus(request: CallableRequest<unknown>) {
  requireAdmin(request);
  return appCheckStatus();
}

/**
 * setAppCheckMode({ mode, force? }) (admins). Enforcing is refused while fewer than 95% of the
 * last day's sessions were verified (or there were fewer than 20), unless `force` is set.
 */
export async function setAppCheckMode(request: CallableRequest<unknown>) {
  const admin = requireAdmin(request);
  const data = (request.data ?? {}) as { mode?: unknown; force?: unknown };
  if (data.mode !== 'monitor' && data.mode !== 'enforce') throw fail('invalid-argument', 'mode');
  if (data.mode === 'enforce' && data.force !== true) {
    const status = await appCheckStatus();
    if (!status.ready) throw fail('failed-precondition', 'not-ready', status);
  }
  await configRef().set({
    mode: data.mode,
    updatedBy: admin.uid,
    updatedAt: FieldValue.serverTimestamp(),
  });
  cached = null;
  logger.warn('App Check mode changed', { mode: data.mode, by: admin.uid });
  return appCheckStatus();
}
