// Consent for ads (roadmap §9.1, docs/adr/0023-ads-behind-an-admin-switch.md). Nothing here runs
// while ads are off: the ad host calls it only right before the ad script loads.
//
// - Consent Mode v2 defaults are written first: every storage type denied, so Google's tags set no
//   ad cookies and serve non-personalised ads until a consent signal arrives.
// - Visitors from the EEA, the UK and Switzerland get Google's certified TCF v2.2 CMP (AdSense
//   "Privacy & messaging"), which the ad tag delivers itself and which updates the signals.
// - Everyone else (Turkey under KVKK first) gets the platform's own notice
//   (components/ads/ad-consent-notice.tsx): personalised ads only after an explicit "Allow".

export type AdConsentChoice = 'granted' | 'denied';

export const CONSENT_KEY = 'ayvago:ad-consent';

type ConsentWindow = Window & {
  dataLayer?: unknown[];
  adsbygoogle?: unknown[] & { requestNonPersonalizedAds?: number };
  __tcfapi?: (
    command: string,
    version: number,
    callback: (data: { gdprApplies?: boolean } | null, success: boolean) => void,
  ) => void;
  /** Google's CMP (AdSense Privacy & messaging, "Funding Choices"). */
  googlefc?: { callbackQueue?: Array<() => void>; showRevocationMessage?: () => void };
};

const AD_SIGNALS = ['ad_storage', 'ad_user_data', 'ad_personalization'] as const;

// The official gtag snippet: Consent Mode reads the `arguments` object, not an array.
function gtag(..._args: unknown[]): void;
function gtag() {
  const w = window as ConsentWindow;
  w.dataLayer = w.dataLayer || [];
  // eslint-disable-next-line prefer-rest-params
  w.dataLayer.push(arguments);
}

let defaultsWritten = false;

/** Writes the Consent Mode defaults (all denied) and applies a choice made on an earlier visit. */
export function writeConsentDefaults(): void {
  if (defaultsWritten) return;
  defaultsWritten = true;
  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    wait_for_update: 500,
  });
  gtag('set', 'ads_data_redaction', true);
  const stored = storedConsent();
  applyNonPersonalized(stored !== 'granted');
  if (stored) signal(stored);
}

function applyNonPersonalized(on: boolean) {
  const w = window as ConsentWindow;
  w.adsbygoogle = w.adsbygoogle || [];
  // AdSense's own switch for non-personalised ads, honoured with or without Consent Mode.
  w.adsbygoogle.requestNonPersonalizedAds = on ? 1 : 0;
}

function signal(choice: AdConsentChoice) {
  const value = choice === 'granted' ? 'granted' : 'denied';
  gtag('consent', 'update', Object.fromEntries(AD_SIGNALS.map((key) => [key, value])));
  applyNonPersonalized(choice !== 'granted');
}

export function storedConsent(): AdConsentChoice | null {
  try {
    const value = window.localStorage.getItem(CONSENT_KEY);
    return value === 'granted' || value === 'denied' ? value : null;
  } catch {
    return null;
  }
}

/** The visitor answered the platform's notice (or changed it on the privacy page). */
export function chooseConsent(choice: AdConsentChoice): void {
  try {
    window.localStorage.setItem(CONSENT_KEY, choice);
  } catch {
    // Private mode: the choice holds for this page only.
  }
  if (defaultsWritten) signal(choice);
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: choice }));
}

export const CONSENT_EVENT = 'ayvago:ad-consent';

/**
 * Whether Google's TCF CMP covers this visitor (EEA, UK, Switzerland). Null when no CMP answered
 * in time; the platform's notice is then shown, which never grants more than the visitor chose.
 */
export function gdprApplies(timeoutMs = 4000): Promise<boolean | null> {
  return new Promise((resolve) => {
    const started = Date.now();
    const poll = () => {
      const api = (window as ConsentWindow).__tcfapi;
      if (api) {
        try {
          api('ping', 2, (data) => resolve(data?.gdprApplies ?? null));
        } catch {
          resolve(null);
        }
        return;
      }
      if (Date.now() - started >= timeoutMs) resolve(null);
      else window.setTimeout(poll, 250);
    };
    poll();
  });
}

/**
 * Opens Google's own consent settings ("Privacy and cookie settings"), where visitors covered by
 * its TCF CMP change or withdraw their ad consent. The call is queued, so it also works while the
 * CMP script is still loading; it does nothing when the CMP never loads (ads off).
 */
export function openGooglePrivacyOptions(win: Window = window): void {
  const w = win as ConsentWindow;
  w.googlefc = w.googlefc || {};
  w.googlefc.callbackQueue = w.googlefc.callbackQueue || [];
  w.googlefc.callbackQueue.push(() => w.googlefc?.showRevocationMessage?.());
}
