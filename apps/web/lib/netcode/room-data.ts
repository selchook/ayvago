// The rooms/{code} record as the app uses it (docs/adr/0010-online-matches.md). Pure, so tests
// can import it without Firebase; reads and writes live in rooms.ts.
import { readCharacterId, type CharacterId } from '@ayvago/shared';

export type RoomStatus = 'open' | 'full' | 'closed';

export type Room = {
  code: string;
  gameId: string;
  slug: string;
  hostUid: string;
  hostName: string;
  guestUid: string | null;
  guestName: string | null;
  /** Each seat's chosen character (protocol 2.2 `peerCharacter`); null when none was chosen. */
  hostCharacter: CharacterId | null;
  guestCharacter: CharacterId | null;
  status: RoomStatus;
  createdAt: number;
  /** uid → the page session that holds the seat right now (a reload makes a new one). */
  online: Record<string, string>;
};

/** Reads a room snapshot; null when it is not a room. */
export function toRoom(code: string, value: unknown): Room | null {
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
    // Unlisted ids (such as the retired alien characters) read as "no choice".
    hostCharacter: readCharacterId(v.hostCharacter),
    guestCharacter: readCharacterId(v.guestCharacter),
    status: v.status === 'full' || v.status === 'closed' ? v.status : 'open',
    createdAt: typeof v.createdAt === 'number' ? v.createdAt : 0,
    online,
  };
}
