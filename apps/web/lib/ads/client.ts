'use client';

import { hasRemoveAds, readAdSettings, type AdSettings } from '@ayvago/shared';
import { useSyncExternalStore } from 'react';
import { firebaseEnabled, loadFirestore, loadFunctions } from '@/lib/firebase/client';
import { ADSENSE_BANNER_SLOT, ADSENSE_CLIENT } from './config';
import { writeConsentDefaults } from './consent';
import { createAdManager, type AdEvent, type AdState } from './manager';
import { EMPTY_LOG, readInterstitialLog, type InterstitialLog } from './policy';
import { h5GamesAds } from './provider';

// The platform page's one ad manager, wired to the browser: Firestore for the switch and the
// player's remove_ads, grantAdReward for rewards, local storage for the interstitial caps.

const LOG_KEY = 'ayvago:ads:interstitials';
const SESSION_KEY = 'ayvago:ads:session';

/** Fired on window for every ad event; the analytics hook (GA, later) listens here. */
export const AD_EVENT = 'ayvago:ad';

async function call<T>(name: string, data: unknown): Promise<T> {
  const [functions, { httpsCallable }] = await Promise.all([
    loadFunctions(),
    import('firebase/functions'),
  ]);
  return (await httpsCallable<unknown, T>(functions, name)(data)).data;
}

function readLog(): InterstitialLog {
  try {
    const stored = JSON.parse(window.localStorage.getItem(LOG_KEY) ?? 'null') as unknown;
    const session = Number(window.sessionStorage.getItem(SESSION_KEY) ?? 0);
    return readInterstitialLog(stored, session);
  } catch {
    return EMPTY_LOG;
  }
}

function writeLog(log: InterstitialLog) {
  try {
    const { session, ...stored } = log;
    window.localStorage.setItem(LOG_KEY, JSON.stringify(stored));
    window.sessionStorage.setItem(SESSION_KEY, String(session));
  } catch {
    // Storage refused (private mode): the provider's own frequency hint still applies.
  }
}

export const adManager = createAdManager({
  clientId: ADSENSE_CLIENT,
  bannerSlot: ADSENSE_BANNER_SLOT,
  firebase: firebaseEnabled,
  provider: h5GamesAds,
  rewards: {
    begin: (gameId, placement) =>
      call<{ ticket: string }>('grantAdReward', { step: 'begin', gameId, placement }),
    claim: (ticket) => call<{ rewarded: boolean }>('grantAdReward', { step: 'claim', ticket }),
  },
  storage: { readLog, writeLog },
  consentDefaults: writeConsentDefaults,
  track: (event: AdEvent) => window.dispatchEvent(new CustomEvent(AD_EVENT, { detail: event })),
  now: () => Date.now(),
});

const getServerState = () => adManager.getState();

/** The manager's live state (switch, remove_ads, script) for components. */
export function useAdState(): AdState {
  return useSyncExternalStore(adManager.subscribe, adManager.getState, getServerState);
}

/** Follows config/ads live; the first snapshot (or a failed read: off) marks the switch known. */
export async function watchAdSettings(onChange: (settings: AdSettings) => void) {
  const db = await loadFirestore();
  const { doc, onSnapshot } = await import('firebase/firestore');
  return onSnapshot(
    doc(db, 'config', 'ads'),
    (snapshot) => onChange(readAdSettings(snapshot.data())),
    () => onChange(readAdSettings(undefined)),
  );
}

/** Follows entitlements/{uid}: remove_ads arrives at once after a purchase (roadmap §9.2). */
export async function watchRemoveAds(uid: string, onChange: (removeAds: boolean) => void) {
  const db = await loadFirestore();
  const { doc, onSnapshot } = await import('firebase/firestore');
  return onSnapshot(
    doc(db, 'entitlements', uid),
    (snapshot) => onChange(hasRemoveAds(snapshot.data())),
    // A failed read must not take away a purchase: treat it as owned (no page ads).
    () => onChange(true),
  );
}
