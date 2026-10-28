'use client';

// Online match rooms in the Realtime Database (docs/adr/0010-online-matches.md):
// rooms/{code} holds the two seats and their presence. The rules (firebase/database.rules.json)
// let the first non-host claim the guest seat, so joining needs no transaction.
import type { Unsubscribe } from 'firebase/database';
import { loadDatabase } from '@/lib/firebase/client';
import { generateRoomCode } from './room-code';

export type RoomStatus = 'open' | 'full' | 'closed';

export type Room = {
  code: string;
  gameId: string;
  slug: string;
  hostUid: string;
  hostName: string;
  guestUid: string | null;
  guestName: string | null;
  status: RoomStatus;
  createdAt: number;
  /** uid → the page session that holds the seat right now (a reload makes a new one). */
  online: Record<string, string>;
};

/** How long a room stays usable; cleanupRooms deletes older ones. */
export const ROOM_TTL_MS = 2 * 60 * 60 * 1000;

export type JoinResult =
  | { kind: 'host'; room: Room }
  | { kind: 'guest'; room: Room }
  | { kind: 'full' | 'missing' | 'closed' | 'expired' };

const NAME_LIMIT = 40;

function toRoom(code: string, value: unknown): Room | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.hostUid !== 'string' || typeof v.slug !== 'string') return null;
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
    hostName: String(v.hostName ?? ''),
    guestUid: typeof v.guestUid === 'string' ? v.guestUid : null,
    guestName: typeof v.guestName === 'string' ? v.guestName : null,
    status: v.status === 'full' || v.status === 'closed' ? v.status : 'open',
    createdAt: typeof v.createdAt === 'number' ? v.createdAt : 0,
    online,
  };
}

const roomPath = (code: string) => `rooms/${code}`;

/** Creates a room hosted by `uid`; retries with a new code in the rare case of a collision. */
export async function createRoom(input: {
  uid: string;
  name: string;
  gameId: string;
  slug: string;
}): Promise<string> {
  const db = await loadDatabase();
  const { ref, set, serverTimestamp } = await import('firebase/database');
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateRoomCode();
    try {
      // An existing room with this code belongs to someone else, so the rules refuse the write.
      await set(ref(db, roomPath(code)), {
        gameId: input.gameId,
        slug: input.slug,
        hostUid: input.uid,
        hostName: input.name.slice(0, NAME_LIMIT),
        createdAt: serverTimestamp(),
        status: 'open',
      });
      return code;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

/** Takes the player's seat in a room: the host's own room, the free guest seat, or a rejoin. */
export async function joinRoom(code: string, uid: string, name: string): Promise<JoinResult> {
  const db = await loadDatabase();
  const { ref, get, update } = await import('firebase/database');
  const read = async () => toRoom(code, (await get(ref(db, roomPath(code)))).val());

  const room = await read();
  if (!room) return { kind: 'missing' };
  if (room.hostUid === uid) return { kind: 'host', room };
  if (room.guestUid === uid) return { kind: 'guest', room };
  if (room.status === 'closed') return { kind: 'closed' };
  if (Date.now() - room.createdAt > ROOM_TTL_MS) return { kind: 'expired' };
  if (room.guestUid) return { kind: 'full' };
  try {
    await update(ref(db, roomPath(code)), {
      guestUid: uid,
      guestName: name.slice(0, NAME_LIMIT),
      status: 'full',
    });
  } catch {
    // Someone else claimed the seat first (the rules refuse a second claim).
    const now = await read();
    return now?.guestUid === uid ? { kind: 'guest', room: now } : { kind: 'full' };
  }
  const joined = await read();
  return joined ? { kind: 'guest', room: joined } : { kind: 'missing' };
}

/** Live room updates; `null` once the room is deleted. */
export async function watchRoom(
  code: string,
  onRoom: (room: Room | null) => void,
): Promise<Unsubscribe> {
  const db = await loadDatabase();
  const { ref, onValue } = await import('firebase/database');
  return onValue(
    ref(db, roomPath(code)),
    (snapshot) => onRoom(toRoom(code, snapshot.val())),
    () => onRoom(null),
  );
}

/**
 * Marks the player online in the room while this page is connected; the server clears the
 * entry when the connection drops, which is how the other player learns about a leave. The
 * value is this page's session id, so a quick reload (a fresh game) is noticed as well.
 */
export async function trackPresence(code: string, uid: string): Promise<() => void> {
  const db = await loadDatabase();
  const { ref, onValue, onDisconnect, set, remove } = await import('firebase/database');
  const mine = ref(db, `${roomPath(code)}/online/${uid}`);
  const session = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
  const stop = onValue(ref(db, '.info/connected'), (snapshot) => {
    if (snapshot.val() !== true) return;
    // Register the cleanup first, so a drop right after the write still clears the flag.
    onDisconnect(mine)
      .remove()
      .then(() => set(mine, session))
      .catch((error) => console.warn('[netcode] presence failed', error));
  });
  return () => {
    stop();
    remove(mine).catch(() => undefined);
    onDisconnect(mine)
      .cancel()
      .catch(() => undefined);
  };
}
