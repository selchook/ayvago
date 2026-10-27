'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import styles from './install.module.css';

// Registers the service worker and offers to install the platform as an app:
// - Chromium (Android, desktop): the browser's own prompt behind our "Install" button
//   (beforeinstallprompt);
// - iOS / iPadOS: a hint to use Share → Add to Home Screen, which has no API.
// Hidden when already installed, and for two weeks after "Not now".

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DISMISSED_KEY = 'ayvago-install-dismissed';
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;
const SHOW_DELAY_MS = 3000;

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  // iPadOS reports a desktop Safari user agent; touch support gives it away.
  return /iphone|ipad|ipod/i.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

function snoozed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISSED_KEY));
    return at > 0 && Date.now() - at < SNOOZE_MS;
  } catch {
    return false;
  }
}

export function InstallPrompt() {
  const t = useTranslations('install');
  const [mode, setMode] = useState<'hidden' | 'prompt' | 'ios'>('hidden');
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((error) => {
        console.warn('[pwa] service worker not registered', error);
      });
    }
    if (isStandalone() || snoozed()) return;

    let timer: number | undefined;
    const show = (next: 'prompt' | 'ios') => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setMode(next), SHOW_DELAY_MS);
    };
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallEvent);
      show('prompt');
    };
    const onInstalled = () => setMode('hidden');
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    if (isIos()) show('ios');
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  function dismiss() {
    setMode('hidden');
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      // Storage can be unavailable (private mode); the banner simply shows again next visit.
    }
  }

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    setInstallEvent(null);
    if (outcome === 'accepted') setMode('hidden');
    else dismiss();
  }

  if (mode === 'hidden') return null;
  return (
    <aside className={styles.banner} aria-labelledby="install-title" data-mode={mode}>
      <img className={styles.icon} src="/icons/icon-192.png" alt="" width={48} height={48} />
      <div className={styles.text}>
        <p id="install-title" className={styles.title}>
          {t('title')}
        </p>
        <p className={styles.body}>{mode === 'ios' ? t('iosBody') : t('body')}</p>
      </div>
      <div className={styles.actions}>
        {mode === 'prompt' ? (
          <>
            <button
              type="button"
              className={`${styles.button} ${styles.secondary}`}
              onClick={dismiss}
            >
              {t('later')}
            </button>
            <button
              type="button"
              className={`${styles.button} ${styles.primary}`}
              onClick={install}
            >
              {t('install')}
            </button>
          </>
        ) : (
          <button type="button" className={`${styles.button} ${styles.primary}`} onClick={dismiss}>
            {t('ok')}
          </button>
        )}
      </div>
    </aside>
  );
}
