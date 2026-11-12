'use client';

// A client component on purpose, although it has no state. Server components put a preload hint
// for every eager image into their RSC payload. The game page shows its 1920×1080 cover eagerly,
// so Next's viewport prefetch of every catalog tile's game page made the browser download that
// game's cover even where the tile shows card art. Rendered here, the image only gets the HTML
// preload of a real visit to the page.
import type { GameCategory } from '@ayvago/shared';
import type { ReactNode } from 'react';
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

// Rendered width of a tile: 72% of the screen in phone shelves (half of it in phone grids), at
// most ~320 px in desktop shelves and grids. The browser picks the 640 or 1280 px card from it.
const CARD_SIZES = '(max-width: 639px) 72vw, 320px';
// The player overlay (size "hero") is as wide as the game frame: full width on phones, at most
// ~960 px on desktop, so dense screens get the 1280 px card.
const HERO_CARD_SIZES = '(max-width: 960px) 100vw, 960px';

export function CoverArt({
  id,
  title,
  category,
  size = 'tile',
  plain = false,
  image = null,
  card = null,
  card2x = null,
  eager = size === 'hero',
  children,
}: {
  id: string;
  title: string;
  category: GameCategory;
  size?: 'tile' | 'hero';
  // Absolute URL of the game's cover image (decorative; the title is always shown nearby).
  image?: string | null;
  // Background only, for places that draw their own text on top (the player overlay).
  plain?: boolean;
  // Card art (640×360, optional 1280×720): the Minimal and Cartoon themes show it instead of the
  // cover, on tiles and in the player overlay; the Arcade theme keeps the cover (hidden images are
  // never loaded).
  card?: string | null;
  card2x?: string | null;
  // Load the cover at once (the hero default); false where a theme may hide this cover.
  eager?: boolean;
  // Decorative layers drawn over the image (the tile's play button).
  children?: ReactNode;
}) {
  const [h1, h2] = hues(id);
  const showsImage = Boolean(image || card);
  return (
    <div
      className={styles.cover}
      data-size={size}
      style={{ '--h1': h1, '--h2': h2 } as React.CSSProperties}
      aria-hidden="true"
    >
      {card ? (
        // Card and cover images live on each game's own origin; next/image would need every game
        // host allow-listed and adds little for pre-sized images. Each image a theme may hide sits
        // in a wrapper that the theme hides: browsers skip lazy images under a hidden parent, but
        // still fetch a lazy image that is hidden itself.
        <span className={styles.cardFrame}>
          <img
            className={styles.cardImage}
            data-card=""
            src={card}
            srcSet={card2x ? `${card} 640w, ${card2x} 1280w` : undefined}
            sizes={card2x ? (size === 'hero' ? HERO_CARD_SIZES : CARD_SIZES) : undefined}
            width={640}
            height={360}
            alt=""
            loading="lazy"
            decoding="async"
          />
        </span>
      ) : null}
      {image && card ? (
        // Behind the card: only the Arcade theme shows the cover of a game with card art.
        <span className={styles.coverFrame}>
          <img className={styles.coverImage} src={image} alt="" loading="lazy" decoding="async" />
        </span>
      ) : image ? (
        <img
          className={styles.coverImage}
          src={image}
          alt=""
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
        />
      ) : null}
      {showsImage || plain ? null : (
        <>
          <span className={styles.coverIcon}>
            <CategoryIcon category={category} size={size === 'hero' ? 56 : 32} />
          </span>
          <span className={styles.coverTitle}>{title}</span>
        </>
      )}
      {children}
    </div>
  );
}
