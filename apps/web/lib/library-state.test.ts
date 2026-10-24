import { describe, expect, it } from 'vitest';
import {
  FAVORITES_LIMIT,
  RECENT_LIMIT,
  mergeLibraries,
  sanitizeLibrary,
  type LibraryState,
} from './library-state';

const lib = (state: Partial<LibraryState>): LibraryState => ({
  favorites: [],
  recent: [],
  best: {},
  ...state,
});

describe('mergeLibraries', () => {
  it('unites favorites, keeping the first library order first', () => {
    const merged = mergeLibraries(
      lib({ favorites: ['orb-surge', 'chromashift'] }),
      lib({ favorites: ['chromashift', 'pixel-cascade'] }),
    );
    expect(merged.favorites).toEqual(['orb-surge', 'chromashift', 'pixel-cascade']);
  });

  it('keeps the latest play per game, newest first', () => {
    const merged = mergeLibraries(
      lib({
        recent: [
          { slug: 'orb-surge', playedAt: 100 },
          { slug: 'chromashift', playedAt: 50 },
        ],
      }),
      lib({
        recent: [
          { slug: 'chromashift', playedAt: 300 },
          { slug: 'tavla', playedAt: 10 },
        ],
      }),
    );
    expect(merged.recent).toEqual([
      { slug: 'chromashift', playedAt: 300 },
      { slug: 'orb-surge', playedAt: 100 },
      { slug: 'tavla', playedAt: 10 },
    ]);
  });

  it('keeps the better best score for each game and order', () => {
    const merged = mergeLibraries(
      lib({ best: { a: { score: 10, order: 'desc' }, b: { score: 30, order: 'asc' } } }),
      lib({
        best: {
          a: { score: 25, order: 'desc' },
          b: { score: 40, order: 'asc' },
          c: { score: 1, order: 'desc' },
        },
      }),
    );
    expect(merged.best).toEqual({
      a: { score: 25, order: 'desc' },
      b: { score: 30, order: 'asc' },
      c: { score: 1, order: 'desc' },
    });
  });

  it('stays within the limits', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => `game-${i}`);
    const merged = mergeLibraries(
      lib({ favorites: many(150), recent: many(15).map((slug, i) => ({ slug, playedAt: i })) }),
      lib({
        favorites: many(300).reverse(),
        recent: many(30).map((slug, i) => ({ slug, playedAt: 100 + i })),
      }),
    );
    expect(merged.favorites).toHaveLength(FAVORITES_LIMIT);
    expect(merged.recent).toHaveLength(RECENT_LIMIT);
    expect(merged.recent[0]).toEqual({ slug: 'game-29', playedAt: 129 });
  });
});

describe('sanitizeLibrary', () => {
  it('drops malformed entries from untrusted data', () => {
    expect(
      sanitizeLibrary({
        favorites: ['ok', 42, '', null],
        recent: [{ slug: 'ok', playedAt: 1 }, { slug: 'bad' }, 'nope'],
        best: {
          ok: { score: 5, order: 'desc' },
          nan: { score: Number.NaN, order: 'desc' },
          x: { score: 1, order: 'up' },
        },
      }),
    ).toEqual({
      favorites: ['ok'],
      recent: [{ slug: 'ok', playedAt: 1 }],
      best: { ok: { score: 5, order: 'desc' } },
    });
  });

  it('turns anything else into an empty library', () => {
    expect(sanitizeLibrary(null)).toEqual({ favorites: [], recent: [], best: {} });
    expect(sanitizeLibrary('x')).toEqual({ favorites: [], recent: [], best: {} });
  });
});
