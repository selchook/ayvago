import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  get,
  push,
  ref,
  runTransaction,
  serverTimestamp,
  set,
  update,
  type Database,
  type DatabaseReference,
} from 'firebase/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { syncLobbyTable } from '../functions/src/lobby';

// Slice 5.29 (docs/adr/0026-two-seat-tables.md): Tavla plays at two-seat tables in the lobby,
// without bots. No rule changed: these tests pin down that the existing table, move, invite and
// quick-play rules (ADR 0015, 0019, 0020) carry a two-seat table from opening to playing.

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

const pushTo = (at: DatabaseReference, value: unknown) => Promise.resolve(push(at, value));
const as = (uid: string) => env.authenticatedContext(uid).database() as unknown as Database;
const CODE = 'TAV234';
const ON = 'abcdef012345';
// What createTable stores for a two-seat table: bots are always off.
const DUEL_SETTINGS = { hands: 5, turnSeconds: 30, bots: false };

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

function duel(changes: Record<string, unknown> = {}) {
  return {
    gameId: 'backgammon',
    slug: 'backgammon',
    hostUid: 'host',
    size: 2,
    status: 'open',
    visibility: 'public',
    createdAt: Date.now(),
    settings: DUEL_SETTINGS,
    seats: { 0: { uid: 'host', name: 'Ayşe', character: 'explorer' } },
    ...changes,
  };
}

const bothSeated = {
  0: { uid: 'host', name: 'Ayşe', character: 'explorer' },
  1: { uid: 'mert', name: 'Mert', character: 'soldier' },
};

describe('two-seat tables (Tavla)', () => {
  it('lets the host open one, public with the auto start, as quick play does', async () => {
    await assertSucceeds(
      set(ref(as('host'), `tables/${CODE}`), {
        ...duel({ startAt: Date.now() + 20_000 }),
        createdAt: serverTimestamp(),
      }),
    );
  });

  it('seats exactly one opponent, never a third player or a bot', async () => {
    await seed(`tables/${CODE}`, duel());
    // A bot opponent is refused: two-seat tables are stored with bots off.
    await assertFails(set(ref(as('host'), `tables/${CODE}/seats/1`), { bot: true, name: 'Bot 1' }));
    // There is no seat 2 at a table for two.
    await assertFails(set(ref(as('can'), `tables/${CODE}/seats/2`), { uid: 'can', name: 'Can' }));
    await assertSucceeds(
      set(ref(as('mert'), `tables/${CODE}/seats/1`), {
        uid: 'mert',
        name: 'Mert',
        character: 'soldier',
      }),
    );
    // The seat is taken now.
    await assertFails(set(ref(as('can'), `tables/${CODE}/seats/1`), { uid: 'can', name: 'Can' }));
  });

  it('starts by the host’s transaction once both are seated, and carries the moves', async () => {
    await seed(`tables/${CODE}`, duel({ seats: bothSeated, startAt: Date.now() }));
    const db = as('host');
    await get(ref(db, `tables/${CODE}`));
    const result = await runTransaction(ref(db, `tables/${CODE}`), (raw) => {
      if (!raw) return raw;
      const next = { ...raw, status: 'playing' };
      delete next.startAt;
      return next;
    });
    expect(result.committed).toBe(true);
    expect(await readAdmin(`tables/${CODE}/status`)).toBe('playing');

    await assertSucceeds(
      pushTo(ref(as('mert'), `tableMoves/${CODE}`), {
        from: 'mert',
        seat: '1',
        data: '{"t":"rdy"}',
      }),
    );
    await assertSucceeds(
      pushTo(ref(as('host'), `tableMoves/${CODE}`), {
        from: 'host',
        seat: '0',
        data: '{"t":"dice"}',
      }),
    );
    await assertFails(
      pushTo(ref(as('mert'), `tableMoves/${CODE}`), { from: 'mert', seat: '0', data: '{}' }),
    );
    await assertFails(
      pushTo(ref(as('can'), `tableMoves/${CODE}`), { from: 'can', seat: '1', data: '{}' }),
    );
    await assertSucceeds(get(ref(as('mert'), `tableMoves/${CODE}`)));
    await assertFails(get(ref(as('can'), `tableMoves/${CODE}`)));
  });

  it('lets the seated host invite a player from the Tavla lobby', async () => {
    await seed(`tables/${CODE}`, duel());
    await seed('presence/lobbies/backgammon/mert', {
      name: 'Mert',
      state: 'lobby',
      since: Date.now() - 1000,
    });
    const invite = {
      fromUid: 'host',
      fromName: 'Ayşe',
      gameId: 'backgammon',
      slug: 'backgammon',
      tableCode: CODE,
      createdAt: serverTimestamp(),
    };
    await assertSucceeds(
      update(ref(as('host')), {
        'invites/mert/host': invite,
        'inviteQuota/host': { start: serverTimestamp(), count: 1 },
      }),
    );
    // The invite must name the table's game.
    await assertFails(
      update(ref(as('host')), {
        'invites/can/host': { ...invite, gameId: 'okey', slug: 'okey' },
        'inviteQuota/host': { start: await readAdmin('inviteQuota/host/start'), count: 2 },
      }),
    );
  });

  it('points quick play at the host’s open public table', async () => {
    await seed(`tables/${CODE}`, duel({ startAt: Date.now() + 20_000 }));
    await assertSucceeds(
      set(ref(as('host'), 'quickPlay/backgammon'), { code: CODE, at: serverTimestamp() }),
    );
    // Not for another game's pointer.
    await assertFails(
      set(ref(as('host'), 'quickPlay/okey'), { code: CODE, at: serverTimestamp() }),
    );
  });
});

// The handler is called directly, as in table-play.test.ts (the live trigger is opt-in).
describe.skipIf(process.env.AYVAGO_EMULATOR_DB_TRIGGERS === '1')('syncLobbyTable for Tavla', () => {
  it('lists a two-seat table with both seats and no uids', async () => {
    const value = duel({ online: { host: ON } });
    await seed(`tables/${CODE}`, value);
    expect(await syncLobbyTable(CODE, null, value)).toBe('set');
    const listed = (await readAdmin(`lobby/backgammon/tables/${CODE}`)) as Record<string, unknown>;
    expect(listed).toMatchObject({
      slug: 'backgammon',
      size: 2,
      hostName: 'Ayşe',
      online: 1,
      settings: DUEL_SETTINGS,
    });
    expect(listed.seats).toEqual([
      { kind: 'player', name: 'Ayşe', character: 'explorer' },
      { kind: 'empty' },
    ]);
    // The host's uid ('host') never appears as a value.
    expect(JSON.stringify(listed)).not.toContain('"host"');
  });
});
