import type { GameCategory } from '@ayvago/shared';
import { CategoryIcon } from '../category-icon';
import styles from './catalog.module.css';

// Game cover: the game's own image when it has one, otherwise a placeholder generated from the
// game id. The generated colors stay underneath an image, so a slow or failed load still looks
// intentional. Deterministic, so a game always gets the same colors.
function hues(seed: string): [number, number] {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const a = hash % 360;
  return [a, (a + 40 + (hash % 80)) % 360];
}

export function CoverArt({
  id,
  title,
  category,
  size = 'tile',
  plain = false,
  image = null,
}: {
  id: string;
  title: string;
  category: GameCategory;
  size?: 'tile' | 'hero';
  // Absolute URL of the game's cover image (decorative; the title is always shown nearby).
  image?: string | null;
  // Background only, for places that draw their own text on top (the player overlay).
  plain?: boolean;
}) {
  const [h1, h2] = hues(id);
  return (
    <div
      className={styles.cover}
      data-size={size}
      style={{ '--h1': h1, '--h2': h2 } as React.CSSProperties}
      aria-hidden="true"
    >
      {image ? (
        // Cover images live on each game's own origin; next/image would need every game host
        // allow-listed and adds little for pre-sized 1920x1080 JPEGs.
        <img
          className={styles.coverImage}
          src={image}
          alt=""
          loading={size === 'hero' ? 'eager' : 'lazy'}
          decoding="async"
        />
      ) : plain ? null : (
        <>
          <span className={styles.coverIcon}>
            <CategoryIcon category={category} size={size === 'hero' ? 56 : 32} />
          </span>
          <span className={styles.coverTitle}>{title}</span>
        </>
      )}
    </div>
  );
}
