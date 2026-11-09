import {
  DEFAULT_TABLE_SETTINGS,
  INVITE_TTL_MS,
  LOBBY_TABLE_TTL_MS,
  type LobbyPresence,
  type LobbyTable,
} from '@ayvago/shared';
import { describe, expect, it } from 'vitest';
import {
  botCount,
  canInviteAgain,
  canSit,
  freeSeatCount,
  lobbyPlayers,
  lobbyTables,
  minutesSince,
  outgoingStatus,
  playerCount,
  QUICK_PLAY_FRESH_MS,
  QUICK_PLAY_MAX_AGE_MS,
  quickPlayOrder,
  readQuickPlayPointer,
} from './lobby-data';

const NOW = 10_000_000;

function table(code: string, changes: Partial<LobbyTable> = {}, free = 1): LobbyTable {
  const seats: LobbyTable['seats'] = [
    { kind: 'player', name: 'Ayşe', character: null },
    { kind: 'bot', name: 'Bot 1' },
  ];
  for (let i = 0; i < free; i++) seats.push({ kind: 'empty' });
  while (seats.length < 4) seats.push({ kind: 'player', name: 'Mert', character: null });
  return {
    code,
    gameId: 'okey',
    slug: 'okey',
    size: 4,
    status: 'open',
    createdAt: NOW - 60_000,
    hostName: 'Ayşe',
    hostCharacter: null,
    seats,
    online: 1,
    settings: DEFAULT_TABLE_SETTINGS,
    autoStart: false,
    ...changes,
  };
}

describe('seat counts', () => {
  it('counts players, bots and free seats', () => {
    const t = table('AAA222', {}, 2);
    expect([playerCount(t), botCount(t), freeSeatCount(t)]).toEqual([1, 1, 2]);
    expect(canSit(t)).toBe(true);
    expect(canSit(table('AAA222', {}, 0))).toBe(false);
    expect(canSit(table('AAA222', { status: 'playing' }, 1))).toBe(false);
  });
});

describe('lobbyTables', () => {
  it('lists open tables with free seats first, fullest first, then full, then playing', () => {
    const list = lobbyTables(
      [
        table('PLAY22', { status: 'playing', createdAt: NOW - 1000 }, 0),
        table('FULL22', {}, 0),
        table('TWO222', {}, 2),
        table('ONE222', {}, 1),
        table('ONENEW', { createdAt: NOW - 1000 }, 1),
      ],
      NOW,
    );
    expect(list.map((t) => t.code)).toEqual(['ONENEW', 'ONE222', 'TWO222', 'FULL22', 'PLAY22']);
  });

  it('leaves out old and abandoned tables, but keeps the player’s own', () => {
    const list = lobbyTables(
      [
        table('OLD222', { createdAt: NOW - LOBBY_TABLE_TTL_MS }),
        table('GONE22', { online: 0, createdAt: NOW - QUICK_PLAY_FRESH_MS - 1 }),
        table('MINE22', { online: 0 }),
        table('LIVE22'),
      ],
      NOW,
      'MINE22',
    );
    expect(list.map((t) => t.code).sort()).toEqual(['LIVE22', 'MINE22']);
  });
});

describe('lobbyPlayers', () => {
  const player = (uid: string, name: string, state: LobbyPresence['state']): LobbyPresence => ({
    uid,
    name,
    state,
    character: null,
    level: null,
    since: 0,
    dnd: false,
  });

  it('puts this player first, then lobby, table and playing, then by name', () => {
    const sorted = lobbyPlayers(
      [
        player('a', 'Zeynep', 'playing'),
        player('b', 'ali', 'lobby'),
        player('c', 'Can', 'table'),
        player('me', 'Ömer', 'table'),
        player('d', 'Bora', 'lobby'),
      ],
      'me',
    );
    expect(sorted.map((p) => p.uid)).toEqual(['me', 'b', 'd', 'c', 'a']);
  });
});

describe('minutesSince', () => {
  it('rounds down and never goes negative', () => {
    expect(minutesSince(NOW - 59_000, NOW)).toBe(0);
    expect(minutesSince(NOW - 125_000, NOW)).toBe(2);
    expect(minutesSince(NOW + 5_000, NOW)).toBe(0);
  });
});

describe('outgoingStatus', () => {
  const invite = {
    fromUid: 'me',
    fromName: 'Ayşe',
    fromCharacter: null,
    gameId: 'okey',
    slug: 'okey',
    tableCode: 'ABC234',
    createdAt: NOW,
    answer: null,
  };

  it('follows the invite from sending to an answer or no answer', () => {
    expect(outgoingStatus(null, false, NOW, NOW + 1000)).toBe('sending');
    expect(outgoingStatus(invite, true, NOW, NOW + 1000)).toBe('pending');
    expect(outgoingStatus({ ...invite, answer: 'accepted' }, true, NOW, NOW)).toBe('accepted');
    expect(outgoingStatus({ ...invite, answer: 'declined' }, true, NOW, NOW)).toBe('declined');
    expect(outgoingStatus(invite, true, NOW, NOW + INVITE_TTL_MS)).toBe('expired');
    // Deleted without an answer: the recipient cleared it once it expired.
    expect(outgoingStatus(null, true, NOW, NOW + 1000)).toBe('expired');
    expect(outgoingStatus(null, false, NOW, NOW + INVITE_TTL_MS)).toBe('expired');
  });

  it('allows a new invite only when nothing is waiting', () => {
    expect(canInviteAgain(undefined)).toBe(true);
    for (const status of ['declined', 'expired', 'failed', 'limit'] as const) {
      expect(canInviteAgain(status)).toBe(true);
    }
    for (const status of ['sending', 'pending', 'accepted'] as const) {
      expect(canInviteAgain(status)).toBe(false);
    }
  });
});

describe('quick play (slice 5.19)', () => {
  const humans = (n: number, free: number): LobbyTable['seats'] => [
    ...Array.from({ length: n }, () => ({ kind: 'player' as const, name: 'P', character: null })),
    ...Array.from({ length: free }, () => ({ kind: 'empty' as const })),
    ...Array.from({ length: 4 - n - free }, () => ({ kind: 'bot' as const, name: 'Bot' })),
  ];

  it('tries the tables with the most players first, then the oldest', () => {
    const order = quickPlayOrder(
      [
        table('AAAAAA', { seats: humans(1, 3), createdAt: NOW - 50_000 }),
        table('BBBBBB', { seats: humans(3, 1), createdAt: NOW - 10_000 }),
        table('CCCCCC', { seats: humans(2, 2), createdAt: NOW - 20_000 }),
        table('DDDDDD', { seats: humans(2, 1), createdAt: NOW - 90_000 }),
      ],
      NOW,
    );
    expect(order).toEqual(['BBBBBB', 'DDDDDD', 'CCCCCC', 'AAAAAA']);
  });

  it('leaves out full, started, abandoned and nearly expired tables', () => {
    const order = quickPlayOrder(
      [
        table('FULL22', { seats: humans(2, 0) }),
        table('PLAY22', { status: 'playing' }),
        table('GONE22', { online: 0, createdAt: NOW - QUICK_PLAY_FRESH_MS - 1 }),
        table('OLD222', { createdAt: NOW - QUICK_PLAY_MAX_AGE_MS - 1 }),
        table('GOOD22'),
      ],
      NOW,
    );
    expect(order).toEqual(['GOOD22']);
  });

  it('counts a brand-new table as attended before its host page is there', () => {
    // Quick play just opened it; the host's table page has not marked them present yet.
    const opener: LobbyTable['seats'] = [
      { kind: 'player', name: 'Ayşe', character: null },
      { kind: 'empty' },
      { kind: 'empty' },
      { kind: 'empty' },
    ];
    const fresh = { online: 0, createdAt: NOW - 2_000 };
    expect(quickPlayOrder([table('NEW222', { ...fresh, seats: opener })], NOW)).toEqual(['NEW222']);
    // A new table that everyone has left already is abandoned all the same.
    expect(quickPlayOrder([table('LEFT22', fresh)], NOW)).toEqual([]);
  });

  it('reads the quick-play pointer', () => {
    expect(readQuickPlayPointer({ code: 'ABC234', at: 5 })).toEqual({ code: 'ABC234', at: 5 });
    expect(readQuickPlayPointer({ code: 'abc234', at: 5 })).toBeNull();
    expect(readQuickPlayPointer({ code: 'ABC234' })).toBeNull();
    expect(readQuickPlayPointer(null)).toBeNull();
  });
});
