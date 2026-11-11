'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import {
  chooseConsent,
  CONSENT_EVENT,
  storedConsent,
  type AdConsentChoice,
} from '@/lib/ads/consent';
import styles from './legal.module.css';

/**
 * The visitor's ad consent on the privacy page: shows the current choice and changes it (KVKK:
 * consent can be withdrawn as easily as it was given). Stored in this browser; it applies to the
 * ads at once when they are on and is simply kept while they are off.
 */
export function AdChoice() {
  const t = useTranslations('ads.choice');
  const [choice, setChoice] = useState<AdConsentChoice | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setChoice(storedConsent());
    const onChange = () => setChoice(storedConsent());
    window.addEventListener(CONSENT_EVENT, onChange);
    return () => window.removeEventListener(CONSENT_EVENT, onChange);
  }, []);

  function pick(next: AdConsentChoice) {
    chooseConsent(next);
    setChoice(next);
    setSaved(true);
  }

  return (
    <div className={styles.choice} data-testid="ad-choice">
      <h3>{t('title')}</h3>
      <p role="status">
        {t('current', { choice: choice ? t(choice) : t('unset') })}
        {saved ? ` ${t('saved')}` : ''}
      </p>
      <div className={styles.choiceActions}>
        <button
          type="button"
          className={styles.button}
          aria-pressed={choice === 'granted'}
          onClick={() => pick('granted')}
        >
          {t('allow')}
        </button>
        <button
          type="button"
          className={styles.button}
          aria-pressed={choice === 'denied'}
          onClick={() => pick('denied')}
        >
          {t('deny')}
        </button>
      </div>
      <p className={styles.choiceNote}>{t('note')}</p>
    </div>
  );
}
