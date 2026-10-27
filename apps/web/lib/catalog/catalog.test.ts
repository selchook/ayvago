import { ARCADE_GAMES, resolveAssetUrl } from '@ayvago/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadCatalog() {
  vi.resetModules();
  return import('./index');
}

describe('seed catalog', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('parses every seed manifest', async () => {
    const { getAllGames } = await loadCatalog();
    expect(getAllGames().length).toBeGreaterThanOrEqual(10);
  });

  it('has unique slugs and manifest ids', async () => {
    const { getAllGames } = await loadCatalog();
    const games = getAllGames();
    expect(new Set(games.map((g) => g.slug)).size).toBe(games.length);
    expect(new Set(games.map((g) => g.manifest.id)).size).toBe(games.length);
  });

  it('provides Turkish text for every seed game', async () => {
    const { getAllGames } = await loadCatalog();
    for (const game of getAllGames()) {
      expect(game.manifest.title.tr, game.slug).toBeTruthy();
      expect(game.manifest.description.tr, game.slug).toBeTruthy();
    }
  });

  it('hides the fixture game unless dev games are enabled', async () => {
    let catalog = await loadCatalog();
    expect(catalog.getGameBySlug('bridge-fixture')).toBeUndefined();

    vi.stubEnv('AYVAGO_DEV_GAMES', '1');
    catalog = await loadCatalog();
    expect(catalog.getGameBySlug('bridge-fixture')?.status).toBe('live');
  });

  it('applies local entry overrides only together with dev games', async () => {
    vi.stubEnv('AYVAGO_DEV_ENTRY_OVERRIDES', 'tavla=http://localhost:4207/');
    let catalog = await loadCatalog();
    // Tests run with NODE_ENV=test, so overrides apply.
    expect(catalog.getGameBySlug('tavla')).toMatchObject({
      status: 'live',
      manifest: { entry: 'http://localhost:4207/' },
      coverUrl: 'http://localhost:4207/ayvago/cover-1920x1080.jpg',
    });

    vi.stubEnv('NODE_ENV', 'production');
    catalog = await loadCatalog();
    expect(catalog.getGameBySlug('tavla')).toMatchObject({
      status: 'coming_soon',
      manifest: { entry: 'https://backgammon-tito.vercel.app/' },
    });
  });

  it('lists every Ayvago Arcade game with its own entry and art', async () => {
    const { getAllGames } = await loadCatalog();
    const arcade = getAllGames().filter((game) => game.repo === 'selchook/ayvago-games');
    expect(arcade).toHaveLength(ARCADE_GAMES.length);
    expect(arcade.length).toBeGreaterThanOrEqual(26);
    for (const game of arcade) {
      expect(game.manifest.id, game.slug).toBe(game.slug.replace(/-/g, ''));
      expect(game.manifest.entry, game.slug).toMatch(new RegExp(`/games/${game.slug}/$`));
      expect(resolveAssetUrl(game.manifest, game.manifest.assets.cover), game.slug).toBe(
        new URL(`/games/${game.slug}/ayvago/cover-1920x1080.jpg`, game.manifest.entry).toString(),
      );
    }
  });

  it('points the arcade games at a local build with AYVAGO_DEV_ARCADE_ORIGIN', async () => {
    vi.stubEnv('AYVAGO_DEV_ARCADE_ORIGIN', 'http://localhost:4173/');
    let catalog = await loadCatalog();
    expect(catalog.getGameBySlug('space-blaster')).toMatchObject({
      status: 'live',
      manifest: { entry: 'http://localhost:4173/games/space-blaster/' },
      coverUrl: 'http://localhost:4173/games/space-blaster/ayvago/cover-1920x1080.jpg',
    });

    vi.stubEnv('NODE_ENV', 'production');
    catalog = await loadCatalog();
    expect(catalog.getGameBySlug('space-blaster')?.manifest.entry).toMatch(/^https:\/\//);
  });

  it('uses the cover a live game serves from its own origin', async () => {
    vi.stubEnv('AYVAGO_DEV_GAMES', '1');
    const { getAllGames } = await loadCatalog();
    for (const game of getAllGames()) {
      if (game.slug === 'bridge-fixture' || game.status === 'coming_soon') {
        expect(game.coverUrl, game.slug).toBeNull();
      } else {
        expect(game.coverUrl, game.slug).toBe(
          resolveAssetUrl(game.manifest, game.manifest.assets.cover),
        );
      }
    }
    expect(getAllGames().filter((game) => game.coverUrl).length).toBeGreaterThanOrEqual(6);
  });

  it('never relates a game to itself', async () => {
    const { getAllGames, getRelatedGames } = await loadCatalog();
    for (const game of getAllGames()) {
      expect(getRelatedGames(game).some((g) => g.slug === game.slug)).toBe(false);
    }
  });
});

describe('rankings', () => {
  it('orders live games by score and keeps coming-soon games last', async () => {
    const { getAllGames } = await loadCatalog();
    const { rankGames, parseRankings, gameLikePercent } = await import('./rankings');
    const games = getAllGames();
    const rankings = parseRankings({
      games: {
        mapValue: {
          fields: {
            chromashift: {
              mapValue: {
                fields: {
                  likes: { integerValue: '19' },
                  dislikes: { integerValue: '1' },
                  qualityScore: { doubleValue: 0.9 },
                  trendScore: { doubleValue: 0.1 },
                },
              },
            },
          },
        },
      },
    });
    const ranked = rankGames(games, rankings, 'qualityScore');
    expect(ranked[0]!.slug).toBe('chromashift');
    expect(ranked.at(-1)!.status).toBe('coming_soon');
    expect(gameLikePercent(ranked[0]!, rankings)).toBe(95);
    expect(rankGames(games, null, 'qualityScore')).toEqual(games);
  });
});
