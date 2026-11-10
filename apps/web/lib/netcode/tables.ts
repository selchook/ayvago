'use client';

// Game tables for up to four players in the Realtime Database
// (docs/adr/0015-tables-for-four-with-bots.md). tables/{code} holds the seats; players take a
// free seat from the invite link, the host fills the others with bots and starts the game. Moves
// go through tableMoves/{code}: tables are for turn-based games, so the database is fast enough
// and no peer-to-peer connection is needed. Settings, auto start and host hand-over:
// docs/adr/0020-quick-play-settings-host-handover.md.
import {
  AUTO_START_MS,
  DEFAULT_TABLE_SETTINGS,
  type CharacterId,
  type TableSettings,
  type TableVisibility,
} from '@ayvago/shared';
import type { Unsubscribe } from 'firebase/database';
import { loadDatabase } from '@/lib/firebase/client';
import { serverNow, syncServerClock } from '@/lib/lobby/lobby';
import { generateRoomCode } from './room-code';
import {
  applyTableUpdates,
  freeSeat,
  nextBotNumbers,
  planLeave,
  planStart,
  seatOf,
  toTable,
  type LeaveKind,
  type StartPlan,
  type Table,
} from './table-data';

export type { LeaveKind, Table, TableSeat, TableStatus } from './table-data';

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
  settings?: TableSettings;
  /** Start by itself after AUTO_START_MS (quick play). */
  autoStart?: boolean;
}): Promise<string> {
  const db = await loadDatabase();
  const { ref, set, serverTimestamp } = await import('firebase/database');
  if (input.autoStart) await syncServerClock().catch(() => undefined);
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
        settings: input.settings ?? DEFAULT_TABLE_SETTINGS,
        ...(input.autoStart ? { startAt: serverNow() + AUTO_START_MS } : {}),
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
    // A host who left a waiting table alone closed it (slice 5.20), seat and all.
    if (table.status === 'closed') return { kind: 'closed' };
    const mine = seatOf(table, uid);
    if (mine >= 0) return { kind: 'seated', table, seat: mine };
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

/** Host: lists the table in the lobby or takes it out (a private table does not start by itself). */
export async function setTableVisibility(code: string, visibility: TableVisibility): Promise<void> {
  const db = await loadDatabase();
  const { ref, update } = await import('firebase/database');
  await update(ref(db, tablePath(code)), {
    visibility,
    ...(visibility === 'private' ? { startAt: null } : {}),
  });
}

/**
 * Host: changes the settings while the table is open. Turning bots off frees the bot seats in the
 * same write (the rules refuse bots at a table without them).
 */
export async function setTableSettings(table: Table, settings: TableSettings): Promise<void> {
  const db = await loadDatabase();
  const { ref, update } = await import('firebase/database');
  const updates: Record<string, unknown> = { settings };
  if (!settings.bots) {
    table.seats.forEach((seat, index) => {
      if (seat?.kind === 'bot') updates[`seats/${index}`] = null;
    });
  }
  await update(ref(db, tablePath(table.code)), updates);
}

/** Host: turns the auto start on (a fresh countdown) or off. */
export async function setAutoStart(code: string, on: boolean): Promise<void> {
  const db = await loadDatabase();
  const { ref, set, remove } = await import('firebase/database');
  const at = ref(db, `${tablePath(code)}/startAt`);
  if (!on) {
    await remove(at);
    return;
  }
  await syncServerClock().catch(() => undefined);
  await set(at, serverNow() + AUTO_START_MS);
}

/** Host: moves the end of the countdown (a new player sat down). */
export async function moveStart(code: string, startAt: number): Promise<void> {
  const db = await loadDatabase();
  const { ref, set } = await import('firebase/database');
  await set(ref(db, `${tablePath(code)}/startAt`), startAt);
}

/** One read of a table; null when it does not exist. */
export async function readTable(code: string): Promise<Table | null> {
  const db = await loadDatabase();
  const { ref, get } = await import('firebase/database');
  return toTable(code, (await get(ref(db, tablePath(code)))).val());
}

export type StartResult = StartPlan['kind'] | 'gone';

/**
 * Host: starts the game for everyone at the table, filling the empty seats with bots when the
 * table allows them. One transaction, so a player who sits down at the same moment is never
 * overwritten by a bot: the database hands the start the table as it really is. `known`: see
 * planStart (the auto start passes the players its page has seen; the Start button passes null).
 */
export async function startTable(
  code: string,
  botName: (n: number) => string,
  known: ReadonlySet<string> | null = null,
): Promise<StartResult> {
  const db = await loadDatabase();
  const { ref, runTransaction } = await import('firebase/database');
  let result: StartResult = 'gone';
  await runTransaction(
    ref(db, tablePath(code)),
    (raw: Record<string, unknown> | null) => {
      // Not in this page's cache yet: a probe write that the database answers with the table.
      if (raw === null) return null;
      const table = toTable(code, raw);
      if (!table || table.status !== 'open') {
        result = 'gone';
        return undefined;
      }
      const plan = planStart(table, known);
      result = plan.kind;
      if (plan.kind !== 'start') return undefined;
      const seats = { ...((raw.seats as Record<string, unknown> | null) ?? {}) };
      const numbers = nextBotNumbers(table, plan.bots.length);
      plan.bots.forEach((index, i) => {
        seats[String(index)] = {
          bot: true,
          name: botName(numbers[i] ?? i + 1).slice(0, NAME_LIMIT),
        };
      });
      // The countdown ends with the start (the rules allow startAt only while the table is open).
      const next: Record<string, unknown> = { ...raw, seats, status: 'playing' };
      delete next.startAt;
      return next;
    },
    { applyLocally: false },
  );
  return result;
}

/**
 * Host hand-over (docs/adr/0020): takes the host role from `from`, whose table page is gone.
 * A transaction, so two players who decide at once cannot both become host; the rules check
 * that the old host is away and this player sits at the table with the page open.
 */
export async function claimHost(code: string, from: string, uid: string): Promise<boolean> {
  const db = await loadDatabase();
  const { ref, runTransaction } = await import('firebase/database');
  // null: not in this page's cache yet; the database then answers with the real value.
  const outcome = await runTransaction(ref(db, `${tablePath(code)}/hostUid`), (current) =>
    current === from || current === null ? uid : undefined,
  );
  return outcome.committed && outcome.snapshot.val() === uid;
}

/**
 * "Leave table" (slice 5.20; see planLeave). The caller stops this page's table presence first,
 * so it is not written again. Players write their own seat and presence in one update. The host
 * decides in a transaction, so a player who sits down at that moment keeps the table open and
 * gets the host role instead of a closed table.
 */
export async function leaveTable(code: string, uid: string): Promise<LeaveKind | 'gone'> {
  const db = await loadDatabase();
  const { ref, get, update, runTransaction } = await import('firebase/database');
  const at = ref(db, tablePath(code));
  const table = toTable(code, (await get(at)).val());
  if (!table) return 'gone';
  if (table.hostUid !== uid) {
    const plan = planLeave(table, uid);
    await update(at, plan.updates);
    return plan.kind;
  }
  let kind: LeaveKind | 'gone' = 'gone';
  const outcome = await runTransaction(
    at,
    (raw: Record<string, unknown> | null) => {
      // Not in this page's cache yet: a probe write that the database answers with the table.
      if (raw === null) return null;
      const current = toTable(code, raw);
      if (!current) {
        kind = 'gone';
        return undefined;
      }
      if (current.hostUid !== uid) {
        // Someone took over in the meantime: leave as a player (below).
        kind = 'gone';
        return undefined;
      }
      const plan = planLeave(current, uid);
      kind = plan.kind;
      return applyTableUpdates(raw, plan.updates);
    },
    { applyLocally: false },
  );
  if (outcome.committed) return kind;
  // The host role moved on while this page decided: leave as a normal player.
  const now = toTable(code, outcome.snapshot.val());
  if (!now) return 'gone';
  const plan = planLeave(now, uid);
  await update(at, plan.updates);
  return plan.kind;
}

/** Host: back at the table after leaving it, so the next hand-over waits again (slice 5.20). */
export async function clearHostLeft(code: string): Promise<void> {
  const db = await loadDatabase();
  const { ref, remove } = await import('firebase/database');
  await remove(ref(db, `${tablePath(code)}/hostLeft`));
}

/**
 * Marks this player online at the table while the page is connected (as rooms do). The returned
 * stop removes the entry; `stop(false)` leaves that to the caller's next write ("Leave table"
 * removes it together with the seat or the host marker, in one write).
 */
export async function trackTablePresence(
  code: string,
  uid: string,
): Promise<(remove?: boolean) => void> {
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
  return (removeEntry = true) => {
    stop();
    if (removeEntry) remove(mine).catch(() => undefined);
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
