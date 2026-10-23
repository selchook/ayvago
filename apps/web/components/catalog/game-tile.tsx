import type { GameCategory } from '@ayvago/shared';
import { Link } from '@/i18n/navigation';
import { CoverArt } from './cover-art';
import styles from './catalog.module.css';

// Everything a tile needs, already localized, so the same component renders in server
// components (shelves, grids) and client components (recent, favorites).
export type TileData = {
  slug: string;
  id: string;
  title: string;
  category: GameCategory;
  categoryLabel: string;
  comingSoon: boolean;
  isNew: boolean;
  multiplayer: boolean;
};

export type TileLabels = { comingSoon: string; new: string; multiplayer: string };

export function GameTile({ tile, labels }: { tile: TileData; labels: TileLabels }) {
  return (
    <Link href={`/games/${tile.slug}`} className={styles.tile}>
      <CoverArt id={tile.id} title={tile.title} category={tile.category} />
      <span className={styles.badges}>
        {tile.comingSoon ? (
          <span className={styles.badge} data-kind="soon">
            {labels.comingSoon}
          </span>
        ) : tile.isNew ? (
          <span className={styles.badge} data-kind="new">
            {labels.new}
          </span>
        ) : null}
        {tile.multiplayer ? (
          <span className={styles.badge} data-kind="mp">
            {labels.multiplayer}
          </span>
        ) : null}
      </span>
      <span className={styles.tileMeta}>
        <span className={styles.tileTitle}>{tile.title}</span>
        <span className={styles.tileCategory}>{tile.categoryLabel}</span>
      </span>
    </Link>
  );
}
