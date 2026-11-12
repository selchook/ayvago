// Ad providers behind one small interface (docs/adr/0023-ads-behind-an-admin-switch.md). The first
// one is Google H5 Games Ads: the AdSense `adsbygoogle` tag with the Ad Placement API (adBreak /
// adConfig) for interstitial and rewarded ads, and a regular AdSense unit for the desktop banner.
// Another provider (AppLixir, …) only has to implement AdProvider.

export type AdOutcome =
  /** The ad played to the end (rewarded: the reward is earned). */
  | 'viewed'
  /** The ad showed, the player closed it early (rewarded: no reward). */
  | 'dismissed'
  /** No ad was shown: none available, frequency-capped by the provider, blocked, timed out. */
  | 'unavailable';

export type LoadOptions = {
  clientId: string;
  testMode: boolean;
  /** Least time between interstitials, passed on as the provider's own frequency hint. */
  gapSeconds: number;
  /**
   * The provider's tag itself has loaded. That is all a display banner needs; the rewarded and
   * interstitial API may become ready later or never (H5 Games Ads needs its own approval).
   */
  onTag?: () => void;
};

export type BreakOptions = {
  placement: string;
  /** Called just before the ad covers the page, and after it is gone. */
  beforeAd(): void;
  afterAd(): void;
};

export interface AdProvider {
  readonly id: string;
  /**
   * Loads the provider's script once; resolves true when rewarded and interstitial ads can be
   * requested, false when the script is blocked, fails or that API never gets ready.
   */
  load(options: LoadOptions): Promise<boolean>;
  /** `next`: between rounds (game over → play again); `browse`: the player leaves a game. */
  interstitial(kind: 'next' | 'browse', options: BreakOptions): Promise<AdOutcome>;
  rewarded(options: BreakOptions): Promise<AdOutcome>;
  /** Fills a banner element the page rendered (see components/ads/ad-banner.tsx). */
  fillBanner(): void;
}

// The Ad Placement API's surface (https://developers.google.com/ad-placement/apis).
type PlacementInfo = { breakStatus?: string };
type AdBreakConfig = {
  type: 'start' | 'pause' | 'next' | 'browse' | 'reward';
  name: string;
  beforeAd?: () => void;
  afterAd?: () => void;
  beforeReward?: (showAdFn: () => void) => void;
  adDismissed?: () => void;
  adViewed?: () => void;
  adBreakDone?: (info: PlacementInfo) => void;
};
type AdsWindow = Window & {
  adsbygoogle?: unknown[];
  adBreak?: (config: AdBreakConfig) => void;
  adConfig?: (config: Record<string, unknown>) => void;
};

export const ADSENSE_SCRIPT = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';
/** A load that has not finished by then counts as blocked. */
const LOAD_TIMEOUT_MS = 10_000;
/**
 * A break that never reports back is given up after this long, so the game gets its answer
 * before the adapter's own 90-second timeout.
 */
const BREAK_TIMEOUT_MS = 80_000;

let loading: Promise<boolean> | null = null;

function adsWindow(): AdsWindow {
  return window as AdsWindow;
}

/** H5 interstitial statuses that mean the ad was on screen. */
const SHOWN = new Set(['viewed', 'dismissed']);

function runBreak(config: AdBreakConfig, outcome: () => AdOutcome): Promise<AdOutcome> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: AdOutcome) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(result);
    };
    const timer = window.setTimeout(() => finish(outcome()), BREAK_TIMEOUT_MS);
    const adBreak = adsWindow().adBreak;
    if (!adBreak) {
      finish('unavailable');
      return;
    }
    try {
      adBreak({
        ...config,
        adBreakDone: (info) => {
          config.adBreakDone?.(info);
          finish(outcome());
        },
      });
    } catch {
      finish('unavailable');
    }
  });
}

export const h5GamesAds: AdProvider = {
  id: 'h5-games-ads',

  load({ clientId, testMode, gapSeconds, onTag }) {
    if (loading) return loading;
    loading = new Promise<boolean>((resolve) => {
      const w = adsWindow();
      // The API's documented bootstrap: calls queue in adsbygoogle until the tag has loaded.
      w.adsbygoogle = w.adsbygoogle || [];
      w.adBreak = w.adConfig = (config: object) => {
        w.adsbygoogle!.push(config);
      };
      const script = document.createElement('script');
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.src = `${ADSENSE_SCRIPT}?client=${encodeURIComponent(clientId)}`;
      script.dataset.adClient = clientId;
      script.dataset.adFrequencyHint = `${gapSeconds}s`;
      if (testMode) script.dataset.adbreakTest = 'on';
      const timer = window.setTimeout(() => resolve(false), LOAD_TIMEOUT_MS);
      // The tag loading is enough for the AdSense banner unit, whether or not the Ad Placement
      // API below ever calls onReady (it does not until the account is approved for H5 Games).
      script.onload = () => onTag?.();
      script.onerror = () => {
        window.clearTimeout(timer);
        resolve(false);
      };
      document.head.appendChild(script);
      w.adConfig({
        preloadAdBreaks: 'on',
        sound: 'on',
        onReady: () => {
          window.clearTimeout(timer);
          resolve(true);
        },
      });
    });
    return loading;
  },

  interstitial(kind, { placement, beforeAd, afterAd }) {
    let status = '';
    return runBreak(
      {
        type: kind,
        name: placement,
        beforeAd,
        afterAd,
        adBreakDone: (info) => {
          status = info.breakStatus ?? '';
        },
      },
      () => (SHOWN.has(status) ? 'viewed' : 'unavailable'),
    );
  },

  rewarded({ placement, beforeAd, afterAd }) {
    let result: AdOutcome = 'unavailable';
    return runBreak(
      {
        type: 'reward',
        name: placement,
        beforeAd,
        afterAd,
        // The player already chose to watch (the game's button), so the ad starts at once.
        beforeReward: (showAdFn) => showAdFn(),
        adDismissed: () => {
          result = 'dismissed';
        },
        adViewed: () => {
          result = 'viewed';
        },
      },
      () => result,
    );
  },

  fillBanner() {
    const w = adsWindow();
    (w.adsbygoogle = w.adsbygoogle || []).push({});
  },
};
