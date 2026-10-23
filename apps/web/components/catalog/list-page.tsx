import type { Locale } from '@ayvago/shared';
import { getTranslations } from 'next-intl/server';
import type { CatalogGame } from '@/lib/catalog';
import { getTileLabels, toTiles } from '@/lib/catalog/tiles';
import styles from '../page.module.css';
import { GameGrid } from './game-grid';

// Shared layout for "all games of a kind" pages (new, category, multiplayer).
export async function ListPage({
  title,
  intro,
  games,
  locale,
}: {
  title: string;
  intro: string;
  games: CatalogGame[];
  locale: Locale;
}) {
  const [t, tiles, labels] = await Promise.all([
    getTranslations('list'),
    toTiles(games, locale),
    getTileLabels(),
  ]);
  return (
    <>
      <header className={styles.header}>
        <h1>{title}</h1>
        <p className={styles.intro}>{intro}</p>
        <p className={styles.count}>{t('count', { count: games.length })}</p>
      </header>
      <GameGrid tiles={tiles} labels={labels} />
    </>
  );
}
