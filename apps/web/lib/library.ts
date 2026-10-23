'use client';

import { useSyncExternalStore } from 'react';

// Per-browser player library (recently played, favorites, local best scores).
// Temporary until accounts land: the same data moves to Firestore (users/{uid}/...) in Phase 1,
// and these keys are migrated on first sign-in.

const RECENT_KEY = 'ayvago:recent';
const FAVORITES_KEY = 'ayvago:favorites';
const BEST_PREFIX = 'ayvago:best:';
const RECENT_LIMIT = 20;
const CHANGE_EVENT = 'ayvago:library-change';

export type RecentEntry = { slug: string; playedAt: number };

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable (private mode, quota); the library is best-effort.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function recordPlay(slug: string): void {
  const recent = read<RecentEntry[]>(RECENT_KEY, []).filter((entry) => entry.slug !== slug);
  write(RECENT_KEY, [{ slug, playedAt: Date.now() }, ...recent].slice(0, RECENT_LIMIT));
}

export function toggleFavorite(slug: string): boolean {
  const favorites = read<string[]>(FAVORITES_KEY, []);
  const isFavorite = favorites.includes(slug);
  write(FAVORITES_KEY, isFavorite ? favorites.filter((s) => s !== slug) : [slug, ...favorites]);
  return !isFavorite;
}

// Stores the score if it beats the previous local best (higher or lower is better per game).
export function recordBestScore(slug: string, score: number, order: 'asc' | 'desc'): boolean {
  const key = BEST_PREFIX + slug;
  const previous = read<number | null>(key, null);
  const improved = previous === null || (order === 'desc' ? score > previous : score < previous);
  if (improved) write(key, score);
  return improved;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

// Snapshots must be referentially stable, so hooks read the raw string and parse it in render.
function rawSnapshot(key: string): () => string {
  return () => {
    try {
      return window.localStorage.getItem(key) ?? '';
    } catch {
      return '';
    }
  };
}

function parse<T>(raw: string, fallback: T): T {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function useRecent(): RecentEntry[] {
  const raw = useSyncExternalStore(subscribe, rawSnapshot(RECENT_KEY), () => '');
  return parse<RecentEntry[]>(raw, []);
}

export function useFavorites(): string[] {
  const raw = useSyncExternalStore(subscribe, rawSnapshot(FAVORITES_KEY), () => '');
  return parse<string[]>(raw, []);
}

export function useBestScore(slug: string): number | null {
  const raw = useSyncExternalStore(subscribe, rawSnapshot(BEST_PREFIX + slug), () => '');
  return parse<number | null>(raw, null);
}
