'use client';

import { useEffect, useState } from 'react';
import { firebaseEnabled, loadAuth, loadFirestore } from '@/lib/firebase/client';
import { bestForStart, entryScore } from './best';

// Firestore side of the server best (best.ts holds the rules): one read for GHA_START and a live
// view for the game toolbar. Leaderboard entries are public, so no rule change is needed.

const entryPath = (gameId: string, uid: string) =>
  ['leaderboards', gameId, 'boards', 'all', 'entries', uid] as const;

async function currentUid(): Promise<string | null> {
  const auth = await loadAuth();
  await auth.authStateReady();
  return auth.currentUser?.uid ?? null;
}

/** Reads the player's all-time best for a game (one document read). */
async function readServerBest(gameId: string, uid: string): Promise<number | null> {
  const [db, { doc, getDoc }] = await Promise.all([loadFirestore(), import('firebase/firestore')]);
  return entryScore((await getDoc(doc(db, ...entryPath(gameId, uid)))).data());
}

/** The player's server best for GHA_START; see bestForStart for the three outcomes. */
export function startBest(gameId: string): Promise<number | null | undefined> {
  return bestForStart({
    enabled: firebaseEnabled,
    uid: currentUid,
    read: (uid) => readServerBest(gameId, uid),
  });
}

/**
 * Live server best for the toolbar: a number, null when the player has no score (or nobody is
 * signed in), undefined while unknown or when the server cannot answer (the caller then falls
 * back to the browser library). `uid` is undefined while the account is still loading.
 */
export function useServerBest(
  gameId: string,
  uid: string | null | undefined,
): number | null | undefined {
  const [best, setBest] = useState<{ key: string; value: number | null } | null>(null);
  const key = `${gameId}/${uid ?? ''}`;

  useEffect(() => {
    if (!uid || !firebaseEnabled()) return;
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;
    Promise.all([loadFirestore(), import('firebase/firestore')])
      .then(([db, { doc, onSnapshot }]) => {
        if (cancelled) return;
        unsubscribe = onSnapshot(
          doc(db, ...entryPath(gameId, uid)),
          (snapshot) => setBest({ key, value: entryScore(snapshot.data()) }),
          (error) => {
            console.warn('[leaderboard] best unavailable', error);
            setBest(null);
          },
        );
      })
      .catch(() => setBest(null));
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [gameId, uid, key]);

  if (!firebaseEnabled()) return undefined;
  if (uid === null) return null;
  if (!uid) return undefined;
  return best && best.key === key ? best.value : undefined;
}
