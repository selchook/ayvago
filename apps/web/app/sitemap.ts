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
import { SITE_URL } from '@/lib/seo';

// Every indexable page in every locale, with hreflang alternates. Left out (noindex, slice 3.5):
// leaderboards (their tables load in the browser), coming-soon game pages (no game yet), and the
// private or short-lived pages (profile, favorites, search, lobbies, rooms, tables, admin).
export default function sitemap(): MetadataRoute.Sitemap {
  const paths = [
    '',
    '/new',
    '/most-played',
    '/about',
    '/privacy',
    '/terms',
    '/contact',
    ...(getMultiplayerGames().length > 0 ? ['/multiplayer'] : []),
    ...GAME_CATEGORIES.filter((category) => getGamesByCategory(category).length > 0).map(
      categoryPath,
    ),
    ...getLiveGames().map(gamePath),
  ];
  return paths.flatMap((path) =>
    routing.locales.map((locale) => ({
      url: `${SITE_URL}/${locale}${path}`,
      alternates: {
        languages: Object.fromEntries(routing.locales.map((l) => [l, `${SITE_URL}/${l}${path}`])),
      },
    })),
  );
}
