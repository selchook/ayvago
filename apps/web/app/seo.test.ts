import { afterEach, describe, expect, it, vi } from 'vitest';

// Thin pages out of the index (slice 3.5): the sitemap lists only pages with content of their
// own, and leaderboards and coming-soon game pages say noindex.

vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
  setRequestLocale: () => {},
}));
// The pages' components link through next-intl's navigation, which Node cannot load here.
vi.mock('@/i18n/navigation', () => ({
  Link: () => null,
  usePathname: () => '/',
  useRouter: () => ({}),
  redirect: () => {},
}));

afterEach(() => {
  vi.doUnmock('@/lib/catalog');
  vi.resetModules();
});

/** The catalog with one game turned into a coming-soon game. */
async function withComingSoon(slug: string) {
  vi.resetModules();
  const actual = await vi.importActual<typeof import('@/lib/catalog')>('@/lib/catalog');
  const games = actual
    .getAllGames()
    .map((game) => (game.slug === slug ? { ...game, status: 'coming_soon' as const } : game));
  vi.doMock('@/lib/catalog', () => ({
    ...actual,
    getAllGames: () => games,
    getLiveGames: () => games.filter((game) => game.status === 'live'),
    getGameBySlug: (s: string) => games.find((game) => game.slug === s),
  }));
}

describe('sitemap', () => {
  it('lists the info pages and live game pages, never leaderboards', async () => {
    const { default: sitemap } = await import('./sitemap');
    const urls = sitemap().map((entry) => entry.url);
    for (const path of ['/about', '/terms', '/contact', '/privacy', '/c/puzzle']) {
      expect(urls, path).toContain(`https://ayvago.com/en${path}`);
      expect(urls, path).toContain(`https://ayvago.com/tr${path}`);
    }
    expect(urls).toContain('https://ayvago.com/en/games/block-drop');
    expect(urls.filter((url) => url.endsWith('/leaderboard'))).toEqual([]);
  });

  it('dates game pages by the day they joined and list pages by their newest game', async () => {
    const { default: sitemap } = await import('./sitemap');
    const { getGameBySlug, getLiveGames, getGamesByCategory } = await import('@/lib/catalog');
    const entries = sitemap();
    const at = (url: string) => entries.find((entry) => entry.url === url)?.lastModified;
    const game = getGameBySlug('block-drop')!;
    expect(at('https://ayvago.com/en/games/block-drop')).toBe(game.addedAt);
    expect(at('https://ayvago.com/tr/games/block-drop')).toBe(game.addedAt);
    const newest = getLiveGames()
      .map((g) => g.addedAt)
      .sort()
      .at(-1);
    expect(at('https://ayvago.com/en')).toBe(newest);
    expect(at('https://ayvago.com/tr/new')).toBe(newest);
    const puzzle = getGamesByCategory('puzzle')
      .filter((g) => g.status === 'live')
      .map((g) => g.addedAt)
      .sort()
      .at(-1);
    expect(at('https://ayvago.com/en/c/puzzle')).toBe(puzzle);
    // the info pages have no real date to give
    expect(at('https://ayvago.com/en/about')).toBeUndefined();
    // every date is a plain W3C date
    for (const entry of entries) {
      if (entry.lastModified) expect(String(entry.lastModified)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('dates a list by its newest live game only', async () => {
    const { newestAdded } = await import('@/lib/seo');
    const { getAllGames } = await import('@/lib/catalog');
    const all = getAllGames();
    const a = all[0]!;
    const b = all[1]!;
    expect(newestAdded([])).toBeUndefined();
    expect(
      newestAdded([
        { ...a, status: 'live', addedAt: '2026-10-01' },
        { ...b, status: 'coming_soon', addedAt: '2026-12-01' },
      ]),
    ).toBe('2026-10-01');
  });

  it('leaves coming-soon games out', async () => {
    await withComingSoon('block-drop');
    const { default: sitemap } = await import('./sitemap');
    const urls = sitemap().map((entry) => entry.url);
    expect(urls).not.toContain('https://ayvago.com/en/games/block-drop');
    expect(urls).toContain('https://ayvago.com/en/games/space-blaster');
  });
});

describe('robots metadata', () => {
  const params = (slug: string) => ({ params: Promise.resolve({ locale: 'en' as const, slug }) });

  it('keeps every leaderboard page out of the index but follows its links', async () => {
    const { generateMetadata } = await import('./[locale]/games/[slug]/leaderboard/page');
    expect((await generateMetadata(params('block-drop'))).robots).toEqual({
      index: false,
      follow: true,
    });
  });

  it('indexes live game pages and keeps coming-soon ones out', async () => {
    let page = await import('./[locale]/games/[slug]/page');
    expect((await page.generateMetadata(params('block-drop'))).robots).toBeUndefined();

    await withComingSoon('block-drop');
    page = await import('./[locale]/games/[slug]/page');
    expect((await page.generateMetadata(params('block-drop'))).robots).toEqual({
      index: false,
      follow: true,
    });
  });
});
