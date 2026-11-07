import { Timestamp, type CollectionReference, type Firestore } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { db } from '../functions/src/admin';
import { resetProgress, toJson } from '../functions/scripts/reset-progress-lib.mjs';
import { useEmulators } from './helpers';

// The fresh-start reset (slice 5.13, docs/adr/0017-server-best-and-fresh-start.md), run with the
// Admin SDK against the emulator, like the "Reset progress" workflow runs it against production.

useEmulators();

const at = Timestamp.fromMillis(Date.UTC(2026, 10, 1, 12));

/** Everything in the database, path → data (as JSON), at every depth. */
async function dump(firestore: Firestore): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  async function walk(collections: CollectionReference[]) {
    for (const collection of collections) {
      for (const ref of await collection.listDocuments()) {
        const snapshot = await ref.get();
        if (snapshot.exists) out[ref.path] = toJson(snapshot.data());
        await walk(await ref.listCollections());
      }
    }
  }
  await walk(await firestore.listCollections());
  return out;
}

// What the reset removes …
const PROGRESS: Record<string, Record<string, unknown>> = {
  'leaderboards/tetrix/boards/all': {
    periodKey: 'all',
    order: 'desc',
    top: [{ uid: 'ayla', username: 'Ayla', score: 9000, achievedAt: 1 }],
    updatedAt: at,
  },
  'leaderboards/tetrix/boards/all/entries/ayla': {
    score: 9000,
    achievedAt: at,
    periodKey: 'all',
    continued: false,
    sessionId: 's1',
  },
  'leaderboards/tetrix/boards/season/entries/ayla': {
    score: 9000,
    achievedAt: at,
    periodKey: '2026-W45',
  },
  'leaderboards/snake/seasons/2026-W44': { periodKey: '2026-W44', top: [], closedAt: at },
  'users/ayla/stats/tetrix': { plays: 3, playSeconds: 180, lastPlayedAt: at },
  'users/bora/stats/snake': { plays: 1, playSeconds: 30, lastPlayedAt: at },
  'users/ayla/progress/summary': { xp: 170, level: 2, achievements: { 'first-run': at } },
  'sessions/s1': { uid: 'ayla', gameId: 'tetrix', status: 'finished', startedAt: at },
  'sessions/s2': { uid: 'bora', gameId: 'snake', status: 'open', startedAt: at },
};

// … and what it keeps.
const KEPT: Record<string, Record<string, unknown>> = {
  'users/bora': { username: 'Bora', isGuest: true, locale: 'tr', createdAt: at },
  'users/ayla/library/state': {
    favorites: ['tetrix'],
    recent: [{ slug: 'tetrix', playedAt: 1 }],
    best: {},
    updatedAt: at,
  },
  'games/tetrix': { plays: 12, likes: 3, dislikes: 1 },
  'games/tetrix/votes/ayla': { value: 1, updatedAt: at },
  'games/tetrix/daily/2026-11-01': { started: 4, finished: 3 },
  'rankings/catalog': { games: { tetrix: { trendScore: 1 } } },
  'usernames/ayla': { uid: 'ayla' },
  // Collections that share a name with the per-player ones but are not under users/{uid}.
  'rooms/r1/progress/state': { turn: 2 },
  'games/snake/stats/total': { plays: 99 },
};

const AYLA = {
  username: 'Ayla',
  isGuest: false,
  locale: 'en',
  avatarId: 'fox-blue',
  characterId: 'zombie',
  createdAt: at,
};

async function seed() {
  const batch = db().batch();
  for (const [path, data] of Object.entries({ ...PROGRESS, ...KEPT }))
    batch.set(db().doc(path), data);
  batch.set(db().doc('users/ayla'), { ...AYLA, xp: 170, level: 2 });
  batch.set(db().doc('users/cem'), { username: 'Cem', isGuest: true, locale: 'en', level: 1 });
  batch.set(db().doc('users/bora/library/state'), {
    favorites: ['snake'],
    recent: [],
    best: { snake: { score: 120, order: 'desc' } },
    updatedAt: at,
  });
  await batch.commit();
}

const noBackup = () => undefined;

describe('resetProgress', () => {
  it('only backs up and counts in a dry run', async () => {
    await seed();
    const before = await dump(db());
    let backup: Record<string, unknown> | null = null;

    const result = await resetProgress(db(), {
      dryRun: true,
      saveBackup: (data: Record<string, unknown>) => {
        backup = data;
      },
    });

    expect(await dump(db())).toEqual(before);
    expect(result).toEqual({
      dryRun: true,
      counts: {
        leaderboards: 4,
        stats: 2,
        progress: 1,
        userLevels: 2,
        libraryBests: 1,
        sessions: 2,
      },
    });
    // One JSON file with Timestamps as ISO strings.
    const saved = JSON.parse(JSON.stringify(backup)) as Record<string, { path: string }[]>;
    expect(saved.leaderboards!.map((d) => d.path).sort()).toEqual(
      Object.keys(PROGRESS)
        .filter((p) => p.startsWith('leaderboards/'))
        .sort(),
    );
    expect(saved.stats).toContainEqual({
      path: 'users/ayla/stats/tetrix',
      data: { plays: 3, playSeconds: 180, lastPlayedAt: '2026-11-01T12:00:00.000Z' },
    });
    expect(saved.userLevels).toEqual(
      expect.arrayContaining([
        { path: 'users/ayla', data: { xp: 170, level: 2 } },
        { path: 'users/cem', data: { level: 1 } },
      ]),
    );
    expect(saved.libraryBests).toEqual([
      {
        path: 'users/bora/library/state',
        data: { best: { snake: { score: 120, order: 'desc' } } },
      },
    ]);
    expect(saved.sessions!.map((d) => d.path).sort()).toEqual(['sessions/s1', 'sessions/s2']);
  });

  it('removes exactly the progress and keeps profiles, votes and favorites', async () => {
    await seed();
    const result = await resetProgress(db(), { dryRun: false, saveBackup: noBackup });
    expect(result.dryRun).toBe(false);

    const after = await dump(db());
    const expected = Object.fromEntries(
      Object.entries(KEPT).map(([path, data]) => [path, toJson(data)]),
    );
    expect(after).toEqual({
      ...expected,
      // The profile keeps everything but its copy of XP and level.
      'users/ayla': toJson(AYLA),
      'users/cem': { username: 'Cem', isGuest: true, locale: 'en' },
      // The account library keeps favorites and recently played; its best scores are cleared.
      'users/bora/library/state': toJson({
        favorites: ['snake'],
        recent: [],
        best: {},
        updatedAt: at,
      }),
    });
  });

  it('writes nothing when the backup cannot be saved', async () => {
    await seed();
    const before = await dump(db());
    await expect(
      resetProgress(db(), {
        dryRun: false,
        saveBackup: () => {
          throw new Error('disk full');
        },
      }),
    ).rejects.toThrow('disk full');
    expect(await dump(db())).toEqual(before);
  });

  it('is a no-op on an empty database', async () => {
    const result = await resetProgress(db(), { dryRun: false, saveBackup: noBackup });
    expect(Object.values(result.counts).every((count) => count === 0)).toBe(true);
    expect(await dump(db())).toEqual({});
  });
});
