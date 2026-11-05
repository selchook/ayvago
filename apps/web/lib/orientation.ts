// Screen orientation for the game player's fullscreen: a landscape game turns the phone sideways
// as soon as it goes fullscreen; portrait games keep the device's own orientation.
//
// `screen.orientation.lock()` only works in fullscreen and only where the browser allows it
// (Chrome on Android; iOS Safari and desktop browsers refuse). A refusal is not an error here: the
// game simply stays in whatever orientation the device is in.

type GameOrientation = 'portrait' | 'landscape' | 'any';

/** The part of `ScreenOrientation` used here; `lock` is missing from some DOM typings. */
export interface OrientationControl {
  lock?: (orientation: 'landscape') => Promise<void>;
  unlock?: () => void;
}

function control(): OrientationControl | undefined {
  if (typeof screen === 'undefined') return undefined;
  return screen.orientation as unknown as OrientationControl | undefined;
}

/** Whether fullscreen should lock this game's orientation (landscape games only). */
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
