import { ARCADE_GAMES, GAME_CATEGORIES, PARKED_GAMES, resolveAssetUrl } from '@ayvago/shared';
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
    vi.stubEnv('AYVAGO_DEV_ENTRY_OVERRIDES', 'gem-match=http://localhost:4207/');
    let catalog = await loadCatalog();
    // Tests run with NODE_ENV=test, so overrides apply.
    expect(catalog.getGameBySlug('gem-match')).toMatchObject({
      status: 'live',
      manifest: { entry: 'http://localhost:4207/' },
    });

    vi.stubEnv('NODE_ENV', 'production');
    catalog = await loadCatalog();
    expect(catalog.getGameBySlug('gem-match')?.manifest.entry).toBe(
      'https://ayvago-games.vercel.app/games/gem-match/',
    );
  });

  it('lists a game under every one of its categories', async () => {
    const { getGameBySlug, getGamesByCategory } = await loadCatalog();
    const blaster = getGameBySlug('space-blaster')!;
    expect(blaster.manifest.category).toBe('arcade');
    for (const category of blaster.manifest.categories ?? []) {
      expect(
        getGamesByCategory(category).map((g) => g.slug),
        category,
      ).toContain('space-blaster');
    }
    expect(getGamesByCategory('puzzle').map((g) => g.slug)).not.toContain('space-blaster');
  });

  it('leaves the parked imported games out of the catalog', async () => {
    const { getAllGames, getGameBySlug, getMultiplayerGames, getFeaturedGames } =
      await loadCatalog();
    for (const parked of PARKED_GAMES) {
      expect(getGameBySlug(parked.slug), parked.slug).toBeUndefined();
    }
    expect(getAllGames().every((game) => game.repo === 'selchook/ayvago-games')).toBe(true);
    // The online two-player games of slice 4.1; the parked Ably games are not among them.
    expect(getMultiplayerGames().map((game) => game.slug)).toEqual([
      'air-hockey',
      'bowling-strike',
      'connect-four',
      'memory-match',
      'mini-golf',
      'neon-pong',
      'penalty-kick',
      'reversi',
    ]);
    // The home spotlight needs a lead game and two side tiles.
    expect(getFeaturedGames().length).toBeGreaterThanOrEqual(3);
  });

  it('has a game in every category (Word Hunt fills Word since slice 2.12)', async () => {
    const { getGamesByCategory } = await loadCatalog();
    for (const category of GAME_CATEGORIES) {
      expect(getGamesByCategory(category).length, category).toBeGreaterThan(0);
    }
  });

  it('lists every Ayvago Arcade game with its own entry and art', async () => {
    const { getAllGames } = await loadCatalog();
    const arcade = getAllGames().filter((game) => game.repo === 'selchook/ayvago-games');
    expect(arcade).toHaveLength(ARCADE_GAMES.length);
    expect(arcade.length).toBeGreaterThanOrEqual(54);
    for (const game of arcade) {
      expect(game.manifest.id, game.slug).toBe(game.slug.replace(/-/g, ''));
      expect(game.manifest.entry, game.slug).toMatch(new RegExp(`/games/${game.slug}/$`));
      expect(resolveAssetUrl(game.manifest, game.manifest.assets.cover), game.slug).toBe(
        new URL(`/games/${game.slug}/ayvago/cover-1920x1080.jpg`, game.manifest.entry).toString(),
      );
      // The Arcade theme's tiles show the in-game screenshot.
      expect(game.screenshotUrl, game.slug).toBe(
        new URL(`/games/${game.slug}/ayvago/screenshot.jpg`, game.manifest.entry).toString(),
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
            gemmatch: {
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
    // Every catalog game is live now; add a coming-soon one to check it is ranked last.
    const comingSoon = { ...games[0]!, slug: 'coming-soon', status: 'coming_soon' as const };
    const ranked = rankGames([comingSoon, ...games], rankings, 'qualityScore');
    expect(ranked[0]!.slug).toBe('gem-match');
    expect(ranked.at(-1)!.slug).toBe('coming-soon');
    expect(gameLikePercent(ranked[0]!, rankings)).toBe(95);
    expect(rankGames(games, null, 'qualityScore')).toEqual(games);
  });
});
