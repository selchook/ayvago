import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { get, ref, remove, serverTimestamp, set, update, type Database } from 'firebase/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteStaleLobbyData, syncLobbyTable } from '../functions/src/lobby';
import { deleteOldTables, ROOM_TTL_MS } from '../functions/src/rooms';

// The table lobby (docs/adr/0019-table-lobby-presence-invites.md): the public table list written
// by the syncLobbyTable trigger, presence per game, invites between players and the invite quota.

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-ayvago',
    database: {
      rules: readFileSync(new URL('../database.rules.json', import.meta.url), 'utf8'),
      host: '127.0.0.1',
      port: 9000,
    },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearDatabase();
});

const as = (uid: string) => env.authenticatedContext(uid).database() as unknown as Database;
const anon = () => env.unauthenticatedContext().database() as unknown as Database;
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

const presence = (changes: Record<string, unknown> = {}) => ({
  name: 'Mert',
  state: 'lobby',
  since: Date.now() - 1000,
  ...changes,
});

const invite = (from = 'host', changes: Record<string, unknown> = {}) => ({
  fromUid: from,
  fromName: 'Ayşe',
  gameId: 'okey',
  slug: 'okey',
  tableCode: CODE,
  createdAt: serverTimestamp(),
  ...changes,
});

/** The invite and the quota tick in one write, as the app sends them. */
function sendInvite(
  from: string,
  to: string,
  quota: Record<string, unknown> = { start: serverTimestamp(), count: 1 },
  changes: Record<string, unknown> = {},
) {
  return update(ref(as(from)), {
    [`invites/${to}/${from}`]: invite(from, changes),
    [`inviteQuota/${from}`]: quota,
  });
}

describe('tables/{code}/visibility', () => {
  it('lets the host open a public or private table and change it, nobody else', async () => {
    await assertSucceeds(set(ref(as('host'), `tables/${CODE}`), table()));
    await assertSucceeds(set(ref(as('host'), `tables/${CODE}/visibility`), 'private'));
    await assertFails(set(ref(as('host'), `tables/${CODE}/visibility`), 'secret'));
    await assertFails(set(ref(as('guest'), `tables/${CODE}/visibility`), 'public'));
    await assertSucceeds(
      set(
        ref(as('other'), 'tables/XYZ234'),
        table({
          hostUid: 'other',
          visibility: 'private',
          seats: { 0: { uid: 'other', name: 'O' } },
        }),
      ),
    );
  });
});

describe('lobby/{gameId}/tables', () => {
  it('is readable by signed-in players and written by nobody but the server', async () => {
    await seed(`lobby/okey/tables/${CODE}`, { slug: 'okey', status: 'open' });
    await assertSucceeds(get(ref(as('anyone'), 'lobby/okey/tables')));
    await assertFails(get(ref(anon(), 'lobby/okey/tables')));
    await assertFails(get(ref(as('anyone'), 'lobby')));
    await assertFails(set(ref(as('host'), `lobby/okey/tables/${CODE}`), { slug: 'okey' }));
    await assertFails(remove(ref(as('host'), `lobby/okey/tables/${CODE}`)));
  });
});

describe('presence/lobbies/{gameId}/{uid}', () => {
  it('lets a player write and remove only their own entry', async () => {
    await assertSucceeds(set(ref(as('mert'), 'presence/lobbies/okey/mert'), presence()));
    await assertSucceeds(
      set(
        ref(as('mert'), 'presence/lobbies/okey/mert'),
        presence({
          state: 'playing',
          level: 7,
          character: 'rookie',
          dnd: true,
          since: serverTimestamp(),
        }),
      ),
    );
    await assertFails(set(ref(as('mallory'), 'presence/lobbies/okey/mert'), presence()));
    await assertFails(remove(ref(as('mallory'), 'presence/lobbies/okey/mert')));
    await assertFails(set(ref(anon(), 'presence/lobbies/okey/mert'), presence()));
    await assertSucceeds(remove(ref(as('mert'), 'presence/lobbies/okey/mert')));
  });

  it('validates the fields', async () => {
    const at = ref(as('mert'), 'presence/lobbies/okey/mert');
    await assertFails(set(at, presence({ state: 'away' })));
    await assertFails(set(at, presence({ name: '' })));
    await assertFails(set(at, presence({ name: 'x'.repeat(41) })));
    await assertFails(set(at, presence({ character: 'alien-green' })));
    await assertFails(set(at, presence({ level: 0 })));
    await assertFails(set(at, presence({ dnd: false })));
    await assertFails(set(at, presence({ since: Date.now() + 60_000 })));
    await assertFails(set(at, presence({ email: 'a@b.c' })));
    await assertFails(set(at, { name: 'Mert', state: 'lobby' }));
    await assertFails(set(ref(as('mert'), 'presence/lobbies/Bad-Id/mert'), presence()));
  });

  it('is readable per game by signed-in players only', async () => {
    await seed('presence/lobbies/okey/mert', presence());
    await assertSucceeds(get(ref(as('anyone'), 'presence/lobbies/okey')));
    await assertFails(get(ref(anon(), 'presence/lobbies/okey')));
    await assertFails(get(ref(as('anyone'), 'presence/lobbies')));
  });
});

describe('invites/{toUid}/{fromUid}', () => {
  beforeEach(async () => {
    await seed(`tables/${CODE}`, table());
    await seed('presence/lobbies/okey/mert', presence());
  });

  it('lets a seated player invite someone in the lobby to their open table', async () => {
    await assertSucceeds(sendInvite('host', 'mert'));
    expect(await readAdmin('invites/mert/host')).toMatchObject({
      fromName: 'Ayşe',
      tableCode: CODE,
    });
  });

  it('refuses invites without the quota tick, from strangers or as someone else', async () => {
    await assertFails(set(ref(as('host'), 'invites/mert/host'), invite('host')));
    await assertFails(sendInvite('stranger', 'mert', undefined, { fromName: 'S' }));
    await assertFails(
      update(ref(as('mallory')), {
        'invites/mert/host': invite('host'),
        'inviteQuota/mallory': { start: serverTimestamp(), count: 1 },
      }),
    );
    await assertFails(sendInvite('host', 'host'));
    await assertFails(get(ref(as('host'), 'invites/mert')));
  });

  it('refuses invites to players outside the lobby, taking no invites, or already seated', async () => {
    await assertFails(sendInvite('host', 'nobody'));
    await seed('presence/lobbies/okey/quiet', presence({ dnd: true }));
    await assertFails(sendInvite('host', 'quiet'));
    await seed(`tables/${CODE}/seats/1`, { uid: 'mert', name: 'Mert' });
    await assertFails(sendInvite('host', 'mert'));
  });

  it('refuses invites to started, missing or other games’ tables and bad fields', async () => {
    await assertFails(sendInvite('host', 'mert', undefined, { tableCode: 'ZZZ234' }));
    await assertFails(sendInvite('host', 'mert', undefined, { slug: 'connect-four' }));
    await assertFails(sendInvite('host', 'mert', undefined, { fromName: '' }));
    await assertFails(sendInvite('host', 'mert', undefined, { createdAt: Date.now() - 5000 }));
    await assertFails(sendInvite('host', 'mert', undefined, { extra: 1 }));
    await assertFails(sendInvite('host', 'mert', undefined, { answer: 'accepted' }));
    await seed(`tables/${CODE}/status`, 'playing');
    await assertFails(sendInvite('host', 'mert'));
  });

  it('keeps one pending invite per pair until it is answered or expires', async () => {
    await assertSucceeds(sendInvite('host', 'mert'));
    const quota = (await readAdmin('inviteQuota/host')) as { start: number; count: number };
    await assertFails(sendInvite('host', 'mert', { start: quota.start, count: 2 }));
    // Expired: may be sent again.
    await seed('invites/mert/host/createdAt', Date.now() - 121_000);
    await assertSucceeds(sendInvite('host', 'mert', { start: quota.start, count: 2 }));
    // Answered: may be sent again.
    await assertSucceeds(set(ref(as('mert'), 'invites/mert/host/answer'), 'declined'));
    await assertSucceeds(sendInvite('host', 'mert', { start: quota.start, count: 3 }));
  });

  it('lets the recipient read and answer once, and either side delete', async () => {
    await assertSucceeds(sendInvite('host', 'mert'));
    await assertSucceeds(get(ref(as('mert'), 'invites/mert')));
    await assertSucceeds(get(ref(as('host'), 'invites/mert/host')));
    await assertFails(get(ref(as('stranger'), 'invites/mert/host')));
    await assertFails(set(ref(as('host'), 'invites/mert/host/answer'), 'accepted'));
    await assertFails(set(ref(as('mert'), 'invites/mert/host/answer'), 'maybe'));
    await assertFails(set(ref(as('mert'), 'invites/mert/host/tableCode'), 'XYZ234'));
    await assertSucceeds(set(ref(as('mert'), 'invites/mert/host/answer'), 'accepted'));
    await assertFails(set(ref(as('mert'), 'invites/mert/host/answer'), 'declined'));
    await assertFails(remove(ref(as('stranger'), 'invites/mert/host')));
    await assertSucceeds(remove(ref(as('host'), 'invites/mert/host')));
    await assertSucceeds(
      sendInvite('host', 'mert', {
        start: ((await readAdmin('inviteQuota/host')) as { start: number }).start,
        count: 2,
      }),
    );
    await assertSucceeds(remove(ref(as('mert'), 'invites/mert/host')));
  });
});

describe('inviteQuota/{uid}', () => {
  beforeEach(async () => {
    await seed(`tables/${CODE}`, table());
    for (const uid of ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']) {
      await seed(`presence/lobbies/okey/${uid}`, presence({ name: uid }));
    }
  });

  it('allows five invites a minute and refuses the sixth', async () => {
    await assertSucceeds(sendInvite('host', 'p1'));
    const { start } = (await readAdmin('inviteQuota/host')) as { start: number };
    for (const [i, to] of ['p2', 'p3', 'p4', 'p5'].entries()) {
      await assertSucceeds(sendInvite('host', to, { start, count: i + 2 }));
    }
    await assertFails(sendInvite('host', 'p6', { start, count: 6 }));
    // Starting a new window early, skipping counts or deleting the quota is refused too.
    await assertFails(sendInvite('host', 'p6', { start: serverTimestamp(), count: 1 }));
    await assertFails(sendInvite('host', 'p6', { start, count: 5 }));
    await assertFails(remove(ref(as('host'), 'inviteQuota/host')));
    await assertFails(
      set(ref(as('host'), 'inviteQuota/host'), { start: start - 60_000, count: 1 }),
    );
  });

  it('opens a new window after a minute', async () => {
    await seed('inviteQuota/host', { start: Date.now() - 61_000, count: 5 });
    await assertSucceeds(sendInvite('host', 'p1', { start: serverTimestamp(), count: 1 }));
  });

  it('belongs to its player only', async () => {
    await seed('inviteQuota/host', { start: Date.now(), count: 1 });
    await assertSucceeds(get(ref(as('host'), 'inviteQuota/host')));
    await assertFails(get(ref(as('other'), 'inviteQuota/host')));
    await assertFails(
      set(ref(as('other'), 'inviteQuota/host'), { start: serverTimestamp(), count: 1 }),
    );
  });
});

// With the live trigger on (see below) it would race these direct calls, so they run in the
// default run and the trigger test in the opt-in run.
const LIVE_TRIGGER = process.env.AYVAGO_EMULATOR_DB_TRIGGERS === '1';

describe.skipIf(LIVE_TRIGGER)('syncLobbyTable', () => {
  it('lists a public table without uids, follows its changes and removes it', async () => {
    const value = table({ online: { host: 'abcdef012345' } });
    await seed(`tables/${CODE}`, value);
    expect(await syncLobbyTable(CODE, null, value)).toBe('set');
    const entry = (await readAdmin(`lobby/okey/tables/${CODE}`)) as Record<string, unknown>;
    expect(entry).toMatchObject({ hostName: 'Ayşe', status: 'open', size: 4, online: 1 });
    expect(JSON.stringify(entry)).not.toContain('host"');

    const playing = { ...value, status: 'playing' };
    await seed(`tables/${CODE}/status`, 'playing');
    expect(await syncLobbyTable(CODE, value, playing)).toBe('set');
    expect(await readAdmin(`lobby/okey/tables/${CODE}/status`)).toBe('playing');

    // A change the lobby does not show (a move of the session id) writes nothing.
    expect(
      await syncLobbyTable(CODE, playing, { ...playing, online: { host: '012345abcdef' } }),
    ).toBe('unchanged');

    await seed(`tables/${CODE}`, null);
    expect(await syncLobbyTable(CODE, playing, null)).toBe('removed');
    expect(await readAdmin(`lobby/okey/tables/${CODE}`)).toBeNull();
  });

  it('takes a table out when it turns private or closes, and never lists private ones', async () => {
    const value = table();
    await seed(`tables/${CODE}`, value);
    await syncLobbyTable(CODE, null, value);
    const hidden = { ...value, visibility: 'private' };
    await seed(`tables/${CODE}`, hidden);
    expect(await syncLobbyTable(CODE, value, hidden)).toBe('removed');
    expect(await readAdmin(`lobby/okey/tables/${CODE}`)).toBeNull();

    const other = table({ visibility: 'private' });
    await seed('tables/XYZ234', other);
    expect(await syncLobbyTable('XYZ234', null, other)).toBe('unchanged');
    expect(await readAdmin('lobby/okey/tables/XYZ234')).toBeNull();
  });

  it('writes the table as it is now when events arrive out of order', async () => {
    const first = table();
    const now = table({
      seats: { 0: { uid: 'host', name: 'Ayşe' }, 1: { bot: true, name: 'Bot 1' } },
    });
    await seed(`tables/${CODE}`, now);
    // The older event is handled last.
    await syncLobbyTable(CODE, null, now);
    await syncLobbyTable(CODE, null, first);
    const seats = (await readAdmin(`lobby/okey/tables/${CODE}/seats`)) as Array<{ kind: string }>;
    expect(seats[1]).toEqual({ kind: 'bot', name: 'Bot 1' });
  });
});

// The deployed trigger itself, running in the Functions emulator. The emulator fires database
// triggers only in us-central1, so index.ts moves the trigger there when the emulator has
// AYVAGO_EMULATOR_DB_TRIGGERS=1 (deploys stay in europe-west1). To run it, put that line in
// firebase/functions/.env.local and run this file alone with the variable set:
//   AYVAGO_EMULATOR_DB_TRIGGERS=1 firebase emulators:exec --only auth,firestore,functions,database \
//     --project demo-ayvago "vitest run tests/lobby.test.ts"
// The default run leaves it off: the other suites' bursts of table writes overwhelm the
// emulator's function workers. The handler itself is tested above.
describe.skipIf(!LIVE_TRIGGER)('syncLobbyTable trigger', () => {
  async function waitFor(path: string, check: (value: unknown) => boolean) {
    for (let i = 0; i < 60; i++) {
      const value = await readAdmin(path);
      if (check(value)) return value;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`timed out waiting for ${path}`);
  }

  it('lists a table the host opens as public and drops it when it turns private', async () => {
    await assertSucceeds(set(ref(as('host'), 'tables/TRG234'), table()));
    const entry = await waitFor('lobby/okey/tables/TRG234', (value) => value !== null);
    expect(entry).toMatchObject({ hostName: 'Ayşe', status: 'open' });
    await assertSucceeds(set(ref(as('host'), 'tables/TRG234/visibility'), 'private'));
    await waitFor('lobby/okey/tables/TRG234', (value) => value === null);
  });
});

describe('cleanup', () => {
  it('deleteOldTables removes the lobby entry with the table', async () => {
    await seed('tables/OLD234', table({ createdAt: Date.now() - 3 * 3600_000 }));
    await seed('lobby/okey/tables/OLD234', { slug: 'okey', createdAt: Date.now() - 3 * 3600_000 });
    expect(await deleteOldTables(Date.now() - ROOM_TTL_MS)).toBe(1);
    expect(await readAdmin('lobby/okey/tables/OLD234')).toBeNull();
  });

  it('deleteStaleLobbyData removes old lobby entries, invites and quotas only', async () => {
    const now = Date.now();
    // Codes no other test uses, so a late trigger run from an earlier test cannot touch them.
    await seed('lobby/okey/tables/STA234', { slug: 'okey', createdAt: now - 3 * 3600_000 });
    await seed('lobby/okey/tables/NEW234', { slug: 'okey', createdAt: now });
    await seed('invites/mert/old', { fromUid: 'old', createdAt: now - 30 * 60_000 });
    await seed('invites/mert/new', { fromUid: 'new', createdAt: now - 60_000 });
    await seed('inviteQuota/old', { start: now - 2 * 3600_000, count: 5 });
    await seed('inviteQuota/new', { start: now - 30_000, count: 2 });
    expect(await deleteStaleLobbyData(now - ROOM_TTL_MS, now)).toEqual({
      entries: 1,
      invites: 1,
      quotas: 1,
    });
    expect(await readAdmin('lobby/okey/tables/STA234')).toBeNull();
    expect(await readAdmin('lobby/okey/tables/NEW234')).not.toBeNull();
    expect(await readAdmin('invites/mert/old')).toBeNull();
    expect(await readAdmin('invites/mert/new')).not.toBeNull();
    expect(await readAdmin('inviteQuota/old')).toBeNull();
    expect(await readAdmin('inviteQuota/new')).not.toBeNull();
  });
});
