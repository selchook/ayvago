'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { usePathname } from '@/i18n/navigation';
import {
  DISMISSED_KEY,
  isSnoozed,
  nextDismissal,
  parseDismissal,
  type Dismissal,
} from '@/lib/pwa/install-snooze';
import styles from './install.module.css';

// Registers the service worker and offers to install the platform as an app:
// - Chromium (Android, desktop): the browser's own prompt behind our "Install" button
//   (beforeinstallprompt);
// - iOS / iPadOS: a hint to use Share → Add to Home Screen, which has no API.
// Hidden when already installed, on game pages (it would cover the game) and, after
// "Not now", for a snooze that grows each time (lib/pwa/install-snooze.ts).

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

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

// Edge on Android installs a home screen shortcut, which some launchers (Xiaomi, Oppo, …)
// only allow after the "Home screen shortcuts" permission is granted in Edge's App info.
function isEdgeAndroid(): boolean {
  return /EdgA\//.test(navigator.userAgent);
}

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
  const [mode, setMode] = useState<'hidden' | 'prompt' | 'ios'>('hidden');
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [edge, setEdge] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((error) => {
        console.warn('[pwa] service worker not registered', error);
      });
    }
    setEdge(isEdgeAndroid());

    let timer: number | undefined;
    // Checked again on every event: Chromium fires beforeinstallprompt again on later
    // navigations, and the banner must stay away once the player said "Not now".
    const show = (next: 'prompt' | 'ios') => {
      if (isStandalone() || isSnoozed(readDismissal(), Date.now())) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (!isSnoozed(readDismissal(), Date.now())) setMode(next);
      }, SHOW_DELAY_MS);
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
      const next = nextDismissal(readDismissal(), Date.now());
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
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

  if (mode === 'hidden' || pathname.startsWith('/games/')) return null;
  return (
    <aside className={styles.banner} aria-labelledby="install-title" data-mode={mode}>
      <img className={styles.icon} src="/icons/icon-192.png" alt="" width={48} height={48} />
      <div className={styles.text}>
        <p id="install-title" className={styles.title}>
          {t('title')}
        </p>
        <p className={styles.body}>{mode === 'ios' ? t('iosBody') : t('body')}</p>
        {mode === 'prompt' && edge ? <p className={styles.hint}>{t('edgeHint')}</p> : null}
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
