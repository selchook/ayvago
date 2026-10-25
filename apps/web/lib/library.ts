'use client';

import { useSyncExternalStore } from 'react';
import {
  EMPTY_LIBRARY,
  clampLibrary,
  isBetter,
  sanitizeLibrary,
  type LibraryState,
  type RecentEntry,
  type ScoreOrder,
} from './library-state';

// The player's library in this browser (recently played, favorites, best scores). It is the
// instant cache the UI reads; when an account is signed in, lib/account/library-sync.ts mirrors
// it to Firestore (users/{uid}/library/state) and every change here is written back there.

const RECENT_KEY = 'ayvago:recent';
const FAVORITES_KEY = 'ayvago:favorites';
const BEST_KEY = 'ayvago:best';
// Before accounts, each best score had its own key (a bare number; every game then sorted desc).
const LEGACY_BEST_PREFIX = 'ayvago:best:';
const CHANGE_EVENT = 'ayvago:library-change';

export type { RecentEntry };

type Change = (state: LibraryState) => LibraryState;
type Writer = (state: LibraryState) => void;

let writer: Writer | null = null;
// Changes made while no account is attached, replayed onto the account's library when it loads.
let unsynced: Change[] = [];

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function migrateLegacyBest(store: Storage, best: LibraryState['best']) {
  let migrated = false;
  for (let i = store.length - 1; i >= 0; i--) {
    const key = store.key(i);
    if (!key?.startsWith(LEGACY_BEST_PREFIX)) continue;
    const score = Number(store.getItem(key));
    const slug = key.slice(LEGACY_BEST_PREFIX.length);
    if (Number.isFinite(score) && !best[slug]) best[slug] = { score, order: 'desc' };
    store.removeItem(key);
    migrated = true;
  }
  if (!migrated) return;
  try {
    store.setItem(BEST_KEY, JSON.stringify(best));
  } catch {
    // Best-effort; the scores stay in memory for this read.
  }
}

export function readLibrary(): LibraryState {
  const store = storage();
  if (!store) return EMPTY_LIBRARY;
  const parse = (key: string) => {
    try {
      return JSON.parse(store.getItem(key) ?? 'null');
    } catch {
      return null;
    }
  };
  const state = sanitizeLibrary({
    favorites: parse(FAVORITES_KEY),
    recent: parse(RECENT_KEY),
    best: parse(BEST_KEY),
  });
  migrateLegacyBest(store, state.best);
  return state;
}

function save(state: LibraryState) {
  const store = storage();
  try {
    store?.setItem(FAVORITES_KEY, JSON.stringify(state.favorites));
    store?.setItem(RECENT_KEY, JSON.stringify(state.recent));
    store?.setItem(BEST_KEY, JSON.stringify(state.best));
  } catch {
    // Storage can be unavailable (private mode, quota); the account copy still gets the change.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function apply(change: Change) {
  const next = clampLibrary(change(readLibrary()));
  save(next);
  if (writer) writer(next);
  else unsynced.push(change);
}

/** Replaces the browser copy (used by the account sync; does not write back). */
export function replaceLibrary(state: LibraryState) {
  save(clampLibrary(state));
}

/**
 * Connects the library to an account: `writer` receives the full state after every change.
 * Returns the changes made since the page loaded without an account, so the sync can replay
 * them onto the account's library.
 */
export function attachLibraryWriter(next: Writer | null): Change[] {
  writer = next;
  const pending = unsynced;
  unsynced = [];
  return pending;
}

export function recordPlay(slug: string): void {
  apply((state) => ({
    ...state,
    recent: [{ slug, playedAt: Date.now() }, ...state.recent.filter((e) => e.slug !== slug)],
  }));
}

export function toggleFavorite(slug: string): boolean {
  const isFavorite = readLibrary().favorites.includes(slug);
  apply((state) => ({
    ...state,
    favorites: isFavorite
      ? state.favorites.filter((s) => s !== slug)
      : [slug, ...state.favorites.filter((s) => s !== slug)],
  }));
  return !isFavorite;
}

// Stores the score if it beats the previous best (higher or lower is better per game).
export function recordBestScore(slug: string, score: number, order: ScoreOrder): boolean {
  const previous = readLibrary().best[slug];
  // A first run that scored nothing is not worth celebrating as a personal best.
  if (!previous && order === 'desc' && score <= 0) return false;
  if (!isBetter(score, previous, order)) return false;
  apply((state) =>
    isBetter(score, state.best[slug], order)
      ? { ...state, best: { ...state.best, [slug]: { score, order } } }
      : state,
  );
  return true;
}

let migrationChecked = false;

function subscribe(onChange: () => void): () => void {
  if (!migrationChecked) {
    migrationChecked = true;
    readLibrary();
  }
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
  const raw = useSyncExternalStore(subscribe, rawSnapshot(BEST_KEY), () => '');
  return parse<LibraryState['best']>(raw, {})[slug]?.score ?? null;
}

export function useBestScores(): LibraryState['best'] {
  const raw = useSyncExternalStore(subscribe, rawSnapshot(BEST_KEY), () => '');
  return parse<LibraryState['best']>(raw, {});
}
