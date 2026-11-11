import { DEFAULT_AD_SETTINGS, type AdSettings } from '@ayvago/shared';
import { describe, expect, it } from 'vitest';
import {
  adPlan,
  adStatus,
  EMPTY_LOG,
  interstitialVerdict,
  logInterstitial,
  NO_ADS,
  readInterstitialLog,
  rewardedAvailable,
  type AdContext,
} from './policy';

const ON: AdSettings = { ...DEFAULT_AD_SETTINGS, enabled: true, cmpConfirmed: true };

const context = (changes: Partial<AdContext> = {}): AdContext => ({
  settings: ON,
  clientId: 'ca-pub-1234567890123456',
  bannerSlot: '1234567890',
  firebase: true,
  removeAds: false,
  ...changes,
});

describe('adPlan', () => {
  it('loads nothing while the switch is off (the default)', () => {
    expect(adPlan(context({ settings: DEFAULT_AD_SETTINGS }))).toEqual(NO_ADS);
    expect(adPlan(context({ settings: { ...ON, enabled: false } }))).toEqual(NO_ADS);
  });

  it('loads nothing when the switch is on but the client ID is not set', () => {
    expect(adPlan(context({ clientId: '' }))).toEqual(NO_ADS);
  });

  it('loads nothing before the consent message is confirmed', () => {
    expect(adPlan(context({ settings: { ...ON, cmpConfirmed: false } }))).toEqual(NO_ADS);
  });

  it('loads with the page and allows every format when everything is set', () => {
    expect(adPlan(context())).toEqual({
      script: 'page-load',
      rewarded: true,
      interstitial: true,
      banner: true,
    });
  });

  it('gives remove_ads owners no interstitial and no banner; rewarded stays on request', () => {
    expect(adPlan(context({ removeAds: true }))).toEqual({
      script: 'on-request',
      rewarded: true,
      interstitial: false,
      banner: false,
    });
    const noRewarded = { ...ON, rewarded: false };
    expect(adPlan(context({ removeAds: true, settings: noRewarded }))).toEqual(NO_ADS);
  });

  it('follows the per-format switches', () => {
    expect(adPlan(context({ settings: { ...ON, interstitial: false, banner: false } }))).toEqual({
      script: 'page-load',
      rewarded: true,
      interstitial: false,
      banner: false,
    });
    expect(
      adPlan(context({ settings: { ...ON, rewarded: false, interstitial: false, banner: false } })),
    ).toEqual(NO_ADS);
  });

  it('needs a banner slot for the banner and Firebase for rewarded ads', () => {
    expect(adPlan(context({ bannerSlot: '' })).banner).toBe(false);
    expect(adPlan(context({ firebase: false })).rewarded).toBe(false);
  });
});

describe('rewardedAvailable (GHA_START.adsEnabled)', () => {
  const plan = adPlan(context());

  it('is false while off, in online matches and before the script is ready', () => {
    expect(rewardedAvailable(NO_ADS, 'ready', false)).toBe(false);
    expect(rewardedAvailable(plan, 'ready', true)).toBe(false);
    expect(rewardedAvailable(plan, 'loading', false)).toBe(false);
    expect(rewardedAvailable(plan, 'failed', false)).toBe(false);
  });

  it('is true once rewarded ads can be served', () => {
    expect(rewardedAvailable(plan, 'ready', false)).toBe(true);
    const onRequest = adPlan(context({ removeAds: true }));
    expect(rewardedAvailable(onRequest, 'idle', false)).toBe(true);
    expect(rewardedAvailable(onRequest, 'failed', false)).toBe(false);
  });
});

describe('interstitialVerdict', () => {
  const plan = adPlan(context());
  const solo = { online: false, inRun: false };
  const now = Date.UTC(2026, 10, 11, 12, 0);

  it('allows the first interstitial of the day between rounds', () => {
    expect(interstitialVerdict(plan, ON, EMPTY_LOG, solo, now)).toBe('ok');
  });

  it('never interrupts while off, for remove_ads, in online matches or during a run', () => {
    expect(interstitialVerdict(NO_ADS, ON, EMPTY_LOG, solo, now)).toBe('off');
    const owner = adPlan(context({ removeAds: true }));
    expect(interstitialVerdict(owner, ON, EMPTY_LOG, solo, now)).toBe('off');
    expect(interstitialVerdict(plan, ON, EMPTY_LOG, { online: true, inRun: false }, now)).toBe(
      'online',
    );
    expect(interstitialVerdict(plan, ON, EMPTY_LOG, { online: false, inRun: true }, now)).toBe(
      'in-run',
    );
  });

  it('keeps the minimum gap (three minutes by default)', () => {
    const log = logInterstitial(EMPTY_LOG, now);
    expect(interstitialVerdict(plan, ON, log, solo, now + 179_000)).toBe('gap');
    expect(interstitialVerdict(plan, ON, log, solo, now + 180_000)).toBe('ok');
    const longer = { ...ON, interstitialGapSeconds: 600 };
    expect(interstitialVerdict(plan, longer, log, solo, now + 300_000)).toBe('gap');
  });

  it('stops at the session cap and the daily cap', () => {
    const settings = { ...ON, interstitialsPerSession: 2, interstitialsPerDay: 3 };
    let log = EMPTY_LOG;
    log = logInterstitial(log, now);
    log = logInterstitial(log, now + 200_000);
    expect(interstitialVerdict(plan, settings, log, solo, now + 400_000)).toBe('session-cap');

    // A new tab session on the same day: the session count starts again, the day's does not.
    log = logInterstitial({ ...log, session: 0 }, now + 400_000);
    expect(interstitialVerdict(plan, settings, { ...log, session: 0 }, solo, now + 600_000)).toBe(
      'day-cap',
    );

    // The next day (UTC) the daily count starts again.
    const tomorrow = Date.UTC(2026, 10, 12, 0, 5);
    expect(interstitialVerdict(plan, settings, { ...log, session: 0 }, solo, tomorrow)).toBe('ok');
  });

  it('shows none at all when a cap is zero', () => {
    const none = { ...ON, interstitialsPerDay: 0 };
    expect(interstitialVerdict(plan, none, EMPTY_LOG, solo, now)).toBe('day-cap');
  });
});

describe('readInterstitialLog', () => {
  it('treats malformed storage as empty', () => {
    expect(readInterstitialLog(null, 'x')).toEqual(EMPTY_LOG);
    expect(readInterstitialLog({ lastAt: 'soon', today: -2 }, -1)).toEqual(EMPTY_LOG);
    expect(readInterstitialLog({ lastAt: 5, day: '2026-11-11', today: 2 }, 1)).toEqual({
      lastAt: 5,
      day: '2026-11-11',
      today: 2,
      session: 1,
    });
  });
});

describe('adStatus (admin panel)', () => {
  const base = {
    clientId: 'ca-pub-1234567890123456',
    bannerSlot: '1234567890',
    firebase: true,
    privacyContact: 'privacy@example.com',
  };

  it('lists everything missing before ads can show', () => {
    expect(adStatus({ ...base, settings: DEFAULT_AD_SETTINGS, clientId: '' })).toEqual({
      live: false,
      blockers: ['switch-off', 'no-client-id', 'cmp-not-confirmed'],
      warnings: ['test-mode'],
    });
  });

  it('is live with warnings only when the essentials are set', () => {
    expect(
      adStatus({ ...base, settings: ON, bannerSlot: '', privacyContact: '', firebase: false }),
    ).toEqual({
      live: true,
      blockers: [],
      warnings: ['firebase-off', 'no-banner-slot', 'test-mode', 'no-privacy-contact'],
    });
    expect(adStatus({ ...base, settings: { ...ON, testMode: false } })).toEqual({
      live: true,
      blockers: [],
      warnings: [],
    });
  });

  it('says so when every format is off', () => {
    const settings = { ...ON, rewarded: false, interstitial: false, banner: false };
    expect(adStatus({ ...base, settings }).blockers).toEqual(['all-formats-off']);
  });
});
