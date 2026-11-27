import { GAME_CATEGORIES } from '@ayvago/shared';
import type { MetadataRoute } from 'next';
import { routing } from '@/i18n/routing';
import {
  categoryPath,
  gamePath,
  getGamesByCategory,
  getLiveGames,
  getMultiplayerGames,
} from '@/lib/catalog';
import { SITE_URL, newestAdded } from '@/lib/seo';

// Every indexable page in every locale, with hreflang alternates. Left out (noindex, slice 3.5):
// leaderboards (their tables load in the browser), coming-soon game pages (no game yet), and the
// private or short-lived pages (profile, favorites, search, lobbies, rooms, tables, admin).
// `lastModified` (slice 5.36) tells crawlers which pages are new: a game page the day the game
// joined the catalog, a list page (home, new, most played, multiplayer, a category) the day its
// newest game joined. The info pages carry none rather than a made-up date.
export default function sitemap(): MetadataRoute.Sitemap {
  const live = getLiveGames();
  const latest = newestAdded(live);
  const pages: { path: string; lastModified?: string }[] = [
    { path: '', lastModified: latest },
    { path: '/new', lastModified: latest },
    { path: '/most-played', lastModified: latest },
    { path: '/about' },
    { path: '/privacy' },
    { path: '/terms' },
    { path: '/contact' },
  ];
  const multiplayer = getMultiplayerGames();
  if (multiplayer.length > 0) {
    pages.push({ path: '/multiplayer', lastModified: newestAdded(multiplayer) });
  }
  for (const category of GAME_CATEGORIES) {
    const games = getGamesByCategory(category);
    if (games.length > 0) {
      pages.push({ path: categoryPath(category), lastModified: newestAdded(games) });
    }
  }
  for (const game of live) pages.push({ path: gamePath(game), lastModified: game.addedAt });
  return pages.flatMap(({ path, lastModified }) =>
    routing.locales.map((locale) => ({
      url: `${SITE_URL}/${locale}${path}`,
      ...(lastModified ? { lastModified } : {}),
      alternates: {
        languages: Object.fromEntries(routing.locales.map((l) => [l, `${SITE_URL}/${l}${path}`])),
      },
    })),
  );
}
