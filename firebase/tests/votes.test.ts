import { Timestamp } from 'firebase/firestore';
import { beforeAll, describe, expect, it } from 'vitest';
import { recomputeGameScores } from '../functions/src/rankings';
import { VOTE_CHANGES_PER_HOUR } from '../functions/src/votes';
import { FIXTURE, guest, outcome, play, read, registered, useEmulators, write } from './helpers';

useEmulators();

beforeAll(() => {
  // Lets recomputeGameScores(), called in this process, see the emulator-only fixture game.
  process.env.FUNCTIONS_EMULATOR = 'true';
});

const GAME = `games/${FIXTURE}`;
type Counters = { value: number; likes: number; dislikes: number };

describe('play stats', () => {
  it('count every finished run from the server clock', async () => {
    const player = await guest();
    await play(player, 100, 70);
    await play(player, 10, 2); // too short for the board, still play time
    expect(await read(`users/${player.uid}/stats/${FIXTURE}`)).toMatchObject({ plays: 2 });
    const seconds = (await read(`users/${player.uid}/stats/${FIXTURE}`))!.playSeconds as number;
    expect(seconds).toBeGreaterThanOrEqual(72);
    expect(seconds).toBeLessThan(80);
    const today = new Date().toISOString().slice(0, 10);
    expect(await read(`${GAME}/daily/${today}`)).toMatchObject({ started: 2, finished: 2 });
  });
});

describe('castVote', () => {
  it('needs a minute of play in the game', async () => {
    const player = await guest();
    expect(await outcome(player.call('castVote', { gameId: FIXTURE, value: 1 }))).toBe(
      'not-eligible',
    );
    await play(player, 100, 30);
    expect(await outcome(player.call('castVote', { gameId: FIXTURE, value: 1 }))).toBe(
      'not-eligible',
    );
    await play(player, 100, 40);
    expect(await outcome(player.call('castVote', { gameId: FIXTURE, value: 1 }))).toBe('ok');
  });

  it('keeps likes and dislikes consistent through changes and removal', async () => {
    const ayla = await guest();
    const bora = await guest();
    await play(ayla, 100, 70);
    await play(bora, 100, 70);
    const vote = (player: typeof ayla, data: Record<string, unknown>) =>
      player.call<Counters>('castVote', { gameId: FIXTURE, ...data });

    await expect(vote(ayla, { value: 1 })).resolves.toEqual({ value: 1, likes: 1, dislikes: 0 });
    await expect(vote(bora, { value: 1 })).resolves.toMatchObject({ likes: 2 });
    await expect(vote(ayla, { value: -1 })).resolves.toMatchObject({ likes: 1, dislikes: 1 });
    await expect(
      vote(ayla, { value: -1, reasons: ['controls', 'too_hard'], comment: 'Hard to steer' }),
    ).resolves.toMatchObject({ likes: 1, dislikes: 1 });
    expect(await read(`${GAME}/votes/${ayla.uid}`)).toMatchObject({
      value: -1,
      reasons: ['controls', 'too_hard'],
      comment: 'Hard to steer',
    });
    const today = new Date().toISOString().slice(0, 10);
    expect(await read(`${GAME}/feedback/${today}`)).toMatchObject({
      count: 1,
      comments: 1,
      reasons: { controls: 1, too_hard: 1 },
    });

    await expect(vote(ayla, { value: 0 })).resolves.toMatchObject({ likes: 1, dislikes: 0 });
    expect(await read(`${GAME}/votes/${ayla.uid}`)).toBeUndefined();
    expect(await read(GAME)).toMatchObject({ likes: 1, dislikes: 0, likePercent: null });
  });

  it('validates reasons and comments', async () => {
    const player = await guest();
    await play(player, 100, 70);
    const vote = (data: Record<string, unknown>) =>
      outcome(player.call('castVote', { gameId: FIXTURE, ...data }));
    expect(await vote({ value: 1, reasons: ['boring'] })).toBe('reasons');
    expect(await vote({ value: -1, reasons: ['nope'] })).toBe('reasons');
    expect(await vote({ value: -1, comment: 'x'.repeat(281) })).toBe('comment');
    expect(await vote({ value: -1, comment: 'what a fucking mess' })).toBe('offensive');
    expect(await vote({ value: 2 })).toBe('value');
    expect(await outcome(player.call('castVote', { gameId: 'numbercracker', value: 1 }))).toBe(
      'unknown-game',
    );
  });

  it('limits vote changes per hour', async () => {
    const player = await guest();
    await play(player, 100, 70);
    await write(`voteRate/${player.uid}`, {
      windowStart: Timestamp.now(),
      changes: VOTE_CHANGES_PER_HOUR,
    });
    expect(await outcome(player.call('castVote', { gameId: FIXTURE, value: 1 }))).toBe(
      'rate-limited',
    );
  });
});

describe('recomputeGameScores', () => {
  it('writes scores per game and one rankings document for the catalog', async () => {
    const player = await guest();
    await play(player, 100, 70);
    await player.call('castVote', { gameId: FIXTURE, value: 1 });
    expect(await recomputeGameScores()).toBeGreaterThanOrEqual(1);
    const rankings = (await read('rankings/catalog'))?.games as Record<
      string,
      Record<string, number>
    >;
    expect(rankings[FIXTURE]).toMatchObject({ likes: 1, dislikes: 0 });
    expect(rankings[FIXTURE]!.qualityScore).toBeGreaterThan(0);
    expect(await read(GAME)).toMatchObject({ plays7d: 1 });
  });
});

describe('player data', () => {
  it('is removed with deleteMyData, counters included', async () => {
    const ayla = await registered('ayla@example.com');
    await play(ayla, 100, 70);
    await ayla.call('castVote', { gameId: FIXTURE, value: -1 });
    await ayla.call('deleteMyData', {});
    expect(await read(GAME)).toMatchObject({ likes: 0, dislikes: 0 });
    expect(await read(`${GAME}/votes/${ayla.uid}`)).toBeUndefined();
    expect(await read(`users/${ayla.uid}/stats/${FIXTURE}`)).toBeUndefined();
  });

  it("moves a guest's votes and play time to the account on merge", async () => {
    const ayla = await registered('ayla@example.com');
    const player = await guest();
    await play(player, 100, 70);
    await player.call('castVote', { gameId: FIXTURE, value: 1 });
    await ayla.call('mergeGuestAccount', { guestIdToken: await player.user.getIdToken() });

    expect(await read(`${GAME}/votes/${ayla.uid}`)).toMatchObject({ value: 1 });
    expect(await read(`${GAME}/votes/${player.uid}`)).toBeUndefined();
    expect(await read(GAME)).toMatchObject({ likes: 1 });
    expect(await read(`users/${ayla.uid}/stats/${FIXTURE}`)).toMatchObject({ plays: 1 });
  });
});
