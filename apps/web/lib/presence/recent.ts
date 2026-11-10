'use client';

// Recent players (docs/adr/0021-site-presence-recent-players.md): users/{uid}/recentPlayers in
// Firestore, written by the server when a table starts or a room gets its second player. The
// lists read them once, then follow the site presence of the players they show, one entry each.
import { readRecentPlayer, type RecentPlayer, type SitePresence } from '@ayvago/shared';
import { useEffect, useState } from 'react';
import { loadFirestore } from '@/lib/firebase/client';
import { watchSitePresence } from './site';

/** The player's most recent players, newest first. */
export async function loadRecentPlayers(uid: string, max: number): Promise<RecentPlayer[]> {
  const db = await loadFirestore();
  const { collection, getDocs, limit, orderBy, query } = await import('firebase/firestore');
  const snapshot = await getDocs(
    query(
      collection(db, 'users', uid, 'recentPlayers'),
      orderBy('lastPlayedAt', 'desc'),
      limit(max),
    ),
  );
  return snapshot.docs
    .map((doc) => readRecentPlayer(doc.id, doc.data()))
    .filter((player): player is RecentPlayer => player !== null);
}

export type RecentList = { players: RecentPlayer[] | null; failed: boolean };

/** Loads the list once per player (and again when `reload` changes). */
export function useRecentPlayers(uid: string | null, max: number, reload = 0): RecentList {
  const [list, setList] = useState<RecentList>({ players: null, failed: false });
  useEffect(() => {
    if (!uid) {
      setList({ players: null, failed: false });
      return;
    }
    let cancelled = false;
    loadRecentPlayers(uid, max)
      .then((players) => !cancelled && setList({ players, failed: false }))
      .catch((error) => {
        console.warn('[presence] recent players failed', error);
        if (!cancelled) setList({ players: [], failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [uid, max, reload]);
  return list;
}

/**
 * Live site presence of the given players (only those on screen). A uid maps to its presence,
 * null while offline, and is missing until its first answer.
 */
export function usePresenceOf(uids: string[]): Record<string, SitePresence | null> {
  const [presence, setPresence] = useState<Record<string, SitePresence | null>>({});
  const key = [...new Set(uids)].sort().join(',');
  useEffect(() => {
    const list = key ? key.split(',') : [];
    if (list.length === 0) return;
    let cancelled = false;
    const stops: Array<() => void> = [];
    for (const uid of list) {
      watchSitePresence(uid, (entry) => {
        if (!cancelled) setPresence((current) => ({ ...current, [uid]: entry }));
      })
        .then((stop) => (cancelled ? stop() : stops.push(stop)))
        .catch(() => !cancelled && setPresence((current) => ({ ...current, [uid]: null })));
    }
    return () => {
      cancelled = true;
      stops.forEach((stop) => stop());
    };
  }, [key]);
  return presence;
}
