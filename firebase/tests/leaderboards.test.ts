import { Timestamp } from 'firebase/firestore';
import { beforeAll, describe, expect, it } from 'vitest';
import { previousSeasonKey, seasonKey } from '@ayvago/shared';
import { closeSeasons } from '../functions/src/leaderboards';
import { judgeRun, SESSIONS_PER_HOUR } from '../functions/src/sessions';
import type { LeaderboardGame } from '../functions/src/games';
import {
  age,
  FIXTURE,
  guest,
  outcome,
  play,
  read,
  registered,
  start,
  useEmulators,
  write,
} from './helpers';

useEmulators();

// The local fixture game (scoring: min 5 s, max 1000 points per second) is live in the emulator.
const GAME = FIXTURE;
const SEASON = `leaderboards/${GAME}/boards/season`;
const ALL = `leaderboards/${GAME}/boards/all`;

beforeAll(() => {
  // Lets closeSeasons(), called in this process, see the emulator-only fixture game too.
  process.env.FUNCTIONS_EMULATOR = 'true';
});

type Row = { uid: string; username: string; score: number };
const top = async (path: string) => ((await read(path))?.top ?? []) as Row[];

describe('startSession', () => {
  it('needs a signed-in player and a live game', async () => {
    const player = await guest();
    expect(await outcome(start(player, 'nosuchgame'))).toBe('unknown-game');
    // Coming-soon games do not take scores yet.
    expect(await outcome(start(player, 'numbercracker'))).toBe('unknown-game');
    const session = await start(player);
    expect(session.sessionId).toMatch(/^[A-Za-z0-9]{20}$/);
    const stored = await read(`sessions/${session.sessionId}`);
    expect(stored).toMatchObject({ uid: player.uid, gameId: GAME, status: 'open' });
    // Only a hash of the token is stored.
    expect(JSON.stringify(stored)).not.toContain(session.token);
  });

  it('limits how many runs a player starts per hour', async () => {
    const player = await guest();
    for (let i = 0; i < SESSIONS_PER_HOUR; i++) {
      await write(`sessions/seed${i}`, {
        uid: player.uid,
        gameId: GAME,
        startedAt: Timestamp.fromMillis(Date.now() - 1000),
      });
    }
    expect(await outcome(start(player))).toBe('rate-limited');
  });
});

describe('finishSession', () => {
  it('puts a validated score on the weekly and all-time boards', async () => {
    const player = await guest({ username: 'PixelFox4821', avatarId: 'fox-blue' });
    const result = await play(player, 5000);
    expect(result).toEqual({
      status: 'recorded',
      boards: {
        season: { improved: true, best: 5000, rank: 1, previousRank: null },
        all: { improved: true, best: 5000, rank: 1, previousRank: null },
      },
    });
    for (const path of [SEASON, ALL]) {
      expect(await top(path)).toEqual([
        expect.objectContaining({
          uid: player.uid,
          username: 'PixelFox4821',
          avatarId: 'fox-blue',
          isGuest: true,
          score: 5000,
          continued: false,
        }),
      ]);
    }
    expect(await read(SEASON)).toMatchObject({ periodKey: seasonKey(Date.now()), order: 'desc' });
    expect(await read(`${SEASON}/entries/${player.uid}`)).toMatchObject({ score: 5000 });
  });

  it('keeps the best score and ranks players', async () => {
    const ayla = await guest({ username: 'Ayla' });
    const bora = await guest({ username: 'Bora' });
    await play(ayla, 5000);
    const worse = await play(ayla, 1000);
    expect(worse).toMatchObject({ boards: { season: { improved: false, best: 5000, rank: 1 } } });

    const second = await play(bora, 3000);
    expect(second).toMatchObject({ boards: { all: { rank: 2 } } });
    const first = await play(bora, 9000);
    expect(first).toMatchObject({ boards: { all: { improved: true, rank: 1, previousRank: 2 } } });
    expect((await top(ALL)).map((row) => [row.username, row.score])).toEqual([
      ['Bora', 9000],
      ['Ayla', 5000],
    ]);
  });

  it('never accepts a score without a valid, open session of the caller', async () => {
    const player = await guest();
    const other = await guest();
    const finish = (data: Record<string, unknown>) =>
      outcome(player.call('finishSession', { score: 999, durationMs: 60_000, ...data }));

    expect(await finish({ sessionId: 'forged', token: 'x' })).toBe('no-session');
    const session = await start(player);
    await age(session, 60_000);
    expect(await finish({ sessionId: session.sessionId, token: 'wrong' })).toBe('bad-token');
    const theirs = await start(other);
    expect(await finish(theirs)).toBe('not-yours');
    expect(await finish(session)).toBe('ok');
    expect(await finish(session)).toBe('closed');
    expect(await top(ALL)).toHaveLength(1);
  });

  it('rejects runs shorter than the game allows', async () => {
    const player = await guest();
    expect(await play(player, 10, 2)).toEqual({ status: 'rejected', reason: 'too-short' });
    expect(await read(ALL)).toBeUndefined();
  });

  it('holds suspicious scores for review instead of showing them', async () => {
    const player = await guest();
    // The client claims a far longer run than the server saw (does not depend on calibration).
    const session = await start(player);
    await age(session, 10_000);
    const result = await player.call('finishSession', {
      ...session,
      score: 5_000,
      durationMs: 200_000,
    });
    expect(result).toEqual({ status: 'flagged' });
    expect(await read(`scoreFlags/${session.sessionId}`)).toMatchObject({
      uid: player.uid,
      gameId: GAME,
      score: 5_000,
      reasons: ['duration-mismatch'],
      status: 'pending',
    });
    expect(await read(ALL)).toBeUndefined();
    expect(await read(`sessions/${session.sessionId}`)).toMatchObject({ status: 'flagged' });
  });

  it('archives last week when the first score of a new season arrives', async () => {
    const old = previousSeasonKey(Date.now());
    const oldRow = {
      uid: 'x',
      username: 'Champ',
      avatarId: null,
      isGuest: false,
      score: 1,
      achievedAt: 1,
      continued: false,
    };
    await write(SEASON, { periodKey: old, order: 'desc', top: [oldRow] });
    const player = await guest();
    await play(player, 700);
    expect(await read(`leaderboards/${GAME}/seasons/${old}`)).toMatchObject({
      periodKey: old,
      top: [oldRow],
    });
    expect((await top(SEASON)).map((row) => row.score)).toEqual([700]);
  });
});

describe('closeSeasons', () => {
  it('archives finished seasons, resets the board and deletes old entries', async () => {
    const old = previousSeasonKey(Date.now());
    await write(SEASON, { periodKey: old, order: 'desc', top: [{ uid: 'x', score: 9 }] });
    await write(`${SEASON}/entries/x`, { score: 9, periodKey: old });
    await write(`${SEASON}/entries/y`, { score: 3, periodKey: seasonKey(Date.now()) });

    expect(await closeSeasons()).toBe(1);
    expect(await read(`leaderboards/${GAME}/seasons/${old}`)).toMatchObject({
      top: [{ uid: 'x' }],
    });
    expect(await read(SEASON)).toMatchObject({ periodKey: seasonKey(Date.now()), top: [] });
    expect(await read(`${SEASON}/entries/x`)).toBeUndefined();
    expect(await read(`${SEASON}/entries/y`)).toBeDefined();
    // Running again changes nothing.
    expect(await closeSeasons()).toBe(0);
  });
});

describe('player rows', () => {
  it('follow username changes', async () => {
    const ayla = await registered('ayla@example.com', { username: 'OldName' });
    await play(ayla, 400);
    await ayla.call('reserveUsername', { username: 'NewName' });
    expect((await top(ALL))[0]).toMatchObject({ uid: ayla.uid, username: 'NewName' });
  });

  it('are removed when the player leaves', async () => {
    const ayla = await registered('ayla@example.com');
    await play(ayla, 400);
    await expect(ayla.call('deleteMyData', {})).resolves.toEqual({ deleted: true });
    expect(await top(ALL)).toEqual([]);
    expect(await read(`users/${ayla.uid}`)).toBeUndefined();
    expect(await read(`${ALL}/entries/${ayla.uid}`)).toBeUndefined();
  });

  it("move to the account when a guest's better scores are merged", async () => {
    const ayla = await registered('ayla@example.com', { username: 'Ayla' });
    await play(ayla, 300);
    const player = await guest({ username: 'GuestFox' });
    await play(player, 800);
    const guestIdToken = await player.user.getIdToken();
    await ayla.call('mergeGuestAccount', { guestIdToken });

    expect((await top(ALL)).map((row) => [row.uid, row.username, row.score])).toEqual([
      [ayla.uid, 'Ayla', 800],
    ]);
    expect(await read(`${SEASON}/entries/${ayla.uid}`)).toMatchObject({ score: 800 });
    expect(await read(`${SEASON}/entries/${player.uid}`)).toBeUndefined();
  });
});

describe('judgeRun', () => {
  const game: LeaderboardGame = {
    gameId: 'g',
    slug: 'g',
    calibrationEndsAt: 0,
    scoring: {
      metric: 'points',
      order: 'desc',
      format: 'number',
      label: { en: 'Score' },
      accumulate: false,
      minDurationMs: 5000,
      maxPerSecond: 100,
      maxScore: 100_000,
    },
  };
  const judge = (overrides: Partial<Parameters<typeof judgeRun>[0]>) =>
    judgeRun({
      game,
      score: 1000,
      clientMs: 60_000,
      serverMs: 60_000,
      allTimeBest: null,
      allTimePlayers: 0,
      now: 1,
      ...overrides,
    });

  it('only flags limit violations while the game calibrates', () => {
    const calibrating = { ...game, calibrationEndsAt: 10 };
    expect(judge({ game: calibrating, score: 7000 })).toEqual({
      reject: null,
      flags: ['too-fast'],
    });
    expect(judge({ game: calibrating, score: 7000, now: 11 }).reject).toBe('too-fast');
  });

  it('rejects scores over the limits after calibration', () => {
    expect(judge({ score: 200_000, serverMs: 3_600_000, clientMs: 3_600_000 }).reject).toBe(
      'max-score',
    );
    expect(judge({ score: 7000 }).reject).toBe('too-fast');
    expect(judge({}).reject).toBeNull();
  });

  it('flags outliers and runs whose length does not match the server clock', () => {
    expect(judge({ allTimeBest: 300, allTimePlayers: 10 })).toEqual({
      reject: null,
      flags: ['outlier'],
    });
    expect(judge({ allTimeBest: 300, allTimePlayers: 9 }).flags).toEqual([]);
    expect(judge({ clientMs: 120_000 }).flags).toEqual(['duration-mismatch']);
  });
});
