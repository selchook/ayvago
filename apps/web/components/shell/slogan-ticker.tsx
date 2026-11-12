'use client';

import { useEffect, useState } from 'react';
import { tickerDuration, tickerItem, type TickerQuote } from '@/lib/shell/ticker';
import styles from './shell.module.css';

// Rotating slogans in the top bar next to the logo, in the voice of the Ayvago Arcade games
// portal, with a thinker's quote after every two slogans (slice 5.27; quotes stay longer).
// Decorative (hidden from assistive tech; the page headings carry the content). It pauses while
// hovered and stays on the first slogan for players who prefer reduced motion.
export function SloganTicker({
  slogans,
  quotes = [],
  attribution,
}: {
  slogans: string[];
  quotes?: TickerQuote[];
  /** "— {name}", already localized with a `{name}` placeholder. */
  attribution?: string;
}) {
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const item = tickerItem(step, slogans, quotes);
  const many = slogans.length + quotes.length > 1;

  useEffect(() => {
    if (paused || !many) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Each item gets its own time; after a hover it starts over on the same item.
    const timer = window.setTimeout(
      () => setStep((current) => current + 1),
      tickerDuration(tickerItem(step, slogans, quotes)),
    );
    return () => window.clearTimeout(timer);
  }, [paused, many, step, slogans, quotes]);

  return (
    <p
      className={styles.slogan}
      aria-hidden="true"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
    >
      {item ? (
        <span key={step} className={styles.sloganText} data-kind={item.kind}>
          <span className={styles.sloganLine}>{item.text}</span>
          {item.kind === 'quote' && attribution ? (
            <span className={styles.sloganBy}>{attribution.replace('{name}', item.by)}</span>
          ) : null}
        </span>
      ) : null}
    </p>
  );
}
