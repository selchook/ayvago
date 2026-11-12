import type { CatalogRankings } from '@ayvago/shared';
import type { CatalogGame } from './index';

// The home spotlight carousel (slice 5.17, ten slides since slice 5.27): a mix of the games
// trending today, this week's trend, the editors' featured games and the newest games, never
// the same game twice. Pure, so it is unit-tested.

export const SPOTLIGHT_SIZE = 10;
/** At most this many slides for each ranked reason, so the mix keeps room for the others. */
export const SPOTLIGHT_TODAY = 3;
export const SPOTLIGHT_WEEK = 3;

/**
 * Why a game is in the spotlight, which picks its badge: trending today (ranked #1, #2, …),
 * popular this week, featured (the editors' picks) or new on Ayvago (the newest-first fill).
 */
export type SpotlightReason = 'today' | 'week' | 'featured' | 'new';

export type SpotlightPick = {
  game: CatalogGame;
  reason: SpotlightReason;
  /** Rank within its reason, from 1: "#2 Trending today". */
  rank: number;
};

type Score = 'todayScore' | 'trendScore';

/** Live games with a positive score, best first; ties keep catalog order. */
function scored(games: CatalogGame[], rankings: CatalogRankings, by: Score): CatalogGame[] {
  return games
    .map((game, index) => ({ game, index, score: rankings.games[game.manifest.id]?.[by] ?? 0 }))
    .filter(({ game, score }) => game.status === 'live' && score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ game }) => game);
}

/** Newest first by `addedAt`; ties keep catalog order. */
function newest(games: CatalogGame[]): CatalogGame[] {
  return games
    .map((game, index) => ({ game, index }))
    .sort((a, b) => (b.game.addedAt ?? '').localeCompare(a.game.addedAt ?? '') || a.index - b.index)
    .map(({ game }) => game);
}

/**
 * Picks the spotlight games, in this order and never the same game twice:
 * 1. up to {@link SPOTLIGHT_TODAY} live games by `todayScore` (> 0);
 * 2. up to {@link SPOTLIGHT_WEEK} by the weekly `trendScore` (> 0);
 * 3. the featured games;
 * 4. the newest live games (by `addedAt`) to fill the rest.
 * Without rankings (local builds, previews, a failed read) it starts at the featured games.
 */
export function pickSpotlight(
  games: CatalogGame[],
  featured: CatalogGame[],
  rankings: CatalogRankings | null,
  size = SPOTLIGHT_SIZE,
): SpotlightPick[] {
  const picks: SpotlightPick[] = [];
  const taken = new Set<string>();
  const add = (candidates: CatalogGame[], reason: SpotlightReason, limit = size) => {
    let added = 0;
    for (const game of candidates) {
      if (picks.length >= size || added >= limit) return;
      if (game.status !== 'live' || taken.has(game.slug)) continue;
      taken.add(game.slug);
      added++;
      picks.push({ game, reason, rank: added });
    }
  };
  if (rankings) {
    add(scored(games, rankings, 'todayScore'), 'today', SPOTLIGHT_TODAY);
    add(scored(games, rankings, 'trendScore'), 'week', SPOTLIGHT_WEEK);
  }
  add(featured, 'featured');
  add(newest(games), 'new');
  return picks;
}
