import type { Locale } from '@ayvago/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CoverArt } from '@/components/catalog/cover-art';
import { gamePath, gameTitle, getGameBySlug, isTableGame } from '@/lib/catalog';
import { MAX_TABLE_SIZE } from '@/lib/netcode/table-data';
import { TableView } from './table-view';

// Shared by /games/{slug}/table (opens a table) and /games/{slug}/table/{code} (joins one).

function tableGame(slug: string) {
  const game = getGameBySlug(slug);
  return game && game.multiplayer && isTableGame(game) && game.status === 'live' ? game : null;
}

export async function tableMetadata(locale: Locale, slug: string): Promise<Metadata> {
  const game = tableGame(slug);
  if (!game) return {};
  const t = await getTranslations({ locale, namespace: 'table' });
  const title = gameTitle(game, locale);
  // Tables are private and short-lived: never indexed.
  return { title: t('pageTitle', { title }), robots: { index: false, follow: false } };
}

export function TablePage({
  locale,
  slug,
  code,
}: {
  locale: Locale;
  slug: string;
  code: string | null;
}) {
  setRequestLocale(locale);
  const game = tableGame(slug);
  if (!game) notFound();
  const { manifest } = game;
  const title = gameTitle(game, locale);
  return (
    <TableView
      key={code ?? 'new'}
      code={code}
      gamePath={gamePath(game)}
      size={Math.min(MAX_TABLE_SIZE, manifest.players.max)}
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
