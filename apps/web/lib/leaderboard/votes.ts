'use client';

import type { NegativeReason, VoteValue } from '@ayvago/shared';
import { useEffect, useState } from 'react';
import { firebaseEnabled, loadFirestore, loadFunctions } from '@/lib/firebase/client';

// Votes (docs/specs/voting.md): written through the castVote function, read live from
// games/{gameId} (public counters) and games/{gameId}/votes/{uid} (the player's own vote).

export type VoteCounts = { likes: number; dislikes: number };

/** Live like/dislike counters of a game; null until loaded or when Firebase is off. */
export function useVoteCounts(gameId: string): VoteCounts | null {
  const [counts, setCounts] = useState<VoteCounts | null>(null);
  useEffect(() => {
    if (!firebaseEnabled()) return;
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;
    Promise.all([loadFirestore(), import('firebase/firestore')])
      .then(([db, { doc, onSnapshot }]) => {
        if (cancelled) return;
        unsubscribe = onSnapshot(
          doc(db, 'games', gameId),
          (snapshot) =>
            setCounts({
              likes: (snapshot.get('likes') as number | undefined) ?? 0,
              dislikes: (snapshot.get('dislikes') as number | undefined) ?? 0,
            }),
          () => setCounts(null),
        );
      })
      .catch(() => setCounts(null));
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [gameId]);
  return counts;
}

/** The signed-in player's vote on a game (0 when none). */
export function useMyVote(
  gameId: string,
  uid: string | null,
): [VoteValue | 0, (v: VoteValue | 0) => void] {
  const [vote, setVote] = useState<VoteValue | 0>(0);
  useEffect(() => {
    setVote(0);
    if (!uid || !firebaseEnabled()) return;
    let cancelled = false;
    (async () => {
      const db = await loadFirestore();
      const { doc, getDoc } = await import('firebase/firestore');
      const snapshot = await getDoc(doc(db, 'games', gameId, 'votes', uid));
      if (!cancelled) setVote((snapshot.get('value') as VoteValue | undefined) ?? 0);
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [gameId, uid]);
  return [vote, setVote];
}

export type VoteOutcome =
  { ok: true } | { ok: false; reason: 'not-eligible' | 'rate-limited' | 'offensive' | 'generic' };

export async function castVote(
  gameId: string,
  value: VoteValue | 0,
  feedback: { reasons?: NegativeReason[]; comment?: string } = {},
): Promise<VoteOutcome> {
  try {
    const [functions, { httpsCallable }] = await Promise.all([
      loadFunctions(),
      import('firebase/functions'),
    ]);
    await httpsCallable(functions, 'castVote')({ gameId, value, ...feedback });
    return { ok: true };
  } catch (error) {
    const reason = (error as { details?: { reason?: string } }).details?.reason;
    return {
      ok: false,
      reason:
        reason === 'not-eligible' || reason === 'rate-limited' || reason === 'offensive'
          ? reason
          : 'generic',
    };
  }
}
