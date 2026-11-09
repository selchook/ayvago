import { rtdb } from './admin';

// Online match rooms live in the Realtime Database (docs/adr/0010-online-matches.md). A room is
// usable for two hours; after that the room, its signaling inboxes and its relay are deleted.

export const ROOM_TTL_MS = 2 * 60 * 60 * 1000;
const PAGE = 200;

/** Deletes rooms created before `cutoff` (ms) with their signals and relay; returns the count. */
export async function deleteOldRooms(cutoff: number): Promise<number> {
  let deleted = 0;
  for (;;) {
    const page = await rtdb()
      .ref('rooms')
      .orderByChild('createdAt')
      .endAt(cutoff)
      .limitToFirst(PAGE)
      .get();
    if (!page.exists()) break;
    const updates: Record<string, null> = {};
    page.forEach((room) => {
      updates[`rooms/${room.key}`] = null;
      updates[`signals/${room.key}`] = null;
      updates[`relay/${room.key}`] = null;
    });
    await rtdb().ref().update(updates);
    deleted += page.numChildren();
    if (page.numChildren() < PAGE) break;
  }
  return deleted;
}

/**
 * Deletes game tables created before `cutoff` (ms) with their moves and lobby entries; returns
 * the count
 * (docs/adr/0015-tables-for-four-with-bots.md). Tables live as long as rooms.
 */
export async function deleteOldTables(cutoff: number): Promise<number> {
  let deleted = 0;
  for (;;) {
    const page = await rtdb()
      .ref('tables')
      .orderByChild('createdAt')
      .endAt(cutoff)
      .limitToFirst(PAGE)
      .get();
    if (!page.exists()) break;
    const updates: Record<string, null> = {};
    page.forEach((table) => {
      updates[`tables/${table.key}`] = null;
      updates[`tableMoves/${table.key}`] = null;
      // The syncLobbyTable trigger removes the lobby entry too; this keeps the cleanup complete
      // on its own (docs/adr/0019-table-lobby-presence-invites.md).
      const gameId = table.child('gameId').val() as unknown;
      if (typeof gameId === 'string' && /^[a-z0-9]{3,32}$/.test(gameId)) {
        updates[`lobby/${gameId}/tables/${table.key}`] = null;
      }
    });
    await rtdb().ref().update(updates);
    deleted += page.numChildren();
    if (page.numChildren() < PAGE) break;
  }
  return deleted;
}
