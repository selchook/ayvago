'use client';

import { EMPTY_PROGRESS, readProgress, type ProgressSummary } from '@ayvago/shared';
import { useEffect, useState } from 'react';
import { firebaseEnabled, loadFirestore } from '@/lib/firebase/client';

// The signed-in player's progress summary (users/{uid}/progress/summary), written by the score
// functions only and readable by its owner (docs/adr/0016-achievements-and-xp.md).

/** Live progress of `uid`; null while loading, the empty summary when nothing was earned yet. */
export function useProgressSummary(uid: string | null): ProgressSummary | null {
  const [summary, setSummary] = useState<{ uid: string; data: ProgressSummary } | null>(null);
  useEffect(() => {
    if (!uid || !firebaseEnabled()) return;
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;
    Promise.all([loadFirestore(), import('firebase/firestore')])
      .then(([db, { doc, onSnapshot }]) => {
        if (cancelled) return;
        unsubscribe = onSnapshot(
          doc(db, 'users', uid, 'progress', 'summary'),
          (snapshot) => setSummary({ uid, data: readProgress(snapshot.data()) }),
          (error) => {
            console.warn('[progress] summary not loaded', error);
            setSummary({ uid, data: EMPTY_PROGRESS });
          },
        );
      })
      .catch(() => setSummary({ uid, data: EMPTY_PROGRESS }));
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [uid]);
  return summary && summary.uid === uid ? summary.data : null;
}
