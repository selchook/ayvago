import type { CatalogRankings } from '@ayvago/shared';
import { describe, expect, it } from 'vitest';
import type { CatalogGame } from './index';
import { pickSpotlight, SPOTLIGHT_SIZE } from './spotlight';

// Synthetic catalog: a to l in catalog order, each added a day after the one before it (so l is
// the newest); d and e are the featured games.
const game = (slug: string, index: number, overrides: Partial<CatalogGame> = {}): CatalogGame =>
  ({
    slug,
    status: 'live',
    featured: false,
    addedAt: `2026-10-${String(index + 1).padStart(2, '0')}`,
    manifest: { id: slug },
    ...overrides,
  }) as CatalogGame;

const games = 'abcdefghijkl'
  .split('')
  .map((slug, index) => game(slug, index, { featured: slug === 'd' || slug === 'e' }));
const featured = games.filter((g) => g.featured);

const rankings = (scores: Record<string, { today?: number; week?: number }>): CatalogRankings => ({
  games: Object.fromEntries(
    Object.entries(scores).map(([id, { today = 0, week = 0 }]) => [
      id,
      {
        likes: 0,
        dislikes: 0,
        qualityScore: 0,
        trendScore: week,
        todayScore: today,
        plays7d: 0,
        playsTotal: 0,
      },
    ]),
  ),
});

const summary = (picks: ReturnType<typeof pickSpotlight>) =>
  picks.map(({ game, reason, rank }) => `${game.slug}:${reason}:${rank}`);

describe('pickSpotlight', () => {
  it('has ten slides', () => {
    expect(SPOTLIGHT_SIZE).toBe(10);
    expect(pickSpotlight(games, featured, null)).toHaveLength(10);
  });

  it('mixes three trending today, three this week, the featured games, then the newest', () => {
    const picks = pickSpotlight(
      games,
      featured,
      rankings({
        a: { today: 2, week: 9 },
        b: { today: 9 },
        c: { today: 0.5 },
        f: { today: 4 },
        g: { week: 3 },
        h: { week: 5 },
        i: { week: 1 },
        j: { week: 0.5 },
      }),
    );
    expect(summary(picks)).toEqual([
      'b:today:1',
      'f:today:2',
      'a:today:3',
      // a leads this week too, but is already in; c (today 0.5) did not make the top three.
      'h:week:1',
      'g:week:2',
      'i:week:3',
      'd:featured:1',
      'e:featured:2',
      'l:new:1',
      'k:new:2',
    ]);
  });

  it('keeps catalog order between equal scores', () => {
    const picks = pickSpotlight(games, featured, rankings({ f: { today: 3 }, c: { today: 3 } }));
    expect(picks.slice(0, 2).map((p) => p.game.slug)).toEqual(['c', 'f']);
  });

  it('fills with the newest games, ties in catalog order', () => {
    const same = games.map((g) => ({ ...g, addedAt: '2026-11-01' }));
    expect(summary(pickSpotlight(same, [], null, 3))).toEqual(['a:new:1', 'b:new:2', 'c:new:3']);
    expect(summary(pickSpotlight(games, featured, rankings({ c: { today: 1 } }), 5))).toEqual([
      'c:today:1',
      'd:featured:1',
      'e:featured:2',
      'l:new:1',
      'k:new:2',
    ]);
  });

  it('never repeats a game', () => {
    // d trends today and this week and is featured; it appears once.
    const picks = pickSpotlight(
      games,
      featured,
      rankings({ d: { today: 5, week: 1 }, l: { week: 2 } }),
    );
    expect(summary(picks).slice(0, 4)).toEqual([
      'd:today:1',
      'l:week:1',
      'e:featured:1',
      'k:new:1',
    ]);
    expect(new Set(picks.map((p) => p.game.slug)).size).toBe(picks.length);
    const all = pickSpotlight(games, featured, null, 50);
    expect(all).toHaveLength(games.length);
    expect(new Set(all.map((p) => p.game.slug)).size).toBe(games.length);
  });

  it('ignores zero scores, unknown ids and games that are not live', () => {
    const soon = game('soon', 30, { status: 'coming_soon', featured: true });
    const picks = pickSpotlight(
      [soon, ...games],
      [soon, ...featured],
      rankings({ soon: { today: 50 }, ghost: { today: 50 }, a: { today: 0, week: 0 } }),
      4,
    );
    expect(summary(picks)).toEqual(['d:featured:1', 'e:featured:2', 'l:new:1', 'k:new:2']);
  });

  it('starts at the featured games when rankings are unavailable', () => {
    expect(summary(pickSpotlight(games, featured, null, 3))).toEqual([
      'd:featured:1',
      'e:featured:2',
      'l:new:1',
    ]);
  });

  it('shows what there is when the catalog is small', () => {
    expect(pickSpotlight(games.slice(0, 2), [], null)).toHaveLength(2);
    expect(pickSpotlight([], [], null)).toEqual([]);
  });
});
