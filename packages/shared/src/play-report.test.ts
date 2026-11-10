import { describe, expect, it } from 'vitest';
import {
  buildPlayReport,
  countOf,
  EXTENDED_STATS_SINCE,
  STATS_SINCE,
  type DailyInput,
  type ProfileInput,
  type StatsInput,
} from './play-report';

const NOW = Date.parse('2026-11-09T12:00:00Z');
const at = (iso: string) => Date.parse(iso);

const profiles = new Map<string, ProfileInput>([
  ['uid-google-AAAAA', { username: 'Ayla', kind: 'google' }],
  ['uid-mail-BBBBB', { username: 'Bora', kind: 'registered' }],
  ['uid-guest-CCCCC', { username: 'PixelFox4821', kind: 'guest' }],
  ['uid-guest-DDDDD', { username: 'PixelFox4821', kind: 'guest' }],
]);

const stats: StatsInput[] = [
  {
    uid: 'uid-google-AAAAA',
    gameId: 'snake',
    plays: 5,
    playSeconds: 300,
    lastPlayedAt: at('2026-11-08T10:00:00Z'),
  },
  {
    uid: 'uid-google-AAAAA',
    gameId: 'tetrix',
    plays: 2,
    playSeconds: 120,
    lastPlayedAt: at('2026-11-09T09:00:00Z'),
  },
  {
    uid: 'uid-mail-BBBBB',
    gameId: 'snake',
    plays: 1,
    playSeconds: 40,
    lastPlayedAt: at('2026-11-07T20:00:00Z'),
  },
  {
    uid: 'uid-guest-CCCCC',
    gameId: 'snake',
    plays: 3,
    playSeconds: 90,
    lastPlayedAt: at('2026-11-08T08:00:00Z'),
  },
  {
    uid: 'uid-guest-DDDDD',
    gameId: 'tetrix',
    plays: 3,
    playSeconds: 60,
    lastPlayedAt: at('2026-11-08T09:00:00Z'),
  },
  // stats left behind by a profile that is gone
  { uid: 'gone-EEEEE', gameId: 'tetrix', plays: 4, playSeconds: 200, lastPlayedAt: null },
];

const daily: DailyInput[] = [
  { gameId: 'snake', day: '2026-10-20', started: 10, finished: 8, playSeconds: 600 },
  { gameId: 'snake', day: '2026-11-08', started: 12, finished: 9, playSeconds: 430 },
  { gameId: 'tetrix', day: '2026-10-25', started: 30, finished: 25, playSeconds: 2000 },
  // a game played before the fresh start only
  { gameId: 'orbsurge', day: '2026-10-22', started: 2, finished: 1, playSeconds: 30 },
];

const report = () =>
  buildPlayReport({
    now: NOW,
    stats,
    daily,
    profiles,
    profileTotals: { google: 3, registered: 1, guest: 7 },
  });

describe('buildPlayReport', () => {
  it('labels the time ranges', () => {
    const r = report();
    expect(r.generatedAt).toBe(NOW);
    expect(r.statsSince).toBe(STATS_SINCE);
    expect(r.extendedSince).toBe(EXTENDED_STATS_SINCE);
    expect(EXTENDED_STATS_SINCE >= STATS_SINCE).toBe(true);
    expect(r.allTimeSince).toBe('2026-10-20');
  });

  it('sums players, plays and play time per kind', () => {
    // documents from before slice 5.22 lack starts, online plays and abandoned time: all 0
    const old = { starts: 0, onlinePlays: 0, abandonedSeconds: 0 };
    expect(report().summary).toEqual({
      google: { profiles: 3, players: 1, plays: 7, playSeconds: 420, totalSeconds: 420, ...old },
      registered: { profiles: 1, players: 1, plays: 1, playSeconds: 40, totalSeconds: 40, ...old },
      guest: { profiles: 7, players: 2, plays: 6, playSeconds: 150, totalSeconds: 150, ...old },
      unknown: {
        profiles: null,
        players: 1,
        plays: 4,
        playSeconds: 200,
        totalSeconds: 200,
        ...old,
      },
    });
  });

  it('adds all-time daily totals and recent plays per game', () => {
    const r = report();
    expect(r.games.map((g) => g.gameId)).toEqual(['tetrix', 'snake', 'orbsurge']);
    expect(r.games[1]).toEqual({
      gameId: 'snake',
      allTime: {
        started: 22,
        finished: 17,
        playSeconds: 1030,
        abandonedSeconds: 0,
        onlineStarted: 0,
      },
      // only the days from STATS_SINCE on
      window: { started: 12, finished: 9, playSeconds: 430, abandonedSeconds: 0, onlineStarted: 0 },
      plays: 9,
      playSeconds: 430,
      playsByKind: { google: 5, registered: 1, guest: 3, unknown: 0 },
      playersByKind: { google: 1, registered: 1, guest: 1, unknown: 0 },
    });
    expect(r.games[0]).toMatchObject({
      plays: 9,
      playersByKind: { google: 1, registered: 0, guest: 1, unknown: 1 },
    });
    expect(r.games[2]).toMatchObject({
      allTime: { started: 2, finished: 1, playSeconds: 30 },
      window: { started: 0, finished: 0, playSeconds: 0 },
      plays: 0,
      playersByKind: { google: 0, registered: 0, guest: 0, unknown: 0 },
    });
  });

  it('lists players by plays with their games, never the whole uid', () => {
    const r = report();
    expect(r.players.map((p) => [p.username, p.kind, p.plays])).toEqual([
      ['Ayla', 'google', 7],
      [null, 'unknown', 4],
      ['PixelFox4821', 'guest', 3],
      ['PixelFox4821', 'guest', 3],
      ['Bora', 'registered', 1],
    ]);
    const ayla = r.players[0]!;
    const none = { starts: 0, onlinePlays: 0, abandonedSeconds: 0 };
    expect(ayla).toEqual({
      tag: 'AAAAA',
      username: 'Ayla',
      kind: 'google',
      plays: 7,
      playSeconds: 420,
      totalSeconds: 420,
      ...none,
      lastPlayedAt: at('2026-11-09T09:00:00Z'),
      games: [
        { gameId: 'snake', plays: 5, playSeconds: 300, totalSeconds: 300, ...none },
        { gameId: 'tetrix', plays: 2, playSeconds: 120, totalSeconds: 120, ...none },
      ],
    });
    // the same names stay apart by their tag; the later player comes first on a tie
    expect(r.players.slice(2, 4).map((p) => p.tag)).toEqual(['DDDDD', 'CCCCC']);
    expect(JSON.stringify(r)).not.toContain('uid-');
    expect(r.playerCount).toBe(5);
    expect(r.truncated).toBe(0);
  });

  it('caps the player list and counts the rest', () => {
    const r = buildPlayReport({
      now: NOW,
      stats,
      daily: [],
      profiles,
      profileTotals: { google: 0, registered: 0, guest: 0 },
      maxPlayers: 2,
    });
    expect(r.players.map((p) => p.tag)).toEqual(['AAAAA', 'EEEEE']);
    expect(r.playerCount).toBe(5);
    expect(r.truncated).toBe(3);
    // the summary still counts everyone
    expect(r.summary.guest.players).toBe(2);
    expect(r.allTimeSince).toBeNull();
  });

  it('counts starts, online matches and abandoned time (slice 5.22)', () => {
    const r = buildPlayReport({
      now: NOW,
      stats: [
        ...stats,
        // Bora started more runs, left two and played online
        {
          uid: 'uid-mail-BBBBB',
          gameId: 'okey',
          plays: 0,
          playSeconds: 0,
          starts: 0,
          onlinePlays: 6,
          lastPlayedAt: at('2026-11-10T20:00:00Z'),
        },
        {
          uid: 'uid-mail-BBBBB',
          gameId: 'tetrix',
          plays: 1,
          playSeconds: 60,
          starts: 4,
          abandonedSeconds: 90,
          lastPlayedAt: at('2026-11-10T08:00:00Z'),
        },
        // a guest who only ever started a run (no plays, no lastPlayedAt field)
        { uid: 'uid-guest-FFFFF', gameId: 'snake', starts: 1, lastPlayedAt: null } as StatsInput,
      ],
      daily: [
        ...daily,
        {
          gameId: 'okey',
          day: '2026-11-10',
          started: 0,
          finished: 0,
          playSeconds: 0,
          onlineStarted: 3,
        },
        {
          gameId: 'tetrix',
          day: '2026-11-10',
          started: 4,
          finished: 1,
          playSeconds: 60,
          abandonedSeconds: 90,
        },
      ],
      profiles: new Map([
        ...profiles,
        ['uid-guest-FFFFF', { username: 'IdleOwl1234', kind: 'guest' } as ProfileInput],
      ]),
      profileTotals: { google: 3, registered: 1, guest: 7 },
    });

    const bora = r.players.find((p) => p.tag === 'BBBBB')!;
    expect(bora).toMatchObject({
      starts: 4,
      plays: 2,
      onlinePlays: 6,
      playSeconds: 100,
      abandonedSeconds: 90,
      totalSeconds: 190,
      // online play is play too
      lastPlayedAt: at('2026-11-10T20:00:00Z'),
    });
    // online matches lift Bora above the players with fewer plays; online first in their games
    expect(r.players.map((p) => p.tag)).toEqual([
      'BBBBB',
      'AAAAA',
      'EEEEE',
      'DDDDD',
      'CCCCC',
      'FFFFF',
    ]);
    expect(bora.games.map((g) => [g.gameId, g.plays, g.onlinePlays])).toEqual([
      ['okey', 0, 6],
      ['tetrix', 1, 0],
      ['snake', 1, 0],
    ]);
    // a starts-only player is listed with zeros
    expect(r.players.at(-1)).toMatchObject({
      username: 'IdleOwl1234',
      starts: 1,
      plays: 0,
      totalSeconds: 0,
      lastPlayedAt: null,
    });
    expect(r.summary.registered).toMatchObject({
      players: 1,
      starts: 4,
      onlinePlays: 6,
      totalSeconds: 190,
    });
    expect(r.summary.guest).toMatchObject({ players: 3, starts: 1, plays: 6 });

    const okey = r.games.find((g) => g.gameId === 'okey')!;
    expect(okey.window).toMatchObject({ onlineStarted: 3, started: 0 });
    expect(okey.allTime.onlineStarted).toBe(3);
    expect(okey.playersByKind.registered).toBe(1);
    expect(r.games.find((g) => g.gameId === 'tetrix')!.window).toEqual({
      started: 4,
      finished: 1,
      playSeconds: 60,
      abandonedSeconds: 90,
      onlineStarted: 0,
    });
  });

  it('reads malformed counts as zero', () => {
    expect([countOf(3), countOf(-1), countOf('7'), countOf(NaN), countOf(undefined)]).toEqual([
      3, 0, 0, 0, 0,
    ]);
  });
});
