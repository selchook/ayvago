import { describe, expect, it } from 'vitest';
import {
  INVITE_LIMIT,
  INVITE_TTL_MS,
  INVITE_WINDOW_MS,
  invitePending,
  nextInviteQuota,
  readInvite,
  readLobbyTable,
  readPresence,
  summarizeTable,
} from './lobby';

const table = (changes: Record<string, unknown> = {}) => ({
  gameId: 'okey',
  slug: 'okey',
  hostUid: 'host-uid',
  size: 4,
  status: 'open',
  visibility: 'public',
  createdAt: 1_000,
  seats: {
    0: { uid: 'host-uid', name: 'Ayşe', character: 'zombie' },
    1: { bot: true, name: 'Bot 1' },
    3: { uid: 'guest-uid', name: 'Mert', character: 'alien-green' },
  },
  online: { 'host-uid': 'abcdef012345', 'stranger-uid': 'abcdef012345' },
  ...changes,
});

describe('summarizeTable', () => {
  it('lists a public table without any uid', () => {
    const summary = summarizeTable(table());
    expect(summary).toEqual({
      gameId: 'okey',
      slug: 'okey',
      size: 4,
      status: 'open',
      createdAt: 1_000,
      hostName: 'Ayşe',
      hostCharacter: 'zombie',
      seats: {
        0: { kind: 'player', name: 'Ayşe', character: 'zombie' },
        1: { kind: 'bot', name: 'Bot 1' },
        2: { kind: 'empty' },
        // A retired character reads as none.
        3: { kind: 'player', name: 'Mert' },
      },
      // Only seated players count; the stranger's entry is ignored.
      online: 1,
      // Tables from before slice 5.19 have no settings: the defaults.
      settings: { hands: 5, turnSeconds: 30, bots: true },
    });
    expect(JSON.stringify(summary)).not.toContain('uid');
  });

  it('carries the settings and the auto start, and follows a hand-over (slice 5.19)', () => {
    const summary = summarizeTable(
      table({
        settings: { hands: 11, turnSeconds: 15, bots: false },
        startAt: 5_000,
        hostUid: 'guest-uid',
      }),
    );
    expect(summary).toMatchObject({
      settings: { hands: 11, turnSeconds: 15, bots: false },
      autoStart: true,
      hostName: 'Mert',
    });
    expect(summary && 'hostCharacter' in summary).toBe(false);
    // The countdown ends with the start.
    expect(summarizeTable(table({ status: 'playing', startAt: 5_000 }))?.autoStart).toBeUndefined();
    // A host who is not seated (bad data) keeps the table out.
    expect(summarizeTable(table({ hostUid: 'nobody' }))).toBeNull();
    const read = readLobbyTable('ABC234', summary);
    expect(read).toMatchObject({
      settings: { hands: 11, turnSeconds: 15, bots: false },
      autoStart: true,
    });
    expect(readLobbyTable('ABC234', summarizeTable(table()))?.autoStart).toBe(false);
  });

  it('keeps private, closed, old-style and malformed tables out', () => {
    expect(summarizeTable(table({ visibility: 'private' }))).toBeNull();
    expect(summarizeTable(table({ visibility: undefined }))).toBeNull();
    expect(summarizeTable(table({ status: 'closed' }))).toBeNull();
    expect(summarizeTable(table({ size: 9 }))).toBeNull();
    expect(summarizeTable(table({ gameId: 'Bad Id' }))).toBeNull();
    expect(summarizeTable(table({ seats: { 1: { bot: true, name: 'B' } } }))).toBeNull();
    expect(summarizeTable(null)).toBeNull();
    expect(summarizeTable('x')).toBeNull();
  });

  it('lists a started table as playing', () => {
    expect(summarizeTable(table({ status: 'playing' }))?.status).toBe('playing');
  });

  it('lists a two-seat Tavla table (docs/adr/0026)', () => {
    const duel = table({
      gameId: 'backgammon',
      slug: 'backgammon',
      size: 2,
      settings: { hands: 5, turnSeconds: 30, bots: false },
      seats: { 0: { uid: 'host-uid', name: 'Ayşe', character: 'zombie' } },
    });
    const summary = summarizeTable(duel);
    expect(summary).toMatchObject({
      gameId: 'backgammon',
      size: 2,
      seats: { 0: { kind: 'player', name: 'Ayşe' }, 1: { kind: 'empty' } },
      settings: { bots: false },
      online: 1,
    });
    // Seats past the table's size are never listed.
    expect(Object.keys(summary!.seats)).toEqual(['0', '1']);
    expect(readLobbyTable('ABC234', summary)?.seats.map((seat) => seat.kind)).toEqual([
      'player',
      'empty',
    ]);
  });
});

describe('readLobbyTable', () => {
  it('reads what the trigger writes, seats as an object or an array', () => {
    const stored = summarizeTable(table())!;
    const read = readLobbyTable('ABC234', stored);
    expect(read).toMatchObject({ code: 'ABC234', hostName: 'Ayşe', hostCharacter: 'zombie' });
    expect(read?.seats.map((seat) => seat.kind)).toEqual(['player', 'bot', 'empty', 'player']);
    const asArray = { ...stored, seats: Object.values(stored.seats) };
    expect(readLobbyTable('ABC234', asArray)?.seats).toEqual(read?.seats);
  });

  it('refuses bad codes and malformed entries', () => {
    const stored = summarizeTable(table())!;
    expect(readLobbyTable('abc234', stored)).toBeNull();
    expect(readLobbyTable('ABC234', { ...stored, status: 'closed' })).toBeNull();
    expect(readLobbyTable('ABC234', { ...stored, size: 1 })).toBeNull();
    expect(readLobbyTable('ABC234', null)).toBeNull();
  });
});

describe('readPresence', () => {
  it('reads a presence entry and its optional fields', () => {
    expect(
      readPresence('u1', { name: 'Ayşe', state: 'table', since: 5, level: 3, character: 'rookie' }),
    ).toEqual({
      uid: 'u1',
      name: 'Ayşe',
      character: 'rookie',
      level: 3,
      state: 'table',
      since: 5,
      dnd: false,
    });
    expect(readPresence('u1', { name: 'A', state: 'lobby', since: 1, dnd: true })?.dnd).toBe(true);
  });

  it('refuses unknown states and missing names', () => {
    expect(readPresence('u1', { name: 'A', state: 'away', since: 1 })).toBeNull();
    expect(readPresence('u1', { state: 'lobby', since: 1 })).toBeNull();
  });
});

describe('invites', () => {
  const raw = {
    fromUid: 'a',
    fromName: 'Ayşe',
    gameId: 'okey',
    slug: 'okey',
    tableCode: 'ABC234',
    createdAt: 10_000,
  };

  it('reads an invite and says whether it is still pending', () => {
    const invite = readInvite('a', raw)!;
    expect(invite).toMatchObject({ fromName: 'Ayşe', answer: null, fromCharacter: null });
    expect(invitePending(invite, 10_000 + INVITE_TTL_MS - 1)).toBe(true);
    expect(invitePending(invite, 10_000 + INVITE_TTL_MS)).toBe(false);
    expect(invitePending({ ...invite, answer: 'declined' }, 10_000)).toBe(false);
  });

  it('refuses invites under the wrong sender key or with bad fields', () => {
    expect(readInvite('b', raw)).toBeNull();
    expect(readInvite('a', { ...raw, tableCode: 'abc' })).toBeNull();
    expect(readInvite('a', { ...raw, createdAt: 'x' })).toBeNull();
    expect(readInvite('a', { ...raw, answer: 'maybe' })?.answer).toBeNull();
  });

  it('counts invites per window and refuses the sixth', () => {
    const now = 100_000;
    expect(nextInviteQuota(null, now, 'TS')).toEqual({ start: 'TS', count: 1 });
    expect(nextInviteQuota({ start: now - 1_000, count: 2 }, now, 'TS')).toEqual({
      start: now - 1_000,
      count: 3,
    });
    expect(nextInviteQuota({ start: now - 1_000, count: INVITE_LIMIT }, now, 'TS')).toBeNull();
    expect(
      nextInviteQuota({ start: now - INVITE_WINDOW_MS, count: INVITE_LIMIT }, now, 'TS'),
    ).toEqual({ start: 'TS', count: 1 });
  });
});
