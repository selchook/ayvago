'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { useAdState } from '@/lib/ads/client';
import { chooseConsent, gdprApplies, storedConsent, type AdConsentChoice } from '@/lib/ads/consent';
import styles from './ads.module.css';

/**
 * The platform's own ad consent notice (KVKK), for visitors Google's TCF message does not cover.
 * Shown once the ad script is live and only until the visitor answers; personalised ads need an
 * explicit "Allow". In the EEA, the UK and Switzerland Google's certified CMP asks instead.
 */
export function AdConsentNotice() {
  const t = useTranslations('ads.consent');
  const { script } = useAdState();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (script !== 'ready' || storedConsent()) return;
    let cancelled = false;
    gdprApplies().then((applies) => {
      if (!cancelled && applies !== true && !storedConsent()) setShow(true);
    });
    return () => {
      cancelled = true;
    };
  }, [script]);

  if (!show) return null;

  function answer(choice: AdConsentChoice) {
    chooseConsent(choice);
    setShow(false);
  }

  return (
    <section className={styles.notice} aria-labelledby="ad-consent-title" data-testid="ad-consent">
      <h2 id="ad-consent-title" className={styles.noticeTitle}>
        {t('title')}
      </h2>
      <p className={styles.noticeBody}>
        {t('body')}{' '}
        <Link href="/privacy#ads" prefetch={false}>
          {t('more')}
        </Link>
      </p>
      <div className={styles.noticeActions}>
        <button
          type="button"
          className={`${styles.button} ${styles.secondary}`}
          onClick={() => answer('denied')}
        >
          {t('deny')}
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles.primary}`}
          onClick={() => answer('granted')}
        >
          {t('allow')}
        </button>
      </div>
    </section>
  );
}
