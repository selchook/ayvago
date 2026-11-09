// The lobby of a table game (docs/adr/0019-table-lobby-presence-invites.md). Shared by the web
// app (reads) and the Cloud Functions (the syncLobbyTable trigger writes the public summary), so
// both agree on what a lobby entry, a presence entry and an invite look like.
//
// Realtime Database paths:
//   lobby/{gameId}/tables/{code}         public summary of a public table: names, seats, status;
//                                        no uids. Written only by the syncLobbyTable trigger.
//   presence/lobbies/{gameId}/{uid}      who is in the lobby or at a table of this game
//   invites/{toUid}/{fromUid}            one pending invite per pair of players
//   inviteQuota/{uid}                    the sender's invites in the current minute
import { readCharacterId, type CharacterId } from './characters';

/** Tables live two hours (ADR 0015); the lobby never lists older ones. */
export const LOBBY_TABLE_TTL_MS = 2 * 60 * 60 * 1000;
/** An invite unanswered for this long has expired ("no answer"). */
export const INVITE_TTL_MS = 2 * 60 * 1000;
/** A player sends at most this many invites per window (database.rules.json repeats both). */
export const INVITE_LIMIT = 5;
export const INVITE_WINDOW_MS = 60 * 1000;

const NAME_LIMIT = 40;
const GAME_ID = /^[a-z0-9]{3,32}$/;
const SLUG = /^[a-z0-9-]{1,64}$/;
const TABLE_CODE = /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/;
const MAX_SEATS = 4;

export type TableVisibility = 'public' | 'private';

export function isTableVisibility(value: unknown): value is TableVisibility {
  return value === 'public' || value === 'private';
}

export type LobbySeat =
  | { kind: 'player'; name: string; character: CharacterId | null }
  | { kind: 'bot'; name: string }
  | { kind: 'empty' };

/** A public table as the lobby lists it. */
export type LobbyTable = {
  code: string;
  gameId: string;
  slug: string;
  size: number;
  status: 'open' | 'playing';
  createdAt: number;
  hostName: string;
  hostCharacter: CharacterId | null;
  seats: LobbySeat[];
  /** Seated players whose table page is open right now. */
  online: number;
};

/** The stored form of a lobby entry (what the trigger writes under lobby/{gameId}/tables). */
export type LobbyTableRecord = {
  gameId: string;
  slug: string;
  size: number;
  status: 'open' | 'playing';
  createdAt: number;
  hostName: string;
  hostCharacter?: CharacterId;
  seats: Record<
    string,
    | { kind: 'player'; name: string; character?: CharacterId }
    | { kind: 'bot'; name: string }
    | { kind: 'empty' }
  >;
  online: number;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;

const cleanName = (value: unknown) => (typeof value === 'string' ? value.slice(0, NAME_LIMIT) : '');

/**
 * The lobby summary of a raw tables/{code} value, or null when the table must not be listed:
 * private (or from before visibility existed), closed, or malformed. Never contains a uid.
 */
export function summarizeTable(value: unknown): LobbyTableRecord | null {
  const v = asRecord(value);
  if (!v) return null;
  if (v.visibility !== 'public') return null;
  if (v.status !== 'open' && v.status !== 'playing') return null;
  if (typeof v.gameId !== 'string' || !GAME_ID.test(v.gameId)) return null;
  if (typeof v.slug !== 'string' || !SLUG.test(v.slug)) return null;
  if (typeof v.createdAt !== 'number' || typeof v.hostUid !== 'string') return null;
  const size =
    typeof v.size === 'number' && v.size >= 2 && v.size <= MAX_SEATS ? Math.floor(v.size) : null;
  if (size === null) return null;
  const rawSeats = asRecord(v.seats) ?? {};
  const online = asRecord(v.online) ?? {};
  const seats: LobbyTableRecord['seats'] = {};
  let onlineCount = 0;
  for (let i = 0; i < size; i++) {
    const seat = asRecord(rawSeats[String(i)]);
    if (seat?.bot === true) {
      seats[String(i)] = { kind: 'bot', name: cleanName(seat.name) };
    } else if (seat && typeof seat.uid === 'string') {
      const character = readCharacterId(seat.character);
      seats[String(i)] = {
        kind: 'player',
        name: cleanName(seat.name),
        ...(character ? { character } : {}),
      };
      if (typeof online[seat.uid] === 'string') onlineCount++;
    } else {
      seats[String(i)] = { kind: 'empty' };
    }
  }
  const host = seats['0'];
  if (host?.kind !== 'player') return null;
  return {
    gameId: v.gameId,
    slug: v.slug,
    size,
    status: v.status,
    createdAt: v.createdAt,
    hostName: host.name,
    ...(host.character ? { hostCharacter: host.character } : {}),
    seats,
    online: onlineCount,
  };
}

/** Reads one lobby entry (lobby/{gameId}/tables/{code}); null when it is not one. */
export function readLobbyTable(code: string, value: unknown): LobbyTable | null {
  const v = asRecord(value);
  if (!v || !TABLE_CODE.test(code)) return null;
  if (v.status !== 'open' && v.status !== 'playing') return null;
  if (typeof v.slug !== 'string' || typeof v.createdAt !== 'number') return null;
  const size = typeof v.size === 'number' && v.size >= 2 && v.size <= MAX_SEATS ? v.size : null;
  if (size === null) return null;
  // The database keeps dense keys as an array.
  const rawSeats = (asRecord(v.seats) ?? {}) as Record<string, unknown>;
  const seats: LobbySeat[] = Array.from({ length: size }, (_, i) => {
    const seat = asRecord(rawSeats[String(i)]);
    if (seat?.kind === 'player') {
      return {
        kind: 'player',
        name: cleanName(seat.name),
        character: readCharacterId(seat.character),
      };
    }
    if (seat?.kind === 'bot') return { kind: 'bot', name: cleanName(seat.name) };
    return { kind: 'empty' };
  });
  return {
    code,
    gameId: typeof v.gameId === 'string' ? v.gameId : '',
    slug: v.slug,
    size,
    status: v.status,
    createdAt: v.createdAt,
    hostName: cleanName(v.hostName),
    hostCharacter: readCharacterId(v.hostCharacter),
    seats,
    online: typeof v.online === 'number' && v.online >= 0 ? v.online : 0,
  };
}

export type PresenceState = 'lobby' | 'table' | 'playing';

/** One player in a game's lobby (presence/lobbies/{gameId}/{uid}). */
export type LobbyPresence = {
  uid: string;
  name: string;
  character: CharacterId | null;
  level: number | null;
  state: PresenceState;
  since: number;
  /** "Do not disturb": the player does not take invites. */
  dnd: boolean;
};

/** The stored form of a presence entry. */
export type LobbyPresenceRecord = {
  name: string;
  character?: CharacterId;
  level?: number;
  state: PresenceState;
  since: number | object;
  dnd?: true;
};

export function isPresenceState(value: unknown): value is PresenceState {
  return value === 'lobby' || value === 'table' || value === 'playing';
}

export function readPresence(uid: string, value: unknown): LobbyPresence | null {
  const v = asRecord(value);
  if (!v || typeof v.name !== 'string' || !isPresenceState(v.state)) return null;
  return {
    uid,
    name: cleanName(v.name),
    character: readCharacterId(v.character),
    level: typeof v.level === 'number' && v.level >= 1 ? Math.floor(v.level) : null,
    state: v.state,
    since: typeof v.since === 'number' ? v.since : 0,
    dnd: v.dnd === true,
  };
}

export type InviteAnswer = 'accepted' | 'declined';

/** An invite to a table (invites/{toUid}/{fromUid}). */
export type TableInvite = {
  fromUid: string;
  fromName: string;
  fromCharacter: CharacterId | null;
  gameId: string;
  slug: string;
  tableCode: string;
  createdAt: number;
  answer: InviteAnswer | null;
};

export function readInvite(fromUid: string, value: unknown): TableInvite | null {
  const v = asRecord(value);
  if (!v || v.fromUid !== fromUid) return null;
  if (typeof v.gameId !== 'string' || !GAME_ID.test(v.gameId)) return null;
  if (typeof v.slug !== 'string' || !SLUG.test(v.slug)) return null;
  if (typeof v.tableCode !== 'string' || !TABLE_CODE.test(v.tableCode)) return null;
  if (typeof v.createdAt !== 'number') return null;
  return {
    fromUid,
    fromName: cleanName(v.fromName),
    fromCharacter: readCharacterId(v.fromCharacter),
    gameId: v.gameId,
    slug: v.slug,
    tableCode: v.tableCode,
    createdAt: v.createdAt,
    answer: v.answer === 'accepted' || v.answer === 'declined' ? v.answer : null,
  };
}

/** Unanswered and younger than INVITE_TTL_MS at `now` (server time). */
export function invitePending(invite: TableInvite, now: number): boolean {
  return invite.answer === null && now - invite.createdAt < INVITE_TTL_MS;
}

/**
 * The quota record to write with the next invite, or null when the sender has used up the
 * current window. `serverNow` is the client's estimate of server time; `timestamp` is the
 * database's server-timestamp placeholder (the rules require it for a new window).
 */
export function nextInviteQuota<T>(
  current: { start: number; count: number } | null,
  serverNow: number,
  timestamp: T,
): { start: number | T; count: number } | null {
  if (current && current.start > serverNow - INVITE_WINDOW_MS) {
    return current.count >= INVITE_LIMIT
      ? null
      : { start: current.start, count: current.count + 1 };
  }
  return { start: timestamp, count: 1 };
}
