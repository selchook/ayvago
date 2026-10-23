'use client';

import { Link } from '@/i18n/navigation';
import { useFavorites, useRecent } from '@/lib/library';
import styles from '../page.module.css';
import { GameGrid } from './game-grid';
import type { TileData, TileLabels } from './game-tile';

// Renders the player's recently played or favorite games from this browser's library.
export function LibraryList({
  kind,
  tiles,
  labels,
  emptyText,
  browseLabel,
}: {
  kind: 'recent' | 'favorites';
  tiles: TileData[];
  labels: TileLabels;
  emptyText: string;
  browseLabel: string;
}) {
  const recent = useRecent();
  const favorites = useFavorites();
  const slugs = kind === 'recent' ? recent.map((entry) => entry.slug) : favorites;
  const bySlug = new Map(tiles.map((tile) => [tile.slug, tile]));
  const selected = slugs.flatMap((slug) => bySlug.get(slug) ?? []);

  if (selected.length === 0) {
    return (
      <div className={styles.empty}>
        <p>{emptyText}</p>
        <Link href="/" className={styles.button}>
          {browseLabel}
        </Link>
      </div>
    );
  }
  return <GameGrid tiles={selected} labels={labels} />;
}
