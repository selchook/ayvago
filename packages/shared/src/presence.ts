// Site-wide presence and recent players (docs/adr/0021-site-presence-recent-players.md). Shared by
// the web app (reads, its own presence write) and the Cloud Functions (the triggers that record
// who played with whom), so both agree on the shapes.
//
//   presence/site/{uid}                  (Realtime Database) the player's online status on any
//                                        page. Written by the player's own page, removed on
//                                        disconnect. Readable one uid at a time; never listable.
//   users/{uid}/recentPlayers/{otherUid} (Firestore) people the player shared a table or a room
//                                        with. Written by the server only; the owner reads it.
import { readCharacterId, type CharacterId } from './characters';

/** What a player is doing, from the least to the most busy. */
export const SITE_STATES = ['online', 'lobby', 'table', 'playing'] as const;
export type SiteState = (typeof SITE_STATES)[number];

export function isSiteState(value: unknown): value is SiteState {
  return typeof value === 'string' && (SITE_STATES as readonly string[]).includes(value);
}

/** How busy a state is (higher = busier); the page shows the busiest of its parts. */
export function siteStateRank(state: SiteState): number {
  return SITE_STATES.indexOf(state);
}

/** One player's site presence (presence/site/{uid}). */
export type SitePresence = {
  uid: string;
  name: string;
  character: CharacterId | null;
  level: number | null;
  state: SiteState;
  /** The game the state is about (its lobby, table or page), if any. */
  gameId: string | null;
  since: number;
  /** "Do not disturb": the player does not take invites. */
  dnd: boolean;
};

/** The stored form; `since` is a number or the database's server-timestamp placeholder. */
export type SitePresenceRecord = {
  name: string;
  character?: CharacterId;
  level?: number;
  state: SiteState;
  gameId?: string;
  since: number | object;
  dnd?: true;
};

const NAME_LIMIT = 40;
const GAME_ID = /^[a-z0-9]{3,32}$/;
const SLUG = /^[a-z0-9-]{1,64}$/;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;

const cleanName = (value: unknown) => (typeof value === 'string' ? value.slice(0, NAME_LIMIT) : '');

export function readSitePresence(uid: string, value: unknown): SitePresence | null {
  const v = asRecord(value);
  if (!v || typeof v.name !== 'string' || !isSiteState(v.state)) return null;
  return {
    uid,
    name: cleanName(v.name),
    character: readCharacterId(v.character),
    level: typeof v.level === 'number' && v.level >= 1 ? Math.floor(v.level) : null,
    state: v.state,
    gameId: typeof v.gameId === 'string' && GAME_ID.test(v.gameId) ? v.gameId : null,
    since: typeof v.since === 'number' ? v.since : 0,
    dnd: v.dnd === true,
  };
}

/** The entry a page writes; optional fields are left out rather than stored empty. */
export function sitePresenceRecord<T extends object>(
  info: {
    name: string;
    character: CharacterId | null;
    level: number | null;
    state: SiteState;
    gameId: string | null;
    dnd: boolean;
  },
  since: number | T,
): SitePresenceRecord {
  const level =
    info.level !== null && info.level >= 1 ? Math.min(1000, Math.floor(info.level)) : null;
  return {
    name: info.name.slice(0, NAME_LIMIT),
    state: info.state,
    since,
    ...(info.character ? { character: info.character } : {}),
    ...(level ? { level } : {}),
    ...(info.gameId && GAME_ID.test(info.gameId) ? { gameId: info.gameId } : {}),
    ...(info.dnd ? { dnd: true as const } : {}),
  };
}

// ---------------------------------------------------------------------------------------------
// Recent players.

/** Each player keeps this many recent players; the trigger deletes the oldest beyond it. */
export const RECENT_PLAYERS_LIMIT = 30;

/** Someone the player shared a table or a room with. */
export type RecentPlayer = {
  uid: string;
  name: string;
  character: CharacterId | null;
  /** The game of the last match together. */
  gameId: string;
  slug: string;
  lastPlayedAt: number;
  /** Matches together (tables started, rooms joined). */
  count: number;
};

/** A seated human at the moment a match starts (bots never count). */
export type MatchPlayer = { uid: string; name: string; character: CharacterId | null };

/** A match two or more people started together: the input of the recent-players trigger. */
export type Match = {
  /** Identifies the match, so a repeated trigger event does not count it twice. */
  key: string;
  gameId: string;
  slug: string;
  players: MatchPlayer[];
};

function millis(value: unknown): number {
  if (typeof value === 'number') return value;
  const toMillis = (asRecord(value) as { toMillis?: unknown } | null)?.toMillis;
  return typeof toMillis === 'function' ? Number((toMillis as () => number).call(value)) : 0;
}

/** Reads one users/{uid}/recentPlayers/{otherUid} document; null when it is not one. */
export function readRecentPlayer(uid: string, value: unknown): RecentPlayer | null {
  const v = asRecord(value);
  if (!v || !uid) return null;
  if (typeof v.gameId !== 'string' || !GAME_ID.test(v.gameId)) return null;
  if (typeof v.slug !== 'string' || !SLUG.test(v.slug)) return null;
  return {
    uid,
    name: cleanName(v.name),
    character: readCharacterId(v.character),
    gameId: v.gameId,
    slug: v.slug,
    lastPlayedAt: millis(v.lastPlayedAt),
    count: typeof v.count === 'number' && v.count >= 1 ? Math.floor(v.count) : 1,
  };
}

function matchPlayer(uid: unknown, name: unknown, character: unknown): MatchPlayer | null {
  if (typeof uid !== 'string' || uid.length === 0 || uid.length > 128) return null;
  return { uid, name: cleanName(name), character: readCharacterId(character) };
}

function distinct(players: Array<MatchPlayer | null>): MatchPlayer[] {
  const seen = new Set<string>();
  const out: MatchPlayer[] = [];
  for (const player of players) {
    if (!player || seen.has(player.uid)) continue;
    seen.add(player.uid);
    out.push(player);
  }
  return out;
}

/**
 * The match a write to tables/{code} started: the table went from not playing to `playing`
 * with at least two people seated. Bots are left out. Null for every other write.
 */
export function tableMatch(code: string, before: unknown, after: unknown): Match | null {
  const match = tableStart(code, before, after);
  return match && match.players.length >= 2 ? match : null;
}

/**
 * Like tableMatch, but also a table one person started with bots: every human seat of a table
 * that just turned `playing` (the online play counters of slice 5.22 count them all).
 */
export function tableStart(code: string, before: unknown, after: unknown): Match | null {
  const was = asRecord(before);
  const is = asRecord(after);
  if (!is || is.status !== 'playing' || was?.status === 'playing') return null;
  if (typeof is.gameId !== 'string' || !GAME_ID.test(is.gameId)) return null;
  if (typeof is.slug !== 'string' || !SLUG.test(is.slug)) return null;
  const seats = asRecord(is.seats) ?? {};
  const players = distinct(
    Object.values(seats).map((raw) => {
      const seat = asRecord(raw);
      return !seat || seat.bot === true ? null : matchPlayer(seat.uid, seat.name, seat.character);
    }),
  );
  if (players.length === 0) return null;
  const createdAt = typeof is.createdAt === 'number' ? is.createdAt : 0;
  return { key: `table:${code}:${createdAt}`, gameId: is.gameId, slug: is.slug, players };
}

/** The match of a two-player room once both seats are taken (rooms/{code}). */
export function roomMatch(code: string, room: unknown): Match | null {
  const v = asRecord(room);
  if (!v) return null;
  if (typeof v.gameId !== 'string' || !GAME_ID.test(v.gameId)) return null;
  if (typeof v.slug !== 'string' || !SLUG.test(v.slug)) return null;
  const players = distinct([
    matchPlayer(v.hostUid, v.hostName, v.hostCharacter),
    matchPlayer(v.guestUid, v.guestName, v.guestCharacter),
  ]);
  if (players.length < 2) return null;
  const createdAt = typeof v.createdAt === 'number' ? v.createdAt : 0;
  return { key: `room:${code}:${createdAt}`, gameId: v.gameId, slug: v.slug, players };
}

/** For every player of a match, the others they now have in common (owner → others). */
export function recentPairs(match: Match): Array<{ owner: string; others: MatchPlayer[] }> {
  return match.players.map((owner) => ({
    owner: owner.uid,
    others: match.players.filter((other) => other.uid !== owner.uid),
  }));
}
