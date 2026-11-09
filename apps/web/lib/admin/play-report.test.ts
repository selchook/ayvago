import type { PlayReport } from '@ayvago/shared';
import { describe, expect, it } from 'vitest';
import { csvCell, toCsv } from './csv';
import { gameCsvRows, playerCsvRows, splitDuration } from './play-report';

const kinds = (google: number, registered: number, guest: number, unknown: number) => ({
  google,
  registered,
  guest,
  unknown,
});

const report: PlayReport = {
  generatedAt: Date.parse('2026-11-09T12:00:00Z'),
  statsSince: '2026-11-07',
  allTimeSince: '2026-10-20',
  summary: {
    google: { profiles: 2, players: 1, plays: 7, playSeconds: 420 },
    registered: { profiles: 0, players: 0, plays: 0, playSeconds: 0 },
    guest: { profiles: 3, players: 1, plays: 2, playSeconds: 60 },
    unknown: { profiles: null, players: 0, plays: 0, playSeconds: 0 },
  },
  games: [
    {
      gameId: 'snake',
      allTime: { started: 22, finished: 17, playSeconds: 1030 },
      plays: 9,
      playSeconds: 480,
      playsByKind: kinds(7, 0, 2, 0),
      playersByKind: kinds(1, 0, 1, 0),
    },
  ],
  players: [
    {
      tag: 'AAAAA',
      username: 'Çağla, "the best"',
      kind: 'google',
      plays: 7,
      playSeconds: 420,
      lastPlayedAt: Date.parse('2026-11-09T09:00:00Z'),
      games: [{ gameId: 'snake', plays: 7, playSeconds: 420 }],
    },
    {
      tag: 'BBBBB',
      username: null,
      kind: 'guest',
      plays: 2,
      playSeconds: 60,
      lastPlayedAt: null,
      games: [{ gameId: 'snake', plays: 2, playSeconds: 60 }],
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
    const rows = gameCsvRows(report, (id) => (id === 'snake' ? 'Yılan' : id), {
      game: 'Game',
      gameId: 'Id',
      allTimeFinished: 'Runs',
      allTimeStarted: 'Starts',
      allTimeSeconds: 'Seconds all',
      plays: 'Plays',
      seconds: 'Seconds',
      playsByKind: label('Plays'),
      playersByKind: label('Players'),
    });
    expect(rows).toEqual([
      [
        'Game',
        'Id',
        'Runs',
        'Starts',
        'Seconds all',
        'Plays',
        'Seconds',
        'Plays G',
        'Plays R',
        'Plays M',
        'Plays U',
        'Players G',
        'Players R',
        'Players M',
        'Players U',
      ],
      ['Yılan', 'snake', 17, 22, 1030, 9, 480, 7, 0, 2, 0, 1, 0, 1, 0],
    ]);
  });

  it('builds the per-player rows with their games', () => {
    const rows = playerCsvRows(
      report,
      () => 'Snake',
      (kind) => kind.toUpperCase(),
      '(no name)',
      {
        rank: '#',
        player: 'Player',
        tag: 'Tag',
        kind: 'Kind',
        plays: 'Plays',
        seconds: 'Seconds',
        lastPlayed: 'Last',
        games: 'Games',
      },
    );
    expect(rows.slice(1)).toEqual([
      [1, 'Çağla, "the best"', 'AAAAA', 'GOOGLE', 7, 420, '2026-11-09T09:00:00.000Z', 'Snake × 7'],
      [2, '(no name)', 'BBBBB', 'GUEST', 2, 60, '', 'Snake × 2'],
    ]);
    expect(toCsv(rows).split('\r\n')[1]).toBe(
      '1,"Çağla, ""the best""",AAAAA,GOOGLE,7,420,2026-11-09T09:00:00.000Z,Snake × 7',
    );
  });
});
