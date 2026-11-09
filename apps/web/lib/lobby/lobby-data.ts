// What the lobby page shows (docs/adr/0019-table-lobby-presence-invites.md). Pure, so tests can
// import it without Firebase; reads and writes live in lobby.ts.
import {
  INVITE_TTL_MS,
  LOBBY_TABLE_TTL_MS,
  type LobbyPresence,
  type LobbyTable,
  type PresenceState,
  type TableInvite,
} from '@ayvago/shared';

export function freeSeatCount(table: LobbyTable): number {
  return table.seats.filter((seat) => seat.kind === 'empty').length;
}

export function playerCount(table: LobbyTable): number {
  return table.seats.filter((seat) => seat.kind === 'player').length;
}

export function botCount(table: LobbyTable): number {
  return table.seats.filter((seat) => seat.kind === 'bot').length;
}

/** A player can sit at it from the lobby. */
export function canSit(table: LobbyTable): boolean {
  return table.status === 'open' && freeSeatCount(table) > 0;
}

/**
 * The tables the lobby lists, in order:
 * - left out: older than two hours, or nobody seated has the table page open (an abandoned table);
 * - first, open tables with free seats, the fullest first (they start soonest), then the newest;
 * - then full open tables waiting for their host, then tables in play, newest first.
 * `keep` is a table the player sits at: it is listed even while nobody else is there.
 */
export function lobbyTables(tables: LobbyTable[], now: number, keep: string | null = null) {
  const listed = tables.filter(
    (table) =>
      now - table.createdAt < LOBBY_TABLE_TTL_MS && (table.online > 0 || table.code === keep),
  );
  const group = (table: LobbyTable) => (canSit(table) ? 0 : table.status === 'open' ? 1 : 2);
  return listed.sort(
    (a, b) =>
      group(a) - group(b) ||
      (group(a) === 0 ? freeSeatCount(a) - freeSeatCount(b) : 0) ||
      b.createdAt - a.createdAt ||
      a.code.localeCompare(b.code),
  );
}

const STATE_ORDER: Record<PresenceState, number> = { lobby: 0, table: 1, playing: 2 };

/** This player first, then the others: in the lobby, at a table, playing; then by name. */
export function lobbyPlayers(players: LobbyPresence[], me: string | null): LobbyPresence[] {
  return [...players].sort(
    (a, b) =>
      Number(b.uid === me) - Number(a.uid === me) ||
      STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) ||
      a.uid.localeCompare(b.uid),
  );
}

/** Whole minutes since `since` (0 for the first minute and for clocks running a bit ahead). */
export function minutesSince(since: number, now: number): number {
  return Math.max(0, Math.floor((now - since) / 60_000));
}

export type OutgoingStatus =
  'sending' | 'pending' | 'accepted' | 'declined' | 'expired' | 'failed' | 'limit';

/**
 * The state of an invite this player sent, from what the database holds now: `invite` is
 * invites/{to}/{me} (null once deleted) and `seen` says whether it was ever read back.
 */
export function outgoingStatus(
  invite: TableInvite | null,
  seen: boolean,
  sentAt: number,
  now: number,
): OutgoingStatus {
  if (invite?.answer) return invite.answer;
  if (invite) return now - invite.createdAt >= INVITE_TTL_MS ? 'expired' : 'pending';
  // Deleted without an answer (the recipient cleared an expired one, or the cleanup did).
  if (seen) return 'expired';
  return now - sentAt >= INVITE_TTL_MS ? 'expired' : 'sending';
}

/** The player can be invited (again): nothing is waiting for their answer. */
export function canInviteAgain(status: OutgoingStatus | undefined): boolean {
  return (
    status === undefined ||
    status === 'declined' ||
    status === 'expired' ||
    status === 'failed' ||
    status === 'limit'
  );
}

/** Quick play leaves out tables that would expire soon after it seats someone. */
export const QUICK_PLAY_MAX_AGE_MS = LOBBY_TABLE_TTL_MS - 15 * 60_000;

/**
 * A table this new with only its opener seated counts as attended even before the opener's page
 * has marked them present (the page is still loading when another quick player looks).
 */
export const QUICK_PLAY_FRESH_MS = 15_000;

/**
 * Quick play (docs/adr/0020): the tables to try, best first. Only open tables with a free seat
 * that someone has open (or that its opener opened in the last 15 seconds) and that are not about to expire;
 * the most players seated first (the game starts soonest and with the fewest bots), then the
 * oldest, then by code.
 */
export function quickPlayOrder(tables: LobbyTable[], now: number): string[] {
  return tables
    .filter(
      (table) =>
        canSit(table) &&
        (table.online > 0 ||
          (playerCount(table) === 1 && now - table.createdAt < QUICK_PLAY_FRESH_MS)) &&
        now - table.createdAt < QUICK_PLAY_MAX_AGE_MS,
    )
    .sort(
      (a, b) =>
        playerCount(b) - playerCount(a) ||
        a.createdAt - b.createdAt ||
        a.code.localeCompare(b.code),
    )
    .map((table) => table.code);
}

/** The quick-play pointer quickPlay/{gameId}: the table quick play opened last. */
export type QuickPlayPointer = { code: string; at: number };

export function readQuickPlayPointer(value: unknown): QuickPlayPointer | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  return typeof v.code === 'string' &&
    /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/.test(v.code) &&
    typeof v.at === 'number'
    ? { code: v.code, at: v.at }
    : null;
}
