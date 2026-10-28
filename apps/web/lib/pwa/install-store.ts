import { useSyncExternalStore } from 'react';

// Shared install state for the install banner and the "Install the app" link in the menu.
// `beforeinstallprompt` can fire before React hydrates, so an inline script in the layout
// (INSTALL_CAPTURE_SCRIPT, install-capture.ts) keeps the event on window until this store
// picks it up.

export type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

/** Banner content: the browser prompt, the iOS hint, or manual steps for other browsers. */
export type BannerMode = 'hidden' | 'prompt' | 'ios' | 'manual';

export type InstallState = {
  /** False until the store has run in the browser. */
  ready: boolean;
  /** Running as the installed app, or installed during this visit. */
  installed: boolean;
  /** The deferred browser prompt (Chromium), when the browser offers one. */
  event: InstallEvent | null;
  ios: boolean;
  edgeAndroid: boolean;
  banner: BannerMode;
  /** The player opened the banner from the menu link (so it also shows on game pages). */
  requested: boolean;
};

declare global {
  interface Window {
    __ayvagoInstallEvent?: InstallEvent;
  }
}

const SERVER_STATE: InstallState = {
  ready: false,
  installed: false,
  event: null,
  ios: false,
  edgeAndroid: false,
  banner: 'hidden',
  requested: false,
};

let state = SERVER_STATE;
const listeners = new Set<() => void>();
const eventListeners = new Set<(event: InstallEvent) => void>();

function update(partial: Partial<InstallState>) {
  state = { ...state, ...partial };
  for (const listener of listeners) listener();
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  // iPadOS reports a desktop Safari user agent; touch support gives it away.
  return /iphone|ipad|ipod/i.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

let started = false;

/** Starts listening once, in the browser. Safe to call from every component. */
export function startInstallStore() {
  if (started || typeof window === 'undefined') return;
  started = true;
  const onPrompt = (event: InstallEvent) => {
    update({ event });
    for (const listener of eventListeners) listener(event);
  };
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    onPrompt(event as InstallEvent);
  });
  window.addEventListener('appinstalled', () =>
    update({ installed: true, event: null, banner: 'hidden' }),
  );
  update({
    ready: true,
    installed: isStandalone(),
    ios: isIos(),
    // Edge on Android installs a home screen shortcut, which some launchers (Xiaomi, Oppo, …)
    // only allow after the "Home screen shortcuts" permission is granted in Edge's App info.
    edgeAndroid: /EdgA\//.test(navigator.userAgent),
  });
  if (window.__ayvagoInstallEvent) onPrompt(window.__ayvagoInstallEvent);
}

/** Calls `listener` for every browser prompt event, including one captured before hydration. */
export function onInstallEvent(listener: (event: InstallEvent) => void): () => void {
  eventListeners.add(listener);
  if (state.event) listener(state.event);
  return () => eventListeners.delete(listener);
}

export function useInstall(): InstallState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => SERVER_STATE,
  );
}

export function showBanner(mode: Exclude<BannerMode, 'hidden'>, requested = false) {
  update({ banner: mode, requested });
}

export function hideBanner() {
  update({ banner: 'hidden', requested: false });
}

/** Opens the browser's own install prompt. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const event = state.event;
  if (!event) return 'unavailable';
  await event.prompt();
  const { outcome } = await event.userChoice;
  // A prompt can only be used once; Chromium fires a new event when it may be shown again.
  update({ event: null, installed: outcome === 'accepted', banner: 'hidden' });
  return outcome;
}

/**
 * What the "Install the app" link does: the browser prompt when there is one, otherwise the
 * banner with the iOS hint or the manual steps.
 */
export async function requestInstall() {
  if (state.event) await promptInstall();
  else showBanner(state.ios ? 'ios' : 'manual', true);
}
