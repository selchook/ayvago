// The tables/{code} record as the app uses it (docs/adr/0015-tables-for-four-with-bots.md). Pure,
// so tests can import it without Firebase; reads and writes live in tables.ts.
import {
  AUTO_START_JOIN_MS,
  HOST_HANDOVER_MS,
  HOST_HANDOVER_STEP_MS,
  readCharacterId,
  readTableSettings,
  tableSettingsFor,
  type CharacterId,
  type TableSettings,
  type TableVisibility,
} from '@ayvago/shared';

export type TableStatus = 'open' | 'playing' | 'closed';

export type TableSeat =
  | { kind: 'player'; uid: string; name: string; character: CharacterId | null }
  | { kind: 'bot'; name: string };

export type Table = {
  code: string;
  gameId: string;
  slug: string;
  /** The host: the opener (seat 0) until a hand-over gives the role to another seated player. */
  hostUid: string;
  /** Number of seats (2 to 4; two seats are a duel without bots, docs/adr/0026). */
  size: number;
  /** One entry per seat; null for an empty seat. The opener sits in seat 0. */
  seats: Array<TableSeat | null>;
  status: TableStatus;
  /**
   * Public tables are listed in the game's lobby (docs/adr/0019); private ones only reach
   * players through the invite link or an invite. Tables from before slice 5.18 read as private.
   */
  visibility: TableVisibility;
  createdAt: number;
  /** uid → the page session that holds the seat right now (a reload makes a new one). */
  online: Record<string, string>;
  /** The host's choices (docs/adr/0020); defaults for tables from before slice 5.19. */
  settings: TableSettings;
  /** Auto start: when the host's page starts the game (server time); null when it is off. */
  startAt: number | null;
  /**
   * The current host pressed "Leave table" (slice 5.20): `hostLeft` holds their uid. The others
   * then take over at once instead of after HOST_HANDOVER_MS. A marker left by an earlier host
   * does not count.
   */
  hostLeft: boolean;
};

export const MIN_TABLE_SIZE = 2;
export const MAX_TABLE_SIZE = 4;

function toSeat(value: unknown): TableSeat | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  const name = typeof v.name === 'string' ? v.name : '';
  if (v.bot === true) return { kind: 'bot', name };
  if (typeof v.uid !== 'string') return null;
  // Unlisted ids (such as the retired alien characters) read as "no choice".
  return { kind: 'player', uid: v.uid, name, character: readCharacterId(v.character) };
}

/** Reads a table snapshot; null when it is not a table. */
export function toTable(code: string, value: unknown): Table | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.hostUid !== 'string' || typeof v.slug !== 'string') return null;
  const size =
    typeof v.size === 'number' && v.size >= MIN_TABLE_SIZE && v.size <= MAX_TABLE_SIZE
      ? Math.floor(v.size)
      : MAX_TABLE_SIZE;
  // The database keeps seats as an object or, when the keys are dense, an array.
  const raw = (typeof v.seats === 'object' && v.seats !== null ? v.seats : {}) as Record<
    string,
    unknown
  >;
  const seats = Array.from({ length: size }, (_, i) => toSeat(raw[String(i)]));
  const online: Record<string, string> = {};
  if (typeof v.online === 'object' && v.online !== null) {
    for (const [uid, session] of Object.entries(v.online)) {
      if (typeof session === 'string') online[uid] = session;
    }
  }
  return {
    code,
    gameId: String(v.gameId ?? ''),
    slug: v.slug,
    hostUid: v.hostUid,
    size,
    seats,
    status: v.status === 'playing' || v.status === 'closed' ? v.status : 'open',
    visibility: v.visibility === 'public' ? 'public' : 'private',
    createdAt: typeof v.createdAt === 'number' ? v.createdAt : 0,
    online,
    // A two-seat table never has bots, whatever is stored (docs/adr/0026).
    settings: tableSettingsFor(size, readTableSettings(v.settings)),
    startAt: typeof v.startAt === 'number' ? v.startAt : null,
    hostLeft: typeof v.hostLeft === 'string' && v.hostLeft === v.hostUid,
  };
}

/** The seat this player holds, or -1. */
export function seatOf(table: Table, uid: string): number {
  return table.seats.findIndex((seat) => seat?.kind === 'player' && seat.uid === uid);
}

/** The uids of the players seated at the table. */
export function seatedUids(table: Table): string[] {
  return table.seats.flatMap((seat) => (seat?.kind === 'player' ? [seat.uid] : []));
}

/** The first empty seat, or -1 when the table is full. */
export function freeSeat(table: Table): number {
  return table.seats.findIndex((seat) => seat === null);
}

/** Every seat is taken (by a player or a bot): the host may start. */
export function tableReady(table: Table): boolean {
  return table.seats.every((seat) => seat !== null);
}

/** The next free bot number for a new bot ("Bot 1", "Bot 2" …). */
export function nextBotNumber(table: Table): number {
  return nextBotNumbers(table, 1)[0] ?? 1;
}

/** `count` free bot numbers, lowest first (for filling several seats at once). */
export function nextBotNumbers(table: Table, count: number): number[] {
  const used = new Set(
    table.seats.flatMap((seat) => {
      const n = seat?.kind === 'bot' ? Number(/(\d+)\s*$/.exec(seat.name)?.[1]) : NaN;
      return Number.isFinite(n) ? [n] : [];
    }),
  );
  const numbers: number[] = [];
  for (let n = 1; numbers.length < count; n++) if (!used.has(n)) numbers.push(n);
  return numbers;
}

/** The seat of the table's host, or -1 (a table always seats its host; -1 only for bad data). */
export function hostSeat(table: Table): number {
  return seatOf(table, table.hostUid);
}

/** The host has the table page open right now. */
export function hostPresent(table: Table): boolean {
  return !!table.online[table.hostUid];
}

/**
 * Host hand-over (docs/adr/0020): how long this player waits after noticing that the host's
 * table page is gone before taking the host role, or null when they must not take it (the host
 * is there, the player is the host, not seated or not present, or the table is over). The seated
 * players who are present take it in seat order: the lowest after HOST_HANDOVER_MS, each next
 * one HOST_HANDOVER_STEP_MS later in case the one before is stuck. A host who left on purpose
 * (slice 5.20) is not waited for: the lowest takes over at once.
 */
export function handoverDelay(table: Table, uid: string): number | null {
  if (table.status === 'closed' || table.hostUid === uid || hostPresent(table)) return null;
  if (!table.online[uid]) return null;
  const line = table.seats.flatMap((seat) =>
    seat?.kind === 'player' && seat.uid !== table.hostUid && table.online[seat.uid]
      ? [seat.uid]
      : [],
  );
  const rank = line.indexOf(uid);
  if (rank < 0) return null;
  return (table.hostLeft ? 0 : HOST_HANDOVER_MS) + rank * HOST_HANDOVER_STEP_MS;
}

/** Whole seconds left of an auto-start countdown (0 once it has run out). */
export function secondsLeft(startAt: number, now: number): number {
  return Math.max(0, Math.ceil((startAt - now) / 1000));
}

/** A new player sat down: the countdown's new end when less than AUTO_START_JOIN_MS is left. */
export function extendedStart(startAt: number, now: number): number | null {
  return startAt - now < AUTO_START_JOIN_MS ? now + AUTO_START_JOIN_MS : null;
}

export type StartPlan =
  /** Start now; `bots` are the empty seats that get a bot. */
  | { kind: 'start'; bots: number[] }
  /** A player sat down that the host's page has not seen yet: give them the countdown first. */
  | { kind: 'newPlayer' }
  /** Seats are empty and bots are off: wait for players. */
  | { kind: 'notReady' };

/**
 * What starting the table does now. `known` are the players the host's page has already seen
 * (the auto start passes them; the host's own Start button passes null and starts anyway).
 */
export function planStart(table: Table, known: ReadonlySet<string> | null): StartPlan {
  if (known && seatedUids(table).some((uid) => !known.has(uid))) return { kind: 'newPlayer' };
  const empty = table.seats.flatMap((seat, index) => (seat === null ? [index] : []));
  if (empty.length > 0 && !table.settings.bots) return { kind: 'notReady' };
  return { kind: 'start', bots: empty };
}

/** The table can be started by the host now: every seat taken, or bots allowed for the rest. */
export function canStart(table: Table): boolean {
  return tableReady(table) || table.settings.bots;
}

/** The bot seats (to empty them when the host turns bots off). */
export function botSeats(table: Table): number[] {
  return table.seats.flatMap((seat, index) => (seat?.kind === 'bot' ? [index] : []));
}

/**
 * What "Leave table" does (slice 5.20):
 * - `free`: the table is waiting for players, so the leaver's seat becomes free;
 * - `close`: the host leaves a waiting table where no other player is seated, so it closes;
 * - `away`: the game is on (or the table is over): only the leaver's presence goes, and the seat
 *   stays theirs, so they can come back through the table link.
 * `handOver`: the leaver is the host and other players are seated; `hostLeft` lets them take over
 * at once.
 */
export type LeaveKind = 'free' | 'close' | 'away';

export type LeavePlan = {
  kind: LeaveKind;
  handOver: boolean;
  /** Changes to tables/{code}, by path below it (null removes). */
  updates: Record<string, unknown>;
};

export function planLeave(table: Table, uid: string): LeavePlan {
  const seat = seatOf(table, uid);
  const isHost = table.hostUid === uid;
  const others = seatedUids(table).some((player) => player !== uid);
  const handOver = isHost && others && table.status !== 'closed';
  const updates: Record<string, unknown> = { [`online/${uid}`]: null };
  // A host also clears a marker an earlier host left behind.
  if (isHost) updates.hostLeft = handOver ? uid : null;
  if (table.status === 'open') {
    if (isHost && !others) {
      // The countdown only exists on open tables (the rules refuse it on closed ones).
      return { kind: 'close', handOver, updates: { ...updates, status: 'closed', startAt: null } };
    }
    if (seat >= 0)
      return { kind: 'free', handOver, updates: { ...updates, [`seats/${seat}`]: null } };
  }
  return { kind: 'away', handOver, updates };
}

/**
 * Applies `updates` (paths below the table) to a raw tables/{code} value, as a database update
 * would. For the host's leave transaction.
 */
export function applyTableUpdates(
  raw: Record<string, unknown>,
  updates: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...raw };
  for (const [path, value] of Object.entries(updates)) {
    const [key, child] = path.split('/') as [string, string | undefined];
    if (child === undefined) {
      if (value === null) delete next[key];
      else next[key] = value;
      continue;
    }
    // The database keeps dense seat keys as an array: copy them into an object.
    const current = next[key];
    const branch: Record<string, unknown> =
      typeof current === 'object' && current !== null ? { ...(current as object) } : {};
    if (value === null) delete branch[child];
    else branch[child] = value;
    if (Object.keys(branch).length > 0) next[key] = branch;
    else delete next[key];
  }
  return next;
}
