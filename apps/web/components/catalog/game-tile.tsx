import type { GameCategory } from '@ayvago/shared';
import { Link } from '@/i18n/navigation';
import { ThumbUpIcon } from '../icons';
import { CoverArt } from './cover-art';
import styles from './catalog.module.css';

// Everything a tile needs, already localized, so the same component renders in server
// components (shelves, grids) and client components (recent, favorites).
export type TileData = {
  slug: string;
  id: string;
  title: string;
  category: GameCategory;
  /** Localized category names, primary first (at most three). */
  categoryLabels: string[];
  comingSoon: boolean;
  isNew: boolean;
  multiplayer: boolean;
  cover: string | null;
  /** In-game screenshot; the Arcade theme shows it instead of the cover. */
  screenshot: string | null;
  landscape: boolean;
  /** Shown from 20 votes (docs/specs/voting.md §2). */
  likePercent: number | null;
};

/** `likes` is an ICU message with a {percent} placeholder, already formatted by the caller. */
export type TileLabels = { comingSoon: string; new: string; multiplayer: string; likes: string };

/**
 * `wide` keeps the 16:9 cover in every theme (spotlight side tiles); otherwise the Arcade theme
 * shows the game's screenshot in its own orientation, like the Ayvago Arcade games portal.
 */
export function GameTile({
  tile,
  labels,
  wide = false,
}: {
  tile: TileData;
  labels: TileLabels;
  wide?: boolean;
}) {
  const shot = !wide && tile.screenshot;
  return (
    <Link
      href={`/games/${tile.slug}`}
      className={styles.tile}
      data-shot={shot ? (tile.landscape ? 'landscape' : 'portrait') : undefined}
    >
      <CoverArt id={tile.id} title={tile.title} category={tile.category} image={tile.cover} />
      {shot ? (
        <span className={styles.shot}>
          {/* Hidden (and so never loaded) outside the Arcade theme. */}
          <img src={shot} alt="" loading="lazy" decoding="async" />
        </span>
      ) : null}
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
        <span className={styles.tileCategory}>
          <span className={styles.tags}>
            {tile.categoryLabels.map((label) => (
              <span key={label} className={styles.tag}>
                {label}
              </span>
            ))}
          </span>
          {tile.likePercent !== null ? (
            <span className={styles.tileLikes}>
              <ThumbUpIcon size={13} />
              {labels.likes.replace('{percent}', String(tile.likePercent))}
            </span>
          ) : null}
        </span>
      </span>
    </Link>
  );
}
