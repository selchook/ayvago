'use client';

// The lobby of a table game in the Realtime Database (docs/adr/0019-table-lobby-presence-invites.md):
// the public table list (written by the syncLobbyTable trigger), who is in the lobby or at a
// table of the game, and invites from one player to another.
import {
  nextInviteQuota,
  readInvite,
  readLobbyTable,
  readPresence,
  type CharacterId,
  type InviteAnswer,
  type LobbyPresence,
  type LobbyTable,
  type PresenceState,
  type TableInvite,
} from '@ayvago/shared';
import type { Unsubscribe } from 'firebase/database';
import { loadDatabase } from '@/lib/firebase/client';

// ---------------------------------------------------------------------------------------------
// Server time: invites expire by the database's clock, not the device's.

let offset = 0;
let offsetWatch: Promise<void> | null = null;

function watchServerOffset(): Promise<void> {
  offsetWatch ??= (async () => {
    const db = await loadDatabase();
    const { ref, onValue } = await import('firebase/database');
    await new Promise<void>((resolve) => {
      onValue(ref(db, '.info/serverTimeOffset'), (snapshot) => {
        offset = typeof snapshot.val() === 'number' ? snapshot.val() : 0;
        resolve();
      });
    });
  })();
  return offsetWatch;
}

/** Starts following the database clock (tables count down by it); resolves with the first answer. */
export function syncServerClock(): Promise<void> {
  return watchServerOffset();
}

/** The database's clock as far as this page knows it (the device's until the first answer). */
export function serverNow(): number {
  return Date.now() + offset;
}

// ---------------------------------------------------------------------------------------------
// Public tables and presence.

/** Live public tables of a game, as the lobby lists them. */
export async function watchLobbyTables(
  gameId: string,
  onTables: (tables: LobbyTable[]) => void,
): Promise<Unsubscribe> {
  const db = await loadDatabase();
  const { ref, onValue } = await import('firebase/database');
  watchServerOffset().catch(() => undefined);
  return onValue(
    ref(db, `lobby/${gameId}/tables`),
    (snapshot) => {
      const tables: LobbyTable[] = [];
      snapshot.forEach((child) => {
        const table = child.key ? readLobbyTable(child.key, child.val()) : null;
        if (table) tables.push(table);
      });
      onTables(tables);
    },
    (error) => {
      console.warn('[lobby] table list failed', error);
      onTables([]);
    },
  );
}

/** Live list of the players in a game's lobby or at one of its tables. */
export async function watchLobbyPlayers(
  gameId: string,
  onPlayers: (players: LobbyPresence[]) => void,
): Promise<Unsubscribe> {
  const db = await loadDatabase();
  const { ref, onValue } = await import('firebase/database');
  return onValue(
    ref(db, `presence/lobbies/${gameId}`),
    (snapshot) => {
      const players: LobbyPresence[] = [];
      snapshot.forEach((child) => {
        const player = child.key ? readPresence(child.key, child.val()) : null;
        if (player) players.push(player);
      });
      onPlayers(players);
    },
    (error) => {
      console.warn('[lobby] player list failed', error);
      onPlayers([]);
    },
  );
}

export type PresenceInfo = {
  name: string;
  character: CharacterId | null;
  level: number | null;
  state: PresenceState;
  dnd: boolean;
};

export type PresenceHandle = {
  update(info: PresenceInfo): void;
  stop(): void;
};

/**
 * Shows this player in the game's lobby while the page is connected; the entry disappears when
 * the page closes or loses its connection (onDisconnect). One entry per player and game: a second
 * tab overwrites it, and closing either tab removes it.
 */
export async function trackLobbyPresence(
  gameId: string,
  uid: string,
  initial: PresenceInfo,
): Promise<PresenceHandle> {
  markLobbyVisit();
  const db = await loadDatabase();
  const { ref, onValue, onDisconnect, set, update, remove, serverTimestamp } =
    await import('firebase/database');
  const mine = ref(db, `presence/lobbies/${gameId}/${uid}`);
  let info = initial;
  // True once this connection's full entry has been sent; later changes are partial updates,
  // which the database applies after it. Before that, changes only update `info`.
  let ready = false;
  let stopped = false;
  const warn = (error: unknown) => console.warn('[lobby] presence failed', error);
  const optional = (value: PresenceInfo) => ({
    character: value.character ?? null,
    level: value.level && value.level >= 1 ? Math.min(1000, Math.floor(value.level)) : null,
    dnd: value.dnd ? true : null,
  });
  const stopConnected = onValue(ref(db, '.info/connected'), (snapshot) => {
    ready = false;
    if (snapshot.val() !== true || stopped) return;
    onDisconnect(mine)
      .remove()
      .then(() => {
        if (stopped) return;
        // set() leaves the null fields out.
        set(mine, {
          name: info.name,
          state: info.state,
          since: serverTimestamp(),
          ...optional(info),
        }).catch(warn);
        ready = true;
      })
      .catch(warn);
  });
  return {
    update(next) {
      const stateChanged = next.state !== info.state;
      info = next;
      if (!ready || stopped) return;
      update(mine, {
        name: next.name,
        state: next.state,
        ...(stateChanged ? { since: serverTimestamp() } : {}),
        ...optional(next),
      }).catch(warn);
    },
    stop() {
      stopped = true;
      stopConnected();
      remove(mine).catch(() => undefined);
      onDisconnect(mine)
        .cancel()
        .catch(() => undefined);
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Invites.

export type SendResult = 'sent' | 'limit' | 'failed';

/**
 * Sends an invite to `to` for the table `tableCode` (the sender sits at it). The invite and the
 * sender's quota tick go in one write; the rules refuse an invite without the tick, a sixth one
 * within a minute, a second pending one to the same player, and invites to players who left the
 * lobby or do not take invites.
 */
export async function sendInvite(input: {
  from: string;
  fromName: string;
  fromCharacter: CharacterId | null;
  to: string;
  gameId: string;
  slug: string;
  tableCode: string;
}): Promise<SendResult> {
  const db = await loadDatabase();
  const { ref, get, update, serverTimestamp } = await import('firebase/database');
  await watchServerOffset().catch(() => undefined);
  try {
    const stored = (await get(ref(db, `inviteQuota/${input.from}`))).val() as {
      start?: unknown;
      count?: unknown;
    } | null;
    const current =
      stored && typeof stored.start === 'number' && typeof stored.count === 'number'
        ? { start: stored.start, count: stored.count }
        : null;
    const quota = nextInviteQuota(current, serverNow(), serverTimestamp());
    if (!quota) return 'limit';
    await update(ref(db), {
      [`invites/${input.to}/${input.from}`]: {
        fromUid: input.from,
        fromName: input.fromName.slice(0, 40),
        ...(input.fromCharacter ? { fromCharacter: input.fromCharacter } : {}),
        gameId: input.gameId,
        slug: input.slug,
        tableCode: input.tableCode,
        createdAt: serverTimestamp(),
      },
      [`inviteQuota/${input.from}`]: quota,
    });
    return 'sent';
  } catch (error) {
    console.warn('[lobby] invite refused', error);
    return 'failed';
  }
}

/** Live view of an invite this player sent (null once it is deleted). */
export async function watchSentInvite(
  to: string,
  from: string,
  onInvite: (invite: TableInvite | null) => void,
): Promise<Unsubscribe> {
  const db = await loadDatabase();
  const { ref, onValue } = await import('firebase/database');
  return onValue(
    ref(db, `invites/${to}/${from}`),
    (snapshot) => onInvite(readInvite(from, snapshot.val())),
    () => onInvite(null),
  );
}

/** Live inbox of invites to this player. */
export async function watchInbox(
  uid: string,
  onInvites: (invites: TableInvite[]) => void,
): Promise<Unsubscribe> {
  const db = await loadDatabase();
  const { ref, onValue } = await import('firebase/database');
  await watchServerOffset().catch(() => undefined);
  return onValue(
    ref(db, `invites/${uid}`),
    (snapshot) => {
      const invites: TableInvite[] = [];
      snapshot.forEach((child) => {
        const invite = child.key ? readInvite(child.key, child.val()) : null;
        if (invite) invites.push(invite);
      });
      onInvites(invites);
    },
    (error) => console.warn('[lobby] invites failed', error),
  );
}

/** The recipient answers an invite (once). */
export async function answerInvite(to: string, from: string, answer: InviteAnswer): Promise<void> {
  const db = await loadDatabase();
  const { ref, set } = await import('firebase/database');
  await set(ref(db, `invites/${to}/${from}/answer`), answer);
}

/** Either side removes an invite (the sender after the answer, the recipient once expired). */
export async function deleteInvite(to: string, from: string): Promise<void> {
  const db = await loadDatabase();
  const { ref, remove } = await import('firebase/database');
  await remove(ref(db, `invites/${to}/${from}`));
}

// ---------------------------------------------------------------------------------------------
// Local memory: this player's table per game, and when they were last in a lobby.

const TABLE_KEY = (gameId: string) => `ayvago:lobby-table:${gameId}`;
const VISIT_KEY = 'ayvago:lobby-visit';
/** The window in which this browser listens for invites after the player was in a lobby. */
export const INVITE_LISTEN_MS = 12 * 60 * 60 * 1000;
export const LOBBY_VISIT_EVENT = 'ayvago:lobby-visit';

export function rememberTable(gameId: string, code: string | null): void {
  try {
    if (code) window.localStorage.setItem(TABLE_KEY(gameId), code);
    else window.localStorage.removeItem(TABLE_KEY(gameId));
  } catch {
    // Without storage the lobby simply does not point back to the table.
  }
}

export function rememberedTable(gameId: string): string | null {
  try {
    return window.localStorage.getItem(TABLE_KEY(gameId));
  } catch {
    return null;
  }
}

/**
 * Invites only go to players who are in a lobby or at a table (the rules check their presence),
 * so a browser listens for them only for a while after its player was there: other visitors
 * never load the database on ordinary pages.
 */
export function markLobbyVisit(): void {
  try {
    window.localStorage.setItem(VISIT_KEY, String(Date.now()));
  } catch {
    // The notifier still listens on this page through the event below.
  }
  window.dispatchEvent(new Event(LOBBY_VISIT_EVENT));
}

export function recentLobbyVisit(now = Date.now()): boolean {
  try {
    const at = Number(window.localStorage.getItem(VISIT_KEY));
    return Number.isFinite(at) && at > 0 && now - at < INVITE_LISTEN_MS;
  } catch {
    return false;
  }
}
