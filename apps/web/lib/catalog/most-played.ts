import type { CatalogRankings } from '@ayvago/shared';
import type { CatalogGame } from './index';

// The "Most played" page (slice 5.27): platform-wide plays this week and of all time from the
// public rankings/catalog document, and the player's own most played games. Pure, so it is
// unit-tested; the page and the client view only render the results.

export const MOST_PLAYED_TABS = ['week', 'all', 'mine'] as const;
export type MostPlayedTab = (typeof MOST_PLAYED_TABS)[number];

/** The tab named by `?tab=`; anything else is the default, this week. */
export function parseTab(value: string | string[] | undefined | null): MostPlayedTab {
  const raw = Array.isArray(value) ? value[0] : value;
  return MOST_PLAYED_TABS.includes(raw as MostPlayedTab) ? (raw as MostPlayedTab) : 'week';
}

/**
 * The tabs worth showing: only those with at least one game (owner request). "Yours" counts only
 * once it is known, so it never flashes in and out. With nothing anywhere every tab is kept, so
 * the page can still say why it is empty.
 */
export function visibleTabs(counts: {
  week: number;
  all: number;
  mine: number;
  mineKnown: boolean;
}): MostPlayedTab[] {
  const shown = MOST_PLAYED_TABS.filter((tab) =>
    tab === 'mine' ? counts.mineKnown && counts.mine > 0 : counts[tab] > 0,
  );
  if (shown.length > 0) return shown;
  return counts.mineKnown ? [...MOST_PLAYED_TABS] : [];
}

/** The tab to show: the requested one while it is visible, otherwise the first visible one. */
export function activeTab(requested: MostPlayedTab, visible: MostPlayedTab[]): MostPlayedTab {
  return visible.includes(requested) ? requested : (visible[0] ?? requested);
}

/** One row of a ranked list: the game's slug, its plays (0 when unknown) and its rank from 1. */
export type RankedEntry = { slug: string; plays: number; rank: number };

/** Gold, silver and bronze for the top three; nothing below. */
export function medal(rank: number): 'gold' | 'silver' | 'bronze' | undefined {
  return rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : undefined;
}

/**
 * Live games with at least one finished run in the period (`plays7d`: the last 7 days, the
 * number the admin Games table shows; `playsTotal`: all time), most first; ties keep catalog
 * order. Ranks are positions (1, 2, 3 …), so every tile has its own number.
 */
export function rankByPlays(
  games: CatalogGame[],
  rankings: CatalogRankings | null,
  by: 'plays7d' | 'playsTotal',
): RankedEntry[] {
  if (!rankings) return [];
  return games
    .map((game, index) => ({
      game,
      index,
      plays: game.status === 'live' ? (rankings.games[game.manifest.id]?.[by] ?? 0) : 0,
    }))
    .filter(({ plays }) => Number.isFinite(plays) && plays > 0)
    .sort((a, b) => b.plays - a.plays || a.index - b.index)
    .map(({ game, plays }, i) => ({ slug: game.slug, plays, rank: i + 1 }));
}

/** A player's numbers for one game from users/{uid}/stats/{gameId}. */
export type MyStat = { gameId: string; plays: number; lastPlayedAt: number };

/**
 * The player's own most played games: the account's play stats (finished runs and online
 * matches) merged with this browser's recently played list, which also covers games played
 * signed out. Sorted by plays, then by the last time played, newest first. Games that left the
 * catalog are skipped.
 */
export function rankMine(
  stats: MyStat[],
  recent: { slug: string; playedAt: number }[],
  games: { slug: string; id: string }[],
): RankedEntry[] {
  const slugOf = new Map(games.map((game) => [game.id, game.slug]));
  const known = new Set(games.map((game) => game.slug));
  const merged = new Map<string, { plays: number; last: number }>();
  const add = (slug: string, plays: number, last: number) => {
    if (!known.has(slug)) return;
    const entry = merged.get(slug) ?? { plays: 0, last: 0 };
    entry.plays = Math.max(entry.plays, Number.isFinite(plays) && plays > 0 ? plays : 0);
    entry.last = Math.max(entry.last, Number.isFinite(last) ? last : 0);
    merged.set(slug, entry);
  };
  for (const stat of stats) {
    const slug = slugOf.get(stat.gameId);
    if (slug) add(slug, stat.plays, stat.lastPlayedAt);
  }
  for (const entry of recent) add(entry.slug, 0, entry.playedAt);
  return [...merged.entries()]
    .sort(([, a], [, b]) => b.plays - a.plays || b.last - a.last)
    .map(([slug, { plays }], i) => ({ slug, plays, rank: i + 1 }));
}
