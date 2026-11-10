import { describe, expect, it } from 'vitest';
import {
  isSiteState,
  readRecentPlayer,
  readSitePresence,
  recentPairs,
  roomMatch,
  sitePresenceRecord,
  siteStateRank,
  tableMatch,
  tableStart,
} from './presence';

const table = (changes: Record<string, unknown> = {}) => ({
  gameId: 'okey',
  slug: 'okey',
  hostUid: 'a',
  size: 4,
  status: 'playing',
  visibility: 'public',
  createdAt: 1_000,
  seats: {
    0: { uid: 'a', name: 'Ayşe', character: 'zombie' },
    1: { bot: true, name: 'Bot 1' },
    2: { uid: 'b', name: 'Mert' },
    3: { uid: 'c', name: 'Can', character: 'alien-green' },
  },
  ...changes,
});

describe('site presence', () => {
  it('orders the states from online to playing', () => {
    expect(
      ['playing', 'online', 'table', 'lobby'].sort(
        (a, b) => siteStateRank(a as never) - siteStateRank(b as never),
      ),
    ).toEqual(['online', 'lobby', 'table', 'playing']);
    expect(isSiteState('online')).toBe(true);
    expect(isSiteState('away')).toBe(false);
  });

  it('reads an entry and drops what it does not know', () => {
    expect(
      readSitePresence('u1', {
        name: 'Ayşe',
        state: 'table',
        gameId: 'okey',
        since: 5,
        level: 7.6,
        character: 'explorer',
        dnd: true,
      }),
    ).toEqual({
      uid: 'u1',
      name: 'Ayşe',
      character: 'explorer',
      level: 7,
      state: 'table',
      gameId: 'okey',
      since: 5,
      dnd: true,
    });
    const odd = readSitePresence('u2', { name: 'X', state: 'online', gameId: 'Bad Id!' });
    expect(odd?.gameId).toBeNull();
    expect(odd?.dnd).toBe(false);
    expect(readSitePresence('u3', { name: 'X', state: 'away' })).toBeNull();
    expect(readSitePresence('u3', null)).toBeNull();
  });

  it('writes only the fields that are set, within their limits', () => {
    const stamp = { '.sv': 'timestamp' };
    expect(
      sitePresenceRecord(
        {
          name: 'A'.repeat(50),
          character: null,
          level: 0,
          state: 'online',
          gameId: null,
          dnd: false,
        },
        stamp,
      ),
    ).toEqual({ name: 'A'.repeat(40), state: 'online', since: stamp });
    expect(
      sitePresenceRecord(
        {
          name: 'Ayşe',
          character: 'rookie',
          level: 2000,
          state: 'playing',
          gameId: 'okey',
          dnd: true,
        },
        7,
      ),
    ).toEqual({
      name: 'Ayşe',
      character: 'rookie',
      level: 1000,
      state: 'playing',
      gameId: 'okey',
      since: 7,
      dnd: true,
    });
  });
});

describe('recent players', () => {
  it('records a table only when it starts, with the humans seated', () => {
    const open = table({ status: 'open' });
    const match = tableMatch('ABC234', open, table());
    expect(match?.key).toBe('table:ABC234:1000');
    expect(match?.players).toEqual([
      { uid: 'a', name: 'Ayşe', character: 'zombie' },
      { uid: 'b', name: 'Mert', character: null },
      { uid: 'c', name: 'Can', character: null },
    ]);
    // Already playing, still open, closed or deleted: nothing to record.
    expect(tableMatch('ABC234', table(), table())).toBeNull();
    expect(tableMatch('ABC234', open, open)).toBeNull();
    expect(tableMatch('ABC234', table(), null)).toBeNull();
    // A table created already playing (no before) counts.
    expect(tableMatch('ABC234', null, table())?.players).toHaveLength(3);
  });

  it('needs two people: one player with bots is not a match', () => {
    const solo = table({
      seats: { 0: { uid: 'a', name: 'Ayşe' }, 1: { bot: true, name: 'Bot 1' } },
    });
    expect(tableMatch('ABC234', null, solo)).toBeNull();
    expect(tableMatch('ABC234', null, table({ gameId: 'Bad' }))).toBeNull();
  });

  it('tableStart also takes one person with bots, for the online play counters', () => {
    const solo = table({
      seats: { 0: { uid: 'a', name: 'Ayşe' }, 1: { bot: true, name: 'Bot 1' } },
    });
    expect(tableStart('ABC234', null, solo)).toEqual({
      key: 'table:ABC234:1000',
      gameId: 'okey',
      slug: 'okey',
      players: [{ uid: 'a', name: 'Ayşe', character: null }],
    });
    expect(tableStart('ABC234', table(), table())).toBeNull();
    const bots = table({ seats: { 0: { bot: true, name: 'Bot 1' } } });
    expect(tableStart('ABC234', null, bots)).toBeNull();
  });

  it('records a room once both seats are taken', () => {
    const room = {
      gameId: 'connectfour',
      slug: 'connect-four',
      hostUid: 'a',
      hostName: 'Ayşe',
      hostCharacter: 'soldier',
      guestUid: 'b',
      guestName: 'Mert',
      createdAt: 9,
      status: 'full',
    };
    const match = roomMatch('XYZ234', room);
    expect(match).toMatchObject({
      key: 'room:XYZ234:9',
      gameId: 'connectfour',
      slug: 'connect-four',
    });
    expect(match?.players.map((player) => player.uid)).toEqual(['a', 'b']);
    expect(roomMatch('XYZ234', { ...room, guestUid: undefined })).toBeNull();
    expect(roomMatch('XYZ234', { ...room, guestUid: 'a' })).toBeNull();
  });

  it('pairs every player with every other one', () => {
    const match = tableMatch('ABC234', null, table())!;
    expect(
      recentPairs(match).map(({ owner, others }) => [owner, others.map((p) => p.uid)]),
    ).toEqual([
      ['a', ['b', 'c']],
      ['b', ['a', 'c']],
      ['c', ['a', 'b']],
    ]);
  });

  it('reads a stored entry with a Firestore timestamp', () => {
    const entry = readRecentPlayer('b', {
      uid: 'b',
      name: 'Mert',
      character: 'rookie',
      gameId: 'okey',
      slug: 'okey',
      count: 3,
      lastPlayedAt: { toMillis: () => 42 },
    });
    expect(entry).toEqual({
      uid: 'b',
      name: 'Mert',
      character: 'rookie',
      gameId: 'okey',
      slug: 'okey',
      lastPlayedAt: 42,
      count: 3,
    });
    expect(readRecentPlayer('b', { name: 'Mert', gameId: 'okey' })).toBeNull();
  });
});
