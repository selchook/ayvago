import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { Timestamp } from 'firebase-admin/firestore';
import { get, ref, remove, serverTimestamp, set, update, type Database } from 'firebase/database';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  serverTimestamp as firestoreTimestamp,
  type Firestore,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RECENT_PLAYERS_LIMIT, tableMatch } from '../../packages/shared/src/presence';
import { db } from '../functions/src/admin';
import {
  moveRecentPlayers,
  recordMatch,
  recordRoomJoin,
  recordTableStart,
  removeFromRecentPlayers,
} from '../functions/src/recent';

// Site-wide presence and recent players (docs/adr/0021-site-presence-recent-players.md):
// presence/site/{uid} in the Realtime Database, invites to players who are online anywhere on
// the site, and users/{uid}/recentPlayers in Firestore, written by the triggers only.

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-ayvago',
    database: {
      rules: readFileSync(new URL('../database.rules.json', import.meta.url), 'utf8'),
      host: '127.0.0.1',
      port: 9000,
    },
    firestore: {
      rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearDatabase();
  await env.clearFirestore();
});

const as = (uid: string) => env.authenticatedContext(uid).database() as unknown as Database;
const anon = () => env.unauthenticatedContext().database() as unknown as Database;
const store = (uid: string) => env.authenticatedContext(uid).firestore() as unknown as Firestore;
const CODE = 'ABC234';

async function seed(path: string, value: unknown) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await set(ref(ctx.database() as unknown as Database, path), value);
  });
}

async function readAdmin(path: string) {
  let value: unknown;
  await env.withSecurityRulesDisabled(async (ctx) => {
    value = (await get(ref(ctx.database() as unknown as Database, path))).val();
  });
  return value;
}

const site = (changes: Record<string, unknown> = {}) => ({
  name: 'Mert',
  state: 'online',
  since: serverTimestamp(),
  ...changes,
});

function table(changes: Record<string, unknown> = {}) {
  return {
    gameId: 'okey',
    slug: 'okey',
    hostUid: 'host',
    size: 4,
    status: 'open',
    visibility: 'public',
    createdAt: Date.now(),
    seats: { 0: { uid: 'host', name: 'Ayşe' } },
    ...changes,
  };
}

/** The invite and the quota tick in one write, as the app sends them. */
function sendInvite(from: string, to: string) {
  return update(ref(as(from)), {
    [`invites/${to}/${from}`]: {
      fromUid: from,
      fromName: 'Ayşe',
      gameId: 'okey',
      slug: 'okey',
      tableCode: CODE,
      createdAt: serverTimestamp(),
    },
    [`inviteQuota/${from}`]: { start: serverTimestamp(), count: 1 },
  });
}

describe('presence/site/{uid}', () => {
  it('lets a player write and remove only their own entry', async () => {
    await assertSucceeds(set(ref(as('mert'), 'presence/site/mert'), site()));
    await assertSucceeds(
      set(
        ref(as('mert'), 'presence/site/mert'),
        site({ state: 'playing', gameId: 'okey', level: 4, character: 'rookie', dnd: true }),
      ),
    );
    await assertFails(set(ref(as('mert'), 'presence/site/ayse'), site()));
    await assertFails(set(ref(anon(), 'presence/site/mert'), site()));
    await assertFails(remove(ref(as('ayse'), 'presence/site/mert')));
    await assertSucceeds(remove(ref(as('mert'), 'presence/site/mert')));
  });

  it('validates every field and refuses anything else, a hidden flag included', async () => {
    const mine = ref(as('mert'), 'presence/site/mert');
    await assertFails(set(mine, site({ state: 'away' })));
    await assertFails(set(mine, site({ gameId: 'Not a game' })));
    await assertFails(set(mine, site({ name: '' })));
    await assertFails(set(mine, site({ name: 'x'.repeat(41) })));
    await assertFails(set(mine, site({ level: 0 })));
    await assertFails(set(mine, site({ character: 'alien-green' })));
    await assertFails(set(mine, site({ dnd: false })));
    await assertFails(set(mine, site({ since: Date.now() + 60_000 })));
    await assertFails(set(mine, site({ email: 'mert@example.com' })));
    // "Show me as online" off writes nothing: no flag can stand in for it.
    await assertFails(set(mine, site({ hidden: true })));
    await assertFails(set(mine, { name: 'Mert', since: serverTimestamp() }));
  });

  it('is readable one uid at a time by signed-in players, never as a list', async () => {
    await seed('presence/site/mert', { name: 'Mert', state: 'online', since: 1 });
    await seed('presence/site/ayse', { name: 'Ayşe', state: 'table', gameId: 'okey', since: 1 });
    const entry = await assertSucceeds(get(ref(as('zeynep'), 'presence/site/mert')));
    expect(entry.val()).toMatchObject({ name: 'Mert', state: 'online' });
    await assertFails(get(ref(as('zeynep'), 'presence/site')));
    await assertFails(get(ref(as('zeynep'), 'presence')));
    await assertFails(get(ref(anon(), 'presence/site/mert')));
    // A hidden player has no entry: they read as offline.
    expect((await get(ref(as('zeynep'), 'presence/site/gizli'))).val()).toBeNull();
  });
});

describe('invites to players online anywhere on the site', () => {
  beforeEach(async () => {
    await seed(`tables/${CODE}`, table());
  });

  it('reach a site-present player who is in no lobby', async () => {
    await seed('presence/site/mert', { name: 'Mert', state: 'online', since: 1 });
    await assertSucceeds(sendInvite('host', 'mert'));
    expect(await readAdmin('invites/mert/host')).toMatchObject({ tableCode: CODE });
  });

  it('do not reach hidden, offline or do-not-disturb players', async () => {
    // Hidden ("Show me as online" off) and offline look the same: no entry.
    await assertFails(sendInvite('host', 'gizli'));
    await seed('presence/site/elif', { name: 'Elif', state: 'online', since: 1, dnd: true });
    await assertFails(sendInvite('host', 'elif'));
    // Do not disturb in the site entry wins even when the lobby entry lacks it.
    await seed('presence/lobbies/okey/elif', { name: 'Elif', state: 'lobby', since: 1 });
    await assertFails(sendInvite('host', 'elif'));
  });

  it('keep the 5.18 checks: a seated sender, an open table, no second pending invite', async () => {
    await seed('presence/site/mert', { name: 'Mert', state: 'playing', gameId: 'snake', since: 1 });
    // Not seated at the table.
    await assertFails(sendInvite('stranger', 'mert'));
    await assertSucceeds(sendInvite('host', 'mert'));
    // One pending invite per pair (and the quota already started its window).
    await assertFails(sendInvite('host', 'mert'));
    await seed(`tables/${CODE}/status`, 'playing');
    await seed('invites/mert/host', null);
    await seed('inviteQuota/host', null);
    await assertFails(sendInvite('host', 'mert'));
  });

  it('do not reach a player already seated at the table', async () => {
    await seed(`tables/${CODE}/seats/1`, { uid: 'mert', name: 'Mert' });
    await seed('presence/site/mert', { name: 'Mert', state: 'table', gameId: 'okey', since: 1 });
    await assertFails(sendInvite('host', 'mert'));
  });
});

describe('users/{uid}/recentPlayers', () => {
  it('is readable by its owner only and written by no client', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/ayse/recentPlayers/mert'), {
        uid: 'mert',
        name: 'Mert',
        gameId: 'okey',
        slug: 'okey',
        count: 1,
      });
    });
    await assertSucceeds(getDoc(doc(store('ayse'), 'users/ayse/recentPlayers/mert')));
    await assertSucceeds(getDocs(collection(store('ayse'), 'users/ayse/recentPlayers')));
    await assertFails(getDoc(doc(store('mert'), 'users/ayse/recentPlayers/mert')));
    await assertFails(getDocs(collection(store('mert'), 'users/ayse/recentPlayers')));
    await assertFails(
      setDoc(doc(store('ayse'), 'users/ayse/recentPlayers/zeynep'), {
        uid: 'zeynep',
        name: 'Zeynep',
        gameId: 'okey',
        slug: 'okey',
        count: 99,
      }),
    );
    await assertFails(
      updateDoc(doc(store('ayse'), 'users/ayse/recentPlayers/mert'), { count: 50 }),
    );
    await assertFails(
      setDoc(doc(store('mert'), 'users/ayse/recentPlayers/mert'), { uid: 'mert', count: 1 }),
    );
  });

  it('"Show me as online" is a boolean the owner sets on the profile', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/ayse'), {
        username: 'Ayse',
        isGuest: true,
        locale: 'tr',
      });
    });
    const profile = (uid: string) => doc(store(uid), 'users/ayse');
    // The rules compare isGuest with the sign-in provider.
    const guestStore = env
      .authenticatedContext('ayse', { firebase: { sign_in_provider: 'anonymous' } })
      .firestore() as unknown as Firestore;
    for (const hideOnline of [true, false]) {
      await assertSucceeds(
        updateDoc(doc(guestStore, 'users/ayse'), { hideOnline, updatedAt: firestoreTimestamp() }),
      );
    }
    await assertFails(
      updateDoc(doc(guestStore, 'users/ayse'), {
        hideOnline: 'no',
        updatedAt: firestoreTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(profile('mert'), { hideOnline: true, updatedAt: firestoreTimestamp() }),
    );
  });
});

// The triggers' work, called directly (the live triggers are an opt-in run, below).
const LIVE_TRIGGER = process.env.AYVAGO_EMULATOR_DB_TRIGGERS === '1';

async function recent(owner: string) {
  const snapshot = await db()
    .collection(`users/${owner}/recentPlayers`)
    .orderBy('lastPlayedAt', 'desc')
    .get();
  return snapshot.docs.map(
    (entry) => ({ id: entry.id, ...entry.data() }) as Record<string, unknown>,
  );
}

const fourAtTable = table({
  status: 'playing',
  createdAt: 1_000,
  seats: {
    0: { uid: 'host', name: 'Ayşe', character: 'explorer' },
    1: { bot: true, name: 'Bot 1' },
    2: { uid: 'guest-mert', name: 'Mert' },
    3: { uid: 'zeynep', name: 'Zeynep', character: 'rookie' },
  },
});

describe.skipIf(LIVE_TRIGGER)('recording recent players', () => {
  it('records everyone at a table when it starts, bots left out, guests included', async () => {
    const open = { ...fourAtTable, status: 'open' };
    expect(await recordTableStart(CODE, open, fourAtTable)).toBe(6);
    const ayse = await recent('host');
    expect(ayse.map((entry) => entry.id).sort()).toEqual(['guest-mert', 'zeynep']);
    expect(ayse.find((entry) => entry.id === 'zeynep')).toMatchObject({
      uid: 'zeynep',
      name: 'Zeynep',
      character: 'rookie',
      gameId: 'okey',
      slug: 'okey',
      count: 1,
    });
    expect((await recent('guest-mert')).map((entry) => entry.id).sort()).toEqual([
      'host',
      'zeynep',
    ]);
    // Later writes to the playing table record nothing; the same start twice counts once.
    expect(await recordTableStart(CODE, fourAtTable, fourAtTable)).toBe(0);
    expect(await recordMatch(tableMatch(CODE, open, fourAtTable)!)).toBe(0);
    // A new table with the same players counts again.
    const next = { ...fourAtTable, createdAt: 2_000 };
    expect(await recordTableStart('NXT234', { ...next, status: 'open' }, next)).toBe(6);
    expect((await recent('host')).every((entry) => entry.count === 2)).toBe(true);
  });

  it('records nothing for a table with one player and bots', async () => {
    const solo = table({
      status: 'playing',
      seats: { 0: { uid: 'host', name: 'Ayşe' }, 1: { bot: true, name: 'Bot 1' } },
    });
    expect(await recordTableStart(CODE, table(), solo)).toBe(0);
    expect(await recent('host')).toEqual([]);
  });

  it('records both players of a room once its guest seat is taken', async () => {
    await seed('rooms/ROM234', {
      gameId: 'connectfour',
      slug: 'connect-four',
      hostUid: 'host',
      hostName: 'Ayşe',
      createdAt: 5,
      status: 'open',
    });
    expect(await recordRoomJoin('ROM234')).toBe(0);
    await seed('rooms/ROM234/guestUid', 'guest-mert');
    await seed('rooms/ROM234/guestName', 'Mert');
    expect(await recordRoomJoin('ROM234')).toBe(2);
    expect(await recent('host')).toMatchObject([
      { id: 'guest-mert', name: 'Mert', gameId: 'connectfour', slug: 'connect-four', count: 1 },
    ]);
    expect(await recent('guest-mert')).toMatchObject([{ id: 'host', name: 'Ayşe', count: 1 }]);
  });

  it(`keeps each player's ${RECENT_PLAYERS_LIMIT} most recent players`, async () => {
    const batch = db().batch();
    for (let i = 0; i < RECENT_PLAYERS_LIMIT; i++) {
      batch.set(db().doc(`users/host/recentPlayers/old-${i}`), {
        uid: `old-${i}`,
        name: `Old ${i}`,
        gameId: 'okey',
        slug: 'okey',
        count: 1,
        lastPlayedAt: Timestamp.fromMillis(1_000_000 + i),
      });
    }
    await batch.commit();
    const pair = table({
      status: 'playing',
      seats: { 0: { uid: 'host', name: 'Ayşe' }, 1: { uid: 'new', name: 'Yeni' } },
    });
    await recordTableStart(CODE, table(), pair);
    const kept = await recent('host');
    expect(kept).toHaveLength(RECENT_PLAYERS_LIMIT);
    expect(kept[0]!.id).toBe('new');
    // The oldest one made room.
    expect(kept.some((entry) => entry.id === 'old-0')).toBe(false);
    expect(kept.some((entry) => entry.id === 'old-1')).toBe(true);
  });

  it('removes a deleted player from every list and moves a merged guest to the account', async () => {
    const open = { ...fourAtTable, status: 'open' };
    await recordTableStart(CODE, open, fourAtTable);
    // The guest Mert signs in to the account "mert".
    expect(await moveRecentPlayers('guest-mert', 'mert')).toBe(4);
    expect((await recent('mert')).map((entry) => entry.id).sort()).toEqual(['host', 'zeynep']);
    expect((await recent('host')).map((entry) => entry.id).sort()).toEqual(['mert', 'zeynep']);
    expect((await recent('host')).find((entry) => entry.id === 'mert')).toMatchObject({
      uid: 'mert',
      count: 1,
    });
    // Zeynep deletes her account.
    expect(await removeFromRecentPlayers('zeynep')).toBe(2);
    expect((await recent('host')).map((entry) => entry.id)).toEqual(['mert']);
    expect((await recent('mert')).map((entry) => entry.id)).toEqual(['host']);
  });
});

// The deployed triggers in the Functions emulator (see lobby.test.ts for how to run them):
//   AYVAGO_EMULATOR_DB_TRIGGERS=1 firebase emulators:exec --only auth,firestore,functions,database \
//     --project demo-ayvago "vitest run tests/presence.test.ts"
describe.skipIf(!LIVE_TRIGGER)('recent players triggers', () => {
  async function waitForRecent(owner: string, count: number) {
    for (let i = 0; i < 80; i++) {
      const entries = await recent(owner);
      if (entries.length >= count) return entries;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`timed out waiting for ${owner}'s recent players`);
  }

  it('syncLobbyTable records the players when a table starts', async () => {
    await assertSucceeds(
      set(ref(as('host'), 'tables/TRG234'), {
        ...table(),
        seats: { 0: { uid: 'host', name: 'Ayşe' }, 1: { bot: true, name: 'Bot 1' } },
      }),
    );
    await assertSucceeds(
      set(ref(as('guest-mert'), 'tables/TRG234/seats/2'), { uid: 'guest-mert', name: 'Mert' }),
    );
    await assertSucceeds(set(ref(as('host'), 'tables/TRG234/status'), 'playing'));
    const entries = await waitForRecent('guest-mert', 1);
    expect(entries).toMatchObject([{ id: 'host', name: 'Ayşe', gameId: 'okey' }]);
  });

  it('recordRoomPlayers records both players when the guest joins a room', async () => {
    await assertSucceeds(
      set(ref(as('host'), 'rooms/RMT234'), {
        gameId: 'connectfour',
        slug: 'connect-four',
        hostUid: 'host',
        hostName: 'Ayşe',
        createdAt: serverTimestamp(),
        status: 'open',
      }),
    );
    await assertSucceeds(
      update(ref(as('guest-mert'), 'rooms/RMT234'), {
        guestUid: 'guest-mert',
        guestName: 'Mert',
        status: 'full',
      }),
    );
    const entries = await waitForRecent('host', 1);
    expect(entries).toMatchObject([{ id: 'guest-mert', name: 'Mert', gameId: 'connectfour' }]);
  });
});
