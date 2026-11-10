import { Timestamp } from 'firebase/firestore';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { PlayReport } from '../../packages/shared/src/play-report';
import { VOTE_MIN_PLAY_SECONDS } from '../../packages/shared/src/ranking';
import { db, rtdb } from '../functions/src/admin';
import { countRoomJoin, countTableStart } from '../functions/src/online';
import { recomputeGameScores } from '../functions/src/rankings';
import { expireOpenSessions } from '../functions/src/sessions';
import { MAX_COUNTED_RUN_MS } from '../functions/src/stats';
import {
  admin,
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
  type Player,
  type Session,
} from './helpers';

// Slice 5.22 (docs/adr/0022-started-abandoned-and-online-play.md): started runs per player,
// the play time of runs left without GHA_END (abandonSession, cleanupSessions) and online matches
// counted by the table and room triggers. None of it may reach boards, XP, votes or rankings.

useEmulators();

beforeAll(() => {
  // Lets the functions called in this process (online counting, rankings) see the fixture game.
  process.env.FUNCTIONS_EMULATOR = 'true';
});

afterEach(async () => {
  await rtdb().ref().remove();
});

const today = () => new Date().toISOString().slice(0, 10);
const stats = (uid: string, gameId = FIXTURE) => read(`users/${uid}/stats/${gameId}`);
const daily = (gameId = FIXTURE) => read(`games/${gameId}/daily/${today()}`);
const abandon = (player: Player, session: Session, durationMs: number) =>
  player.call<{ status: string; seconds?: number }>('abandonSession', { ...session, durationMs });

describe('startSession', () => {
  it("counts the player's own starts next to the game's day", async () => {
    const player = await guest();
    await start(player);
    await start(player);
    const own = await stats(player.uid);
    expect(own).toMatchObject({ starts: 2 });
    expect(own!.plays).toBeUndefined();
    expect(own!.playSeconds).toBeUndefined();
    expect((own!.lastPlayedAt as Timestamp).toMillis()).toBeGreaterThan(Date.now() - 60_000);
    expect(await daily()).toMatchObject({ started: 2 });
  });
});

describe('abandonSession', () => {
  it('counts the time of a left run, never a play', async () => {
    const player = await guest();
    const session = await start(player);
    await age(session, 120_000);
    await expect(abandon(player, session, 90_000)).resolves.toEqual({
      status: 'abandoned',
      seconds: 90,
    });
    const own = await stats(player.uid);
    expect(own).toMatchObject({ starts: 1, abandonedSeconds: 90 });
    expect(own!.plays).toBeUndefined();
    expect(own!.playSeconds).toBeUndefined();
    expect(await daily()).toMatchObject({ started: 1, abandonedSeconds: 90 });
    expect((await daily())!.finished).toBeUndefined();
    expect((await daily())!.playSeconds).toBeUndefined();
    expect(await read(`sessions/${session.sessionId}`)).toMatchObject({
      status: 'abandoned',
      countedSeconds: 90,
      durationMs: 90_000,
    });
    // nothing for boards or progress
    expect(await read(`users/${player.uid}/progress/summary`)).toBeUndefined();
    expect(await read(`leaderboards/${FIXTURE}/boards/all/entries/${player.uid}`)).toBeUndefined();
  });

  it("takes the server's clock when the client claims more", async () => {
    const player = await guest();
    const session = await start(player);
    await age(session, 30_000);
    const result = await abandon(player, session, 60 * 60 * 1000);
    expect(result.status).toBe('abandoned');
    expect(result.seconds).toBeGreaterThanOrEqual(30);
    expect(result.seconds).toBeLessThan(35);
  });

  it(`caps the time at ${MAX_COUNTED_RUN_MS / 3_600_000} hours`, async () => {
    const player = await guest();
    const session = await start(player);
    await age(session, 5 * 60 * 60 * 1000);
    await expect(abandon(player, session, 5 * 60 * 60 * 1000)).resolves.toEqual({
      status: 'abandoned',
      seconds: MAX_COUNTED_RUN_MS / 1000,
    });
    expect(await stats(player.uid)).toMatchObject({ abandonedSeconds: MAX_COUNTED_RUN_MS / 1000 });
  });

  it('counts nothing for a session too old to finish', async () => {
    const player = await guest();
    const session = await start(player);
    await age(session, 7 * 60 * 60 * 1000);
    await expect(abandon(player, session, 60_000)).resolves.toEqual({ status: 'expired' });
    expect((await stats(player.uid))!.abandonedSeconds).toBeUndefined();
    expect(await read(`sessions/${session.sessionId}`)).toMatchObject({ status: 'expired' });
  });

  it("refuses a wrong token, someone else's session and bad input", async () => {
    const player = await guest();
    const other = await guest();
    const session = await start(player);
    await age(session, 60_000);
    expect(await outcome(abandon(player, { ...session, token: 'x'.repeat(32) }, 1000))).toBe(
      'bad-token',
    );
    expect(await outcome(abandon(other, session, 1000))).toBe('not-yours');
    expect(await outcome(abandon(player, { ...session, sessionId: 'nope' }, 1000))).toBe(
      'no-session',
    );
    expect(await outcome(abandon(player, { ...session, sessionId: '../x' }, 1000))).toBe('session');
    expect(await outcome(abandon(player, session, -1))).toBe('duration');
    expect(await outcome(player.call('abandonSession', { ...session, durationMs: 'long' }))).toBe(
      'duration',
    );
    // none of them closed or counted anything
    expect(await read(`sessions/${session.sessionId}`)).toMatchObject({ status: 'open' });
    expect((await stats(player.uid))!.abandonedSeconds).toBeUndefined();
    expect(await stats(other.uid)).toBeUndefined();
  });

  it('closes a run once: no double abandon, no finish after it, no abandon after a finish', async () => {
    const player = await guest();
    const left = await start(player);
    await age(left, 60_000);
    expect(await outcome(abandon(player, left, 50_000))).toBe('ok');
    expect(await outcome(abandon(player, left, 50_000))).toBe('closed');
    expect(
      await outcome(
        player.call('finishSession', { ...left, score: 10, durationMs: 60_000, continues: 0 }),
      ),
    ).toBe('closed');

    await play(player, 100, 60);
    const finished = (await db()
      .collection('sessions')
      .where('uid', '==', player.uid)
      .where('status', '==', 'finished')
      .get())!.docs[0]!;
    expect(
      await outcome(abandon(player, { sessionId: finished.id, token: 'x'.repeat(32) }, 1000)),
    ).toBe('closed');

    const own = await stats(player.uid);
    expect(own).toMatchObject({ starts: 2, plays: 1, abandonedSeconds: 50 });
  });

  it('lets only one of a finish and an abandon sent at the same time count', async () => {
    const player = await guest();
    const session = await start(player);
    await age(session, 60_000);
    const results = await Promise.all([
      outcome(player.call('finishSession', { ...session, score: 10, durationMs: 60_000 })),
      outcome(abandon(player, session, 60_000)),
    ]);
    expect(results.filter((r) => r === 'ok')).toHaveLength(1);
    expect(results.filter((r) => r === 'closed')).toHaveLength(1);
    const own = (await stats(player.uid))!;
    // either a finished play or abandoned time, never both
    expect(own.plays === undefined).not.toBe(own.abandonedSeconds === undefined);
  });

  it('follows the App Check mode like the other session calls', async () => {
    const boss = await admin();
    const player = await guest();
    const session = await start(player);
    await boss.call('setAppCheckMode', { mode: 'enforce', force: true });
    expect(await outcome(abandon(player, session, 1000))).toBe('app-check');
    await boss.call('setAppCheckMode', { mode: 'monitor' });
    expect(await outcome(abandon(player, session, 1000))).toBe('ok');
  });

  it('accepts the keepalive request a closing page sends (the callable protocol over fetch)', async () => {
    const player = await guest();
    const session = await start(player);
    await age(session, 45_000);
    const token = await player.user.getIdToken();
    const response = await fetch('http://127.0.0.1:5001/demo-ayvago/europe-west1/abandonSession', {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ data: { ...session, durationMs: 40_000 } }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ result: { status: 'abandoned', seconds: 40 } });
    // without the ID token it is refused
    const anonymous = await fetch('http://127.0.0.1:5001/demo-ayvago/europe-west1/abandonSession', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { ...session, durationMs: 1 } }),
    });
    expect(anonymous.status).toBe(401);
  });
});

describe('cleanupSessions', () => {
  it('marks open sessions that got no signal as expired and counts nothing', async () => {
    const player = await guest();
    const stale = await start(player);
    const fresh = await start(player);
    const done = await start(player);
    await age(stale, 7 * 60 * 60 * 1000);
    await age(done, 7 * 60 * 60 * 1000);
    await write(`sessions/${done.sessionId}`, { status: 'finished' }, true);

    expect(await expireOpenSessions()).toBe(1);
    expect(await read(`sessions/${stale.sessionId}`)).toMatchObject({ status: 'expired' });
    expect(await read(`sessions/${fresh.sessionId}`)).toMatchObject({ status: 'open' });
    expect(await read(`sessions/${done.sessionId}`)).toMatchObject({ status: 'finished' });
    const own = (await stats(player.uid))!;
    expect(own.abandonedSeconds).toBeUndefined();
    expect(own.playSeconds).toBeUndefined();
    expect(await expireOpenSessions()).toBe(0);
  });
});

describe('online matches', () => {
  const table = (status: string, seats: Record<number, unknown>, gameId = FIXTURE) => ({
    gameId,
    slug: 'bridge-fixture',
    hostUid: 'host',
    size: 4,
    status,
    createdAt: 1_000,
    seats,
  });
  const four = {
    0: { uid: 'host', name: 'Ayşe' },
    1: { bot: true, name: 'Bot 1' },
    2: { uid: 'guest-mert', name: 'Mert' },
    3: { uid: 'zeynep', name: 'Zeynep' },
  };

  it('counts every human at a table once when it starts, bots left out', async () => {
    const open = table('open', four);
    const playing = table('playing', four);
    expect(await countTableStart('ABC234', open, playing)).toBe(3);
    for (const uid of ['host', 'guest-mert', 'zeynep']) {
      const own = await stats(uid);
      expect(own).toMatchObject({ onlinePlays: 1, lastOnlineMatch: 'table:ABC234:1000' });
      expect(own!.plays).toBeUndefined();
      expect(own!.starts).toBeUndefined();
    }
    expect(await stats('Bot 1')).toBeUndefined();
    expect(await daily()).toEqual({ onlineStarted: 1 });

    // a repeated trigger event and later writes to the playing table count nothing
    expect(await countTableStart('ABC234', open, playing)).toBe(0);
    expect(await countTableStart('ABC234', playing, playing)).toBe(0);
    expect(await stats('host')).toMatchObject({ onlinePlays: 1 });
    expect(await daily()).toEqual({ onlineStarted: 1 });

    // one person with bots plays an online table too
    const solo = { 0: { uid: 'host', name: 'Ayşe' }, 1: { bot: true, name: 'Bot 1' } };
    expect(await countTableStart('SOL234', table('open', solo), table('playing', solo))).toBe(1);
    expect(await stats('host')).toMatchObject({
      onlinePlays: 2,
      lastOnlineMatch: 'table:SOL234:1000',
    });
    expect(await daily()).toEqual({ onlineStarted: 2 });

    // never ranked, never progress
    expect(await read('users/host/progress/summary')).toBeUndefined();
    expect((await db().collection(`leaderboards/${FIXTURE}/boards`).get()).empty).toBe(true);
  });

  it('skips tables of games outside the live catalog', async () => {
    const seats = { 0: { uid: 'host', name: 'Ayşe' }, 1: { uid: 'mert', name: 'Mert' } };
    expect(
      await countTableStart(
        'FAK234',
        table('open', seats, 'madeup'),
        table('playing', seats, 'madeup'),
      ),
    ).toBe(0);
    expect(await stats('host', 'madeup')).toBeUndefined();
    expect(await read(`games/madeup/daily/${today()}`)).toBeUndefined();
  });

  it('counts both players of a room once its guest seat is taken', async () => {
    await rtdb().ref('rooms/ROM234').set({
      gameId: FIXTURE,
      slug: 'bridge-fixture',
      hostUid: 'host',
      hostName: 'Ayşe',
      createdAt: 5,
      status: 'open',
    });
    expect(await countRoomJoin('ROM234')).toBe(0);
    await rtdb().ref('rooms/ROM234').update({ guestUid: 'guest-mert', guestName: 'Mert' });
    expect(await countRoomJoin('ROM234')).toBe(2);
    expect(await countRoomJoin('ROM234')).toBe(0);
    expect(await stats('host')).toMatchObject({ onlinePlays: 1, lastOnlineMatch: 'room:ROM234:5' });
    expect(await stats('guest-mert')).toMatchObject({ onlinePlays: 1 });
    expect(await daily()).toEqual({ onlineStarted: 1 });
  });
});

describe('readers of play stats', () => {
  it('vote eligibility counts finished play only: not starts, left runs or online matches', async () => {
    const player = await guest();
    await start(player);
    const notYet = (needed: number) =>
      player
        .call('castVote', { gameId: FIXTURE, value: 1 })
        .then(
          () => 'ok',
          (e: { details?: { reason?: string; needed?: number } }) =>
            `${e.details?.reason}:${e.details?.needed}`,
        )
        .then((result) => expect(result).toBe(`not-eligible:${needed}`));
    // a starts-only stats document reads like no document
    await notYet(VOTE_MIN_PLAY_SECONDS);

    const left = await start(player);
    await age(left, 10 * 60 * 1000);
    await abandon(player, left, 10 * 60 * 1000);
    const seats = { 0: { uid: player.uid, name: 'Fox' }, 1: { bot: true, name: 'Bot 1' } };
    await countTableStart('VOT234', table('open', seats), table('playing', seats));
    expect(await stats(player.uid)).toMatchObject({
      starts: 2,
      abandonedSeconds: 600,
      onlinePlays: 1,
    });
    await notYet(VOTE_MIN_PLAY_SECONDS);

    await play(player, 100, VOTE_MIN_PLAY_SECONDS + 5);
    expect(await outcome(player.call('castVote', { gameId: FIXTURE, value: 1 }))).toBe('ok');
  });

  it('moves every counter of a guest to the account on merge, the newer last play kept', async () => {
    const ayla = await registered('ayla@example.com');
    const player = await guest();
    await start(player); // a starts-only document
    await write(
      `users/${player.uid}/stats/${FIXTURE}`,
      { onlinePlays: 2, abandonedSeconds: 40 },
      true,
    );
    // the account played later than the guest
    const later = Timestamp.fromMillis(Date.now() + 60 * 60 * 1000);
    await write(`users/${ayla.uid}/stats/${FIXTURE}`, {
      plays: 1,
      playSeconds: 30,
      lastPlayedAt: later,
    });
    await ayla.call('mergeGuestAccount', { guestIdToken: await player.user.getIdToken() });

    const merged = (await stats(ayla.uid))!;
    expect(merged).toMatchObject({
      plays: 1,
      playSeconds: 30,
      starts: 1,
      onlinePlays: 2,
      abandonedSeconds: 40,
    });
    expect((merged.lastPlayedAt as Timestamp).toMillis()).toBe(later.toMillis());
    expect(merged.lastOnlineMatch).toBeUndefined();
    expect(await stats(player.uid)).toBeUndefined();
  });

  it('merges a starts-only guest document into an account without stats', async () => {
    const ayla = await registered('ayla@example.com');
    const player = await guest();
    await write(`users/${player.uid}/stats/${FIXTURE}`, { starts: 3 });
    await ayla.call('mergeGuestAccount', { guestIdToken: await player.user.getIdToken() });
    expect(await stats(ayla.uid)).toEqual({ starts: 3 });
  });

  it('deleteMyData takes the new counters too', async () => {
    const ayla = await registered('ayla@example.com');
    await start(ayla);
    await ayla.call('deleteMyData', {});
    expect(await stats(ayla.uid)).toBeUndefined();
  });

  it('leaves the catalog ranking and the spotlight unchanged', async () => {
    const now = Date.parse('2030-03-15T06:00:00Z');
    const base = { started: 30, finished: 10, playSeconds: 600 };
    await write(`games/${FIXTURE}`, { likes: 2, dislikes: 0 }, true);
    await write(`games/${FIXTURE}/daily/2030-03-15`, base);
    await recomputeGameScores(now);
    const before = (await read('rankings/catalog'))!.games as Record<string, unknown>;

    await write(`games/${FIXTURE}/daily/2030-03-15`, {
      ...base,
      abandonedSeconds: 5000,
      onlineStarted: 40,
    });
    await recomputeGameScores(now);
    const after = (await read('rankings/catalog'))!.games as Record<string, unknown>;
    expect(after[FIXTURE]).toEqual(before[FIXTURE]);
  });

  it('getPlayReport shows starts, online matches and the time of left runs', async () => {
    const boss = await admin();
    const fox = await guest({ username: 'PixelFox4821' });
    const left = await start(fox);
    await age(left, 120_000);
    await abandon(fox, left, 100_000);
    await play(fox, 100, 30);
    const seats = { 0: { uid: fox.uid, name: 'Fox' }, 1: { bot: true, name: 'Bot 1' } };
    await countTableStart('REP234', table('open', seats), table('playing', seats));

    const report = await boss.call<PlayReport>('getPlayReport', {});
    const row = report.players.find((p) => p.username === 'PixelFox4821')!;
    expect(row).toMatchObject({ kind: 'guest', starts: 2, plays: 1, onlinePlays: 1 });
    expect(row.abandonedSeconds).toBe(100);
    expect(row.totalSeconds).toBe(row.playSeconds + 100);
    expect(report.summary.guest).toMatchObject({ players: 1, starts: 2, plays: 1, onlinePlays: 1 });
    const game = report.games.find((g) => g.gameId === FIXTURE)!;
    expect(game.window).toMatchObject({
      started: 2,
      finished: 1,
      onlineStarted: 1,
      abandonedSeconds: 100,
    });
    expect(report.extendedSince).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  // shared with the online tests above
  function table(status: string, seats: Record<number, unknown>) {
    return {
      gameId: FIXTURE,
      slug: 'bridge-fixture',
      hostUid: 'h',
      size: 2,
      status,
      createdAt: 7,
      seats,
    };
  }
});
