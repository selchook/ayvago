// Game orientation on the platform.
//
// Stage shape (slice 5.34, docs/adr/0029-adaptive-orientation.md): a manifest's `orientation: 'any'`
// means an adaptive game. It runs portrait (720×1280) on a phone and landscape (1280×720) on
// desktops and tablets, deciding once at boot inside its iframe with the same rule as `isPhone`.
// The player resolves its stage with that rule after mount (`useIsPhone`); the server render and
// the first paint use the landscape stage. Adaptive games' screenshot and card art are landscape.
//
// Fullscreen: a landscape game turns the phone sideways as soon as it goes fullscreen; portrait
// and adaptive games keep the device's own orientation.
//
// `screen.orientation.lock()` only works in fullscreen and only where the browser allows it
// (Chrome on Android; iOS Safari and desktop browsers refuse). A refusal is not an error here: the
// game simply stays in whatever orientation the device is in.

export type GameOrientation = 'portrait' | 'landscape' | 'any';

/** Touch-first devices: no hover and a coarse pointer (phones and tablets). */
export const MOBILE_QUERY = '(hover: none) and (pointer: coarse)';

/** A touch-first device whose screen's short side is below this many CSS pixels is a phone. */
export const PHONE_MAX_SHORT_SIDE = 600;

/** What `isPhone` reads from the browser. */
export type DeviceTraits = { mobile: boolean; screenWidth: number; screenHeight: number };

/**
 * The phone rule of the adaptive-game contract shared with the studio (selchook/ayvago-games,
 * the game asks the identical question at boot): `MOBILE_QUERY` matches and the screen's short
 * side is under 600 px. Tablets (short side 600 px and more) and desktops, touch screens with a
 * mouse or trackpad included, are not phones. Never change it without the studio.
 */
export function isPhone({ mobile, screenWidth, screenHeight }: DeviceTraits): boolean {
  return mobile && Math.min(screenWidth, screenHeight) < PHONE_MAX_SHORT_SIDE;
}

/** The browser's traits for `isPhone`; null outside a browser (server render). */
export function readDeviceTraits(): DeviceTraits | null {
  if (typeof window === 'undefined' || typeof screen === 'undefined') return null;
  return {
    mobile: window.matchMedia?.(MOBILE_QUERY).matches ?? false,
    screenWidth: screen.width,
    screenHeight: screen.height,
  };
}

/**
 * The shape a game runs in, and so the player's stage: adaptive games are portrait on a phone and
 * landscape on desktops and tablets.
 */
export function stageOrientation(
  orientation: GameOrientation,
  phone: boolean,
): 'portrait' | 'landscape' {
  if (orientation === 'any') return phone ? 'portrait' : 'landscape';
  return orientation;
}

/**
 * The shape of a game's catalog art (`screenshot`, `card`): adaptive games are captured in
 * landscape by the studio, so only portrait games have portrait art.
 */
export function artOrientation(orientation: GameOrientation): 'portrait' | 'landscape' {
  return orientation === 'portrait' ? 'portrait' : 'landscape';
}

/** The part of `ScreenOrientation` used here; `lock` is missing from some DOM typings. */
export interface OrientationControl {
  lock?: (orientation: 'landscape') => Promise<void>;
  unlock?: () => void;
}

function control(): OrientationControl | undefined {
  if (typeof screen === 'undefined') return undefined;
  return screen.orientation as unknown as OrientationControl | undefined;
}

/**
 * Whether fullscreen should lock this game's orientation: landscape games only. An adaptive game
 * already runs in the shape that suits the device, so it is never locked.
 */
export function locksInFullscreen(orientation: GameOrientation): boolean {
  return orientation === 'landscape';
}

/** Turns the device to landscape. Returns whether the browser accepted the lock. */
export async function lockLandscape(
  target: OrientationControl | undefined = control(),
): Promise<boolean> {
  if (!target?.lock) return false;
  try {
    await target.lock('landscape');
    return true;
  } catch {
    return false;
  }
}

/** Releases a lock taken by `lockLandscape` (harmless when there is none). */
export function unlockOrientation(target: OrientationControl | undefined = control()): void {
  try {
    target?.unlock?.();
  } catch {
    // Nothing was locked, or the browser does not support it.
  }
}
