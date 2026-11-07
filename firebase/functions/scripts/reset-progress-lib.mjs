// @ts-check
// Progress reset for the fresh start of slice 5.13 (docs/adr/0017-server-best-and-fresh-start.md).
// Selection, backup and delete logic, kept apart from the command line (reset-progress.mjs) so
// the emulator tests (firebase/tests/reset-progress.test.ts) run exactly this code.
//
// Reset (backed up first):
//   leaderboards/**                     boards, entries and season archives, recursively
//   users/{uid}/stats/{gameId}          play statistics
//   users/{uid}/progress/{doc}          XP, level and achievements
//   users/{uid}.xp, .level              the profile's copy of the progress summary
//   users/{uid}/library/state.best      the account copy of the browser's best scores
//   sessions/*                          score sessions
// Kept: the rest of every profile, favorites and recently played, votes, games/* counters,
// rankings, rooms and tables, usernames, roles and bans.
import { DocumentReference, FieldValue, GeoPoint, Timestamp } from 'firebase-admin/firestore';

/** The phrase the workflow and the command line need before anything is deleted. */
export const CONFIRM_PHRASE = 'RESET ALL PROGRESS';

/** @typedef {import('firebase-admin/firestore').Firestore} Firestore */
/** @typedef {import('firebase-admin/firestore').CollectionReference} CollectionReference */
/** @typedef {{ path: string, data: unknown }} BackupDoc */
/**
 * @typedef {{
 *   leaderboards: BackupDoc[],
 *   stats: BackupDoc[],
 *   progress: BackupDoc[],
 *   userLevels: BackupDoc[],
 *   libraryBests: BackupDoc[],
 *   sessions: BackupDoc[],
 * }} BackupSections
 */
/** @typedef {Record<keyof BackupSections, number>} Counts */
/**
 * @typedef {{
 *   backup: { version: 1, createdAt: string, counts: Counts } & BackupSections,
 *   counts: Counts,
 *   refs: {
 *     stats: DocumentReference[],
 *     progress: DocumentReference[],
 *     userLevels: DocumentReference[],
 *     libraryBests: DocumentReference[],
 *   },
 * }} Collected
 */

/**
 * Firestore values as plain JSON: Timestamps become ISO strings, references their path.
 * @param {unknown} value
 * @returns {unknown}
 */
export function toJson(value) {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof DocumentReference) return value.path;
  if (value instanceof GeoPoint) return { latitude: value.latitude, longitude: value.longitude };
  if (value instanceof Uint8Array) return Buffer.from(value).toString('base64');
  if (Array.isArray(value)) return value.map(toJson);
  if (value && typeof value === 'object') {
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const [key, inner] of Object.entries(value)) out[key] = toJson(inner);
    return out;
  }
  return value;
}

/** True for users/{uid}/{name}/{doc}, the only place the reset touches `name` collections. */
function underUser(/** @type {DocumentReference} */ ref, /** @type {string} */ name) {
  const parts = ref.path.split('/');
  return parts.length === 4 && parts[0] === 'users' && parts[2] === name;
}

const CHUNK = 200;

/**
 * Every document under a collection, at any depth, including the subcollections of documents
 * that do not exist themselves (leaderboards/{gameId} is never written, only its boards).
 */
async function collectTree(
  /** @type {Firestore} */ db,
  /** @type {CollectionReference} */ collection,
  /** @type {BackupDoc[]} */ out,
) {
  const refs = await collection.listDocuments();
  for (let i = 0; i < refs.length; i += CHUNK) {
    const chunk = refs.slice(i, i + CHUNK);
    const snapshots = await db.getAll(...chunk);
    for (const snapshot of snapshots) {
      if (snapshot.exists) out.push({ path: snapshot.ref.path, data: toJson(snapshot.data()) });
    }
    const children = await Promise.all(chunk.map((ref) => ref.listCollections()));
    for (const sub of children.flat()) await collectTree(db, sub, out);
  }
  return out;
}

/** Finds and backs up everything the reset removes. Reads only. */
export async function collectProgress(/** @type {Firestore} */ db, now = new Date()) {
  const leaderboards = await collectTree(db, db.collection('leaderboards'), []);

  const stats = (await db.collectionGroup('stats').get()).docs.filter((d) =>
    underUser(d.ref, 'stats'),
  );
  const progress = (await db.collectionGroup('progress').get()).docs.filter((d) =>
    underUser(d.ref, 'progress'),
  );
  const levels = (await db.collection('users').select('xp', 'level').get()).docs.filter(
    (d) => d.get('xp') !== undefined || d.get('level') !== undefined,
  );
  const libraries = (await db.collectionGroup('library').get()).docs.filter((d) => {
    const best = d.get('best');
    return (
      underUser(d.ref, 'library') &&
      d.id === 'state' &&
      best !== null &&
      typeof best === 'object' &&
      Object.keys(best).length > 0
    );
  });
  const sessions = (await db.collection('sessions').get()).docs;

  /** @type {BackupSections} */
  const sections = {
    leaderboards,
    stats: stats.map((d) => ({ path: d.ref.path, data: toJson(d.data()) })),
    progress: progress.map((d) => ({ path: d.ref.path, data: toJson(d.data()) })),
    userLevels: levels.map((d) => ({
      path: d.ref.path,
      data: toJson({ xp: d.get('xp'), level: d.get('level') }),
    })),
    libraryBests: libraries.map((d) => ({
      path: d.ref.path,
      data: toJson({ best: d.get('best') }),
    })),
    sessions: sessions.map((d) => ({ path: d.ref.path, data: toJson(d.data()) })),
  };
  /** @type {Counts} */
  const counts = {
    leaderboards: sections.leaderboards.length,
    stats: sections.stats.length,
    progress: sections.progress.length,
    userLevels: sections.userLevels.length,
    libraryBests: sections.libraryBests.length,
    sessions: sections.sessions.length,
  };
  /** @type {Collected} */
  const collected = {
    backup: { version: 1, createdAt: now.toISOString(), counts, ...sections },
    counts,
    refs: {
      stats: stats.map((d) => d.ref),
      progress: progress.map((d) => d.ref),
      userLevels: levels.map((d) => d.ref),
      libraryBests: libraries.map((d) => d.ref),
    },
  };
  return collected;
}

const NOT_FOUND = 5;

/** Deletes what collectProgress found. Throws when any write fails after retries. */
export async function deleteProgress(/** @type {Firestore} */ db, /** @type {Collected} */ found) {
  await db.recursiveDelete(db.collection('leaderboards'));

  /** @type {string[]} */
  const failures = [];
  const writer = db.bulkWriter();
  writer.onWriteError((error) => {
    // A player who deleted their account meanwhile has nothing left to reset.
    if (error.code === NOT_FOUND) return false;
    if (error.failedAttempts < 5) return true;
    failures.push(`${error.documentRef.path}: ${error.message}`);
    return false;
  });
  // Failures are collected by onWriteError; each write's own promise only needs a handler.
  const settle = (/** @type {Promise<unknown>} */ write) => void write.catch(() => undefined);
  for (const ref of found.refs.stats) settle(writer.delete(ref));
  for (const ref of found.refs.progress) settle(writer.delete(ref));
  for (const ref of found.refs.userLevels) {
    settle(writer.update(ref, { xp: FieldValue.delete(), level: FieldValue.delete() }));
  }
  // The library document must keep all its keys (firestore.rules), so best becomes empty.
  for (const ref of found.refs.libraryBests) settle(writer.update(ref, { best: {} }));
  await writer.close();
  if (failures.length > 0) {
    throw new Error(`${failures.length} writes failed:\n${failures.slice(0, 20).join('\n')}`);
  }

  await db.recursiveDelete(db.collection('sessions'));
}

/**
 * Backs up, then (unless `dryRun`) deletes. `saveBackup` runs before any deletion; when it
 * throws, nothing is deleted.
 */
export async function resetProgress(
  /** @type {Firestore} */ db,
  /** @type {{ dryRun: boolean, saveBackup: (backup: Collected['backup']) => Promise<void> | void }} */ options,
) {
  const found = await collectProgress(db);
  await options.saveBackup(found.backup);
  if (!options.dryRun) await deleteProgress(db, found);
  return { dryRun: options.dryRun, counts: found.counts };
}
