'use client';

import { Link } from '@/i18n/navigation';
import { useRecent } from '@/lib/library';
import { GameTile, type TileData, type TileLabels } from './game-tile';
import { ShelfScroller } from './shelf-scroller';
import styles from './catalog.module.css';

/** "Continue playing": the player's recently played games, first on the home page when any. */
export function ContinueShelf({
  title,
  seeAllLabel,
  tiles,
  labels,
}: {
  title: string;
  seeAllLabel: string;
  tiles: TileData[];
  labels: TileLabels;
}) {
  const recent = useRecent();
  const bySlug = new Map(tiles.map((tile) => [tile.slug, tile]));
  const selected = recent.flatMap((entry) => bySlug.get(entry.slug) ?? []);
  if (selected.length === 0) return null;
  return (
    <section className={styles.shelf} aria-labelledby="shelf-continue">
      <div className={styles.shelfHeader}>
        <h2 id="shelf-continue">{title}</h2>
        <Link href="/recent" className={styles.seeAll}>
          {seeAllLabel}
        </Link>
      </div>
      <ShelfScroller>
        {selected.map((tile) => (
          <li key={tile.slug}>
            <GameTile tile={tile} labels={labels} />
          </li>
        ))}
      </ShelfScroller>
    </section>
  );
}
