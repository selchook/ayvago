// The player's library: favorites, recently played games and personal best scores.
// Pure data helpers shared by the browser cache (lib/library.ts) and the Firestore sync
// (lib/account/library-sync.ts). Best scores are player-reported; leaderboards will rely on
// server-validated sessions instead.

export type RecentEntry = { slug: string; playedAt: number };
export type ScoreOrder = 'asc' | 'desc';
export type BestEntry = { score: number; order: ScoreOrder };

export type LibraryState = {
  favorites: string[];
  recent: RecentEntry[];
  best: Record<string, BestEntry>;
};

// Firestore rules enforce the same limits on users/{uid}/library/state.
export const RECENT_LIMIT = 20;
export const FAVORITES_LIMIT = 200;
export const BEST_LIMIT = 300;

export const EMPTY_LIBRARY: LibraryState = { favorites: [], recent: [], best: {} };

export function isBetter(score: number, previous: BestEntry | undefined, order: ScoreOrder) {
  if (!previous) return true;
  return order === 'desc' ? score > previous.score : score < previous.score;
}

/** Keeps every list within the limits, newest first. */
export function clampLibrary(state: LibraryState): LibraryState {
  const recent = [...state.recent].sort((a, b) => b.playedAt - a.playedAt).slice(0, RECENT_LIMIT);
  const best = Object.fromEntries(Object.entries(state.best).slice(0, BEST_LIMIT));
  return { favorites: state.favorites.slice(0, FAVORITES_LIMIT), recent, best };
}

/**
 * Combines two libraries without losing anything: favorites are united (first library's order
 * first), each game keeps its latest play, and each best score keeps the better result.
 * Used once per browser and account, when a guest's or signed-out library first meets the
 * account's library.
 */
export function mergeLibraries(first: LibraryState, second: LibraryState): LibraryState {
  const favorites = [...first.favorites];
  for (const slug of second.favorites) if (!favorites.includes(slug)) favorites.push(slug);

  const latest = new Map<string, number>();
  for (const { slug, playedAt } of [...first.recent, ...second.recent]) {
    latest.set(slug, Math.max(latest.get(slug) ?? 0, playedAt));
  }
  const recent = [...latest].map(([slug, playedAt]) => ({ slug, playedAt }));

  const best: Record<string, BestEntry> = { ...first.best };
  for (const [slug, entry] of Object.entries(second.best)) {
    if (isBetter(entry.score, best[slug], best[slug]?.order ?? entry.order)) best[slug] = entry;
  }
  return clampLibrary({ favorites, recent, best });
}

/** Reads a library from untrusted JSON (browser storage or Firestore), dropping bad entries. */
export function sanitizeLibrary(value: unknown): LibraryState {
  const data = (typeof value === 'object' && value) || {};
  const { favorites, recent, best } = data as Record<string, unknown>;
  const isSlug = (s: unknown): s is string =>
    typeof s === 'string' && s.length > 0 && s.length <= 64;
  return clampLibrary({
    favorites: Array.isArray(favorites) ? favorites.filter(isSlug) : [],
    recent: Array.isArray(recent)
      ? recent.filter(
          (e): e is RecentEntry =>
            typeof e === 'object' && e !== null && isSlug(e.slug) && Number.isFinite(e.playedAt),
        )
      : [],
    best: Object.fromEntries(
      Object.entries(typeof best === 'object' && best ? best : {}).filter(
        (entry): entry is [string, BestEntry] => {
          const [slug, e] = entry as [string, Partial<BestEntry> | null];
          return (
            isSlug(slug) &&
            typeof e === 'object' &&
            e !== null &&
            Number.isFinite(e.score) &&
            (e.order === 'asc' || e.order === 'desc')
          );
        },
      ),
    ),
  });
}

export function sameLibrary(a: LibraryState, b: LibraryState): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
