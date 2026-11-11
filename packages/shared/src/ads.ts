// Ads (Phase 3, docs/adr/0023-ads-behind-an-admin-switch.md). The settings live in one Firestore
// document, config/ads: anyone may read it, only admins write it (firestore.rules), and a missing
// or malformed document means "ads off". The web app, the admin panel and grantAdReward all read
// it through readAdSettings, so the defaults below are the single source of truth.

export const AD_FORMATS = ['rewarded', 'interstitial', 'banner'] as const;
export type AdFormat = (typeof AD_FORMATS)[number];

export type AdSettings = {
  /** Master switch. Absent or anything but `true` means off. */
  enabled: boolean;
  /** Per-format switches; they only matter while `enabled` is on. */
  rewarded: boolean;
  interstitial: boolean;
  banner: boolean;
  /** Least time between two interstitials for one browser (roadmap §9.1: at least 3 minutes). */
  interstitialGapSeconds: number;
  /** Interstitials per browser tab session and per calendar day (UTC). 0 = none. */
  interstitialsPerSession: number;
  interstitialsPerDay: number;
  /** Rewarded ads a player may be rewarded for per day (UTC), enforced by grantAdReward. */
  rewardedPerDay: number;
  /**
   * Platform reward per rewarded ad, recorded with the grant. The platform has no currency yet
   * (wallets are Phase 5), so this is 0 by default; in-game rewards (continue, 2×) are the game's.
   */
  rewardAmount: number;
  /** Ask the provider for test ads (H5 Games Ads `data-adbreak-test="on"`): no revenue. */
  testMode: boolean;
  /**
   * The owner confirmed that the consent message (Google Privacy & messaging, TCF v2.2 for the
   * EEA, UK and Switzerland) is published. The ad script never loads before that.
   */
  cmpConfirmed: boolean;
};

/** Inclusive ranges the admin panel offers and the Firestore rules enforce. */
export const AD_SETTING_LIMITS = {
  interstitialGapSeconds: { min: 180, max: 3600 },
  interstitialsPerSession: { min: 0, max: 50 },
  interstitialsPerDay: { min: 0, max: 200 },
  rewardedPerDay: { min: 0, max: 200 },
  rewardAmount: { min: 0, max: 1000 },
} as const;

export type AdNumberSetting = keyof typeof AD_SETTING_LIMITS;
export const AD_NUMBER_SETTINGS = Object.keys(AD_SETTING_LIMITS) as AdNumberSetting[];
export const AD_FLAG_SETTINGS = [
  'enabled',
  'rewarded',
  'interstitial',
  'banner',
  'testMode',
  'cmpConfirmed',
] as const;
export type AdFlagSetting = (typeof AD_FLAG_SETTINGS)[number];

/** Ads are off until an admin turns them on; everything else is ready to go. */
export const DEFAULT_AD_SETTINGS: AdSettings = Object.freeze({
  enabled: false,
  rewarded: true,
  interstitial: true,
  banner: true,
  interstitialGapSeconds: 180,
  interstitialsPerSession: 6,
  interstitialsPerDay: 20,
  rewardedPerDay: 20,
  rewardAmount: 0,
  testMode: true,
  cmpConfirmed: false,
});

function clampInt(value: unknown, setting: AdNumberSetting): number {
  const { min, max } = AD_SETTING_LIMITS[setting];
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_AD_SETTINGS[setting];
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * Normalizes the config/ads document. Missing fields take their defaults; `enabled` is on only
 * when it is exactly `true`, so an absent or damaged document can never turn ads on.
 */
export function readAdSettings(data: unknown): AdSettings {
  const d = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
  const flag = (key: AdFlagSetting) =>
    typeof d[key] === 'boolean' ? (d[key] as boolean) : DEFAULT_AD_SETTINGS[key];
  return {
    enabled: d.enabled === true,
    rewarded: flag('rewarded'),
    interstitial: flag('interstitial'),
    banner: flag('banner'),
    testMode: flag('testMode'),
    cmpConfirmed: flag('cmpConfirmed'),
    interstitialGapSeconds: clampInt(d.interstitialGapSeconds, 'interstitialGapSeconds'),
    interstitialsPerSession: clampInt(d.interstitialsPerSession, 'interstitialsPerSession'),
    interstitialsPerDay: clampInt(d.interstitialsPerDay, 'interstitialsPerDay'),
    rewardedPerDay: clampInt(d.rewardedPerDay, 'rewardedPerDay'),
    rewardAmount: clampInt(d.rewardAmount, 'rewardAmount'),
  };
}

/** Calendar day (UTC) used by the daily caps: "2026-11-11". */
export function adDayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** A rewarded placement name from a game: short, plain characters, "default" otherwise. */
export function adPlacement(value: unknown): string {
  return typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,40}$/.test(value) ? value : 'default';
}

/** entitlements/{uid} (roadmap §9.2): only an explicit `removeAds: true` removes ads. */
export function hasRemoveAds(data: unknown): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { removeAds?: unknown }).removeAds === true
  );
}
