import { DEFAULT_AD_SETTINGS, type AdSettings } from '@ayvago/shared';
import {
  adPlan,
  interstitialVerdict,
  logInterstitial,
  rewardedAvailable,
  type AdMoment,
  type AdPlan,
  type InterstitialLog,
  type ScriptState,
} from './policy';
import type { AdOutcome, AdProvider } from './provider';

// The ad manager of the top-level platform page (docs/adr/0023-ads-behind-an-admin-switch.md).
// Games never show ads themselves: they send GHA_AD_REQUEST and get GHA_AD_RESULT. The manager
// holds the live state (the admin switch, the player's remove_ads, the provider script) and
// answers every request; while ads are off it answers "not shown" at once and touches nothing.
// Everything browser-specific comes in through AdDeps, so the rules are unit tested.

export type AdState = {
  settings: AdSettings;
  /** The first config/ads snapshot arrived (or there is none to wait for). */
  settingsKnown: boolean;
  removeAds: boolean;
  /** The player's remove_ads is known (signed out, or the entitlement was read). */
  entitlementKnown: boolean;
  script: ScriptState;
  /**
   * The provider's tag has loaded, which is all the display banner needs. `script` turns
   * `ready` only once rewarded and interstitial ads can be requested as well.
   */
  tag: boolean;
  /** An ad is being requested or shown; one at a time. */
  busy: boolean;
};

export type AdAnswer = { shown: boolean; rewarded: boolean };
export const NOT_SHOWN: AdAnswer = Object.freeze({ shown: false, rewarded: false });

/** Short notes the game page shows next to the score while a rewarded ad runs. */
export type AdNote = 'loading' | 'rewardGranted' | 'rewardFailed' | 'unavailable';

/** Ad events for analytics; no personal data (docs/plan/phase-3.md: GA is not wired yet). */
export type AdEvent = {
  event: 'request' | 'shown' | 'rewarded' | 'skipped' | 'capped' | 'unavailable';
  format: 'rewarded' | 'interstitial';
  placement: string;
};

export type AdRequest = {
  format: 'rewarded' | 'interstitial';
  placement: string;
  /** The game's manifest id (rewards are recorded per game). */
  gameId: string;
  /** An online room or table, and whether a solo run is in progress. */
  moment: AdMoment;
  /** Around the ad: the game page mutes the game while the ad plays. */
  beforeAd?: () => void;
  afterAd?: () => void;
  notify?: (note: AdNote) => void;
};

export type AdDeps = {
  clientId: string;
  bannerSlot: string;
  firebase: () => boolean;
  provider: AdProvider;
  /** grantAdReward: a ticket before the ad, the grant after it. Errors carry details.reason. */
  rewards: {
    begin(gameId: string, placement: string): Promise<{ ticket: string }>;
    claim(ticket: string): Promise<{ rewarded: boolean }>;
  };
  storage: { readLog(): InterstitialLog; writeLog(log: InterstitialLog): void };
  /** Consent Mode defaults, written once before the script loads. */
  consentDefaults(): void;
  track(event: AdEvent): void;
  now(): number;
};

const INITIAL: AdState = {
  settings: DEFAULT_AD_SETTINGS,
  settingsKnown: false,
  removeAds: false,
  entitlementKnown: false,
  script: 'idle',
  tag: false,
  busy: false,
};

const CAPPED = new Set(['gap', 'session-cap', 'day-cap']);

export function createAdManager(deps: AdDeps) {
  let state: AdState = INITIAL;
  const listeners = new Set<() => void>();
  let loading: Promise<boolean> | null = null;

  function set(patch: Partial<AdState>) {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
    maybeLoad();
  }

  function plan(): AdPlan {
    return adPlan({
      settings: state.settings,
      clientId: deps.clientId,
      bannerSlot: deps.bannerSlot,
      firebase: deps.firebase(),
      removeAds: state.removeAds,
    });
  }

  // The script loads with the page only once both the switch and the player's remove_ads are
  // known, so a remove_ads owner never downloads it unasked.
  function maybeLoad() {
    if (state.script !== 'idle' || !state.settingsKnown || !state.entitlementKnown) return;
    if (plan().script === 'page-load') void loadScript();
  }

  function loadScript(): Promise<boolean> {
    if (state.script === 'ready') return Promise.resolve(true);
    if (state.script === 'failed') return Promise.resolve(false);
    loading ??= (async () => {
      set({ script: 'loading' });
      deps.consentDefaults();
      let ok = false;
      try {
        ok = await deps.provider.load({
          clientId: deps.clientId,
          testMode: state.settings.testMode,
          gapSeconds: state.settings.interstitialGapSeconds,
          onTag: () => set({ tag: true }),
        });
      } catch {
        ok = false;
      }
      set({ script: ok ? 'ready' : 'failed' });
      return ok;
    })();
    return loading;
  }

  /** Resolves once `ready` holds or `ms` passed. */
  function waitFor(ready: () => boolean, ms: number): Promise<void> {
    if (ready()) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        listeners.delete(check);
        resolve();
      };
      const check = () => {
        if (ready()) done();
      };
      const timer = setTimeout(done, ms);
      listeners.add(check);
    });
  }

  async function rewarded(request: AdRequest): Promise<AdAnswer> {
    const { placement, notify } = request;
    const track = (event: AdEvent['event']) => deps.track({ event, format: 'rewarded', placement });
    track('request');
    notify?.('loading');
    if (!(await loadScript())) {
      track('unavailable');
      notify?.('unavailable');
      return NOT_SHOWN;
    }
    let ticket: string;
    try {
      ticket = (await deps.rewards.begin(request.gameId, placement)).ticket;
    } catch (error) {
      const reason = (error as { details?: { reason?: string } }).details?.reason;
      track(reason === 'capped' ? 'capped' : 'unavailable');
      notify?.('unavailable');
      return NOT_SHOWN;
    }
    // The switch may have gone off while the ticket was on its way.
    if (!plan().rewarded) return NOT_SHOWN;
    const outcome: AdOutcome = await deps.provider.rewarded({
      placement,
      beforeAd: () => request.beforeAd?.(),
      afterAd: () => request.afterAd?.(),
    });
    if (outcome === 'unavailable') {
      track('unavailable');
      notify?.('unavailable');
      return NOT_SHOWN;
    }
    track('shown');
    if (outcome === 'dismissed') {
      track('skipped');
      return { shown: true, rewarded: false };
    }
    // Only the server's confirmation turns a watched ad into a reward.
    try {
      if ((await deps.rewards.claim(ticket)).rewarded) {
        track('rewarded');
        notify?.('rewardGranted');
        return { shown: true, rewarded: true };
      }
    } catch {
      // capped, switched off, expired: no reward
    }
    notify?.('rewardFailed');
    return { shown: true, rewarded: false };
  }

  async function interstitial(
    kind: 'next' | 'browse',
    placement: string,
    moment: AdMoment,
    hooks: Pick<AdRequest, 'beforeAd' | 'afterAd'> = {},
  ): Promise<AdAnswer> {
    const now = deps.now();
    const log = deps.storage.readLog();
    const verdict = interstitialVerdict(plan(), state.settings, log, moment, now);
    const track = (event: AdEvent['event']) =>
      deps.track({ event, format: 'interstitial', placement });
    if (verdict !== 'ok') {
      if (CAPPED.has(verdict)) track('capped');
      return NOT_SHOWN;
    }
    // Interstitials never wait for the script: it loads with the page when they are on.
    if (state.script !== 'ready' || state.busy) return NOT_SHOWN;
    set({ busy: true });
    try {
      track('request');
      const outcome = await deps.provider.interstitial(kind, {
        placement,
        beforeAd: () => hooks.beforeAd?.(),
        afterAd: () => hooks.afterAd?.(),
      });
      if (outcome === 'unavailable') {
        track('unavailable');
        return NOT_SHOWN;
      }
      deps.storage.writeLog(logInterstitial(log, deps.now()));
      track('shown');
      return { shown: true, rewarded: false };
    } finally {
      set({ busy: false });
    }
  }

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    plan,
    setSettings(settings: AdSettings) {
      set({ settings, settingsKnown: true });
    },
    setRemoveAds(removeAds: boolean) {
      set({ removeAds, entitlementKnown: true });
    },

    /**
     * GHA_START.adsEnabled. While ads are live it waits up to `waitMs` for the switch and the
     * script, so a game that starts with the page still gets its answer; while they are off (no
     * client ID) it answers false at once.
     */
    async startAdsEnabled(online: boolean, waitMs = 3000): Promise<boolean> {
      if (online || !deps.clientId || !deps.firebase()) return false;
      await waitFor(() => state.settingsKnown && state.entitlementKnown, waitMs);
      const current = plan();
      if (!current.rewarded) return false;
      if (current.script === 'page-load') {
        await waitFor(() => state.script === 'ready' || state.script === 'failed', waitMs);
      }
      return rewardedAvailable(plan(), state.script, online);
    },

    /** Answers a game's GHA_AD_REQUEST. Off, online, busy or not possible: not shown, at once. */
    async request(request: AdRequest): Promise<AdAnswer> {
      if (request.format === 'interstitial') {
        return interstitial('next', request.placement, request.moment, request);
      }
      const current = plan();
      if (request.moment.online || !current.rewarded || state.busy) return NOT_SHOWN;
      if (state.script === 'failed') return NOT_SHOWN;
      set({ busy: true });
      try {
        return await rewarded(request);
      } finally {
        set({ busy: false });
      }
    },

    /** Fills the desktop banner slot the page rendered (only while banners are allowed). */
    fillBanner() {
      if (plan().banner && state.tag) deps.provider.fillBanner();
    },

    /** The platform's own transition: the player leaves a game page after finishing a run. */
    leaveInterstitial(): Promise<AdAnswer> {
      return interstitial('browse', 'leave-game', { online: false, inRun: false });
    },
  };
}

export type AdManager = ReturnType<typeof createAdManager>;
