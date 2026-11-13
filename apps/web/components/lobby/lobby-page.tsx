import type { Locale } from '@ayvago/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import {
  gamePath,
  gameTitle,
  getAllGames,
  getGameBySlug,
  isTableGame,
  tableSize,
} from '@/lib/catalog';
import { LobbyView } from './lobby-view';

// /games/{slug}/lobby for every table game (isTableGame): docs/adr/0019, 0026.

function lobbyGame(slug: string) {
  const game = getGameBySlug(slug);
  return game && game.multiplayer && isTableGame(game) && game.status === 'live' ? game : null;
}

export async function lobbyMetadata(locale: Locale, slug: string): Promise<Metadata> {
  const game = lobbyGame(slug);
  if (!game) return {};
  const t = await getTranslations({ locale, namespace: 'lobby' });
  const title = gameTitle(game, locale);
  // Live, signed-in content that changes by the second: the game page is the one to index.
  return {
    title: t('pageTitle', { title }),
    description: t('metaDescription', { title }),
    robots: { index: false, follow: true },
  };
}

export function LobbyPage({ locale, slug }: { locale: Locale; slug: string }) {
  setRequestLocale(locale);
  const game = lobbyGame(slug);
  if (!game) notFound();
  return (
    <LobbyView
      gameId={game.manifest.id}
      slug={game.slug}
      title={gameTitle(game, locale)}
      gamePath={gamePath(game)}
      size={tableSize(game)}
      gameTitles={Object.fromEntries(
        getAllGames().map((other) => [other.manifest.id, gameTitle(other, locale)]),
      )}
    />
  );
}
