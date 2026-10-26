import type { Locale } from '@ayvago/shared';
import { getTranslations } from 'next-intl/server';
import type { TileData, TileLabels } from '@/components/catalog/game-tile';
import { gameTitle, type CatalogGame } from './index';
import { gameLikePercent, getRankings } from './rankings';

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

export async function toTiles(games: CatalogGame[], locale: Locale): Promise<TileData[]> {
  const [tc, rankings] = await Promise.all([getTranslations('categories'), getRankings()]);
  const now = Date.now();
  return games.map((game) => ({
    slug: game.slug,
    id: game.manifest.id,
    title: gameTitle(game, locale),
    category: game.manifest.category,
    categoryLabel: tc(game.manifest.category),
    comingSoon: game.status === 'coming_soon',
    isNew: now - Date.parse(game.addedAt) < NEW_BADGE_DAYS * 24 * 60 * 60 * 1000,
    multiplayer: game.multiplayer,
    cover: game.coverUrl,
    likePercent: gameLikePercent(game, rankings),
  }));
}
