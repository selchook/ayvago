// Table settings, quick play and host hand-over (docs/adr/0020-quick-play-settings-host-handover.md).
// Shared by the web app (tables, lobby, protocol 2.7) and the Cloud Functions (the lobby summary),
// so both read a table's settings the same way. database.rules.json repeats the allowed values.

/** Hands per match. */
export const TABLE_HANDS = [5, 11] as const;
/** Seconds a player has for a turn: fast, normal, relaxed. */
export const TABLE_TURN_SECONDS = [15, 30, 60] as const;

export type TableHands = (typeof TABLE_HANDS)[number];
export type TableTurnSeconds = (typeof TABLE_TURN_SECONDS)[number];

/** What the host chooses when opening a table (tables/{code}/settings), sent to the game. */
export type TableSettings = {
  hands: TableHands;
  turnSeconds: TableTurnSeconds;
  /** Empty seats may be filled with bots (by the host, or by the auto start). */
  bots: boolean;
};

/** Quick-play tables and tables from before settings existed use these. */
export const DEFAULT_TABLE_SETTINGS: TableSettings = { hands: 5, turnSeconds: 30, bots: true };

/** The countdown of an auto-start table when it opens or when the host turns auto start on. */
export const AUTO_START_MS = 20_000;
/** Every human who sits down leaves at least this much of the countdown. */
export const AUTO_START_JOIN_MS = 10_000;
/** The host's table presence must be gone this long before another player takes over. */
export const HOST_HANDOVER_MS = 15_000;
/** Each further player in line waits this much longer, in case the first one is stuck. */
export const HOST_HANDOVER_STEP_MS = 5_000;

/**
 * A two-seat table (Tavla; docs/adr/0026-two-seat-tables.md) is a duel: no bots, because a bot
 * opponent is the game's own solo mode, and no hands or turn time, because the match rules are
 * the game's own. Only the visibility and the auto start remain.
 */
export function isDuelTable(size: number): boolean {
  return size <= 2;
}

/** The settings a new table of `size` seats stores: a duel never allows bots. */
export function tableSettingsFor(
  size: number,
  settings: TableSettings = DEFAULT_TABLE_SETTINGS,
): TableSettings {
  return isDuelTable(size) ? { ...settings, bots: false } : settings;
}

export function isTableHands(value: unknown): value is TableHands {
  return TABLE_HANDS.includes(value as TableHands);
}

export function isTableTurnSeconds(value: unknown): value is TableTurnSeconds {
  return TABLE_TURN_SECONDS.includes(value as TableTurnSeconds);
}

/** Reads stored settings; missing or invalid fields take the defaults. */
export function readTableSettings(value: unknown): TableSettings {
  const v = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  return {
    hands: isTableHands(v.hands) ? v.hands : DEFAULT_TABLE_SETTINGS.hands,
    turnSeconds: isTableTurnSeconds(v.turnSeconds)
      ? v.turnSeconds
      : DEFAULT_TABLE_SETTINGS.turnSeconds,
    bots: typeof v.bots === 'boolean' ? v.bots : DEFAULT_TABLE_SETTINGS.bots,
  };
}
