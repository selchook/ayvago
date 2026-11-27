import type { Metadata } from 'next';
import { routing } from '@/i18n/routing';
import type { CatalogGame } from '@/lib/catalog';

export const SITE_URL = 'https://ayvago.com';

// Canonical URL plus hreflang alternates for a locale-independent path ("" for home).
export function localizedAlternates(locale: string, path: string): Metadata['alternates'] {
  return {
    canonical: `/${locale}${path}`,
    languages: {
      ...Object.fromEntries(routing.locales.map((l) => [l, `/${l}${path}`])),
      'x-default': `/${routing.defaultLocale}${path}`,
    },
  };
}

/** The newest `addedAt` (YYYY-MM-DD) among the live games of a list, or undefined for none. */
export function newestAdded(games: CatalogGame[]): string | undefined {
  let newest: string | undefined;
  for (const game of games) {
    if (game.status === 'live' && game.addedAt && (!newest || game.addedAt > newest)) {
      newest = game.addedAt;
    }
  }
  return newest;
}
