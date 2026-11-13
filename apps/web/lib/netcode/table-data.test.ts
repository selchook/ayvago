import { describe, expect, it } from 'vitest';
import {
  AUTO_START_JOIN_MS,
  DEFAULT_TABLE_SETTINGS,
  HOST_HANDOVER_MS,
  HOST_HANDOVER_STEP_MS,
} from '@ayvago/shared';
import {
  applyTableUpdates,
  botSeats,
  canStart,
  extendedStart,
  freeSeat,
  handoverDelay,
  hostSeat,
  nextBotNumber,
  nextBotNumbers,
  planLeave,
  planStart,
  seatedUids,
  seatOf,
  secondsLeft,
  tableReady,
  toTable,
} from './table-data';

const RAW = {
  gameId: 'okey',
  slug: 'okey',
  hostUid: 'host',
  size: 4,
  status: 'open',
  createdAt: 1000,
  seats: {
    0: { uid: 'host', name: 'Ayşe', character: 'explorer' },
    2: { bot: true, name: 'Bot 1' },
  },
  online: { host: 'abcdef012345', junk: 7 },
};

describe('toTable', () => {
  it('reads seats in order, with empty seats as null', () => {
    const table = toTable('ABC234', RAW);
    expect(table?.seats).toEqual([
      { kind: 'player', uid: 'host', name: 'Ayşe', character: 'explorer' },
      null,
      { kind: 'bot', name: 'Bot 1' },
      null,
    ]);
    expect(table?.online).toEqual({ host: 'abcdef012345' });
    expect(table?.status).toBe('open');
  });

  it('reads array-shaped seats and drops unknown characters', () => {
    const table = toTable('ABC234', {
      ...RAW,
      size: 2,
      seats: [
        { uid: 'host', name: 'A', character: 'alien-blue' },
        { bot: true, name: 'Bot 1' },
      ],
    });
    expect(table?.seats).toEqual([
      { kind: 'player', uid: 'host', name: 'A', character: null },
      { kind: 'bot', name: 'Bot 1' },
    ]);
  });

  it('reads the lobby visibility; tables from before it are private', () => {
    expect(toTable('ABC234', { ...RAW, visibility: 'public' })?.visibility).toBe('public');
    expect(toTable('ABC234', { ...RAW, visibility: 'private' })?.visibility).toBe('private');
    expect(toTable('ABC234', RAW)?.visibility).toBe('private');
    expect(toTable('ABC234', { ...RAW, visibility: 'open' })?.visibility).toBe('private');
  });

  it('lists the seated players', () => {
    const table = toTable('ABC234', {
      ...RAW,
      seats: { ...RAW.seats, 3: { uid: 'g', name: 'G' } },
    })!;
    expect(seatedUids(table)).toEqual(['host', 'g']);
  });

  it('refuses things that are not tables', () => {
    expect(toTable('ABC234', null)).toBeNull();
    expect(toTable('ABC234', { slug: 'okey' })).toBeNull();
  });
});

describe('table helpers', () => {
  const table = toTable('ABC234', RAW)!;

  it('finds seats', () => {
    expect(seatOf(table, 'host')).toBe(0);
    expect(seatOf(table, 'nobody')).toBe(-1);
    expect(freeSeat(table)).toBe(1);
  });

  it('is ready only when every seat is taken', () => {
    expect(tableReady(table)).toBe(false);
    const full = toTable('ABC234', {
      ...RAW,
      seats: { ...RAW.seats, 1: { uid: 'g', name: 'G' }, 3: { bot: true, name: 'Bot 2' } },
    })!;
    expect(tableReady(full)).toBe(true);
    expect(freeSeat(full)).toBe(-1);
  });

  it('numbers new bots after the ones already seated', () => {
    expect(nextBotNumber(table)).toBe(2);
  });
});

describe('settings and auto start (slice 5.19)', () => {
  it('reads the settings, with defaults for old tables and bad values', () => {
    expect(toTable('ABC234', RAW)?.settings).toEqual(DEFAULT_TABLE_SETTINGS);
    expect(
      toTable('ABC234', { ...RAW, settings: { hands: 11, turnSeconds: 60, bots: false } })
        ?.settings,
    ).toEqual({ hands: 11, turnSeconds: 60, bots: false });
    expect(
      toTable('ABC234', { ...RAW, settings: { hands: 7, turnSeconds: 1, bots: 'no' } })?.settings,
    ).toEqual(DEFAULT_TABLE_SETTINGS);
    expect(toTable('ABC234', RAW)?.startAt).toBeNull();
    expect(toTable('ABC234', { ...RAW, startAt: 5 })?.startAt).toBe(5);
  });

  it('counts down in whole seconds and gives new players at least the join time', () => {
    expect(secondsLeft(10_500, 1_000)).toBe(10);
    expect(secondsLeft(1_000, 5_000)).toBe(0);
    expect(extendedStart(50_000, 1_000)).toBeNull();
    expect(extendedStart(5_000, 1_000)).toBe(1_000 + AUTO_START_JOIN_MS);
  });

  it('plans the start: bots in empty seats, or wait', () => {
    const table = toTable('ABC234', RAW)!;
    expect(planStart(table, null)).toEqual({ kind: 'start', bots: [1, 3] });
    expect(planStart(table, new Set(['host']))).toEqual({ kind: 'start', bots: [1, 3] });
    // A player the host's page has not seen yet gets the countdown first.
    const joined = toTable('ABC234', {
      ...RAW,
      seats: { ...RAW.seats, 1: { uid: 'new', name: 'N' } },
    })!;
    expect(planStart(joined, new Set(['host']))).toEqual({ kind: 'newPlayer' });
    const noBots = toTable('ABC234', {
      ...RAW,
      settings: { hands: 5, turnSeconds: 30, bots: false },
    })!;
    expect(planStart(noBots, null)).toEqual({ kind: 'notReady' });
    expect(canStart(noBots)).toBe(false);
    expect(canStart(table)).toBe(true);
    expect(botSeats(table)).toEqual([2]);
    expect(nextBotNumbers(table, 2)).toEqual([2, 3]);
  });
});

describe('two-seat tables (docs/adr/0026)', () => {
  const DUEL = {
    gameId: 'backgammon',
    slug: 'backgammon',
    hostUid: 'host',
    size: 2,
    status: 'open',
    createdAt: 1000,
    // Stored with bots on (an old or forged write): a duel reads them off all the same.
    settings: { hands: 5, turnSeconds: 30, bots: true },
    seats: { 0: { uid: 'host', name: 'Ayşe' } },
  };

  it('reads two seats and never bots', () => {
    const table = toTable('ABC234', DUEL)!;
    expect(table.seats).toHaveLength(2);
    expect(table.settings.bots).toBe(false);
    expect(freeSeat(table)).toBe(1);
  });

  it('starts only once the opponent sits down', () => {
    const waiting = toTable('ABC234', DUEL)!;
    expect(canStart(waiting)).toBe(false);
    expect(planStart(waiting, null)).toEqual({ kind: 'notReady' });
    const full = toTable('ABC234', {
      ...DUEL,
      seats: { ...DUEL.seats, 1: { uid: 'guest', name: 'Mert' } },
    })!;
    expect(tableReady(full)).toBe(true);
    expect(canStart(full)).toBe(true);
    expect(planStart(full, new Set(['host', 'guest']))).toEqual({ kind: 'start', bots: [] });
    expect(planStart(full, new Set(['host']))).toEqual({ kind: 'newPlayer' });
  });
});

describe('host hand-over (slice 5.19)', () => {
  const seats = {
    0: { uid: 'host', name: 'Ayşe' },
    1: { bot: true, name: 'Bot 1' },
    2: { uid: 'mert', name: 'Mert' },
    3: { uid: 'can', name: 'Can' },
  };
  const at = (online: Record<string, string>, changes: Record<string, unknown> = {}) =>
    toTable('ABC234', { ...RAW, seats, online, ...changes })!;
  const ON = 'abcdef012345';

  it('finds the host seat after a hand-over', () => {
    expect(hostSeat(at({}))).toBe(0);
    expect(hostSeat(at({}, { hostUid: 'can' }))).toBe(3);
  });

  it('waits while the host is there, and for players who are away or not seated', () => {
    const all = at({ host: ON, mert: ON, can: ON });
    expect(handoverDelay(all, 'mert')).toBeNull();
    expect(handoverDelay(at({ mert: ON }), 'can')).toBeNull();
    expect(handoverDelay(at({ mert: ON }), 'stranger')).toBeNull();
    expect(handoverDelay(at({ mert: ON }), 'host')).toBeNull();
    expect(handoverDelay(at({ mert: ON }, { status: 'closed' }), 'mert')).toBeNull();
  });

  it('lets the present players take over in seat order', () => {
    const gone = at({ mert: ON, can: ON });
    expect(handoverDelay(gone, 'mert')).toBe(HOST_HANDOVER_MS);
    expect(handoverDelay(gone, 'can')).toBe(HOST_HANDOVER_MS + HOST_HANDOVER_STEP_MS);
    // The first in line is away too: the next one is first.
    expect(handoverDelay(at({ can: ON }), 'can')).toBe(HOST_HANDOVER_MS);
    // During a game too.
    expect(handoverDelay(at({ can: ON }, { status: 'playing' }), 'can')).toBe(HOST_HANDOVER_MS);
  });
});

describe('leaving a table (slice 5.20)', () => {
  const ON = 'abcdef012345';
  const seats = {
    0: { uid: 'host', name: 'Ayşe' },
    1: { bot: true, name: 'Bot 1' },
    2: { uid: 'mert', name: 'Mert' },
  };
  const at = (changes: Record<string, unknown> = {}) =>
    toTable('ABC234', { ...RAW, seats, online: { host: ON, mert: ON }, ...changes })!;

  it('reads the host marker only for the current host', () => {
    expect(at().hostLeft).toBe(false);
    expect(at({ hostLeft: 'host' }).hostLeft).toBe(true);
    // Left by an earlier host: the new one has not left.
    expect(at({ hostLeft: 'host', hostUid: 'mert' }).hostLeft).toBe(false);
  });

  it('frees a player’s seat at a waiting table', () => {
    expect(planLeave(at(), 'mert')).toEqual({
      kind: 'free',
      handOver: false,
      updates: { 'online/mert': null, 'seats/2': null },
    });
  });

  it('keeps the seat during a game', () => {
    expect(planLeave(at({ status: 'playing' }), 'mert')).toEqual({
      kind: 'away',
      handOver: false,
      updates: { 'online/mert': null },
    });
  });

  it('hands over when the host leaves other players behind', () => {
    expect(planLeave(at(), 'host')).toEqual({
      kind: 'free',
      handOver: true,
      updates: { 'online/host': null, hostLeft: 'host', 'seats/0': null },
    });
    expect(planLeave(at({ status: 'playing' }), 'host')).toEqual({
      kind: 'away',
      handOver: true,
      updates: { 'online/host': null, hostLeft: 'host' },
    });
  });

  it('closes a waiting table when the host is the only player (bots do not count)', () => {
    const alone = at({ seats: { 0: seats[0], 1: seats[1] }, startAt: 5000 });
    expect(planLeave(alone, 'host')).toEqual({
      kind: 'close',
      handOver: false,
      // A marker from an earlier host goes too.
      updates: { 'online/host': null, hostLeft: null, status: 'closed', startAt: null },
    });
    // During a game the seat stays theirs, as for everyone.
    expect(planLeave(at({ seats: { 0: seats[0] }, status: 'playing' }), 'host').kind).toBe('away');
  });

  it('lets the others take over at once when the host left on purpose', () => {
    const left = at({ online: { mert: ON }, hostLeft: 'host' });
    expect(handoverDelay(left, 'mert')).toBe(0);
    const two = at({
      seats: { ...seats, 3: { uid: 'can', name: 'Can' } },
      online: { mert: ON, can: ON },
      hostLeft: 'host',
    });
    expect(handoverDelay(two, 'can')).toBe(HOST_HANDOVER_STEP_MS);
    // Back at the table: no hand-over at all.
    expect(handoverDelay(at({ hostLeft: 'host' }), 'mert')).toBeNull();
  });

  it('applies the updates to a raw table as the database would', () => {
    const raw = {
      status: 'open',
      startAt: 9,
      seats: [{ uid: 'a' }, { uid: 'b' }],
      online: { a: 'x' },
    };
    expect(
      applyTableUpdates(raw, {
        'seats/1': null,
        'online/a': null,
        status: 'closed',
        startAt: null,
      }),
    ).toEqual({ status: 'closed', seats: { 0: { uid: 'a' } } });
    expect(applyTableUpdates({ online: { a: 'x' } }, { hostLeft: 'a' })).toEqual({
      online: { a: 'x' },
      hostLeft: 'a',
    });
  });
});
