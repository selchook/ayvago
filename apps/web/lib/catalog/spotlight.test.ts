import type { CatalogRankings } from '@ayvago/shared';
import { describe, expect, it } from 'vitest';
import type { CatalogGame } from './index';
import { pickSpotlight } from './spotlight';

// Small synthetic catalog: a to f in catalog order; d and e are the featured games.
const game = (slug: string, overrides: Partial<CatalogGame> = {}): CatalogGame =>
  ({
    slug,
    status: 'live',
    featured: false,
    manifest: { id: slug },
    ...overrides,
  }) as CatalogGame;

const games = [
  game('a'),
  game('b'),
  game('c'),
  game('d', { featured: true }),
  game('e', { featured: true }),
  game('f'),
];
const featured = games.filter((g) => g.featured);

const rankings = (scores: Record<string, { today?: number; week?: number }>): CatalogRankings => ({
  games: Object.fromEntries(
    Object.entries(scores).map(([id, { today = 0, week = 0 }]) => [
      id,
      { likes: 0, dislikes: 0, qualityScore: 0, trendScore: week, todayScore: today },
    ]),
  ),
});

const summary = (picks: ReturnType<typeof pickSpotlight>) =>
  picks.map(({ game, reason, rank }) => `${rank}:${game.slug}:${reason}`);

describe('pickSpotlight', () => {
  it('shows the three games trending today, best first', () => {
    const picks = pickSpotlight(
      games,
      featured,
      rankings({ a: { today: 2 }, b: { today: 9 }, c: { today: 0.5 }, f: { today: 4 } }),
    );
    expect(summary(picks)).toEqual(['1:b:today', '2:f:today', '3:a:today']);
  });

  it('keeps catalog order between equal scores', () => {
    const picks = pickSpotlight(games, featured, rankings({ f: { today: 3 }, c: { today: 3 } }));
    expect(picks.slice(0, 2).map((p) => p.game.slug)).toEqual(['c', 'f']);
  });

  it("fills up with this week's trend, then featured games, then catalog order", () => {
    expect(
      summary(pickSpotlight(games, featured, rankings({ c: { today: 1 }, f: { week: 0.4 } }))),
    ).toEqual(['1:c:today', '2:f:week', '3:d:featured']);
    expect(summary(pickSpotlight(games, [featured[0]!], rankings({ e: { today: 1 } })))).toEqual([
      '1:e:today',
      '2:d:featured',
      '3:a:featured',
    ]);
  });

  it('never repeats a game', () => {
    // d trends today and this week and is featured; it appears once.
    const picks = pickSpotlight(
      games,
      featured,
      rankings({ d: { today: 5, week: 1 }, e: { week: 2 } }),
    );
    expect(summary(picks)).toEqual(['1:d:today', '2:e:week', '3:a:featured']);
    const many = pickSpotlight(games, featured, null, 6);
    expect(new Set(many.map((p) => p.game.slug)).size).toBe(6);
  });

  it('ignores zero scores, unknown ids and games that are not live', () => {
    const soon = game('soon', { status: 'coming_soon', featured: true });
    const picks = pickSpotlight(
      [soon, ...games],
      [soon, ...featured],
      rankings({ soon: { today: 50 }, ghost: { today: 50 }, a: { today: 0, week: 0 } }),
    );
    expect(summary(picks)).toEqual(['1:d:featured', '2:e:featured', '3:a:featured']);
  });

  it('starts at the featured games when rankings are unavailable', () => {
    expect(summary(pickSpotlight(games, featured, null))).toEqual([
      '1:d:featured',
      '2:e:featured',
      '3:a:featured',
    ]);
  });

  it('shows what there is when the catalog is small', () => {
    expect(pickSpotlight(games.slice(0, 2), [], null)).toHaveLength(2);
    expect(pickSpotlight([], [], null)).toEqual([]);
  });
});
