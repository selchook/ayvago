import type { PlayReport } from '@ayvago/shared';
import { describe, expect, it } from 'vitest';
import { csvCell, toCsv } from './csv';
import { gameCsvRows, playerCsvRows, reportFileName, splitDuration } from './play-report';

const kinds = (google: number, registered: number, guest: number, unknown: number) => ({
  google,
  registered,
  guest,
  unknown,
});

const counts = (
  starts: number,
  plays: number,
  onlinePlays: number,
  playSeconds: number,
  abandonedSeconds: number,
) => ({
  starts,
  plays,
  onlinePlays,
  playSeconds,
  abandonedSeconds,
  totalSeconds: playSeconds + abandonedSeconds,
});

const report: PlayReport = {
  generatedAt: Date.parse('2026-11-09T12:00:00Z'),
  statsSince: '2026-11-07',
  extendedSince: '2026-11-10',
  summary: {
    google: { profiles: 2, players: 1, ...counts(9, 7, 3, 420, 30) },
    registered: { profiles: 0, players: 0, ...counts(0, 0, 0, 0, 0) },
    guest: { profiles: 3, players: 1, ...counts(0, 2, 0, 60, 0) },
    unknown: { profiles: null, players: 0, ...counts(0, 0, 0, 0, 0) },
  },
  games: [
    {
      gameId: 'snake',
      window: {
        started: 12,
        finished: 9,
        playSeconds: 480,
        abandonedSeconds: 30,
        onlineStarted: 2,
      },
      playsByKind: kinds(7, 0, 2, 0),
      playersByKind: kinds(1, 0, 1, 0),
    },
  ],
  players: [
    {
      tag: 'AAAAA',
      username: 'Çağla, "the best"',
      kind: 'google',
      ...counts(9, 7, 3, 420, 30),
      lastPlayedAt: Date.parse('2026-11-09T09:00:00Z'),
      games: [
        { gameId: 'snake', ...counts(9, 7, 0, 420, 30) },
        { gameId: 'okey', ...counts(0, 0, 3, 0, 0) },
      ],
    },
    {
      tag: 'BBBBB',
      username: null,
      kind: 'guest',
      ...counts(0, 2, 0, 60, 0),
      lastPlayedAt: null,
      games: [{ gameId: 'snake', ...counts(0, 2, 0, 60, 0) }],
    },
  ],
  playerCount: 2,
  truncated: 0,
};

describe('csv', () => {
  it('quotes separators, quotes and line breaks and defuses formulas', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('-1')).toBe("'-1");
    expect(csvCell(-1)).toBe('-1');
    expect(csvCell(null)).toBe('');
    expect(csvCell(NaN)).toBe('');
    expect(
      toCsv([
        ['a', 1],
        ['b', 2],
      ]),
    ).toBe('a,1\r\nb,2\r\n');
  });
});

describe('play report rows', () => {
  it('splits play time into hours and minutes', () => {
    expect(splitDuration(0)).toEqual({ hours: 0, minutes: 0 });
    expect(splitDuration(89)).toEqual({ hours: 0, minutes: 1 });
    expect(splitDuration(3600 + 29 * 60 + 40)).toEqual({ hours: 1, minutes: 30 });
    expect(splitDuration(-5)).toEqual({ hours: 0, minutes: 0 });
  });

  it('builds the per-game rows', () => {
    const label = (prefix: string) => ({
      google: `${prefix} G`,
      registered: `${prefix} R`,
      guest: `${prefix} M`,
      unknown: `${prefix} U`,
    });
    const rows = gameCsvRows(report.games, (id) => (id === 'snake' ? 'Yılan' : id), {
      game: 'Game',
      gameId: 'Id',
      started: 'Starts',
      finished: 'Runs',
      online: 'Online',
      seconds: 'Seconds',
      abandonedSeconds: 'Left',
      playsByKind: label('Plays'),
      playersByKind: label('Players'),
    });
    // one window: no all-time columns (slice 5.28)
    expect(rows[0]).toEqual([
      'Game',
      'Id',
      'Starts',
      'Runs',
      'Online',
      'Seconds',
      'Left',
      'Plays G',
      'Plays R',
      'Plays M',
      'Plays U',
      'Players G',
      'Players R',
      'Players M',
      'Players U',
    ]);
    expect(rows[1]).toEqual(['Yılan', 'snake', 12, 9, 2, 480, 30, 7, 0, 2, 0, 1, 0, 1, 0]);
  });

  it('names the files after the window and the build time', () => {
    expect(reportFileName('games', report.statsSince, report.generatedAt)).toBe(
      'ayvago-games-from-2026-11-07-2026-11-09T12-00.csv',
    );
    expect(reportFileName('players', '2026-11-07', Date.parse('2026-11-13T09:30:59Z'))).toBe(
      'ayvago-players-from-2026-11-07-2026-11-13T09-30.csv',
    );
  });

  it('builds the per-player rows with their games', () => {
    const rows = playerCsvRows(
      report.players,
      (g) => `${g.gameId === 'snake' ? 'Snake' : 'Okey'} × ${g.plays + g.onlinePlays}`,
      (kind) => kind.toUpperCase(),
      '(no name)',
      {
        rank: '#',
        player: 'Player',
        tag: 'Tag',
        kind: 'Kind',
        starts: 'Starts',
        plays: 'Plays',
        online: 'Online',
        seconds: 'Seconds',
        abandonedSeconds: 'Left',
        totalSeconds: 'Total',
        lastPlayed: 'Last',
        games: 'Games',
      },
    );
    expect(rows.slice(1)).toEqual([
      [
        1,
        'Çağla, "the best"',
        'AAAAA',
        'GOOGLE',
        9,
        7,
        3,
        420,
        30,
        450,
        '2026-11-09T09:00:00.000Z',
        'Snake × 7; Okey × 3',
      ],
      [2, '(no name)', 'BBBBB', 'GUEST', 0, 2, 0, 60, 0, 60, '', 'Snake × 2'],
    ]);
    expect(toCsv(rows).split('\r\n')[1]).toBe(
      '1,"Çağla, ""the best""",AAAAA,GOOGLE,9,7,3,420,30,450,2026-11-09T09:00:00.000Z,Snake × 7; Okey × 3',
    );
  });
});
