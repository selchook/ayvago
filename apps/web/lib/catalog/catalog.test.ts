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

  it('never relates a game to itself', async () => {
    const { getAllGames, getRelatedGames } = await loadCatalog();
    for (const game of getAllGames()) {
      expect(getRelatedGames(game).some((g) => g.slug === game.slug)).toBe(false);
    }
  });
});
