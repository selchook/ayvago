import type { Locale } from '@ayvago/shared';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { CatalogGame } from '@/lib/catalog';
import { getTileLabels, toTiles } from '@/lib/catalog/tiles';
import { GameTile } from './game-tile';
import { ShelfScroller } from './shelf-scroller';
import styles from './catalog.module.css';

export async function Shelf({
  id,
  title,
  games,
  locale,
  seeAllHref,
}: {
  id: string;
  title: string;
  games: CatalogGame[];
  locale: Locale;
  seeAllHref?: string;
}) {
  if (games.length === 0) return null;
  const [t, tiles, labels] = await Promise.all([
    getTranslations('home'),
    toTiles(games, locale),
    getTileLabels(),
  ]);
  const headingId = `shelf-${id}`;

  return (
    <section className={styles.shelf} aria-labelledby={headingId}>
      <div className={styles.shelfHeader}>
        <h2 id={headingId}>{title}</h2>
        {seeAllHref ? (
          <Link href={seeAllHref} className={styles.seeAll}>
            {t('seeAll')}
          </Link>
        ) : null}
      </div>
      <ShelfScroller>
        {tiles.map((tile) => (
          <li key={tile.slug}>
            <GameTile tile={tile} labels={labels} />
          </li>
        ))}
      </ShelfScroller>
    </section>
  );
}
