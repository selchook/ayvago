import { gameCategories, SUPPORTED_LOCALES, type Locale } from '@ayvago/shared';
import { getTranslations } from 'next-intl/server';
import type { TileData, TileLabels } from '@/components/catalog/game-tile';
import { gameTitle, type CatalogGame } from './index';
import { gameLikePercent, getRankings } from './rankings';
import { normalizeSearch } from './search';

// Games added within this many days show a "New" badge.
const NEW_BADGE_DAYS = 14;

export async function getTileLabels(): Promise<TileLabels> {
  const t = await getTranslations('tile');
  return {
    comingSoon: t('comingSoon'),
    new: t('new'),
    multiplayer: t('multiplayer'),
    likes: t.raw('likes') as string,
  };
}

/** What the game search matches: titles in every language, the slug and the category names. */
export function gameSearchText(game: CatalogGame, categoryLabels: string[]): string {
  const titles = SUPPORTED_LOCALES.map((locale) => gameTitle(game, locale));
  return normalizeSearch([...titles, game.slug, ...categoryLabels].join(' '));
}

export async function toTiles(games: CatalogGame[], locale: Locale): Promise<TileData[]> {
  const [tc, rankings] = await Promise.all([getTranslations('categories'), getRankings()]);
  const now = Date.now();
  return games.map((game) => {
    const categoryLabels = gameCategories(game.manifest).map((category) => tc(category));
    return {
      slug: game.slug,
      id: game.manifest.id,
      title: gameTitle(game, locale),
      category: game.manifest.category,
      // Up to three categories, primary first, like the tags on the Ayvago Arcade games portal.
      categoryLabels: categoryLabels.slice(0, 3),
      comingSoon: game.status === 'coming_soon',
      isNew: now - Date.parse(game.addedAt) < NEW_BADGE_DAYS * 24 * 60 * 60 * 1000,
      multiplayer: game.multiplayer,
      cover: game.coverUrl,
      screenshot: game.screenshotUrl,
      landscape: game.manifest.orientation === 'landscape',
      likePercent: gameLikePercent(game, rankings),
      search: gameSearchText(game, categoryLabels),
    };
  });
}
