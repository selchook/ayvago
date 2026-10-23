'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '../icons';
import styles from './catalog.module.css';

// Horizontal, snap-scrolling row with arrow buttons that appear only when there is more to see.
export function ShelfScroller({ children }: { children: React.ReactNode }) {
  const t = useTranslations('shelf');
  const listRef = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  const update = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    // scrollLeft is negative in RTL layouts; compare magnitudes.
    const left = Math.abs(el.scrollLeft);
    setEdges({ start: left < 4, end: left + el.clientWidth >= el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    update();
    const el = listRef.current;
    if (!el) return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [update]);

  function scrollBy(direction: 1 | -1) {
    const el = listRef.current;
    if (!el) return;
    const rtl = getComputedStyle(el).direction === 'rtl' ? -1 : 1;
    el.scrollBy({ left: direction * rtl * el.clientWidth * 0.85, behavior: 'smooth' });
  }

  return (
    <div className={styles.scroller}>
      <button
        type="button"
        className={styles.arrow}
        data-side="start"
        aria-label={t('previous')}
        hidden={edges.start}
        onClick={() => scrollBy(-1)}
      >
        <ChevronLeftIcon />
      </button>
      <ul ref={listRef} className={styles.shelfList} onScroll={update}>
        {children}
      </ul>
      <button
        type="button"
        className={styles.arrow}
        data-side="end"
        aria-label={t('next')}
        hidden={edges.end}
        onClick={() => scrollBy(1)}
      >
        <ChevronRightIcon />
      </button>
    </div>
  );
}
