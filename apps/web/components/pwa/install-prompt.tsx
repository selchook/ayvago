'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { usePathname } from '@/i18n/navigation';
import {
  DISMISSED_KEY,
  isSnoozed,
  nextDismissal,
  parseDismissal,
  type Dismissal,
} from '@/lib/pwa/install-snooze';
import {
  hideBanner,
  onInstallEvent,
  promptInstall,
  showBanner,
  startInstallStore,
  useInstall,
} from '@/lib/pwa/install-store';
import styles from './install.module.css';

// Registers the service worker and offers to install the platform as an app, on the first
// visit already:
// - Chromium (Android, desktop): the browser's own prompt behind our "Install" button
//   (beforeinstallprompt);
// - iOS / iPadOS: a hint to use Share → Add to Home Screen, which has no API.
// Hidden when already installed and on game pages (it would cover the game). After "Not now"
// it comes back after a snooze that grows each time (lib/pwa/install-snooze.ts). The
// "Install the app" link in the menu (InstallLink) opens it at any time.

const SHOW_DELAY_MS = 1000;

function readDismissal(): Dismissal | null {
  try {
    return parseDismissal(localStorage.getItem(DISMISSED_KEY));
  } catch {
    return null;
  }
}

export function InstallPrompt() {
  const t = useTranslations('install');
  const pathname = usePathname();
  const { banner, edgeAndroid, ios, installed, requested } = useInstall();

  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((error) => {
        console.warn('[pwa] service worker not registered', error);
      });
    }
    startInstallStore();
  }, []);

  useEffect(() => {
    if (installed) return;
    let timer: number | undefined;
    // Checked again on every event: Chromium fires beforeinstallprompt again on later
    // navigations, and the banner must stay away while "Not now" is in effect.
    const show = (mode: 'prompt' | 'ios') => {
      if (isSnoozed(readDismissal(), Date.now())) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => showBanner(mode), SHOW_DELAY_MS);
    };
    const stop = onInstallEvent(() => show('prompt'));
    if (ios) show('ios');
    return () => {
      window.clearTimeout(timer);
      stop();
    };
  }, [installed, ios]);

  function dismiss() {
    hideBanner();
    try {
      const next = nextDismissal(readDismissal(), Date.now());
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
    } catch {
      // Storage can be unavailable (private mode); the banner simply shows again next visit.
    }
  }

  async function install() {
    if ((await promptInstall()) === 'dismissed') dismiss();
  }

  if (banner === 'hidden' || installed) return null;
  if (!requested && pathname.startsWith('/games/')) return null;
  const body = banner === 'ios' ? t('iosBody') : banner === 'manual' ? t('manualBody') : t('body');
  return (
    <aside className={styles.banner} aria-labelledby="install-title" data-mode={banner}>
      <img className={styles.icon} src="/icons/icon-192.png" alt="" width={48} height={48} />
      <div className={styles.text}>
        <p id="install-title" className={styles.title}>
          {t('title')}
        </p>
        <p className={styles.body}>{body}</p>
        {banner === 'prompt' && edgeAndroid ? <p className={styles.hint}>{t('edgeHint')}</p> : null}
      </div>
      <div className={styles.actions}>
        {banner === 'prompt' ? (
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
          <button
            type="button"
            className={`${styles.button} ${styles.primary}`}
            onClick={requested ? hideBanner : dismiss}
          >
            {t('ok')}
          </button>
        )}
      </div>
    </aside>
  );
}
