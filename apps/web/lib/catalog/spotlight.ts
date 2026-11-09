import type { CatalogRankings } from '@ayvago/shared';
import type { CatalogGame } from './index';

// The home spotlight carousel (slice 5.17): the games trending today, filled up with this week's
// trend, then the editors' featured games, then catalog order. Pure, so it is unit-tested.

export const SPOTLIGHT_SIZE = 3;

/**
 * Why a game is in the spotlight, which picks its badge: trending today (ranked #1, #2, …),
 * popular this week, or featured (the editors' picks and the catalog-order fill).
 */
export type SpotlightReason = 'today' | 'week' | 'featured';

export type SpotlightPick = {
  game: CatalogGame;
  reason: SpotlightReason;
  /** Position in the carousel, from 1. Today's games come first, so it is also their rank. */
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

/**
 * Picks the spotlight games: live games by `todayScore` (> 0), then by the weekly `trendScore`
 * (> 0), then the featured games, then the catalog in order; never the same game twice. Without
 * rankings (local builds, previews, a failed read) it starts at the featured games.
 */
export function pickSpotlight(
  games: CatalogGame[],
  featured: CatalogGame[],
  rankings: CatalogRankings | null,
  size = SPOTLIGHT_SIZE,
): SpotlightPick[] {
  const picks: SpotlightPick[] = [];
  const taken = new Set<string>();
  const add = (candidates: CatalogGame[], reason: SpotlightReason) => {
    for (const game of candidates) {
      if (picks.length >= size) return;
      if (game.status !== 'live' || taken.has(game.slug)) continue;
      taken.add(game.slug);
      picks.push({ game, reason, rank: picks.length + 1 });
    }
  };
  if (rankings) {
    add(scored(games, rankings, 'todayScore'), 'today');
    add(scored(games, rankings, 'trendScore'), 'week');
  }
  add(featured, 'featured');
  add(games, 'featured');
  return picks;
}
