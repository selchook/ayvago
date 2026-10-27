import { GAME_CATEGORIES } from '@ayvago/shared';
import type { MetadataRoute } from 'next';
import { routing } from '@/i18n/routing';
import {
  categoryPath,
  gamePath,
  getAllGames,
  getGamesByCategory,
  getMultiplayerGames,
} from '@/lib/catalog';
import { SITE_URL } from '@/lib/seo';

// Every public page in every locale, with hreflang alternates.
export default function sitemap(): MetadataRoute.Sitemap {
  const paths = [
    '',
    '/new',
    ...(getMultiplayerGames().length > 0 ? ['/multiplayer'] : []),
    ...GAME_CATEGORIES.filter((category) => getGamesByCategory(category).length > 0).map(
      categoryPath,
    ),
    ...getAllGames().map(gamePath),
    ...getAllGames()
      .filter((game) => game.status === 'live')
      .map((game) => `${gamePath(game)}/leaderboard`),
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
