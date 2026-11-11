'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import {
  chooseConsent,
  CONSENT_EVENT,
  gdprApplies,
  openGooglePrivacyOptions,
  storedConsent,
  type AdConsentChoice,
} from '@/lib/ads/consent';
import styles from './legal.module.css';

/**
 * The visitor's ad consent on the privacy page: shows the current choice and changes it (KVKK:
 * consent can be withdrawn as easily as it was given). Stored in this browser; it applies to the
 * ads at once when they are on and is simply kept while they are off.
 *
 * Where Google's CMP covers the visitor (EEA, UK, Switzerland), consent belongs to Google's
 * message alone: the page then offers Google's own "Privacy and cookie settings" instead of the
 * platform's buttons, so there is one consent and one place to change it.
 */
export function AdChoice() {
  const t = useTranslations('ads.choice');
  const [choice, setChoice] = useState<AdConsentChoice | null>(null);
  const [saved, setSaved] = useState(false);
  const [google, setGoogle] = useState(false);

  useEffect(() => {
    setChoice(storedConsent());
    const onChange = () => setChoice(storedConsent());
    window.addEventListener(CONSENT_EVENT, onChange);
    let live = true;
    // Google's CMP answers only while ads are on; otherwise this resolves null and nothing changes.
    void gdprApplies(2500).then((applies) => {
      if (live && applies === true) setGoogle(true);
    });
    return () => {
      live = false;
      window.removeEventListener(CONSENT_EVENT, onChange);
    };
  }, []);

  if (google) {
    return (
      <div className={styles.choice} data-testid="ad-choice" data-cmp="google">
        <h3>{t('title')}</h3>
        <p>{t('google')}</p>
        <div className={styles.choiceActions}>
          <button
            type="button"
            className={styles.button}
            onClick={() => openGooglePrivacyOptions()}
          >
            {t('googleButton')}
          </button>
        </div>
      </div>
    );
  }

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
