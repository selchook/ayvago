import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { get, ref, remove, runTransaction, set, update, type Database } from 'firebase/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { syncLobbyTable } from '../functions/src/lobby';

// Slice 5.20: "Leave table". A player frees their seat (waiting table) or only their presence
// (game on); a host who leaves alone closes the table; a host who leaves others behind writes
// `hostLeft`, so the next player takes over at once.

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
const CODE = 'NVT234';
const ON = 'abcdef012345';
const SETTINGS = { hands: 5, turnSeconds: 30, bots: true };

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

const threeSeated = {
  0: { uid: 'host', name: 'Ayşe' },
  1: { uid: 'mert', name: 'Mert' },
  2: { uid: 'can', name: 'Can' },
};

function table(changes: Record<string, unknown> = {}) {
  return {
    gameId: 'okey',
    slug: 'okey',
    hostUid: 'host',
    size: 4,
    status: 'open',
    visibility: 'public',
    createdAt: Date.now(),
    settings: SETTINGS,
    seats: threeSeated,
    online: { host: ON, mert: ON, can: ON },
    ...changes,
  };
}

const at = (uid: string, path = '') => ref(as(uid), `tables/${CODE}${path}`);

describe('a player leaves', () => {
  it('frees their own seat and presence at a waiting table, in one update', async () => {
    await seed(`tables/${CODE}`, table());
    // Not someone else's seat or presence.
    await assertFails(update(at('mert'), { 'seats/2': null, 'online/mert': null }));
    await assertFails(update(at('mert'), { 'seats/1': null, 'online/can': null }));
    await assertSucceeds(update(at('mert'), { 'seats/1': null, 'online/mert': null }));
    expect(await readAdmin(`tables/${CODE}/seats/1`)).toBeNull();
    expect(await readAdmin(`tables/${CODE}/online/mert`)).toBeNull();
    expect(await readAdmin(`tables/${CODE}/seats/2/uid`)).toBe('can');
  });

  it('keeps their seat during a game and only takes their presence away', async () => {
    await seed(`tables/${CODE}`, table({ status: 'playing' }));
    await assertSucceeds(update(at('can'), { 'online/can': null }));
    expect(await readAdmin(`tables/${CODE}/seats/2/uid`)).toBe('can');
    // They can come back: the seat is theirs, so their presence is accepted again.
    await assertSucceeds(set(at('can', '/online/can'), ON));
  });

  it('cannot close the table or write the host marker', async () => {
    await seed(`tables/${CODE}`, table({ online: { mert: ON } }));
    await assertFails(update(at('mert'), { status: 'closed' }));
    await assertFails(update(at('mert'), { 'online/mert': null, hostLeft: 'host' }));
    await assertFails(set(at('mert', '/hostLeft'), 'mert'));
    await seed(`tables/${CODE}/hostLeft`, 'host');
    await assertFails(remove(at('mert', '/hostLeft')));
  });
});

describe('the host leaves', () => {
  it('closes a waiting table where nobody else is seated', async () => {
    await seed(
      `tables/${CODE}`,
      table({
        seats: { 0: { uid: 'host', name: 'Ayşe' }, 1: { bot: true, name: 'Bot 1' } },
        online: { host: ON },
        startAt: Date.now() + 10_000,
      }),
    );
    await assertFails(update(at('mert'), { status: 'closed', startAt: null }));
    await assertSucceeds(
      update(at('host'), { status: 'closed', startAt: null, 'online/host': null }),
    );
    expect(await readAdmin(`tables/${CODE}/status`)).toBe('closed');
    // Nobody sits down at a closed table.
    await assertFails(set(at('mert', '/seats/2'), { uid: 'mert', name: 'Mert' }));
  });

  it('leaves the others a marker, together with going away, so they take over at once', async () => {
    await seed(`tables/${CODE}`, table());
    // Only for the current host, and only once their presence is gone.
    await assertFails(update(at('host'), { hostLeft: 'host' }));
    await assertFails(update(at('host'), { 'online/host': null, hostLeft: 'mert' }));
    await assertFails(update(at('host'), { 'online/host': null, hostLeft: true }));
    await assertSucceeds(
      update(at('host'), { 'seats/0': null, 'online/host': null, hostLeft: 'host' }),
    );
    expect(await readAdmin(`tables/${CODE}/hostLeft`)).toBe('host');
    // The hand-over rule is unchanged: the next present player takes the role themself.
    await assertSucceeds(set(at('mert', '/hostUid'), 'mert'));
    await assertSucceeds(set(at('mert', '/seats/0'), { bot: true, name: 'Bot 1' }));
    await assertFails(set(at('host', '/status'), 'playing'));
  });

  it('decides in a transaction, as the host page does', async () => {
    await seed(`tables/${CODE}`, table({ status: 'playing' }));
    const result = await runTransaction(
      at('host'),
      (raw: Record<string, unknown> | null) => {
        if (raw === null) return null;
        const online = { ...(raw.online as Record<string, unknown>) };
        delete online.host;
        return { ...raw, online, hostLeft: 'host' };
      },
      { applyLocally: false },
    );
    expect(result.committed).toBe(true);
    // During a game the host keeps their seat.
    expect(await readAdmin(`tables/${CODE}/seats/0/uid`)).toBe('host');
    expect(await readAdmin(`tables/${CODE}/hostLeft`)).toBe('host');
  });

  it('does not stand in the way of the new host, who writes the whole table', async () => {
    // Mert took over after the host left; the old marker is still there.
    await seed(
      `tables/${CODE}`,
      table({ hostUid: 'mert', seats: { 1: threeSeated[1], 2: threeSeated[2] }, hostLeft: 'host' }),
    );
    // Starting the table (a whole-table transaction) keeps the old marker as it is.
    const start = await runTransaction(
      at('mert'),
      (raw: Record<string, unknown> | null) =>
        raw === null ? null : { ...raw, status: 'playing' },
      { applyLocally: false },
    );
    expect(start.committed).toBe(true);
    // Nobody may point it at someone else, though.
    await assertFails(set(at('mert', '/hostLeft'), 'can'));
    await assertFails(set(at('mert', '/hostLeft'), 'mert'));
    await assertSucceeds(update(at('mert'), { 'online/mert': null, hostLeft: 'mert' }));
  });

  it('is refused on a closed table, and can be cleared by the host who came back', async () => {
    await seed(`tables/${CODE}`, table({ status: 'closed', online: {} }));
    await assertFails(set(at('host', '/hostLeft'), 'host'));
    await seed(`tables/${CODE}`, table({ online: { mert: ON }, hostLeft: 'host' }));
    await assertSucceeds(set(at('host', '/online/host'), ON));
    await assertSucceeds(remove(at('host', '/hostLeft')));
  });

  it('can sit down again before anyone took over (the host keeps the table rights)', async () => {
    await seed(
      `tables/${CODE}`,
      table({ seats: { 1: threeSeated[1] }, online: {}, hostLeft: 'host' }),
    );
    await assertSucceeds(set(at('host', '/seats/0'), { uid: 'host', name: 'Ayşe' }));
  });
});

describe.skipIf(process.env.AYVAGO_EMULATOR_DB_TRIGGERS === '1')(
  'syncLobbyTable after a leave',
  () => {
    it('drops a closed table and keeps one whose seat was freed', async () => {
      const open = table();
      await seed(`tables/${CODE}`, open);
      expect(await syncLobbyTable(CODE, null, open)).toBe('set');

      const freed = table({ seats: { 0: threeSeated[0], 2: threeSeated[2] } });
      await seed(`tables/${CODE}`, freed);
      expect(await syncLobbyTable(CODE, open, freed)).toBe('set');
      expect(await readAdmin(`lobby/okey/tables/${CODE}/seats/1`)).toEqual({ kind: 'empty' });

      const closed = { ...freed, status: 'closed' };
      await seed(`tables/${CODE}`, closed);
      expect(await syncLobbyTable(CODE, freed, closed)).toBe('removed');
      expect(await readAdmin(`lobby/okey/tables/${CODE}`)).toBeNull();
    });
  },
);
