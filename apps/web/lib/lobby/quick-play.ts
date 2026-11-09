'use client';

// Quick play (docs/adr/0020-quick-play-settings-host-handover.md): one tap seats the player at
// the best public table of the game that has a free seat, or opens a public table that starts by
// itself. Two players who quick-play at the same moment meet through quickPlay/{gameId}, a
// pointer to the table quick play opened last that only moves by transaction.
import {
  DEFAULT_TABLE_SETTINGS,
  readLobbyTable,
  summarizeTable,
  type CharacterId,
  type LobbyTable,
} from '@ayvago/shared';
import { loadDatabase } from '@/lib/firebase/client';
import { createTable, joinTable } from '@/lib/netcode/tables';
import { quickPlayOrder, readQuickPlayPointer } from './lobby-data';
import { serverNow, syncServerClock } from './lobby';

/** Tables tried before quick play opens one (each try is one read and at most a few writes). */
const MAX_TRIES = 5;

export type QuickPlayInput = {
  uid: string;
  name: string;
  character: CharacterId | null;
  gameId: string;
  slug: string;
  size: number;
};

async function tryJoin(code: string, input: QuickPlayInput): Promise<boolean> {
  try {
    const result = await joinTable(code, input.uid, input.name, input.character);
    return result.kind === 'seated' && result.table.slug === input.slug;
  } catch {
    return false;
  }
}

/** Seats the player and resolves with the table code to open. */
export async function quickPlay(input: QuickPlayInput): Promise<string> {
  const db = await loadDatabase();
  const { ref, get, remove, runTransaction, serverTimestamp } = await import('firebase/database');
  await syncServerClock().catch(() => undefined);
  const pointerRef = ref(db, `quickPlay/${input.gameId}`);

  // 1. The public tables as the lobby lists them, plus the pointer's table, which may be too new
  //    for the list (the list follows the tables a moment later).
  const [list, pointerSnapshot] = await Promise.all([
    get(ref(db, `lobby/${input.gameId}/tables`)).catch(() => null),
    get(pointerRef).catch(() => null),
  ]);
  const tables: LobbyTable[] = [];
  list?.forEach((child) => {
    const table = child.key ? readLobbyTable(child.key, child.val()) : null;
    if (table) tables.push(table);
  });
  const seen = readQuickPlayPointer(pointerSnapshot?.val());
  if (seen && !tables.some((table) => table.code === seen.code)) {
    const raw = (await get(ref(db, `tables/${seen.code}`)).catch(() => null))?.val() as unknown;
    const summary = raw ? readLobbyTable(seen.code, summarizeTable(raw)) : null;
    if (summary && summary.gameId === input.gameId) tables.push(summary);
  }

  // 2. Sit at the best of them; a seat taken in the meantime moves on to the next table.
  for (const code of quickPlayOrder(tables, serverNow()).slice(0, MAX_TRIES)) {
    if (await tryJoin(code, input)) return code;
  }

  // 3. Open a public table that starts by itself, and point quick play at it, unless another
  //    player's quick play pointed it somewhere else since step 1: then sit there instead.
  const mine = await createTable({
    uid: input.uid,
    name: input.name,
    gameId: input.gameId,
    slug: input.slug,
    size: input.size,
    character: input.character,
    visibility: 'public',
    settings: DEFAULT_TABLE_SETTINGS,
    autoStart: true,
  });
  let theirs: string | null = null;
  try {
    await runTransaction(pointerRef, (current) => {
      const pointer = readQuickPlayPointer(current);
      if (pointer && pointer.code !== mine && pointer.code !== seen?.code) {
        theirs = pointer.code;
        return undefined;
      }
      theirs = null;
      return { code: mine, at: serverTimestamp() };
    });
  } catch (error) {
    // Without the pointer the table is still public and listed in the lobby.
    console.warn('[lobby] quick play pointer failed', error);
  }
  const other: string | null = theirs;
  if (!other) return mine;
  // Someone already sat at this player's new table (it may be listed by now): stay with them.
  const own = (await get(ref(db, `tables/${mine}/seats`)).catch(() => null))?.val() as unknown;
  const company = Object.values((own ?? {}) as Record<string, { uid?: unknown } | null>).some(
    (seat) => typeof seat?.uid === 'string' && seat.uid !== input.uid,
  );
  if (company || !(await tryJoin(other, input))) return mine;
  await remove(ref(db, `tables/${mine}`)).catch(() => undefined);
  return other;
}
