'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { adManager, useAdState } from '@/lib/ads/client';
import { ADSENSE_BANNER_SLOT, ADSENSE_CLIENT } from '@/lib/ads/config';
import styles from './ads.module.css';

/** The game page's side column exists from this width; below it there is no banner at all. */
const DESKTOP = '(min-width: 1100px)';

/**
 * Desktop side-column banner (roadmap §9.1). Rendered only while ads are live, the banner format
 * is on, the player has no remove_ads and the screen is desktop-wide; never on phones and never
 * inside or over the game frame. Turning ads off removes it at once.
 */
export function AdBanner() {
  return ADSENSE_CLIENT && ADSENSE_BANNER_SLOT ? <LiveAdBanner /> : null;
}

function LiveAdBanner() {
  const t = useTranslations('ads');
  const state = useAdState();
  const [desktop, setDesktop] = useState(false);
  const slotRef = useRef<HTMLModElement>(null);
  const show = desktop && state.script === 'ready' && adManager.plan().banner;

  useEffect(() => {
    const query = window.matchMedia(DESKTOP);
    const update = () => setDesktop(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const slot = slotRef.current;
    if (!show || !slot || slot.dataset.filled) return;
    slot.dataset.filled = '1';
    try {
      adManager.fillBanner();
    } catch {
      // A blocked or failed fill leaves the labelled slot empty.
    }
  }, [show]);

  if (!show) return null;
  return (
    <aside className={styles.banner} aria-label={t('label')} data-testid="ad-banner">
      <span className={styles.bannerLabel}>{t('label')}</span>
      <ins
        ref={slotRef}
        className={`adsbygoogle ${styles.bannerSlot}`}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={ADSENSE_BANNER_SLOT}
      />
    </aside>
  );
}
