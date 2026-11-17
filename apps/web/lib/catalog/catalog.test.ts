import {
  ARCADE_GAMES,
  ARCADE_ORIGIN,
  GAME_CATEGORIES,
  PARKED_GAMES,
  resolveAssetUrl,
  type SeedGame,
} from '@ayvago/shared';
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
      `${ARCADE_ORIGIN}/games/gem-match/`,
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
    // Online two-player games come from the studio, so the list grows with every catalog sync:
    // check that the slice 4.1 games still in the studio are there (Bowling Strike and Mini Golf
    // were retired in sync #93) and that no parked Ably game is among them.
    const multiplayer = getMultiplayerGames().map((game) => game.slug);
    expect(multiplayer).toEqual(
      expect.arrayContaining([
        'air-hockey',
        'connect-four',
        'memory-match',
        'neon-pong',
        'penalty-kick',
        'reversi',
      ]),
    );
    for (const parked of PARKED_GAMES) expect(multiplayer).not.toContain(parked.slug);
    // The home spotlight falls back to three featured games when rankings are unavailable.
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

  it('plays games for more than two at tables, and two-player games only when flagged', async () => {
    const { getAllGames, getGameBySlug, getTableGames, isTableGame, tableSize } =
      await loadCatalog();
    for (const game of getAllGames()) {
      if (game.manifest.players.max > 2) expect(isTableGame(game), game.slug).toBe(true);
      if (game.manifest.players.max < 2) expect(isTableGame(game), game.slug).toBe(false);
    }
    const okey = getGameBySlug('okey')!;
    expect(isTableGame(okey)).toBe(true);
    expect(tableSize(okey)).toBe(4);
    // A real-time two-player game stays in rooms.
    expect(isTableGame(getGameBySlug('air-hockey')!)).toBe(false);
    expect(getTableGames().map((game) => game.slug)).toContain('okey');
  });

  it('seats a flagged two-player game at a two-seat table (docs/adr/0026)', async () => {
    vi.resetModules();
    vi.doMock('@ayvago/shared', async (importOriginal) => {
      const shared = await importOriginal<typeof import('@ayvago/shared')>();
      return {
        ...shared,
        SEED_GAMES: shared.SEED_GAMES.map((seed) =>
          seed.slug === 'backgammon' || seed.slug === 'neon-pong'
            ? { ...seed, tables: seed.slug === 'backgammon' }
            : seed,
        ),
      };
    });
    try {
      const { getGameBySlug, getTableGames, isTableGame, tableSize } = await import('./index');
      const tavla = getGameBySlug('backgammon')!;
      expect(tavla.tables).toBe(true);
      expect(isTableGame(tavla)).toBe(true);
      expect(tableSize(tavla)).toBe(2);
      expect(isTableGame(getGameBySlug('neon-pong')!)).toBe(false);
      expect(getTableGames().map((game) => game.slug)).toEqual(
        expect.arrayContaining(['okey', 'backgammon']),
      );
    } finally {
      vi.doUnmock('@ayvago/shared');
    }
  });

  it('never relates a game to itself', async () => {
    const { getAllGames, getRelatedGames } = await loadCatalog();
    for (const game of getAllGames()) {
      expect(getRelatedGames(game).some((g) => g.slug === game.slug)).toBe(false);
    }
  });
});

describe('resolveGameArt', () => {
  const entry = 'https://games.example.com/games/orb-surge/';
  const assets = {
    icon: '/games/orb-surge/ayvago/icon-512.png',
    cover: '/games/orb-surge/ayvago/cover-1920x1080.jpg',
  };
  const card = '/games/orb-surge/ayvago/card-640x360.webp';
  const card2x = '/games/orb-surge/ayvago/card-1280x720.webp';

  it('resolves the card art like the cover', async () => {
    const { resolveGameArt } = await loadCatalog();
    expect(resolveGameArt({ entry, assets: { ...assets, card, card2x } }, true)).toEqual({
      coverUrl: 'https://games.example.com/games/orb-surge/ayvago/cover-1920x1080.jpg',
      screenshotUrl: null,
      cardUrl: 'https://games.example.com/games/orb-surge/ayvago/card-640x360.webp',
      card2xUrl: 'https://games.example.com/games/orb-surge/ayvago/card-1280x720.webp',
      logoUrl: null,
    });
    // Absolute https refs stay where they point.
    const cdn = 'https://cdn.example.com/card.webp';
    expect(resolveGameArt({ entry, assets: { ...assets, card: cdn } }, true).cardUrl).toBe(cdn);
  });

  it('keeps the cover when a game has no card art', async () => {
    const { resolveGameArt } = await loadCatalog();
    const art = resolveGameArt({ entry, assets }, true);
    expect(art.cardUrl).toBeNull();
    expect(art.card2xUrl).toBeNull();
    expect(art.coverUrl).toBe(new URL(assets.cover, entry).toString());
  });

  it('ignores card2x without card', async () => {
    const { resolveGameArt } = await loadCatalog();
    const art = resolveGameArt({ entry, assets: { ...assets, card2x } }, true);
    expect(art).toMatchObject({ cardUrl: null, card2xUrl: null });
    expect(art.coverUrl).not.toBeNull();
  });

  it('uses a card without card2x on its own', async () => {
    const { resolveGameArt } = await loadCatalog();
    expect(resolveGameArt({ entry, assets: { ...assets, card } }, true)).toMatchObject({
      cardUrl: new URL(card, entry).toString(),
      card2xUrl: null,
    });
  });

  it('resolves nothing for games without their own assets', async () => {
    const { resolveGameArt } = await loadCatalog();
    expect(resolveGameArt({ entry, assets: { ...assets, card, card2x } }, false)).toEqual({
      coverUrl: null,
      screenshotUrl: null,
      cardUrl: null,
      card2xUrl: null,
      logoUrl: null,
    });
  });

  it('passes the card art of every catalog game through to its tile data', async () => {
    const { getAllGames } = await loadCatalog();
    for (const game of getAllGames()) {
      const { card, card2x } = game.manifest.assets;
      const live = game.coverUrl !== null;
      expect(game.cardUrl, game.slug).toBe(
        live && card ? resolveAssetUrl(game.manifest, card) : null,
      );
      expect(game.card2xUrl, game.slug).toBe(
        live && card && card2x ? resolveAssetUrl(game.manifest, card2x) : null,
      );
    }
  });
});

describe('game logos', () => {
  const entry = 'https://games.example.com/games/alien-invaders/';
  const assets = {
    icon: '/games/alien-invaders/ayvago/icon-512.png',
    cover: '/games/alien-invaders/ayvago/cover-1920x1080.jpg',
  };
  // The shape the studio's arcade-catalog.ts adds to every arcade game.
  const logo = {
    en: '/games/alien-invaders/ayvago/logo-en.png',
    tr: '/games/alien-invaders/ayvago/logo-tr.png',
  };

  it('resolves the logo of every locale against the entry like the card', async () => {
    const { resolveGameArt } = await loadCatalog();
    expect(resolveGameArt({ entry, assets: { ...assets, logo } }, true).logoUrl).toEqual({
      en: 'https://games.example.com/games/alien-invaders/ayvago/logo-en.png',
      tr: 'https://games.example.com/games/alien-invaders/ayvago/logo-tr.png',
    });
    // Absolute https refs stay where they point; a missing locale stays missing.
    const cdn = 'https://cdn.example.com/logo.png';
    expect(
      resolveGameArt({ entry, assets: { ...assets, logo: { en: cdn } } }, true).logoUrl,
    ).toEqual({ en: cdn });
  });

  it('resolves no logo without one or without own assets', async () => {
    const { resolveGameArt } = await loadCatalog();
    expect(resolveGameArt({ entry, assets }, true).logoUrl).toBeNull();
    expect(resolveGameArt({ entry, assets: { ...assets, logo } }, false).logoUrl).toBeNull();
  });

  it("picks the locale's logo and falls back to English", async () => {
    const { gameLogoUrl, resolveGameArt } = await loadCatalog();
    const both = resolveGameArt({ entry, assets: { ...assets, logo } }, true);
    expect(gameLogoUrl(both, 'tr')).toBe(new URL(logo.tr, entry).toString());
    expect(gameLogoUrl(both, 'en')).toBe(new URL(logo.en, entry).toString());
    const enOnly = resolveGameArt({ entry, assets: { ...assets, logo: { en: logo.en } } }, true);
    expect(gameLogoUrl(enOnly, 'tr')).toBe(new URL(logo.en, entry).toString());
    expect(gameLogoUrl({ logoUrl: null }, 'tr')).toBeNull();
  });

  it('serves the logo of a studio entry in the shape arcadeGame() will generate', async () => {
    vi.resetModules();
    vi.doMock('@ayvago/shared', async (importOriginal) => {
      const shared = await importOriginal<typeof import('@ayvago/shared')>();
      const withLogo = (seed: SeedGame): SeedGame => ({
        ...seed,
        manifest: {
          ...seed.manifest,
          assets: {
            ...seed.manifest.assets,
            logo: {
              en: `/games/${seed.slug}/ayvago/logo-en.png`,
              tr: `/games/${seed.slug}/ayvago/logo-tr.png`,
            },
          },
        },
      });
      const withoutLogo = (seed: SeedGame): SeedGame => {
        const { logo: _logo, ...rest } = seed.manifest.assets;
        return { ...seed, manifest: { ...seed.manifest, assets: rest } };
      };
      return {
        ...shared,
        // Other games without a logo, whatever the synced catalog ships, so the text fallback is
        // checked on real data independently of the studio's assets.
        SEED_GAMES: shared.SEED_GAMES.map((seed) =>
          seed.slug === 'alien-invaders' ? withLogo(seed) : withoutLogo(seed),
        ),
      };
    });
    try {
      const { gameLogoUrl, getGameBySlug } = await import('./index');
      const game = getGameBySlug('alien-invaders')!;
      expect(game.logoUrl).toEqual({
        en: `${ARCADE_ORIGIN}/games/alien-invaders/ayvago/logo-en.png`,
        tr: `${ARCADE_ORIGIN}/games/alien-invaders/ayvago/logo-tr.png`,
      });
      expect(gameLogoUrl(game, 'tr')).toBe(
        `${ARCADE_ORIGIN}/games/alien-invaders/ayvago/logo-tr.png`,
      );
      // Other games keep the text logo.
      expect(getGameBySlug('bubble-pop')!.logoUrl).toBeNull();
    } finally {
      vi.doUnmock('@ayvago/shared');
    }
  });

  it('passes the logo of every catalog game through', async () => {
    const { getAllGames } = await loadCatalog();
    for (const game of getAllGames()) {
      const { logo: ref } = game.manifest.assets;
      const live = game.coverUrl !== null;
      expect(game.logoUrl?.en ?? null, game.slug).toBe(
        live && ref ? resolveAssetUrl(game.manifest, ref.en) : null,
      );
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

  it('reads todayScore and the play counts, and 0 from documents written before them', async () => {
    const { parseRankings } = await import('./rankings');
    const entry = (fields: Record<string, { integerValue?: string; doubleValue?: number }>) => ({
      mapValue: { fields },
    });
    const rankings = parseRankings({
      games: {
        mapValue: {
          fields: {
            fresh: entry({ trendScore: { doubleValue: 0.2 }, todayScore: { doubleValue: 7.5 } }),
            whole: entry({
              todayScore: { integerValue: '3' },
              plays7d: { integerValue: '42' },
              playsTotal: { integerValue: '1250' },
            }),
            old: entry({ likes: { integerValue: '4' }, trendScore: { doubleValue: 0.3 } }),
          },
        },
      },
    });
    expect(rankings.games.fresh).toMatchObject({ trendScore: 0.2, todayScore: 7.5 });
    expect(rankings.games.whole).toMatchObject({ todayScore: 3, plays7d: 42, playsTotal: 1250 });
    expect(rankings.games.old).toEqual({
      likes: 4,
      dislikes: 0,
      qualityScore: 0,
      trendScore: 0.3,
      todayScore: 0,
      plays7d: 0,
      playsTotal: 0,
    });
    expect(parseRankings(undefined)).toEqual({ games: {} });
  });
});
