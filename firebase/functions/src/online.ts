import type { Reference } from 'firebase-admin/database';
import { roomMatch, tableStart } from '../../../packages/shared/src/presence';
import { rtdb } from './admin';
import { countOnlineMatch } from './stats';

// Online play counters (slice 5.22, docs/adr/0022-started-abandoned-and-online-play.md), counted
// by the same triggers that record recent players, from data the server sees: a table turning
// `playing` and a room's guest seat being taken. Matches only, never ranked; their play time is
// not counted, because neither a table nor a room records when its match ends.

/** The tables/{code} trigger's part: every human at a table that just started (bots never). */
export async function countTableStart(
  code: string,
  before: unknown,
  after: unknown,
): Promise<number> {
  const match = tableStart(code, before, after);
  return match ? countOnlineMatch(match) : 0;
}

/** rooms/{code}/guestUid was created: both players of the room. The room is read as it is now. */
export async function countRoomJoin(code: string, root: Reference = rtdb().ref()): Promise<number> {
  const room = (await root.child(`rooms/${code}`).get()).val() as unknown;
  const match = roomMatch(code, room);
  return match ? countOnlineMatch(match) : 0;
}
