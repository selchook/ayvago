// How long the install banner stays away after "Not now". Each dismissal snoozes it longer:
// 14 days, then 30, then 90 for every later one. Stored in localStorage as JSON.

export const DISMISSED_KEY = 'ayvago-install-dismissed';
const DAY_MS = 24 * 60 * 60 * 1000;
export const SNOOZE_DAYS = [14, 30, 90] as const;

export type Dismissal = { at: number; count: number };

/** Parses the stored value; slice 2.9 stored a bare timestamp (one dismissal). */
export function parseDismissal(raw: string | null): Dismissal | null {
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return { at: Number(raw), count: 1 };
  try {
    const value = JSON.parse(raw) as Partial<Dismissal>;
    return typeof value.at === 'number' && typeof value.count === 'number' && value.count > 0
      ? { at: value.at, count: value.count }
      : null;
  } catch {
    return null;
  }
}

/** True while the last "Not now" is still in effect. */
export function isSnoozed(dismissal: Dismissal | null, now: number): boolean {
  if (!dismissal) return false;
  const days = SNOOZE_DAYS[Math.min(dismissal.count, SNOOZE_DAYS.length) - 1] ?? SNOOZE_DAYS[0];
  return now - dismissal.at < days * DAY_MS;
}

/** The dismissal to store when the player taps "Not now" again. */
export function nextDismissal(previous: Dismissal | null, now: number): Dismissal {
  return { at: now, count: (previous?.count ?? 0) + 1 };
}
