'use client';

import type { ReactNode } from 'react';
import type { CardArt } from '@/lib/catalog';
import { useIsPhone } from '@/lib/use-is-phone';
import styles from './game.module.css';

// The portrait card's rendered width: the phone's portrait stage is as wide as the screen. The
// browser picks the 360 or 720 px card from it (720 on every dense phone screen).
const PORTRAIT_CARD_SIZES = '100vw';

/**
 * An adaptive game's portrait card art (slice 5.35) for the player cover. On a phone the stage of
 * an adaptive game is portrait, and there this shows `art` (the portrait card in the player's
 * language) filling the stage; everywhere else it shows `children`, the 16:9 cover of desktops and
 * tablets. Like the stage, it follows `useIsPhone`: the server render and the first paint show
 * `children`, a phone switches right after hydration, before Play. Rendered on the client only,
 * the portrait card is never requested on desktops and tablets.
 */
export function PhoneCardArt({ art, children }: { art: CardArt; children: ReactNode }) {
  const phone = useIsPhone();
  if (!phone || !art.card) return children;
  const srcSet = art.card2x ? `${art.card} 360w, ${art.card2x} 720w` : undefined;
  const sizes = art.card2x ? PORTRAIT_CARD_SIZES : undefined;
  // The backdrop is the same image with the same candidates, so it never costs a second download;
  // it only shows where the card does not fill the stage (a phone held sideways).
  return (
    <div className={styles.portraitArt} aria-hidden="true">
      <img
        className={styles.portraitArtBackdrop}
        src={art.card}
        srcSet={srcSet}
        sizes={sizes}
        alt=""
        decoding="async"
      />
      <img
        className={styles.portraitArtCard}
        data-card=""
        src={art.card}
        srcSet={srcSet}
        sizes={sizes}
        width={360}
        height={640}
        alt=""
        decoding="async"
      />
    </div>
  );
}
