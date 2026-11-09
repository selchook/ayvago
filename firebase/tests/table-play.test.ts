import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  get,
  ref,
  remove,
  runTransaction,
  serverTimestamp,
  set,
  update,
  type Database,
} from 'firebase/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { syncLobbyTable } from '../functions/src/lobby';

// Slice 5.19 (docs/adr/0020-quick-play-settings-host-handover.md): table settings, the auto-start
// countdown, host hand-over and the quick-play pointer.

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
const CODE = 'QPK234';
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
    seats: { 0: { uid: 'host', name: 'Ayşe' } },
    ...changes,
  };
}

const threeSeated = {
  0: { uid: 'host', name: 'Ayşe' },
  1: { uid: 'mert', name: 'Mert' },
  2: { uid: 'can', name: 'Can' },
};

describe('tables/{code}/settings', () => {
  it('lets the host open a table with valid settings only', async () => {
    await assertSucceeds(set(ref(as('host'), `tables/${CODE}`), table()));
    await assertSucceeds(
      set(
        ref(as('host'), 'tables/QPK235'),
        table({ settings: { hands: 11, turnSeconds: 60, bots: false } }),
      ),
    );
    for (const settings of [
      { hands: 7, turnSeconds: 30, bots: true },
      { hands: 5, turnSeconds: 45, bots: true },
      { hands: 5, turnSeconds: 30, bots: 'yes' },
      { hands: 5, turnSeconds: 30 },
      { hands: 5, turnSeconds: 30, bots: true, rake: 1 },
    ]) {
      await assertFails(set(ref(as('host'), 'tables/QPK236'), table({ settings })));
    }
    // Tables without settings (pages from before the slice) still open.
    const { settings: _unused, ...old } = table();
    await assertSucceeds(set(ref(as('host'), 'tables/QPK237'), old));
  });

  it('lets only the host change them, and only while the table is open', async () => {
    await seed(`tables/${CODE}`, table({ seats: threeSeated }));
    await assertSucceeds(set(ref(as('host'), `tables/${CODE}/settings/hands`), 11));
    await assertSucceeds(
      set(ref(as('host'), `tables/${CODE}/settings`), { hands: 5, turnSeconds: 15, bots: true }),
    );
    await assertFails(set(ref(as('mert'), `tables/${CODE}/settings/hands`), 11));
    await assertFails(set(ref(as('host'), `tables/${CODE}/settings/turnSeconds`), 20));
    await seed(`tables/${CODE}/status`, 'playing');
    await assertFails(set(ref(as('host'), `tables/${CODE}/settings/hands`), 11));
    await assertFails(set(ref(as('host'), `tables/${CODE}/settings/bots`), false));
  });

  it('keeps bots away from a table without them', async () => {
    await seed(`tables/${CODE}`, table({ settings: { ...SETTINGS, bots: false } }));
    await assertFails(set(ref(as('host'), `tables/${CODE}/seats/1`), { bot: true, name: 'Bot 1' }));
    // Players still sit down.
    await assertSucceeds(
      set(ref(as('mert'), `tables/${CODE}/seats/1`), { uid: 'mert', name: 'M' }),
    );

    await seed(
      `tables/${CODE}`,
      table({ seats: { ...threeSeated, 3: { bot: true, name: 'Bot 1' } } }),
    );
    // Bots off while a bot is seated is refused; freeing the bot seat in the same write works.
    await assertFails(set(ref(as('host'), `tables/${CODE}/settings/bots`), false));
    await assertSucceeds(
      update(ref(as('host'), `tables/${CODE}`), {
        'settings/bots': false,
        'seats/3': null,
      }),
    );
  });
});

describe('tables/{code}/startAt (auto start)', () => {
  it('is set by the host while the table is open, within two minutes', async () => {
    await seed(`tables/${CODE}`, table({ seats: threeSeated }));
    await assertSucceeds(set(ref(as('host'), `tables/${CODE}/startAt`), Date.now() + 20_000));
    await assertFails(set(ref(as('mert'), `tables/${CODE}/startAt`), Date.now() + 20_000));
    await assertFails(set(ref(as('host'), `tables/${CODE}/startAt`), Date.now() + 10 * 60_000));
    await assertFails(set(ref(as('host'), `tables/${CODE}/startAt`), 'soon'));
    await assertSucceeds(remove(ref(as('host'), `tables/${CODE}/startAt`)));
  });

  it('starts in one write: bots in the empty seats, status playing, countdown gone', async () => {
    await seed(`tables/${CODE}`, table({ seats: threeSeated, startAt: Date.now() }));
    const started = {
      ...table({ seats: threeSeated }),
      createdAt: await readAdmin(`tables/${CODE}/createdAt`),
      status: 'playing',
      seats: { ...threeSeated, 3: { bot: true, name: 'Bot 1' } },
    };
    // Leaving the countdown in place is refused (startAt only while open).
    await assertFails(set(ref(as('host'), `tables/${CODE}`), { ...started, startAt: Date.now() }));
    await assertFails(set(ref(as('mert'), `tables/${CODE}`), started));
    await assertSucceeds(set(ref(as('host'), `tables/${CODE}`), started));
    await assertFails(set(ref(as('host'), `tables/${CODE}/startAt`), Date.now() + 20_000));
  });

  it('runs as a client transaction, as the host page does', async () => {
    await seed(`tables/${CODE}`, table({ seats: threeSeated, startAt: Date.now() }));
    const db = as('host');
    await get(ref(db, `tables/${CODE}`));
    const result = await runTransaction(ref(db, `tables/${CODE}`), (raw) => {
      if (!raw) return raw;
      const next = {
        ...raw,
        status: 'playing',
        seats: { ...raw.seats, 3: { bot: true, name: 'B' } },
      };
      delete next.startAt;
      return next;
    });
    expect(result.committed).toBe(true);
    expect(await readAdmin(`tables/${CODE}/status`)).toBe('playing');
    expect(await readAdmin(`tables/${CODE}/startAt`)).toBeNull();
  });
});

describe('tables/{code}/hostUid (hand-over)', () => {
  it('lets a seated, present player take over from a host who is gone', async () => {
    await seed(`tables/${CODE}`, table({ seats: threeSeated, online: { mert: ON, can: ON } }));
    await assertFails(set(ref(as('stranger'), `tables/${CODE}/hostUid`), 'stranger'));
    // Only to themself.
    await assertFails(set(ref(as('mert'), `tables/${CODE}/hostUid`), 'can'));
    await assertSucceeds(set(ref(as('mert'), `tables/${CODE}/hostUid`), 'mert'));
    // The new host has the host's rights, the old one has lost them.
    await assertSucceeds(set(ref(as('mert'), `tables/${CODE}/seats/3`), { bot: true, name: 'B' }));
    await assertFails(set(ref(as('host'), `tables/${CODE}/status`), 'playing'));
    await assertSucceeds(set(ref(as('mert'), `tables/${CODE}/status`), 'playing'));
    // While the new host is there, nobody takes it from them, the old host neither.
    await assertFails(set(ref(as('can'), `tables/${CODE}/hostUid`), 'can'));
    await seed(`tables/${CODE}/online/host`, ON);
    await assertFails(set(ref(as('host'), `tables/${CODE}/hostUid`), 'host'));
  });

  it('refuses a take-over while the host is present', async () => {
    await seed(`tables/${CODE}`, table({ seats: threeSeated, online: { host: ON, mert: ON } }));
    await assertFails(set(ref(as('mert'), `tables/${CODE}/hostUid`), 'mert'));
  });

  it('refuses players who are away themselves, and closed tables', async () => {
    await seed(`tables/${CODE}`, table({ seats: threeSeated, online: { can: ON } }));
    await assertFails(set(ref(as('mert'), `tables/${CODE}/hostUid`), 'mert'));
    await seed(
      `tables/${CODE}`,
      table({ seats: threeSeated, status: 'closed', online: { mert: ON } }),
    );
    await assertFails(set(ref(as('mert'), `tables/${CODE}/hostUid`), 'mert'));
  });

  it('works during a game and as a compare-and-set transaction', async () => {
    await seed(
      `tables/${CODE}`,
      table({ seats: threeSeated, status: 'playing', online: { mert: ON, can: ON } }),
    );
    const mert = as('mert');
    const can = as('can');
    const [a, b] = await Promise.all([
      // As claimHost: null means "not cached yet", answered by the database's real value.
      runTransaction(ref(mert, `tables/${CODE}/hostUid`), (current) =>
        current === 'host' || current === null ? 'mert' : undefined,
      ),
      runTransaction(ref(can, `tables/${CODE}/hostUid`), (current) =>
        current === 'host' || current === null ? 'can' : undefined,
      ),
    ]).then((results) => results.map((result) => result.committed));
    // Exactly one of them wins; the other sees the new host and gives up.
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect(['mert', 'can']).toContain(await readAdmin(`tables/${CODE}/hostUid`));
  });

  it('never lets the host hand the table to someone else directly', async () => {
    await seed(`tables/${CODE}`, table({ seats: threeSeated, online: { host: ON } }));
    await assertFails(set(ref(as('host'), `tables/${CODE}/hostUid`), 'mert'));
  });
});

describe('quickPlay/{gameId}', () => {
  const pointer = (code = CODE) => ({ code, at: serverTimestamp() });

  it('points at the host’s own open public table of the game', async () => {
    await seed(`tables/${CODE}`, table());
    await assertFails(set(ref(anon(), 'quickPlay/okey'), pointer()));
    await assertFails(set(ref(as('mert'), 'quickPlay/okey'), pointer()));
    await assertFails(set(ref(as('host'), 'quickPlay/other'), pointer()));
    await assertFails(set(ref(as('host'), 'quickPlay/okey'), { code: CODE, at: 5 }));
    await assertFails(set(ref(as('host'), 'quickPlay/okey'), { ...pointer(), extra: 1 }));
    await assertSucceeds(set(ref(as('host'), 'quickPlay/okey'), pointer()));
    await assertSucceeds(get(ref(as('mert'), 'quickPlay/okey')));
    await assertFails(get(ref(anon(), 'quickPlay/okey')));
    // Nobody deletes it; the hourly cleanup does.
    await assertFails(remove(ref(as('host'), 'quickPlay/okey')));
  });

  it('refuses private, started and missing tables', async () => {
    await seed(`tables/${CODE}`, table({ visibility: 'private' }));
    await assertFails(set(ref(as('host'), 'quickPlay/okey'), pointer()));
    await seed(`tables/${CODE}`, table({ status: 'playing' }));
    await assertFails(set(ref(as('host'), 'quickPlay/okey'), pointer()));
    await assertFails(set(ref(as('host'), 'quickPlay/okey'), pointer('NPQ234')));
  });

  it('moves by transaction: of two players at once, the second meets the first', async () => {
    await seed(`tables/${CODE}`, table());
    await seed(
      'tables/QPK299',
      table({ hostUid: 'mert', seats: { 0: { uid: 'mert', name: 'M' } } }),
    );
    const host = await runTransaction(ref(as('host'), 'quickPlay/okey'), (current) =>
      current ? undefined : pointer(),
    );
    expect(host.committed).toBe(true);
    let seen: unknown = null;
    const mert = await runTransaction(ref(as('mert'), 'quickPlay/okey'), (current) => {
      if (current) {
        seen = (current as { code: string }).code;
        return undefined;
      }
      return pointer('QPK299');
    });
    expect(mert.committed).toBe(false);
    expect(seen).toBe(CODE);
    expect(await readAdmin('quickPlay/okey/code')).toBe(CODE);
  });
});

describe.skipIf(process.env.AYVAGO_EMULATOR_DB_TRIGGERS === '1')(
  'syncLobbyTable with settings',
  () => {
    it('lists the settings, the auto start and the host after a hand-over', async () => {
      const value = table({
        seats: threeSeated,
        settings: { hands: 11, turnSeconds: 15, bots: false },
        startAt: Date.now() + 20_000,
        online: { mert: ON },
      });
      await seed(`tables/${CODE}`, value);
      expect(await syncLobbyTable(CODE, null, value)).toBe('set');
      expect(await readAdmin(`lobby/okey/tables/${CODE}`)).toMatchObject({
        hostName: 'Ayşe',
        settings: { hands: 11, turnSeconds: 15, bots: false },
        autoStart: true,
      });
      const handed = { ...value, hostUid: 'mert' };
      await seed(`tables/${CODE}/hostUid`, 'mert');
      expect(await syncLobbyTable(CODE, value, handed)).toBe('set');
      expect(await readAdmin(`lobby/okey/tables/${CODE}/hostName`)).toBe('Mert');
    });
  },
);
