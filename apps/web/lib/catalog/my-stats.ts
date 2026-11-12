'use client';

import { useEffect, useState } from 'react';
import { useAccount } from '@/lib/account/store';
import { loadFirestore } from '@/lib/firebase/client';
import type { MyStat } from './most-played';

// The player's own play stats for the "Yours" tab of the Most played page (slice 5.27):
// users/{uid}/stats, written by the server only and readable by its owner (firestore.rules).
// One read per game the player has played, only when the tab is shown, never on other pages.

export type MyStatsState = { status: 'loading' | 'ready'; stats: MyStat[] };

const millis = (value: unknown): number =>
  value && typeof (value as { toMillis?: unknown }).toMillis === 'function'
    ? (value as { toMillis: () => number }).toMillis()
    : 0;

const count = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;

async function readMyStats(uid: string): Promise<MyStat[]> {
  const db = await loadFirestore();
  const { collection, getDocs } = await import('firebase/firestore');
  const snapshot = await getDocs(collection(db, 'users', uid, 'stats'));
  return snapshot.docs.map((doc) => ({
    gameId: doc.id,
    // Finished solo runs and online matches (tables, rooms) both count as the player's plays.
    plays: count(doc.get('plays')) + count(doc.get('onlinePlays')),
    lastPlayedAt: millis(doc.get('lastPlayedAt')),
  }));
}

/**
 * The signed-in player's (guest or account) stats; `ready` with none when nobody is signed in or
 * Firebase is off, so the tab falls back to this browser's recently played games.
 */
export function useMyStats(enabled: boolean): MyStatsState {
  const account = useAccount();
  const uid = account.status === 'signedIn' ? account.uid : null;
  const settled = account.status === 'disabled' || account.status === 'signedOut';
  const [loaded, setLoaded] = useState<{ uid: string; stats: MyStat[] } | null>(null);

  useEffect(() => {
    if (!enabled || !uid || loaded?.uid === uid) return;
    let cancelled = false;
    readMyStats(uid)
      .catch((error) => {
        console.error('[most-played] stats read failed', error);
        return [] as MyStat[];
      })
      .then((stats) => {
        if (!cancelled) setLoaded({ uid, stats });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, uid, loaded?.uid]);

  if (settled) return { status: 'ready', stats: [] };
  if (uid && loaded?.uid === uid) return { status: 'ready', stats: loaded.stats };
  return { status: 'loading', stats: [] };
}
