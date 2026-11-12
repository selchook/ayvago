import type { CatalogRankings } from '@ayvago/shared';
import { describe, expect, it } from 'vitest';
import type { CatalogGame } from './index';
import { medal, parseTab, rankByPlays, rankMine } from './most-played';

const game = (slug: string, overrides: Partial<CatalogGame> = {}): CatalogGame =>
  ({ slug, status: 'live', manifest: { id: slug.replace(/-/g, '') }, ...overrides }) as CatalogGame;

const games = [game('a'), game('b'), game('c-c'), game('d')];

const rankings = (plays: Record<string, [number, number]>): CatalogRankings => ({
  games: Object.fromEntries(
    Object.entries(plays).map(([id, [plays7d, playsTotal]]) => [
      id,
      { likes: 0, dislikes: 0, qualityScore: 0, trendScore: 0, todayScore: 0, plays7d, playsTotal },
    ]),
  ),
});

describe('parseTab', () => {
  it('reads the three tabs and falls back to this week', () => {
    expect(parseTab('week')).toBe('week');
    expect(parseTab('all')).toBe('all');
    expect(parseTab('mine')).toBe('mine');
    expect(parseTab(['mine', 'all'])).toBe('mine');
    expect(parseTab('recent')).toBe('week');
    expect(parseTab(undefined)).toBe('week');
    expect(parseTab(null)).toBe('week');
  });
});

describe('medal', () => {
  it('gives the top three gold, silver and bronze', () => {
    expect([1, 2, 3, 4, 0].map(medal)).toEqual(['gold', 'silver', 'bronze', undefined, undefined]);
  });
});

describe('rankByPlays', () => {
  const data = rankings({ a: [3, 40], b: [12, 12], cc: [3, 900], d: [0, 5], ghost: [99, 99] });

  it('ranks live games by weekly plays, ties in catalog order, without games never played', () => {
    expect(rankByPlays(games, data, 'plays7d')).toEqual([
      { slug: 'b', plays: 12, rank: 1 },
      { slug: 'a', plays: 3, rank: 2 },
      { slug: 'c-c', plays: 3, rank: 3 },
    ]);
  });

  it('ranks by all-time plays', () => {
    expect(rankByPlays(games, data, 'playsTotal').map((e) => `${e.rank}:${e.slug}`)).toEqual([
      '1:c-c',
      '2:a',
      '3:b',
      '4:d',
    ]);
  });

  it('leaves out games that are not live, and everything without rankings', () => {
    const soon = game('soon', { status: 'coming_soon' });
    expect(rankByPlays([soon, ...games], rankings({ soon: [50, 50] }), 'plays7d')).toEqual([]);
    expect(rankByPlays(games, null, 'playsTotal')).toEqual([]);
  });
});

describe('rankMine', () => {
  const tiles = games.map((g) => ({ slug: g.slug, id: g.manifest.id }));

  it('sorts by plays, then by the last time played', () => {
    const stats = [
      { gameId: 'a', plays: 4, lastPlayedAt: 100 },
      { gameId: 'b', plays: 9, lastPlayedAt: 50 },
      { gameId: 'cc', plays: 4, lastPlayedAt: 300 },
    ];
    expect(rankMine(stats, [], tiles)).toEqual([
      { slug: 'b', plays: 9, rank: 1 },
      { slug: 'c-c', plays: 4, rank: 2 },
      { slug: 'a', plays: 4, rank: 3 },
    ]);
  });

  it('adds games only played in this browser, after the counted ones, newest first', () => {
    const stats = [{ gameId: 'a', plays: 2, lastPlayedAt: 10 }];
    const recent = [
      { slug: 'd', playedAt: 500 },
      { slug: 'a', playedAt: 900 },
      { slug: 'b', playedAt: 700 },
    ];
    expect(rankMine(stats, recent, tiles).map((e) => `${e.rank}:${e.slug}:${e.plays}`)).toEqual([
      '1:a:2',
      '2:b:0',
      '3:d:0',
    ]);
  });

  it('skips games that left the catalog and bad numbers', () => {
    const stats = [
      { gameId: 'retired', plays: 50, lastPlayedAt: 1 },
      { gameId: 'b', plays: Number.NaN, lastPlayedAt: Number.NaN },
    ];
    expect(rankMine(stats, [{ slug: 'gone', playedAt: 5 }], tiles)).toEqual([
      { slug: 'b', plays: 0, rank: 1 },
    ]);
    expect(rankMine([], [], tiles)).toEqual([]);
  });
});
