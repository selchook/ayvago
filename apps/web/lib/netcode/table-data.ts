// The tables/{code} record as the app uses it (docs/adr/0015-tables-for-four-with-bots.md). Pure,
// so tests can import it without Firebase; reads and writes live in tables.ts.
import { readCharacterId, type CharacterId } from '@ayvago/shared';

export type TableStatus = 'open' | 'playing' | 'closed';

export type TableSeat =
  | { kind: 'player'; uid: string; name: string; character: CharacterId | null }
  | { kind: 'bot'; name: string };

export type Table = {
  code: string;
  gameId: string;
  slug: string;
  hostUid: string;
  /** Number of seats (2 to 4). */
  size: number;
  /** One entry per seat; null for an empty seat. Seat 0 is the host's. */
  seats: Array<TableSeat | null>;
  status: TableStatus;
  createdAt: number;
  /** uid → the page session that holds the seat right now (a reload makes a new one). */
  online: Record<string, string>;
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
    createdAt: typeof v.createdAt === 'number' ? v.createdAt : 0,
    online,
  };
}

/** The seat this player holds, or -1. */
export function seatOf(table: Table, uid: string): number {
  return table.seats.findIndex((seat) => seat?.kind === 'player' && seat.uid === uid);
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
  const used = new Set(
    table.seats.flatMap((seat) => {
      const n = seat?.kind === 'bot' ? Number(/(\d+)\s*$/.exec(seat.name)?.[1]) : NaN;
      return Number.isFinite(n) ? [n] : [];
    }),
  );
  let n = 1;
  while (used.has(n)) n++;
  return n;
}
