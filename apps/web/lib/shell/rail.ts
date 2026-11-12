// The tablet menu rail (slice 5.26): collapsed to icons by default, expanded to icons and text
// when the player asks. The choice is remembered in localStorage and mirrored on <html> as
// data-rail="expanded", which the shell CSS reads at tablet widths only (desktop always shows
// the full menu, phones use the drawer).

/** Widths with the icon rail; keep in step with components/shell/shell.module.css. */
export const RAIL_WIDTHS = '(min-width: 640px) and (max-width: 1023px)';
/** Widths with the phone drawer (below the rail). */
export const DRAWER_WIDTHS = '(max-width: 639px)';

export const RAIL_STORAGE_KEY = 'ayvago-rail';
export const RAIL_ATTRIBUTE = 'data-rail';
export const RAIL_EXPANDED = 'expanded';
/** Fired on window when the rail state changes, so every toggle re-renders. */
export const RAIL_EVENT = 'ayvago:rail';

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Only the exact stored value expands the rail; anything else reads as collapsed. */
export function parseRailExpanded(raw: string | null | undefined): boolean {
  return raw === RAIL_EXPANDED;
}

/** Reads the stored choice; storage that is missing or blocked reads as collapsed. */
export function readRailExpanded(storage: Storage | null | undefined): boolean {
  try {
    return parseRailExpanded(storage?.getItem(RAIL_STORAGE_KEY));
  } catch {
    return false;
  }
}

/** Stores the choice; collapsed (the default) removes the key. Never throws. */
export function writeRailExpanded(storage: Storage | null | undefined, expanded: boolean): void {
  try {
    if (expanded) storage?.setItem(RAIL_STORAGE_KEY, RAIL_EXPANDED);
    else storage?.removeItem(RAIL_STORAGE_KEY);
  } catch {
    // Private mode or blocked storage: the choice lasts for this page only.
  }
}

/** Inline <head> script: applies the stored choice before the first paint (no jump). */
export const RAIL_BOOTSTRAP_SCRIPT = `try{if(localStorage.getItem(${JSON.stringify(
  RAIL_STORAGE_KEY,
)})===${JSON.stringify(RAIL_EXPANDED)})document.documentElement.setAttribute(${JSON.stringify(
  RAIL_ATTRIBUTE,
)},${JSON.stringify(RAIL_EXPANDED)})}catch(e){}`;

/** Minimum horizontal travel (px) of a left swipe that closes the phone drawer. */
export const SWIPE_CLOSE_DISTANCE = 60;

/**
 * True when a touch that moved by (dx, dy) is a left swipe that should close the drawer: far
 * enough to the left and more sideways than up or down, so scrolling the menu never closes it.
 */
export function isCloseSwipe(dx: number, dy: number): boolean {
  return dx <= -SWIPE_CLOSE_DISTANCE && Math.abs(dx) > Math.abs(dy) * 1.5;
}
