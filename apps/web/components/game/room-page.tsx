import type { Locale } from '@ayvago/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CoverArt } from '@/components/catalog/cover-art';
import { gamePath, gameTitle, getGameBySlug } from '@/lib/catalog';
import { RoomView } from './room-view';

// Shared by /games/{slug}/room (creates a room) and /games/{slug}/room/{code} (joins one).

function onlineGame(slug: string) {
  const game = getGameBySlug(slug);
  return game && game.multiplayer && game.status === 'live' ? game : null;
}

export async function roomMetadata(locale: Locale, slug: string): Promise<Metadata> {
  const game = onlineGame(slug);
  if (!game) return {};
  const t = await getTranslations({ locale, namespace: 'online' });
  const title = gameTitle(game, locale);
  // Rooms are private and short-lived: never indexed.
  return { title: t('pageTitle', { title }), robots: { index: false, follow: false } };
}

export function RoomPage({
  locale,
  slug,
  code,
}: {
  locale: Locale;
  slug: string;
  code: string | null;
}) {
  setRequestLocale(locale);
  const game = onlineGame(slug);
  if (!game) notFound();
  const { manifest } = game;
  const title = gameTitle(game, locale);
  return (
    <RoomView
      key={code ?? 'new'}
      code={code}
      gamePath={gamePath(game)}
      slug={game.slug}
      gameId={manifest.id}
      title={title}
      entry={manifest.entry}
      orientation={manifest.orientation}
      scoreOrder={manifest.scoring.order}
      scoreFormat={manifest.scoring.format}
      cover={
        <CoverArt
          id={manifest.id}
          title={title}
          category={manifest.category}
          size="hero"
          plain
          image={game.coverUrl}
        />
      }
    />
  );
}
