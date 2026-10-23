import { GAME_CATEGORIES } from '@ayvago/shared';
import type { MetadataRoute } from 'next';
import { routing } from '@/i18n/routing';
import { categoryPath, gamePath, getAllGames } from '@/lib/catalog';
import { SITE_URL } from '@/lib/seo';

// Every public page in every locale, with hreflang alternates.
export default function sitemap(): MetadataRoute.Sitemap {
  const paths = [
    '',
    '/new',
    '/multiplayer',
    ...GAME_CATEGORIES.map(categoryPath),
    ...getAllGames().map(gamePath),
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
