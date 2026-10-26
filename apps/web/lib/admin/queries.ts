'use client';

import { NEGATIVE_REASONS, usernameKey, type NegativeReason } from '@ayvago/shared';
import { loadFirestore, loadFunctions } from '@/lib/firebase/client';

// Admin panel data (docs/plan/phase-2.md §2.3). Reads go straight to Firestore under admin-only
// rules; changes go through the reviewScoreFlag and setPlayerBan functions.

export type ScoreFlag = {
  sessionId: string;
  uid: string;
  username: string;
  isGuest: boolean;
  gameId: string;
  score: number;
  durationMs: number;
  serverDurationMs: number;
  continued: boolean;
  reasons: string[];
  achievedAt: number;
};

export async function pendingFlags(max = 50): Promise<ScoreFlag[]> {
  const db = await loadFirestore();
  const { collection, getDocs, limit, orderBy, query, where } = await import('firebase/firestore');
  const snapshot = await getDocs(
    query(
      collection(db, 'scoreFlags'),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc'),
      limit(max),
    ),
  );
  return snapshot.docs.map((doc) => {
    const d = doc.data();
    return {
      sessionId: doc.id,
      uid: d.uid,
      username: d.username ?? '?',
      isGuest: d.isGuest === true,
      gameId: d.gameId,
      score: d.score,
      durationMs: d.durationMs ?? 0,
      serverDurationMs: d.serverDurationMs ?? 0,
      continued: d.continued === true,
      reasons: Array.isArray(d.reasons) ? d.reasons : [],
      achievedAt: d.achievedAt?.toMillis?.() ?? 0,
    };
  });
}

async function call<T>(name: string, data: unknown): Promise<T> {
  const [functions, { httpsCallable }] = await Promise.all([
    loadFunctions(),
    import('firebase/functions'),
  ]);
  return (await httpsCallable<unknown, T>(functions, name)(data)).data;
}

export const reviewFlag = (sessionId: string, action: 'approve' | 'reject' | 'ban') =>
  call<{ status: string }>('reviewScoreFlag', { sessionId, action });

export const setBan = (uid: string, banned: boolean) =>
  call<{ banned: boolean }>('setPlayerBan', { uid, banned });

export type GameNumbers = {
  likes: number;
  dislikes: number;
  plays7d: number;
  qualityScore: number | null;
  trendScore: number | null;
};

export async function gameNumbers(gameIds: string[]): Promise<Record<string, GameNumbers>> {
  const db = await loadFirestore();
  const { doc, getDoc } = await import('firebase/firestore');
  const docs = await Promise.all(gameIds.map((id) => getDoc(doc(db, 'games', id))));
  return Object.fromEntries(
    docs.map((snapshot, i) => {
      const d = snapshot.data() ?? {};
      return [
        gameIds[i]!,
        {
          likes: d.likes ?? 0,
          dislikes: d.dislikes ?? 0,
          plays7d: d.plays7d ?? 0,
          qualityScore: typeof d.qualityScore === 'number' ? d.qualityScore : null,
          trendScore: typeof d.trendScore === 'number' ? d.trendScore : null,
        },
      ];
    }),
  );
}

export type Feedback = {
  /** Feedback forms sent in the period, and how often each reason was picked. */
  count: number;
  reasons: Record<NegativeReason, number>;
  comments: { text: string; at: number }[];
};

/** Negative feedback of a game over the last `days` days, with the latest comments. */
export async function gameFeedback(gameId: string, days = 14): Promise<Feedback> {
  const db = await loadFirestore();
  const { collection, doc, getDoc, getDocs, limit, orderBy, query, where } =
    await import('firebase/firestore');
  const keys = Array.from({ length: days }, (_, i) =>
    new Date(Date.now() - i * 24 * 3600 * 1000).toISOString().slice(0, 10),
  );
  const [daily, votes] = await Promise.all([
    Promise.all(keys.map((key) => getDoc(doc(db, 'games', gameId, 'feedback', key)))),
    getDocs(
      query(
        collection(db, 'games', gameId, 'votes'),
        where('value', '==', -1),
        orderBy('updatedAt', 'desc'),
        limit(50),
      ),
    ),
  ]);
  const reasons = Object.fromEntries(NEGATIVE_REASONS.map((r) => [r, 0])) as Record<
    NegativeReason,
    number
  >;
  let count = 0;
  for (const snapshot of daily) {
    const d = snapshot.data();
    if (!d) continue;
    count += d.count ?? 0;
    for (const reason of NEGATIVE_REASONS) reasons[reason] += d.reasons?.[reason] ?? 0;
  }
  const comments = votes.docs
    .map((vote) => vote.data())
    .filter((vote) => typeof vote.comment === 'string' && vote.comment)
    .slice(0, 20)
    .map((vote) => ({ text: vote.comment as string, at: vote.updatedAt?.toMillis?.() ?? 0 }));
  return { count, reasons, comments };
}

export type PlayerSummary = {
  uid: string;
  username: string;
  isGuest: boolean;
  banned: boolean;
  createdAt: number | null;
};

/** Finds players by exact username (any case for registered names) or uid. */
export async function findPlayers(text: string): Promise<PlayerSummary[]> {
  const term = text.trim();
  if (!term) return [];
  const db = await loadFirestore();
  const { collection, doc, getDoc, getDocs, limit, query, where } =
    await import('firebase/firestore');
  const uids = new Set<string>();
  const [byName, reservation, byUid] = await Promise.all([
    getDocs(query(collection(db, 'users'), where('username', '==', term), limit(10))),
    getDoc(doc(db, 'usernames', usernameKey(term))),
    /^[A-Za-z0-9]{20,40}$/.test(term) ? getDoc(doc(db, 'users', term)) : Promise.resolve(null),
  ]);
  byName.docs.forEach((d) => uids.add(d.id));
  if (reservation.exists()) uids.add(reservation.get('uid') as string);
  if (byUid?.exists()) uids.add(byUid.id);
  const profiles = await Promise.all([...uids].map((uid) => getDoc(doc(db, 'users', uid))));
  return profiles
    .filter((p) => p.exists())
    .map((p) => {
      const d = p.data()!;
      return {
        uid: p.id,
        username: d.username ?? '?',
        isGuest: d.isGuest === true,
        banned: d.banned === true,
        createdAt: d.createdAt?.toMillis?.() ?? null,
      };
    });
}

/** Mirrors AppCheckStatus in firebase/functions/src/appcheck.ts. */
export type AppCheckStatus = {
  mode: 'monitor' | 'enforce';
  sessions: number;
  verified: number;
  ready: boolean;
};

export const appCheckStatus = () => call<AppCheckStatus>('getAppCheckStatus', {});

export const setAppCheckMode = (mode: 'monitor' | 'enforce', force = false) =>
  call<AppCheckStatus>('setAppCheckMode', { mode, force });
