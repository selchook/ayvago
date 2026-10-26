'use client';

import { periodKey, type BoardDoc, type BoardKey, type BoardRow } from '@ayvago/shared';
import { useEffect, useState } from 'react';
import { firebaseEnabled, loadFirestore } from '@/lib/firebase/client';
import { SCORE_RECORDED_EVENT } from './session';

// Reading leaderboards: the board document holds the cached top 100, so a view costs one read;
// a player outside the list sees their own rank from one count query.

export type BoardView =
  { status: 'disabled' | 'loading' | 'error' } | { status: 'ready'; top: BoardRow[] };

/** Live view of a board. A season board still holding last week's list shows as empty. */
export function useBoard(gameId: string, board: BoardKey): BoardView {
  const [view, setView] = useState<BoardView>(() =>
    firebaseEnabled() ? { status: 'loading' } : { status: 'disabled' },
  );

  useEffect(() => {
    if (!firebaseEnabled()) return;
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;
    setView({ status: 'loading' });
    Promise.all([loadFirestore(), import('firebase/firestore')])
      .then(([db, { doc, onSnapshot }]) => {
        if (cancelled) return;
        unsubscribe = onSnapshot(
          doc(db, 'leaderboards', gameId, 'boards', board),
          (snapshot) => {
            const data = snapshot.data() as BoardDoc | undefined;
            const current = data && data.periodKey === periodKey(board, Date.now());
            setView({ status: 'ready', top: current ? data.top : [] });
          },
          (error) => {
            console.warn('[leaderboard] board unavailable', error);
            setView({ status: 'error' });
          },
        );
      })
      .catch(() => setView({ status: 'error' }));
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [gameId, board]);

  return view;
}

export type PlayerStanding = { rank: number; score: number; continued: boolean };

/**
 * The signed-in player's rank and best score on a board in the current period, or null when they
 * have no score there. Refreshes after the player records a new score in this game.
 */
export function usePlayerStanding(
  gameId: string,
  board: BoardKey,
  uid: string | null,
  order: 'asc' | 'desc',
): PlayerStanding | null {
  const [standing, setStanding] = useState<PlayerStanding | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    function onRecorded(event: Event) {
      if ((event as CustomEvent<{ gameId: string }>).detail.gameId === gameId) {
        setVersion((v) => v + 1);
      }
    }
    window.addEventListener(SCORE_RECORDED_EVENT, onRecorded);
    return () => window.removeEventListener(SCORE_RECORDED_EVENT, onRecorded);
  }, [gameId]);

  useEffect(() => {
    setStanding(null);
    if (!uid || !firebaseEnabled()) return;
    let cancelled = false;
    (async () => {
      const db = await loadFirestore();
      const { collection, doc, getCountFromServer, getDoc, query, where } =
        await import('firebase/firestore');
      const entry = await getDoc(doc(db, 'leaderboards', gameId, 'boards', board, 'entries', uid));
      const data = entry.data() as
        | {
            score: number;
            achievedAt: { toMillis(): number };
            periodKey: string;
            continued?: boolean;
          }
        | undefined;
      const period = periodKey(board, Date.now());
      if (!data || data.periodKey !== period) return;
      const entries = collection(db, 'leaderboards', gameId, 'boards', board, 'entries');
      const inPeriod = where('periodKey', '==', period);
      const [better, tied] = await Promise.all([
        getCountFromServer(
          query(entries, inPeriod, where('score', order === 'desc' ? '>' : '<', data.score)),
        ),
        getCountFromServer(
          query(
            entries,
            inPeriod,
            where('score', '==', data.score),
            where('achievedAt', '<', data.achievedAt),
          ),
        ),
      ]);
      if (cancelled) return;
      setStanding({
        rank: better.data().count + tied.data().count + 1,
        score: data.score,
        continued: data.continued === true,
      });
    })().catch((error) => console.warn('[leaderboard] rank unavailable', error));
    return () => {
      cancelled = true;
    };
  }, [gameId, board, uid, order, version]);

  return standing;
}

/** Time left in the current weekly season, refreshed every minute. */
export function useSeasonCountdown(end: (now: number) => number): number | null {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setLeft(Math.max(0, end(Date.now()) - Date.now()));
    tick();
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, [end]);
  return left;
}
