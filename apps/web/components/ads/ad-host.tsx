'use client';

import { readAdSettings } from '@ayvago/shared';
import { useEffect } from 'react';
import { useAccount } from '@/lib/account/store';
import { adManager, watchAdSettings, watchRemoveAds } from '@/lib/ads/client';
import { ADSENSE_CLIENT } from '@/lib/ads/config';
import { firebaseEnabled } from '@/lib/firebase/client';
import { AdConsentNotice } from './ad-consent-notice';

/**
 * Feeds the ad manager the live admin switch (config/ads) and the player's remove_ads
 * (entitlements/{uid}); the manager loads the provider only when they allow it. Without the
 * AdSense client ID (docs/setup/phase-3.md) this renders nothing and reads nothing.
 */
export function AdHost() {
  return ADSENSE_CLIENT && firebaseEnabled() ? <LiveAdHost /> : null;
}

function LiveAdHost() {
  const account = useAccount();
  const uid = account.status === 'signedIn' ? account.uid : null;
  const accountKnown = account.status !== 'loading';

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    watchAdSettings(adManager.setSettings)
      .then((unsubscribe) => (cancelled ? unsubscribe() : (stop = unsubscribe)))
      .catch(() => adManager.setSettings(readAdSettings(undefined)));
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  useEffect(() => {
    if (!accountKnown) return;
    if (!uid) {
      adManager.setRemoveAds(false);
      return;
    }
    let stop: (() => void) | undefined;
    let cancelled = false;
    watchRemoveAds(uid, adManager.setRemoveAds)
      .then((unsubscribe) => (cancelled ? unsubscribe() : (stop = unsubscribe)))
      // Unknown: no page ads (never show ads to someone who may have paid to remove them).
      .catch(() => adManager.setRemoveAds(true));
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [uid, accountKnown]);

  return <AdConsentNotice />;
}
