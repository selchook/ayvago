import { adDayKey, type AdSettings } from '@ayvago/shared';

// The ad manager's decisions as pure functions (docs/adr/0023-ads-behind-an-admin-switch.md), so
// every rule is unit tested: what may load, which formats may show, and when an interstitial may
// interrupt. The browser side (lib/ads/manager.ts) only feeds them the live state.

export type AdContext = {
  /** config/ads, normalized (readAdSettings); absent means off. */
  settings: AdSettings;
  /** NEXT_PUBLIC_ADSENSE_CLIENT, '' when not set. */
  clientId: string;
  /** NEXT_PUBLIC_ADSENSE_BANNER_SLOT, '' when not set. */
  bannerSlot: string;
  /** Firebase is configured: rewarded ads need grantAdReward to confirm the reward. */
  firebase: boolean;
  /** The player owns remove_ads (entitlements/{uid}). */
  removeAds: boolean;
};

export type AdPlan = {
  /**
   * When the provider's script loads: with the page, only once the player asks for a rewarded ad
   * (remove_ads owners, for whom rewarded ads stay optional), or never.
   */
  script: 'page-load' | 'on-request' | 'never';
  rewarded: boolean;
  interstitial: boolean;
  banner: boolean;
};

export const NO_ADS: AdPlan = Object.freeze({
  script: 'never',
  rewarded: false,
  interstitial: false,
  banner: false,
});

/** Reasons nothing can show at all. */
export type AdBlocker = 'switch-off' | 'no-client-id' | 'cmp-not-confirmed' | 'all-formats-off';
/** Things that limit what shows, or how. */
export type AdWarning = 'firebase-off' | 'no-banner-slot' | 'test-mode' | 'no-privacy-contact';

export type AdStatus = { live: boolean; blockers: AdBlocker[]; warnings: AdWarning[] };

/** What stands between the switch and an ad on screen, for the admin panel's status line. */
export function adStatus(
  context: Omit<AdContext, 'removeAds'> & { privacyContact: string },
): AdStatus {
  const { settings } = context;
  const blockers: AdBlocker[] = [];
  if (!settings.enabled) blockers.push('switch-off');
  if (!context.clientId) blockers.push('no-client-id');
  if (!settings.cmpConfirmed) blockers.push('cmp-not-confirmed');
  if (!settings.rewarded && !settings.interstitial && !settings.banner) {
    blockers.push('all-formats-off');
  }
  const warnings: AdWarning[] = [];
  if (settings.rewarded && !context.firebase) warnings.push('firebase-off');
  if (settings.banner && !context.bannerSlot) warnings.push('no-banner-slot');
  if (settings.testMode) warnings.push('test-mode');
  if (!context.privacyContact) warnings.push('no-privacy-contact');
  return { live: blockers.length === 0, blockers, warnings };
}

/**
 * What this visitor may get. Nothing loads unless the switch is on, the client ID is set and the
 * owner confirmed the consent message. remove_ads owners get no interstitials and no banners;
 * their script loads only when they ask for a rewarded ad themselves.
 */
export function adPlan(context: AdContext): AdPlan {
  const { settings } = context;
  if (!settings.enabled || !context.clientId || !settings.cmpConfirmed) return NO_ADS;
  const rewarded = settings.rewarded && context.firebase;
  const interstitial = settings.interstitial && !context.removeAds;
  const banner = settings.banner && !context.removeAds && context.bannerSlot !== '';
  const script = context.removeAds
    ? rewarded
      ? 'on-request'
      : 'never'
    : rewarded || interstitial || banner
      ? 'page-load'
      : 'never';
  return { script, rewarded, interstitial, banner };
}

export type ScriptState = 'idle' | 'loading' | 'ready' | 'failed';

/**
 * GHA_START.adsEnabled: true only when a rewarded ad can be served now, so games hide their
 * "watch an ad" buttons otherwise. Online rooms and tables never get ads (the other players
 * would wait).
 */
export function rewardedAvailable(plan: AdPlan, script: ScriptState, online: boolean): boolean {
  if (online || !plan.rewarded) return false;
  return plan.script === 'on-request' ? script !== 'failed' : script === 'ready';
}

/** Interstitials shown in this browser: the last one, today's (UTC) and this tab session's. */
export type InterstitialLog = {
  lastAt: number | null;
  day: string;
  today: number;
  session: number;
};

export const EMPTY_LOG: InterstitialLog = Object.freeze({
  lastAt: null,
  day: '',
  today: 0,
  session: 0,
});

/** Where the player is when an interstitial would show. */
export type AdMoment = {
  /** An online room or table: never an interstitial. */
  online: boolean;
  /** A solo run is in progress (GHA_SESSION_START without GHA_END): never an interstitial. */
  inRun: boolean;
};

export type InterstitialVerdict =
  'ok' | 'off' | 'online' | 'in-run' | 'gap' | 'session-cap' | 'day-cap';

export function interstitialVerdict(
  plan: AdPlan,
  settings: AdSettings,
  log: InterstitialLog,
  moment: AdMoment,
  now: number,
): InterstitialVerdict {
  if (!plan.interstitial) return 'off';
  if (moment.online) return 'online';
  if (moment.inRun) return 'in-run';
  if (log.lastAt !== null && now - log.lastAt < settings.interstitialGapSeconds * 1000) {
    return 'gap';
  }
  if (log.session >= settings.interstitialsPerSession) return 'session-cap';
  const today = log.day === adDayKey(now) ? log.today : 0;
  if (today >= settings.interstitialsPerDay) return 'day-cap';
  return 'ok';
}

/** The log after an interstitial was shown at `now`. */
export function logInterstitial(log: InterstitialLog, now: number): InterstitialLog {
  const day = adDayKey(now);
  return {
    lastAt: now,
    day,
    today: (log.day === day ? log.today : 0) + 1,
    session: log.session + 1,
  };
}

/** Reads a stored log; anything malformed counts as empty. */
export function readInterstitialLog(stored: unknown, session: unknown): InterstitialLog {
  const s = (typeof stored === 'object' && stored !== null ? stored : {}) as Record<
    string,
    unknown
  >;
  const count = (value: unknown) =>
    typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
  return {
    lastAt: typeof s.lastAt === 'number' && Number.isFinite(s.lastAt) ? s.lastAt : null,
    day: typeof s.day === 'string' ? s.day : '',
    today: count(s.today),
    session: count(session),
  };
}
