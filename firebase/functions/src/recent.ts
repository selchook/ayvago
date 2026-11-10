import {
  FieldValue,
  type DocumentData,
  type DocumentReference,
  type Firestore,
  type Timestamp,
} from 'firebase-admin/firestore';
import {
  RECENT_PLAYERS_LIMIT,
  recentPairs,
  roomMatch,
  tableMatch,
  type Match,
} from '../../../packages/shared/src/presence';
import type { Reference } from 'firebase-admin/database';
import { db, rtdb } from './admin';

// Recent players (docs/adr/0021-site-presence-recent-players.md): when a table starts or a
// two-player room gets its second player, every human at it gets the others in
// users/{uid}/recentPlayers/{otherUid}. Only this code writes there; clients only read their own.

const recentRef = (store: Firestore, owner: string, other: string) =>
  store.doc(`users/${owner}/recentPlayers/${other}`);

/**
 * Records a match for every player in it: name, character, game, time and a match counter per
 * other player. A repeated event for the same match (the key) does not count twice. Then keeps
 * only each player's RECENT_PLAYERS_LIMIT most recent entries. Returns the entries written.
 */
export async function recordMatch(match: Match, store: Firestore = db()): Promise<number> {
  let written = 0;
  for (const { owner, others } of recentPairs(match)) {
    written += await store.runTransaction(async (tx) => {
      const refs = others.map((other) => recentRef(store, owner, other.uid));
      const docs = await tx.getAll(...refs);
      let count = 0;
      docs.forEach((doc, index) => {
        if (doc.get('lastMatch') === match.key) return;
        const other = others[index]!;
        tx.set(refs[index]!, {
          uid: other.uid,
          name: other.name,
          ...(other.character ? { character: other.character } : {}),
          gameId: match.gameId,
          slug: match.slug,
          lastPlayedAt: FieldValue.serverTimestamp(),
          count: ((doc.get('count') as number | undefined) ?? 0) + 1,
          lastMatch: match.key,
        });
        count++;
      });
      return count;
    });
    await trimRecentPlayers(owner, store);
  }
  return written;
}

/** Deletes a player's recent players beyond the newest RECENT_PLAYERS_LIMIT; returns the count. */
export async function trimRecentPlayers(owner: string, store: Firestore = db()): Promise<number> {
  const stale = await store
    .collection(`users/${owner}/recentPlayers`)
    .orderBy('lastPlayedAt', 'desc')
    .offset(RECENT_PLAYERS_LIMIT)
    .select()
    .get();
  if (stale.empty) return 0;
  const batch = store.batch();
  stale.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  return stale.size;
}

/** The tables/{code} trigger's part: a table that just started records its players. */
export async function recordTableStart(
  code: string,
  before: unknown,
  after: unknown,
): Promise<number> {
  const match = tableMatch(code, before, after);
  return match ? recordMatch(match) : 0;
}

/**
 * rooms/{code}/guestUid was created: both seats of a two-player room are taken. The room is read
 * as it is now (the event holds only the guest's uid).
 */
export async function recordRoomJoin(
  code: string,
  root: Reference = rtdb().ref(),
): Promise<number> {
  const room = (await root.child(`rooms/${code}`).get()).val() as unknown;
  const match = roomMatch(code, room);
  return match ? recordMatch(match) : 0;
}

/**
 * Account deletion: the player leaves every other player's recent list (their own list goes
 * with users/{uid}). Returns the entries deleted.
 */
export async function removeFromRecentPlayers(uid: string): Promise<number> {
  let deleted = 0;
  for (;;) {
    const page = await db()
      .collectionGroup('recentPlayers')
      .where('uid', '==', uid)
      .limit(400)
      .get();
    if (page.empty) break;
    const batch = db().batch();
    page.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    deleted += page.size;
    if (page.size < 400) break;
  }
  return deleted;
}

/**
 * A guest joins a registered account (mergeGuestAccount): the guest's recent players move to the
 * account (counts added, the newer match kept), and other players' entries for the guest point
 * to the account instead. Runs before the guest's data is deleted.
 */
export async function moveRecentPlayers(from: string, to: string): Promise<number> {
  let moved = 0;
  const own = await db().collection(`users/${from}/recentPlayers`).get();
  for (const doc of own.docs) {
    if (doc.id !== to) {
      await mergeEntry(recentRef(db(), to, doc.id), doc.data());
      moved++;
    }
    await doc.ref.delete();
  }
  const others = await db().collectionGroup('recentPlayers').where('uid', '==', from).get();
  for (const doc of others.docs) {
    const owner = doc.ref.parent.parent?.id;
    if (!owner || owner === to) {
      await doc.ref.delete();
      continue;
    }
    await mergeEntry(recentRef(db(), owner, to), { ...doc.data(), uid: to });
    await doc.ref.delete();
    moved++;
  }
  if (moved > 0) await trimRecentPlayers(to);
  return moved;
}

async function mergeEntry(target: DocumentReference, data: DocumentData) {
  await db().runTransaction(async (tx) => {
    const current = await tx.get(target);
    const count = (Number(data.count) || 1) + (Number(current.get('count')) || 0);
    const currentAt = current.get('lastPlayedAt') as Timestamp | undefined;
    const incomingAt = data.lastPlayedAt as Timestamp | undefined;
    const newer = !currentAt || (incomingAt && incomingAt.toMillis() > currentAt.toMillis());
    tx.set(target, newer ? { ...data, count } : { ...current.data(), count });
  });
}
