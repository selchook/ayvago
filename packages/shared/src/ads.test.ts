import { describe, expect, it } from 'vitest';
import {
  AD_SETTING_LIMITS,
  adDayKey,
  adPlacement,
  DEFAULT_AD_SETTINGS,
  hasRemoveAds,
  readAdSettings,
} from './ads';

describe('readAdSettings', () => {
  it('is off with the defaults when the document is missing', () => {
    expect(readAdSettings(undefined)).toEqual(DEFAULT_AD_SETTINGS);
    expect(readAdSettings(null).enabled).toBe(false);
    expect(DEFAULT_AD_SETTINGS.enabled).toBe(false);
  });

  it('turns ads on only for an explicit true', () => {
    expect(readAdSettings({ enabled: true }).enabled).toBe(true);
    expect(readAdSettings({ enabled: 'true' }).enabled).toBe(false);
    expect(readAdSettings({ enabled: 1 }).enabled).toBe(false);
  });

  it('keeps the roadmap gap of at least three minutes', () => {
    expect(DEFAULT_AD_SETTINGS.interstitialGapSeconds).toBe(180);
    expect(readAdSettings({ interstitialGapSeconds: 10 }).interstitialGapSeconds).toBe(
      AD_SETTING_LIMITS.interstitialGapSeconds.min,
    );
  });

  it('clamps numbers into range and ignores malformed ones', () => {
    const settings = readAdSettings({
      rewardedPerDay: 10_000,
      interstitialsPerDay: -4,
      interstitialsPerSession: 'many',
      rewardAmount: 2.6,
    });
    expect(settings.rewardedPerDay).toBe(AD_SETTING_LIMITS.rewardedPerDay.max);
    expect(settings.interstitialsPerDay).toBe(0);
    expect(settings.interstitialsPerSession).toBe(DEFAULT_AD_SETTINGS.interstitialsPerSession);
    expect(settings.rewardAmount).toBe(3);
  });

  it('reads the per-format switches', () => {
    const settings = readAdSettings({ enabled: true, banner: false, testMode: false });
    expect(settings).toMatchObject({ rewarded: true, interstitial: true, banner: false });
    expect(settings.testMode).toBe(false);
  });
});

describe('helpers', () => {
  it('uses UTC days for the caps', () => {
    expect(adDayKey(Date.UTC(2026, 10, 11, 23, 59))).toBe('2026-11-11');
  });

  it('keeps plain placement names only', () => {
    expect(adPlacement('continue')).toBe('continue');
    expect(adPlacement('double-coins_2')).toBe('double-coins_2');
    expect(adPlacement('<script>')).toBe('default');
    expect(adPlacement(42)).toBe('default');
    expect(adPlacement('x'.repeat(41))).toBe('default');
  });

  it('removes ads only for an explicit entitlement', () => {
    expect(hasRemoveAds({ removeAds: true })).toBe(true);
    expect(hasRemoveAds({ removeAds: 'yes' })).toBe(false);
    expect(hasRemoveAds(undefined)).toBe(false);
  });
});
