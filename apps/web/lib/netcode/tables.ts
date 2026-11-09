'use client';

// Game tables for up to four players in the Realtime Database
// (docs/adr/0015-tables-for-four-with-bots.md). tables/{code} holds the seats; players take a
// free seat from the invite link, the host fills the others with bots and starts the game. Moves
// go through tableMoves/{code}: tables are for turn-based games, so the database is fast enough
// and no peer-to-peer connection is needed.
import type { CharacterId, TableVisibility } from '@ayvago/shared';
import type { Unsubscribe } from 'firebase/database';
import { loadDatabase } from '@/lib/firebase/client';
import { generateRoomCode } from './room-code';
import { freeSeat, seatOf, toTable, type Table } from './table-data';

export type { Table, TableSeat, TableStatus } from './table-data';

/** How long a table stays usable; cleanupRooms deletes older ones. */
export const TABLE_TTL_MS = 2 * 60 * 60 * 1000;

export type TableJoin =
  | { kind: 'seated'; table: Table; seat: number }
  | { kind: 'full' | 'started' | 'missing' | 'closed' | 'expired' };

const NAME_LIMIT = 40;
const tablePath = (code: string) => `tables/${code}`;

function playerSeat(uid: string, name: string, character: CharacterId | null) {
  return { uid, name: name.slice(0, NAME_LIMIT), ...(character ? { character } : {}) };
}

/** Creates a table hosted by `uid` in seat 0; retries with a new code on a collision. */
export async function createTable(input: {
  uid: string;
  name: string;
  gameId: string;
  slug: string;
  size: number;
  character: CharacterId | null;
  /** Public tables are listed in the lobby (docs/adr/0019); the invite-link flow opens private ones. */
  visibility: TableVisibility;
}): Promise<string> {
  const db = await loadDatabase();
  const { ref, set, serverTimestamp } = await import('firebase/database');
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateRoomCode();
    try {
      // An existing table with this code belongs to someone else, so the rules refuse the write.
      await set(ref(db, tablePath(code)), {
        gameId: input.gameId,
        slug: input.slug,
        hostUid: input.uid,
        size: input.size,
        status: 'open',
        visibility: input.visibility,
        createdAt: serverTimestamp(),
        seats: { 0: playerSeat(input.uid, input.name, input.character) },
      });
      return code;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

/** Takes this player's seat: their own (host or rejoin) or the first free one. */
export async function joinTable(
  code: string,
  uid: string,
  name: string,
  character: CharacterId | null,
): Promise<TableJoin> {
  const db = await loadDatabase();
  const { ref, get, set } = await import('firebase/database');
  const read = async () => toTable(code, (await get(ref(db, tablePath(code)))).val());

  for (let attempt = 0; attempt < 4; attempt++) {
    const table = await read();
    if (!table) return { kind: 'missing' };
    const mine = seatOf(table, uid);
    if (mine >= 0) return { kind: 'seated', table, seat: mine };
    if (table.status === 'closed') return { kind: 'closed' };
    if (Date.now() - table.createdAt > TABLE_TTL_MS) return { kind: 'expired' };
    if (table.status === 'playing') return { kind: 'started' };
    const free = freeSeat(table);
    if (free < 0) return { kind: 'full' };
    try {
      await set(ref(db, `${tablePath(code)}/seats/${free}`), playerSeat(uid, name, character));
    } catch {
      // Someone took the seat first (the rules refuse a second claim): look again.
      continue;
    }
  }
  const table = await read();
  if (!table) return { kind: 'missing' };
  const mine = seatOf(table, uid);
  return mine >= 0 ? { kind: 'seated', table, seat: mine } : { kind: 'full' };
}

/** Live table updates; `null` once the table is deleted. */
export async function watchTable(
  code: string,
  onTable: (table: Table | null) => void,
): Promise<Unsubscribe> {
  const db = await loadDatabase();
  const { ref, onValue } = await import('firebase/database');
  return onValue(
    ref(db, tablePath(code)),
    (snapshot) => onTable(toTable(code, snapshot.val())),
    () => onTable(null),
  );
}

/** Host: puts a bot in an empty seat. */
export async function addBot(code: string, seat: number, name: string): Promise<void> {
  const db = await loadDatabase();
  const { ref, set } = await import('firebase/database');
  await set(ref(db, `${tablePath(code)}/seats/${seat}`), {
    bot: true,
    name: name.slice(0, NAME_LIMIT),
  });
}

/** Host: empties a seat (removes a bot, or a player who has not come back). */
export async function clearSeat(code: string, seat: number): Promise<void> {
  const db = await loadDatabase();
  const { ref, remove } = await import('firebase/database');
  await remove(ref(db, `${tablePath(code)}/seats/${seat}`));
}

/** Host: lists the table in the lobby or takes it out. */
export async function setTableVisibility(code: string, visibility: TableVisibility): Promise<void> {
  const db = await loadDatabase();
  const { ref, set } = await import('firebase/database');
  await set(ref(db, `${tablePath(code)}/visibility`), visibility);
}

/** One read of a table; null when it does not exist. */
export async function readTable(code: string): Promise<Table | null> {
  const db = await loadDatabase();
  const { ref, get } = await import('firebase/database');
  return toTable(code, (await get(ref(db, tablePath(code)))).val());
}

/** Host: starts the game for everyone at the table. */
export async function startTable(code: string): Promise<void> {
  const db = await loadDatabase();
  const { ref, set } = await import('firebase/database');
  await set(ref(db, `${tablePath(code)}/status`), 'playing');
}

/** Marks this player online at the table while the page is connected (as rooms do). */
export async function trackTablePresence(code: string, uid: string): Promise<() => void> {
  const db = await loadDatabase();
  const { ref, onValue, onDisconnect, set, remove } = await import('firebase/database');
  const mine = ref(db, `${tablePath(code)}/online/${uid}`);
  const session = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
  const stop = onValue(ref(db, '.info/connected'), (snapshot) => {
    if (snapshot.val() !== true) return;
    onDisconnect(mine)
      .remove()
      .then(() => set(mine, session))
      .catch((error) => console.warn('[netcode] table presence failed', error));
  });
  return () => {
    stop();
    remove(mine).catch(() => undefined);
    onDisconnect(mine)
      .cancel()
      .catch(() => undefined);
  };
}

export type TableChannel = {
  /** Sends a move (JSON) to every other player at the table. */
  send(json: string): void;
  close(): void;
};

/**
 * The table's move channel. Moves written before the channel opened are skipped, so a player
 * who reloads starts fresh (games resync from the host when a player joins again).
 */
export async function openTableChannel(options: {
  code: string;
  uid: string;
  seat: number;
  onMove(from: number, json: string): void;
}): Promise<TableChannel> {
  const db = await loadDatabase();
  const { ref, push, get, query, orderByKey, limitToLast, startAfter, onChildAdded } =
    await import('firebase/database');
  const movesRef = ref(db, `tableMoves/${options.code}`);
  const last = await get(query(movesRef, orderByKey(), limitToLast(1)));
  let lastKey: string | null = null;
  last.forEach((child) => {
    lastKey = child.key;
  });
  const live = lastKey ? query(movesRef, orderByKey(), startAfter(lastKey)) : movesRef;
  const stop = onChildAdded(live, (snapshot) => {
    const v = snapshot.val() as { from?: unknown; seat?: unknown; data?: unknown } | null;
    if (!v || v.from === options.uid || typeof v.data !== 'string') return;
    const from = Number(v.seat);
    if (Number.isInteger(from)) options.onMove(from, v.data);
  });
  return {
    send(json) {
      push(movesRef, { from: options.uid, seat: String(options.seat), data: json }).catch((error) =>
        console.warn('[netcode] table move failed', error),
      );
    },
    close() {
      stop();
    },
  };
}
