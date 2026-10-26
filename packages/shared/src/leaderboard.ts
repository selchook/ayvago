import type { ScoreOrder } from './library';

// Leaderboard rules shared by the Cloud Functions (which write the boards) and the web app
// (which reads them). Spec: docs/specs/leaderboards.md.

/** `season` is the weekly board, `all` the all-time board. */
export type BoardKey = 'season' | 'all';
export const BOARD_KEYS: readonly BoardKey[] = ['season', 'all'];

/** The all-time board's period never changes. */
export const ALL_TIME_PERIOD = 'all';

/** Rows kept in the cached `top` array of a board document. */
export const TOP_SIZE = 100;

/** One row of a board's cached top list (leaderboards/{gameId}/boards/{boardKey}.top). */
export type BoardRow = {
  uid: string;
  username: string;
  avatarId: string | null;
  isGuest: boolean;
  score: number;
  /** Milliseconds since the epoch; ties rank the earlier score higher. */
  achievedAt: number;
  continued: boolean;
};

/** The board document: one read shows a whole board. */
export type BoardDoc = {
  periodKey: string;
  order: ScoreOrder;
  top: BoardRow[];
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
// Seasons turn over on Monday at 09:00 UTC (12:00 in Turkey).
const SEASON_START_OFFSET_MS = 9 * HOUR_MS;

/**
 * Key of the weekly season that contains `now`, e.g. "s-2026-W43": the ISO week (and ISO
 * week-year) in which the season started. Shifting the clock back by 9 hours turns the
 * Monday 09:00 UTC boundary into the ISO week's Monday 00:00 boundary.
 */
export function seasonKey(now: number): string {
  const shifted = new Date(now - SEASON_START_OFFSET_MS);
  const day = shifted.getUTCDay() || 7;
  // The Thursday of this ISO week decides the ISO week-year.
  const thursday = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() + 4 - day,
  );
  const year = new Date(thursday).getUTCFullYear();
  const week = Math.floor((thursday - Date.UTC(year, 0, 1)) / WEEK_MS) + 1;
  return `s-${year}-W${String(week).padStart(2, '0')}`;
}

/** Start of the season that contains `now` (a Monday, 09:00 UTC), in milliseconds. */
export function seasonStart(now: number): number {
  const shifted = new Date(now - SEASON_START_OFFSET_MS);
  const day = shifted.getUTCDay() || 7;
  const monday = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() - (day - 1),
  );
  return monday + SEASON_START_OFFSET_MS;
}

/** When the season that contains `now` ends and the next one starts. */
export function seasonEnd(now: number): number {
  return seasonStart(now) + WEEK_MS;
}

/** Key of the season before the one that contains `now`. */
export function previousSeasonKey(now: number): string {
  return seasonKey(seasonStart(now) - 1);
}

/** The current period of a board. */
export function periodKey(board: BoardKey, now: number): string {
  return board === 'season' ? seasonKey(now) : ALL_TIME_PERIOD;
}

export function isBetterScore(score: number, previous: number, order: ScoreOrder): boolean {
  return order === 'desc' ? score > previous : score < previous;
}

/** Board order: better score first; on a tie, the earlier score first. */
export function compareRows(a: BoardRow, b: BoardRow, order: ScoreOrder): number {
  if (a.score !== b.score) return order === 'desc' ? b.score - a.score : a.score - b.score;
  return a.achievedAt - b.achievedAt;
}

/** Puts `row` into `top` (replacing the player's previous row), sorted and cut to TOP_SIZE. */
export function upsertRow(top: BoardRow[], row: BoardRow, order: ScoreOrder): BoardRow[] {
  return [...top.filter((r) => r.uid !== row.uid), row]
    .sort((a, b) => compareRows(a, b, order))
    .slice(0, TOP_SIZE);
}

/** 1-based position of a player in `top`, or null when they are not in it. */
export function rankInTop(top: BoardRow[], uid: string): number | null {
  const index = top.findIndex((row) => row.uid === uid);
  return index === -1 ? null : index + 1;
}

/** Days a game's limits only flag suspicious scores instead of rejecting them. */
export const CALIBRATION_DAYS = 14;

/** Leaderboards went live; games added earlier calibrate from this day. */
export const LEADERBOARDS_LAUNCHED_AT = '2026-10-26';

/** Until when a game added on `addedAt` (YYYY-MM-DD) is in its calibration window. */
export function calibrationEndsAt(addedAt: string): number {
  const start = Math.max(Date.parse(addedAt), Date.parse(LEADERBOARDS_LAUNCHED_AT));
  return start + CALIBRATION_DAYS * DAY_MS;
}
