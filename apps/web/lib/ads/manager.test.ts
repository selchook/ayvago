import { DEFAULT_AD_SETTINGS, type AdSettings } from '@ayvago/shared';
import { describe, expect, it, vi } from 'vitest';
import { createAdManager, NOT_SHOWN, type AdDeps, type AdEvent } from './manager';
import { EMPTY_LOG, type InterstitialLog } from './policy';
import type { AdOutcome, AdProvider } from './provider';

const ON: AdSettings = { ...DEFAULT_AD_SETTINGS, enabled: true, cmpConfirmed: true };
const NOW = Date.UTC(2026, 10, 11, 12, 0);

function setup(
  options: {
    clientId?: string;
    loads?: boolean;
    /** The tag itself loads (default true, even when the placement API never gets ready). */
    tag?: boolean;
    rewarded?: AdOutcome;
    interstitial?: AdOutcome;
    begin?: () => Promise<{ ticket: string }>;
    claim?: () => Promise<{ rewarded: boolean }>;
  } = {},
) {
  let log: InterstitialLog = EMPTY_LOG;
  let now = NOW;
  const events: AdEvent['event'][] = [];
  const provider: AdProvider = {
    id: 'fake',
    load: vi.fn(async ({ onTag }) => {
      if (options.tag ?? true) onTag?.();
      return options.loads ?? true;
    }),
    interstitial: vi.fn(async (_kind, hooks) => {
      hooks.beforeAd();
      hooks.afterAd();
      return options.interstitial ?? 'viewed';
    }),
    rewarded: vi.fn(async (hooks) => {
      hooks.beforeAd();
      hooks.afterAd();
      return options.rewarded ?? 'viewed';
    }),
    fillBanner: vi.fn(),
  };
  const deps: AdDeps = {
    clientId: options.clientId ?? 'ca-pub-1234567890123456',
    bannerSlot: '1234567890',
    firebase: () => true,
    provider,
    rewards: {
      begin: vi.fn(options.begin ?? (async () => ({ ticket: 't1' }))),
      claim: vi.fn(options.claim ?? (async () => ({ rewarded: true }))),
    },
    storage: { readLog: () => log, writeLog: (next) => (log = next) },
    consentDefaults: vi.fn(),
    track: (event) => events.push(event.event),
    now: () => now,
  };
  const manager = createAdManager(deps);
  return {
    manager,
    deps,
    provider,
    events,
    advance: (ms: number) => (now += ms),
    log: () => log,
  };
}

const solo = { online: false, inRun: false };
const rewardedRequest = {
  format: 'rewarded' as const,
  placement: 'continue',
  gameId: 'g',
  moment: solo,
};
const interstitialRequest = { ...rewardedRequest, format: 'interstitial' as const };

/** The switch and the player's entitlement as the ad host reports them. */
function live(manager: ReturnType<typeof setup>['manager'], settings = ON, removeAds = false) {
  manager.setSettings(settings);
  manager.setRemoveAds(removeAds);
}

describe('ad manager while off', () => {
  it('never loads the script and answers every request "not shown" at once', async () => {
    const { manager, provider, deps } = setup();
    live(manager, DEFAULT_AD_SETTINGS);
    await expect(manager.request(rewardedRequest)).resolves.toEqual(NOT_SHOWN);
    await expect(manager.request(interstitialRequest)).resolves.toEqual(NOT_SHOWN);
    await expect(manager.leaveInterstitial()).resolves.toEqual(NOT_SHOWN);
    await expect(manager.startAdsEnabled(false)).resolves.toBe(false);
    expect(provider.load).not.toHaveBeenCalled();
    expect(deps.consentDefaults).not.toHaveBeenCalled();
    expect(deps.rewards.begin).not.toHaveBeenCalled();
  });

  it('never loads when the switch is on but the client ID is not set', async () => {
    const { manager, provider } = setup({ clientId: '' });
    live(manager);
    await expect(manager.startAdsEnabled(false)).resolves.toBe(false);
    await expect(manager.request(rewardedRequest)).resolves.toEqual(NOT_SHOWN);
    expect(provider.load).not.toHaveBeenCalled();
  });

  it('answers GHA_START at once without a client ID, before any settings arrive', async () => {
    const { manager } = setup({ clientId: '' });
    const started = Date.now();
    await expect(manager.startAdsEnabled(false, 5_000)).resolves.toBe(false);
    expect(Date.now() - started).toBeLessThan(100);
  });
});

describe('ad manager when on', () => {
  it('loads the script with the page, after the consent defaults', async () => {
    const { manager, provider, deps } = setup();
    live(manager);
    await expect(manager.startAdsEnabled(false)).resolves.toBe(true);
    expect(deps.consentDefaults).toHaveBeenCalledOnce();
    expect(provider.load).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 'ca-pub-1234567890123456',
        testMode: true,
        gapSeconds: 180,
      }),
    );
  });

  it('waits for the entitlement before loading, and never loads for remove_ads', async () => {
    const { manager, provider } = setup();
    manager.setSettings(ON);
    expect(provider.load).not.toHaveBeenCalled();
    manager.setRemoveAds(true);
    expect(provider.load).not.toHaveBeenCalled();
    expect(manager.plan()).toMatchObject({ interstitial: false, banner: false, rewarded: true });
    await expect(manager.request(interstitialRequest)).resolves.toEqual(NOT_SHOWN);
  });

  it('loads on request for remove_ads owners who ask for a rewarded ad', async () => {
    const { manager, provider } = setup();
    live(manager, ON, true);
    await expect(manager.startAdsEnabled(false)).resolves.toBe(true);
    await expect(manager.request(rewardedRequest)).resolves.toEqual({
      shown: true,
      rewarded: true,
    });
    expect(provider.load).toHaveBeenCalledOnce();
  });

  it('reports adsEnabled false when the script is blocked', async () => {
    const { manager } = setup({ loads: false });
    live(manager);
    await expect(manager.startAdsEnabled(false)).resolves.toBe(false);
    await expect(manager.request(rewardedRequest)).resolves.toEqual(NOT_SHOWN);
  });

  it('gives online matches no ads at all', async () => {
    const { manager, provider } = setup();
    live(manager);
    await expect(manager.startAdsEnabled(true)).resolves.toBe(false);
    const online = { online: true, inRun: false };
    await expect(manager.request({ ...rewardedRequest, moment: online })).resolves.toEqual(
      NOT_SHOWN,
    );
    await expect(manager.request({ ...interstitialRequest, moment: online })).resolves.toEqual(
      NOT_SHOWN,
    );
    expect(provider.rewarded).not.toHaveBeenCalled();
    expect(provider.interstitial).not.toHaveBeenCalled();
  });

  it('stops further requests as soon as the switch goes off', async () => {
    const { manager, provider } = setup();
    live(manager);
    await manager.startAdsEnabled(false);
    manager.setSettings({ ...ON, enabled: false });
    await expect(manager.request(rewardedRequest)).resolves.toEqual(NOT_SHOWN);
    await expect(manager.request(interstitialRequest)).resolves.toEqual(NOT_SHOWN);
    expect(provider.rewarded).not.toHaveBeenCalled();
    expect(provider.interstitial).not.toHaveBeenCalled();
  });
});

describe('rewarded flow', () => {
  it('rewards only after the server confirmed the watched ad', async () => {
    const { manager, deps, events } = setup();
    live(manager);
    await manager.startAdsEnabled(false);
    const notes: string[] = [];
    const answer = await manager.request({ ...rewardedRequest, notify: (n) => notes.push(n) });
    expect(answer).toEqual({ shown: true, rewarded: true });
    expect(deps.rewards.begin).toHaveBeenCalledWith('g', 'continue');
    expect(deps.rewards.claim).toHaveBeenCalledWith('t1');
    expect(notes).toEqual(['loading', 'rewardGranted']);
    expect(events).toEqual(['request', 'shown', 'rewarded']);
  });

  it('does not reward an ad the player closed early', async () => {
    const { manager, deps, events } = setup({ rewarded: 'dismissed' });
    live(manager);
    await manager.startAdsEnabled(false);
    await expect(manager.request(rewardedRequest)).resolves.toEqual({
      shown: true,
      rewarded: false,
    });
    expect(deps.rewards.claim).not.toHaveBeenCalled();
    expect(events).toEqual(['request', 'shown', 'skipped']);
  });

  it('does not reward when the server refuses the claim', async () => {
    const refused = Object.assign(new Error('capped'), { details: { reason: 'capped' } });
    const { manager } = setup({ claim: () => Promise.reject(refused) });
    live(manager);
    await manager.startAdsEnabled(false);
    const notes: string[] = [];
    await expect(
      manager.request({ ...rewardedRequest, notify: (n) => notes.push(n) }),
    ).resolves.toEqual({ shown: true, rewarded: false });
    expect(notes).toEqual(['loading', 'rewardFailed']);
  });

  it('shows no ad when the daily cap is reached (the ticket is refused)', async () => {
    const capped = Object.assign(new Error('capped'), { details: { reason: 'capped' } });
    const { manager, provider, events } = setup({ begin: () => Promise.reject(capped) });
    live(manager);
    await manager.startAdsEnabled(false);
    await expect(manager.request(rewardedRequest)).resolves.toEqual(NOT_SHOWN);
    expect(provider.rewarded).not.toHaveBeenCalled();
    expect(events).toEqual(['request', 'capped']);
  });

  it('answers "not shown" when no ad is available', async () => {
    const { manager, deps } = setup({ rewarded: 'unavailable' });
    live(manager);
    await manager.startAdsEnabled(false);
    await expect(manager.request(rewardedRequest)).resolves.toEqual(NOT_SHOWN);
    expect(deps.rewards.claim).not.toHaveBeenCalled();
  });

  it('runs one ad at a time', async () => {
    let release: (outcome: AdOutcome) => void = () => undefined;
    const { manager, provider } = setup();
    vi.mocked(provider.rewarded).mockImplementation(
      () => new Promise<AdOutcome>((resolve) => (release = resolve)),
    );
    live(manager);
    await manager.startAdsEnabled(false);
    const first = manager.request(rewardedRequest);
    await expect(manager.request(rewardedRequest)).resolves.toEqual(NOT_SHOWN);
    await vi.waitFor(() => expect(provider.rewarded).toHaveBeenCalledOnce());
    release('viewed');
    await expect(first).resolves.toEqual({ shown: true, rewarded: true });
  });
});

describe('interstitials', () => {
  it('shows one between rounds, then keeps the minimum gap', async () => {
    const { manager, advance, events } = setup();
    live(manager);
    await manager.startAdsEnabled(false);
    await expect(manager.request(interstitialRequest)).resolves.toEqual({
      shown: true,
      rewarded: false,
    });
    advance(60_000);
    await expect(manager.request(interstitialRequest)).resolves.toEqual(NOT_SHOWN);
    advance(120_000);
    await expect(manager.leaveInterstitial()).resolves.toEqual({ shown: true, rewarded: false });
    expect(events).toEqual(['request', 'shown', 'capped', 'request', 'shown']);
  });

  it('never interrupts a run in progress', async () => {
    const { manager, provider } = setup();
    live(manager);
    await manager.startAdsEnabled(false);
    await expect(
      manager.request({ ...interstitialRequest, moment: { online: false, inRun: true } }),
    ).resolves.toEqual(NOT_SHOWN);
    expect(provider.interstitial).not.toHaveBeenCalled();
  });

  it('counts only interstitials that showed', async () => {
    const { manager, log } = setup({ interstitial: 'unavailable' });
    live(manager);
    await manager.startAdsEnabled(false);
    await expect(manager.request(interstitialRequest)).resolves.toEqual(NOT_SHOWN);
    expect(log()).toEqual(EMPTY_LOG);
  });

  it('respects the session cap', async () => {
    const { manager, advance } = setup();
    live(manager, { ...ON, interstitialsPerSession: 1 });
    await manager.startAdsEnabled(false);
    await expect(manager.request(interstitialRequest)).resolves.toMatchObject({ shown: true });
    advance(10 * 60_000);
    await expect(manager.request(interstitialRequest)).resolves.toEqual(NOT_SHOWN);
  });
});

describe('desktop banner', () => {
  it('fills once the tag has loaded, even if the rewarded and interstitial API never gets ready', async () => {
    const { manager, provider } = setup({ loads: false });
    live(manager);
    await expect(manager.startAdsEnabled(false)).resolves.toBe(false);
    expect(manager.getState()).toMatchObject({ script: 'failed', tag: true });
    manager.fillBanner();
    expect(provider.fillBanner).toHaveBeenCalledOnce();
  });

  it('does not fill while the tag is blocked', async () => {
    const { manager, provider } = setup({ loads: false, tag: false });
    live(manager);
    await manager.startAdsEnabled(false);
    expect(manager.getState().tag).toBe(false);
    manager.fillBanner();
    expect(provider.fillBanner).not.toHaveBeenCalled();
  });

  it('does not fill for remove_ads owners', async () => {
    const { manager, provider } = setup();
    live(manager, ON, true);
    await manager.startAdsEnabled(false);
    manager.fillBanner();
    expect(provider.fillBanner).not.toHaveBeenCalled();
  });
});
