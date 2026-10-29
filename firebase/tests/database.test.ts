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
  remove,
  set,
  update,
  type Database,
  type DatabaseReference,
} from 'firebase/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteOldRooms, ROOM_TTL_MS } from '../functions/src/rooms';

// Realtime Database rules for online two-player rooms (docs/plan/phase-4.md): rooms/{code},
// signals/{code}/{toUid} (WebRTC handshake inboxes) and relay/{code} (fallback channel).

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

// The test contexts hand out the compat Database; the modular functions accept it at runtime.
const as = (uid: string) => env.authenticatedContext(uid).database() as unknown as Database;
const anon = () => env.unauthenticatedContext().database() as unknown as Database;
const CODE = 'ABC234';
// push() returns a ThenableReference; the assert helpers want a real Promise.
const pushTo = (at: DatabaseReference, value: unknown) => Promise.resolve(push(at, value));

function newRoom(hostUid = 'host') {
  return {
    gameId: 'connectfour',
    slug: 'connect-four',
    hostUid,
    hostName: 'PixelFox4821',
    createdAt: Date.now(),
    status: 'open',
  };
}

async function seedRoom(extra: Record<string, unknown> = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await set(ref(ctx.database() as unknown as Database, `rooms/${CODE}`), {
      ...newRoom(),
      ...extra,
    });
  });
}

describe('rooms', () => {
  it('lets a signed-in player create a room they host', async () => {
    await assertSucceeds(set(ref(as('host'), `rooms/${CODE}`), newRoom()));
  });

  it('rejects rooms for someone else, with a guest, bad codes or signed out', async () => {
    await assertFails(set(ref(as('mallory'), `rooms/${CODE}`), newRoom('host')));
    await assertFails(set(ref(as('host'), `rooms/${CODE}`), { ...newRoom(), guestUid: 'x' }));
    await assertFails(set(ref(as('host'), 'rooms/abc123'), newRoom()));
    await assertFails(set(ref(as('host'), 'rooms/ABC0EF'), newRoom()));
    await assertFails(set(ref(anon(), `rooms/${CODE}`), newRoom('host')));
    await assertFails(set(ref(as('host'), `rooms/${CODE}`), { ...newRoom(), extra: 1 }));
    await assertFails(set(ref(as('host'), `rooms/${CODE}`), { ...newRoom(), createdAt: 1 }));
  });

  it('lets signed-in players read a room by its code', async () => {
    await seedRoom();
    await assertSucceeds(get(ref(as('anyone'), `rooms/${CODE}`)));
    await assertFails(get(ref(anon(), `rooms/${CODE}`)));
    await assertFails(get(ref(as('anyone'), 'rooms')));
  });

  it('gives the empty guest seat to the first player who claims it', async () => {
    await seedRoom();
    await assertSucceeds(
      update(ref(as('guest'), `rooms/${CODE}`), {
        guestUid: 'guest',
        guestName: 'Mert',
        status: 'full',
      }),
    );
    await assertFails(
      update(ref(as('late'), `rooms/${CODE}`), { guestUid: 'late', status: 'full' }),
    );
  });

  it('does not let the host take the guest seat or anyone change the seats', async () => {
    await seedRoom();
    await assertFails(update(ref(as('host'), `rooms/${CODE}`), { guestUid: 'host' }));
    await seedRoom({ guestUid: 'guest', status: 'full' });
    await assertFails(update(ref(as('guest'), `rooms/${CODE}`), { hostUid: 'guest' }));
    await assertFails(update(ref(as('host'), `rooms/${CODE}`), { guestUid: 'other' }));
    await assertFails(update(ref(as('host'), `rooms/${CODE}`), { gameId: 'reversi' }));
  });

  it('lets members update the status and their own presence', async () => {
    await seedRoom({ guestUid: 'guest', status: 'full' });
    await assertSucceeds(set(ref(as('guest'), `rooms/${CODE}/online/guest`), '0a1b2c3d4e5f'));
    await assertFails(set(ref(as('guest'), `rooms/${CODE}/online/guest`), true));
    await assertFails(set(ref(as('guest'), `rooms/${CODE}/online/host`), '0a1b2c3d4e5f'));
    await assertFails(set(ref(as('stranger'), `rooms/${CODE}/online/stranger`), '0a1b2c3d4e5f'));
    await assertSucceeds(update(ref(as('host'), `rooms/${CODE}`), { status: 'closed' }));
    await assertFails(update(ref(as('stranger'), `rooms/${CODE}`), { status: 'open' }));
  });

  it("stores each seat's character, one of the ten ids, set by that seat only", async () => {
    await assertSucceeds(
      set(ref(as('host'), `rooms/${CODE}`), { ...newRoom(), hostCharacter: 'alien-pink' }),
    );
    await assertSucceeds(
      update(ref(as('guest'), `rooms/${CODE}`), {
        guestUid: 'guest',
        guestName: 'Mert',
        guestCharacter: 'zombie',
        status: 'full',
      }),
    );
    // Each player may change their own seat's character later (a rejoin after a new choice).
    await assertSucceeds(set(ref(as('host'), `rooms/${CODE}/hostCharacter`), 'soldier'));
    await assertSucceeds(set(ref(as('guest'), `rooms/${CODE}/guestCharacter`), 'rookie'));
    // A seated player keeps the other seat's character untouched when updating the room.
    await assertSucceeds(
      update(ref(as('guest'), `rooms/${CODE}`), { status: 'full', guestCharacter: 'explorer' }),
    );
    const room = (await get(ref(as('host'), `rooms/${CODE}`))).val();
    expect(room).toMatchObject({ hostCharacter: 'soldier', guestCharacter: 'explorer' });
  });

  it("rejects unknown characters and changes to the other seat's character", async () => {
    for (const hostCharacter of ['alien-red', 'Zombie', '', 7, true, 'zombie; drop']) {
      await assertFails(set(ref(as('host'), `rooms/${CODE}`), { ...newRoom(), hostCharacter }));
    }
    // No guest character before someone takes the guest seat.
    await assertFails(
      set(ref(as('host'), `rooms/${CODE}`), { ...newRoom(), guestCharacter: 'zombie' }),
    );
    await seedRoom({ hostCharacter: 'alien-blue' });
    await assertFails(
      update(ref(as('guest'), `rooms/${CODE}`), {
        guestUid: 'guest',
        guestCharacter: 'not-a-character',
        status: 'full',
      }),
    );
    await assertFails(
      update(ref(as('guest'), `rooms/${CODE}`), {
        guestUid: 'guest',
        hostCharacter: 'zombie',
        status: 'full',
      }),
    );
    await seedRoom({
      guestUid: 'guest',
      status: 'full',
      hostCharacter: 'alien-blue',
      guestCharacter: 'rookie',
    });
    await assertFails(set(ref(as('guest'), `rooms/${CODE}/hostCharacter`), 'zombie'));
    await assertFails(remove(ref(as('guest'), `rooms/${CODE}/hostCharacter`)));
    await assertFails(set(ref(as('host'), `rooms/${CODE}/guestCharacter`), 'zombie'));
    await assertFails(remove(ref(as('host'), `rooms/${CODE}/guestCharacter`)));
    await assertFails(set(ref(as('stranger'), `rooms/${CODE}/hostCharacter`), 'zombie'));
    await assertFails(set(ref(as('guest'), `rooms/${CODE}/guestCharacter`), 'alien-red'));
    // Removing your own choice is allowed: games then use their default.
    await assertSucceeds(remove(ref(as('guest'), `rooms/${CODE}/guestCharacter`)));
  });

  it('lets only the host delete the room', async () => {
    await seedRoom({ guestUid: 'guest', status: 'full' });
    await assertFails(remove(ref(as('guest'), `rooms/${CODE}`)));
    await assertSucceeds(remove(ref(as('host'), `rooms/${CODE}`)));
  });
});

describe('signals', () => {
  const signal = (from: string) => ({ from, kind: 'offer', data: '{"sdp":"v=0"}' });

  it('lets a member write to the other member’s inbox only', async () => {
    await seedRoom({ guestUid: 'guest', status: 'full' });
    await assertSucceeds(pushTo(ref(as('host'), `signals/${CODE}/guest`), signal('host')));
    await assertFails(pushTo(ref(as('host'), `signals/${CODE}/host`), signal('host')));
    await assertFails(pushTo(ref(as('host'), `signals/${CODE}/guest`), signal('guest')));
    await assertFails(pushTo(ref(as('stranger'), `signals/${CODE}/guest`), signal('stranger')));
    await assertFails(pushTo(ref(as('host'), `signals/${CODE}/stranger`), signal('host')));
    await assertFails(
      pushTo(ref(as('host'), `signals/${CODE}/guest`), { ...signal('host'), kind: 'evil' }),
    );
  });

  it('lets only the recipient read and consume its inbox', async () => {
    await seedRoom({ guestUid: 'guest', status: 'full' });
    const id = (await push(ref(as('host'), `signals/${CODE}/guest`), signal('host'))).key;
    await assertSucceeds(get(ref(as('guest'), `signals/${CODE}/guest`)));
    await assertFails(get(ref(as('host'), `signals/${CODE}/guest`)));
    await assertFails(remove(ref(as('host'), `signals/${CODE}/guest/${id}`)));
    await assertSucceeds(remove(ref(as('guest'), `signals/${CODE}/guest/${id}`)));
  });

  it('accepts a hello asking the host for a fresh offer', async () => {
    await seedRoom({ guestUid: 'guest', status: 'full' });
    await assertSucceeds(
      pushTo(ref(as('guest'), `signals/${CODE}/host`), {
        from: 'guest',
        kind: 'hello',
        data: '{}',
      }),
    );
  });
});

describe('relay', () => {
  it('carries moves between the two members only', async () => {
    await seedRoom({ guestUid: 'guest', status: 'full' });
    await assertSucceeds(
      pushTo(ref(as('host'), `relay/${CODE}`), { from: 'host', data: '{"t":"move"}' }),
    );
    await assertSucceeds(get(ref(as('guest'), `relay/${CODE}`)));
    await assertFails(get(ref(as('stranger'), `relay/${CODE}`)));
    await assertFails(
      pushTo(ref(as('stranger'), `relay/${CODE}`), { from: 'stranger', data: '{}' }),
    );
    await assertFails(pushTo(ref(as('guest'), `relay/${CODE}`), { from: 'host', data: '{}' }));
    await assertFails(
      pushTo(ref(as('guest'), `relay/${CODE}`), { from: 'guest', data: 'x'.repeat(16_001) }),
    );
  });

  it('lets the recipient consume a move, never the sender or a stranger', async () => {
    await seedRoom({ guestUid: 'guest', status: 'full' });
    const id = (await push(ref(as('host'), `relay/${CODE}`), { from: 'host', data: '{}' })).key;
    await assertFails(remove(ref(as('host'), `relay/${CODE}/${id}`)));
    await assertFails(remove(ref(as('stranger'), `relay/${CODE}/${id}`)));
    await assertFails(
      set(ref(as('guest'), `relay/${CODE}/${id}`), { from: 'guest', data: '{"t":"x"}' }),
    );
    await assertSucceeds(remove(ref(as('guest'), `relay/${CODE}/${id}`)));
  });
});

describe('deleteOldRooms', () => {
  it('removes rooms older than the cutoff with their signals and relay', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.database() as unknown as Database;
      await set(ref(db, 'rooms/OLD234'), { ...newRoom(), createdAt: Date.now() - 3 * 3600_000 });
      await set(ref(db, 'signals/OLD234/guest/a'), { from: 'host', kind: 'ice', data: '{}' });
      await set(ref(db, 'relay/OLD234/a'), { from: 'host', data: '{}' });
      await set(ref(db, `rooms/${CODE}`), newRoom());
    });
    expect(await deleteOldRooms(Date.now() - ROOM_TTL_MS)).toBe(1);
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.database() as unknown as Database;
      expect((await get(ref(db, 'rooms/OLD234'))).exists()).toBe(false);
      expect((await get(ref(db, 'signals/OLD234'))).exists()).toBe(false);
      expect((await get(ref(db, 'relay/OLD234'))).exists()).toBe(false);
      expect((await get(ref(db, `rooms/${CODE}`))).exists()).toBe(true);
    });
  });
});
