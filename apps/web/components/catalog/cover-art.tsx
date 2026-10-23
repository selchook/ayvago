import type { GameCategory } from '@ayvago/shared';
import { CategoryIcon } from '../category-icon';
import styles from './catalog.module.css';

// Placeholder cover generated from the game id until real cover art ships with each game's
// ayvago.json assets. Deterministic, so a game always gets the same colors.
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
}: {
  id: string;
  title: string;
  category: GameCategory;
  size?: 'tile' | 'hero';
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
      {plain ? null : (
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
