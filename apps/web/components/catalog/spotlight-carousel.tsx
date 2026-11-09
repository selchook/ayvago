'use client';

import type { GameCategory } from '@ayvago/shared';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { ChevronLeftIcon, ChevronRightIcon, PauseIcon, PlayIcon } from '../icons';
import catalog from './catalog.module.css';
import { CoverArt } from './cover-art';
import styles from './spotlight-carousel.module.css';

/** One spotlight game, as plain data from the home page (a server component). */
export type SpotlightSlide = {
  slug: string;
  href: string;
  id: string;
  title: string;
  description: string;
  category: GameCategory;
  cover: string | null;
  categoryLabels: string[];
  /** "#1 Trending today", "Popular this week" or "Featured", already localized. */
  badge: string;
  reason: 'today' | 'week' | 'featured';
};

/** Time each slide stays before the carousel moves on by itself. */
const ADVANCE_MS = 5000;
/** After a swipe, touch, wheel or click the carousel waits this long before moving again. */
const HOLD_MS = 8000;

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// The home spotlight (slice 5.17): a native scroll-snap track, so touch swipes, trackpads and
// shift+wheel move it without any script; buttons, dots and arrow keys move it too. It advances
// by itself every few seconds, except while the pointer is over it, while it has keyboard focus,
// for a while after the player touches it, while the tab is hidden, when the player stopped it,
// or when the system asks for reduced motion.
export function SpotlightCarousel({
  slides,
  labelledBy,
}: {
  slides: SpotlightSlide[];
  labelledBy: string;
}) {
  const t = useTranslations('carousel');
  const trackRef = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const holdTimer = useRef(0);
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [held, setHeld] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [stopped, setStopped] = useState(false);
  const count = slides.length;

  /** Horizontal distance between two slides (negative in right-to-left layouts). */
  const step = useCallback(() => {
    const track = trackRef.current;
    const items = track?.children;
    if (!track || !items?.length) return 0;
    const first = items[0] as HTMLElement;
    return items.length > 1
      ? (items[1] as HTMLElement).offsetLeft - first.offsetLeft
      : track.clientWidth;
  }, []);

  const goTo = useCallback(
    (target: number, focusSlide = false) => {
      const track = trackRef.current;
      if (!track || count === 0) return;
      const next = ((target % count) + count) % count;
      track.scrollTo({
        left: next * step(),
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      });
      setIndex(next);
      if (focusSlide) {
        track.children[next]?.querySelector<HTMLElement>('a')?.focus({ preventScroll: true });
      }
    },
    [count, step],
  );

  const onScroll = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const track = trackRef.current;
      const size = step();
      if (!track || !size) return;
      setIndex(Math.min(count - 1, Math.max(0, Math.round(track.scrollLeft / size))));
    });
  }, [count, step]);

  /** The player is handling the carousel: wait HOLD_MS after the last touch before moving on. */
  const hold = useCallback(() => {
    setHeld(true);
    window.clearTimeout(holdTimer.current);
    holdTimer.current = window.setTimeout(() => setHeld(false), HOLD_MS);
  }, []);

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMotion = () => setReduced(motion.matches);
    const onVisibility = () => setHidden(document.visibilityState === 'hidden');
    onMotion();
    onVisibility();
    motion.addEventListener('change', onMotion);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      motion.removeEventListener('change', onMotion);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearTimeout(holdTimer.current);
      cancelAnimationFrame(frame.current);
    };
  }, []);

  const canAdvance = count > 1 && !reduced;
  const running = canAdvance && !stopped && !hovered && !focused && !held && !hidden;

  useEffect(() => {
    if (!running) return;
    // Restarts whenever the slide changes, so every slide gets its full time.
    const timer = window.setTimeout(() => goTo(index + 1), ADVANCE_MS);
    return () => window.clearTimeout(timer);
  }, [running, index, goTo]);

  function onKeyDown(event: React.KeyboardEvent) {
    const keys: Record<string, number> = {
      ArrowLeft: index - 1,
      ArrowRight: index + 1,
      Home: 0,
      End: count - 1,
    };
    const target = keys[event.key];
    if (target === undefined || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    // A focused slide hands focus to the new slide; a focused button or dot keeps it.
    const onSlide = (event.target as HTMLElement).closest('[data-slide]') !== null;
    goTo(target, onSlide);
  }

  // Only keyboard focus pauses: a mouse click on a dot focuses it too, and that is a short hold.
  function onFocus(event: React.FocusEvent) {
    const target = event.target as HTMLElement;
    let keyboard = true;
    try {
      keyboard = target.matches(':focus-visible');
    } catch {
      // Browsers without :focus-visible: treat all focus as keyboard focus.
    }
    setFocused(keyboard);
  }

  function onBlur(event: React.FocusEvent) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
  }

  if (count === 0) return null;

  return (
    <section
      role="region"
      aria-roledescription={t('roleDescription')}
      aria-labelledby={labelledBy}
      className={styles.carousel}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onBlur={onBlur}
      onPointerEnter={(event) => event.pointerType === 'mouse' && setHovered(true)}
      onPointerLeave={(event) => event.pointerType === 'mouse' && setHovered(false)}
      onPointerDown={hold}
    >
      <div className={styles.viewport}>
        <div
          ref={trackRef}
          className={styles.track}
          aria-live={running ? 'off' : 'polite'}
          onScroll={onScroll}
          onTouchStart={hold}
          onWheel={hold}
        >
          {slides.map((slide, i) => (
            <div
              key={slide.slug}
              className={styles.slide}
              role="group"
              aria-roledescription={t('slideRoleDescription')}
              aria-label={t('slide', { index: i + 1, total: count })}
              data-slide={i}
            >
              <Link href={slide.href} className={styles.card}>
                <span className={styles.media}>
                  <CoverArt
                    id={slide.id}
                    title={slide.title}
                    category={slide.category}
                    size="hero"
                    image={slide.cover}
                  />
                  <span className={styles.badge} data-reason={slide.reason}>
                    {slide.badge}
                  </span>
                </span>
                <span className={styles.body}>
                  <strong className={styles.title}>{slide.title}</strong>
                  <span className={styles.description}>{slide.description}</span>
                  <span className={`${catalog.tags} ${styles.tags}`}>
                    {slide.categoryLabels.map((label, tone) => (
                      <span key={label} className={catalog.tag} data-tone={tone}>
                        {label}
                      </span>
                    ))}
                  </span>
                  <span className={styles.play} aria-hidden="true">
                    <PlayIcon size={16} />
                    {t('play')}
                  </span>
                </span>
              </Link>
            </div>
          ))}
        </div>
        {count > 1 ? (
          <>
            <button
              type="button"
              className={styles.arrow}
              data-side="start"
              aria-label={t('previous')}
              onClick={() => goTo(index - 1)}
            >
              <ChevronLeftIcon />
            </button>
            <button
              type="button"
              className={styles.arrow}
              data-side="end"
              aria-label={t('next')}
              onClick={() => goTo(index + 1)}
            >
              <ChevronRightIcon />
            </button>
          </>
        ) : null}
      </div>
      {count > 1 ? (
        <div className={styles.controls}>
          <div className={styles.dots}>
            {slides.map((slide, i) => (
              <button
                key={slide.slug}
                type="button"
                className={styles.dot}
                aria-label={t('goTo', { index: i + 1, total: count, title: slide.title })}
                aria-current={i === index ? 'true' : undefined}
                onClick={() => goTo(i)}
              />
            ))}
          </div>
          <button
            type="button"
            className={styles.toggle}
            aria-label={stopped ? t('resume') : t('pause')}
            // Reduced motion never advances, so there is nothing to stop; the space stays
            // reserved so the dots do not move when the preference is read after hydration.
            hidden={!canAdvance}
            onClick={() => setStopped((value) => !value)}
          >
            {stopped ? <PlayIcon size={14} /> : <PauseIcon size={14} />}
          </button>
        </div>
      ) : null}
    </section>
  );
}
