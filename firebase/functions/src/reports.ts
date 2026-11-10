import type { DocumentSnapshot } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import {
  buildPlayReport,
  type DailyInput,
  type PlayReport,
  type ProfileInput,
  type StatsInput,
} from '../../../packages/shared/src/play-report';
import { auth, db } from './admin';
import { requireAdmin } from './roles';

// "Players and plays" report for the admin panel (Phase 5 slices 5.16 and 5.22), computed on
// demand.
//
// Reads (one run), with P = players with stats, R = registered (non-guest) profiles,
// S = stats documents, D = daily documents (games × days played):
//   users where isGuest == true, count()        1 read per 1000 guest profiles
//   users where isGuest == false, two fields    R reads
//   collectionGroup('stats')                    S reads
//   getAll of the other players' profiles       P − (players among R) reads
//   collectionGroup('daily')                    D reads
//   Auth getUsers, 100 uids per call            R / 100 calls (no Firestore cost)
// With a few hundred players this is a few thousand reads, well under a cent per run.

const PROFILE_FIELDS = ['username', 'isGuest'];
const GET_ALL_CHUNK = 300;
const AUTH_CHUNK = 100;

const millis = (value: unknown): number | null =>
  value && typeof (value as { toMillis?: unknown }).toMillis === 'function'
    ? (value as { toMillis: () => number }).toMillis()
    : null;

const username = (snapshot: DocumentSnapshot) => {
  const name = snapshot.get('username');
  return typeof name === 'string' && name ? name : null;
};

/** users/{uid}/stats/{gameId} documents (other "stats" collections are skipped). */
async function readStats(): Promise<StatsInput[]> {
  const snapshot = await db().collectionGroup('stats').get();
  const out: StatsInput[] = [];
  for (const doc of snapshot.docs) {
    const user = doc.ref.parent.parent;
    if (!user || user.parent.id !== 'users' || user.parent.parent !== null) continue;
    out.push({
      uid: user.id,
      gameId: doc.id,
      plays: doc.get('plays'),
      playSeconds: doc.get('playSeconds'),
      starts: doc.get('starts'),
      abandonedSeconds: doc.get('abandonedSeconds'),
      onlinePlays: doc.get('onlinePlays'),
      lastPlayedAt: millis(doc.get('lastPlayedAt')),
    });
  }
  return out;
}

/** games/{gameId}/daily/{day} documents. */
async function readDaily(): Promise<DailyInput[]> {
  const snapshot = await db().collectionGroup('daily').get();
  const out: DailyInput[] = [];
  for (const doc of snapshot.docs) {
    const parentGame = doc.ref.parent.parent;
    if (!parentGame || parentGame.parent.id !== 'games' || parentGame.parent.parent !== null) {
      continue;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(doc.id)) continue;
    out.push({
      gameId: parentGame.id,
      day: doc.id,
      started: doc.get('started'),
      finished: doc.get('finished'),
      playSeconds: doc.get('playSeconds'),
      abandonedSeconds: doc.get('abandonedSeconds'),
      onlineStarted: doc.get('onlineStarted'),
    });
  }
  return out;
}

/** The uids among `uids` that signed in with Google (Firebase Auth provider data). */
async function googleUids(uids: string[]): Promise<Set<string>> {
  const google = new Set<string>();
  for (let i = 0; i < uids.length; i += AUTH_CHUNK) {
    const result = await auth().getUsers(uids.slice(i, i + AUTH_CHUNK).map((uid) => ({ uid })));
    for (const user of result.users) {
      if (user.providerData.some((p) => p.providerId === 'google.com')) google.add(user.uid);
    }
  }
  return google;
}

export async function playReport(now = Date.now()): Promise<PlayReport> {
  const users = db().collection('users');
  const [guestCount, registeredDocs, stats, daily] = await Promise.all([
    users.where('isGuest', '==', true).count().get(),
    users
      .where('isGuest', '==', false)
      .select(...PROFILE_FIELDS)
      .get(),
    readStats(),
    readDaily(),
  ]);

  const registered = registeredDocs.docs.map((doc) => doc.id);
  const google = await googleUids(registered);
  const profiles = new Map<string, ProfileInput>();
  for (const doc of registeredDocs.docs) {
    profiles.set(doc.id, {
      username: username(doc),
      kind: google.has(doc.id) ? 'google' : 'registered',
    });
  }

  // The remaining players are guests, or have no profile any more ("unknown").
  const others = [...new Set(stats.map((s) => s.uid))].filter((uid) => !profiles.has(uid));
  for (let i = 0; i < others.length; i += GET_ALL_CHUNK) {
    const refs = others.slice(i, i + GET_ALL_CHUNK).map((uid) => users.doc(uid));
    const snapshots = await db().getAll(...refs, { fieldMask: PROFILE_FIELDS });
    for (const snapshot of snapshots) {
      if (!snapshot.exists) continue;
      profiles.set(snapshot.id, {
        username: username(snapshot),
        kind: snapshot.get('isGuest') === true ? 'guest' : 'registered',
      });
    }
  }

  const report = buildPlayReport({
    now,
    stats,
    daily,
    profiles,
    profileTotals: {
      google: google.size,
      registered: registered.length - google.size,
      guest: guestCount.data().count,
    },
  });
  logger.info('Play report built', {
    statsDocs: stats.length,
    dailyDocs: daily.length,
    registeredProfiles: registered.length,
    profileReads: others.length,
    players: report.playerCount,
  });
  return report;
}

/** getPlayReport() → PlayReport (admins). Read-only. */
export async function getPlayReport(request: CallableRequest<unknown>) {
  const admin = requireAdmin(request);
  logger.info('Play report requested', { by: admin.uid });
  try {
    return await playReport();
  } catch (err) {
    logger.error('Play report failed', err);
    // Only admins get here, and the reason lets them see what broke without opening the logs.
    const e = err as { code?: unknown; message?: unknown };
    const reason = String(e.message ?? err).slice(0, 300);
    throw new HttpsError('internal', `play-report: ${reason}`, { code: String(e.code ?? '') });
  }
}
