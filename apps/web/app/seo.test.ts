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
