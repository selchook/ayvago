'use client';

import { useEffect, useState } from 'react';
import styles from './shell.module.css';

const INTERVAL_MS = 4000;

// Rotating slogans in the top bar next to the logo, in the voice of the Ayvago Arcade games
// portal. Decorative (hidden from assistive tech; the page headings carry the content). It
// pauses while hovered and stays on the first slogan for players who prefer reduced motion.
export function SloganTicker({ slogans }: { slogans: string[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || slogans.length < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(
      () => setIndex((current) => (current + 1) % slogans.length),
      INTERVAL_MS,
    );
    return () => window.clearInterval(timer);
  }, [paused, slogans.length]);

  return (
    <p
      className={styles.slogan}
      aria-hidden="true"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
    >
      <span key={index} className={styles.sloganText}>
        {slogans[index]}
      </span>
    </p>
  );
}
