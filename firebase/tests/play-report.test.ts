import { Timestamp } from 'firebase/firestore';
import { describe, expect, it } from 'vitest';
import { STATS_SINCE, type PlayReport } from '../../packages/shared/src/play-report';
import { auth } from '../functions/src/admin';
import {
  admin,
  client,
  FIXTURE,
  guest,
  outcome,
  play,
  registered,
  seedProfile,
  useEmulators,
  write,
} from './helpers';

useEmulators();

const at = (iso: string) => Timestamp.fromMillis(Date.parse(iso));

/** A player who signed up with e-mail and password (not Google). */
async function mailPlayer(username: string, profile: Record<string, unknown> = {}) {
  const user = await auth().createUser({ email: `${username}@example.com`, password: 'secret12' });
  await seedProfile(user.uid, { isGuest: false, username, ...profile });
  return user.uid;
}

describe('getPlayReport', () => {
  it('is for admins only', async () => {
    expect(await outcome(client().call('getPlayReport', {}))).toBe('signed-out');
    const player = await guest();
    expect(await outcome(player.call('getPlayReport', {}))).toBe('admin-only');
    const member = await registered('member@example.com', { username: 'Member' });
    expect(await outcome(member.call('getPlayReport', {}))).toBe('admin-only');
  });

  it('counts players, plays and games by player kind', async () => {
    const boss = await admin(); // a Google account with a profile, no plays
    const ayla = await registered('ayla@example.com', { username: 'Ayla' });
    const bora = await mailPlayer('Bora');
    const fox = await guest({ username: 'PixelFox4821' });
    await guest({ username: 'IdleOwl1234' }); // a guest who never finished a run

    // real runs through the functions for the Google player and the guest
    await play(ayla, 100, 30);
    await play(ayla, 200, 30);
    await play(fox, 50, 20);
    // seeded stats for the e-mail player and a player whose profile is gone
    await write(`users/${bora}/stats/snake`, {
      plays: 4,
      playSeconds: 240,
      lastPlayedAt: at('2026-11-08T10:00:00Z'),
    });
    await write('users/ghost123456/stats/snake', {
      plays: 2,
      playSeconds: 60,
      lastPlayedAt: at('2026-11-08T11:00:00Z'),
    });
    // daily counters before and from STATS_SINCE, and documents that are not play stats
    await write('games/snake/daily/2026-10-20', { started: 9, finished: 7, playSeconds: 500 });
    await write('games/snake/daily/2026-11-06', { started: 1, finished: 1, playSeconds: 30 });
    await write(`games/snake/daily/${STATS_SINCE}`, { started: 3, finished: 2, playSeconds: 90 });
    await write('games/orbsurge/daily/2026-10-22', { started: 5, finished: 5, playSeconds: 99 });
    await write('games/snake/stats/total', { plays: 999 });
    await write('rankings/catalog/daily/2026-10-20', { finished: 999 });
    // before STATS_SINCE: profiles created then, and stats the reset missed
    await mailPlayer('Old', { createdAt: at('2026-10-01T10:00:00Z') });
    await write('users/oldguest12345', {
      username: 'OldOwl1000',
      isGuest: true,
      createdAt: at('2026-10-02T10:00:00Z'),
    });
    await write(`users/${bora}/stats/orbsurge`, {
      plays: 30,
      playSeconds: 900,
      lastPlayedAt: at('2026-11-06T23:59:59Z'),
    });

    const report = await boss.call<PlayReport>('getPlayReport', {});

    // play time of real runs comes from the server clock, so it may be a second longer
    const near = (seconds: number) =>
      expect.toSatisfy((v: number) => v >= seconds && v <= seconds + 3);
    // runs through startSession count their starts (slice 5.22); seeded documents have none
    const none = { onlinePlays: 0, abandonedSeconds: 0 };
    // profiles count from STATS_SINCE on: Old and OldOwl1000 are left out
    expect(report.summary).toEqual({
      google: {
        profiles: 2,
        players: 1,
        starts: 2,
        plays: 2,
        playSeconds: near(60),
        totalSeconds: near(60),
        ...none,
      },
      registered: {
        profiles: 1,
        players: 1,
        starts: 0,
        plays: 4,
        playSeconds: 240,
        totalSeconds: 240,
        ...none,
      },
      guest: {
        profiles: 2,
        players: 1,
        starts: 1,
        plays: 1,
        playSeconds: near(20),
        totalSeconds: near(20),
        ...none,
      },
      unknown: {
        profiles: null,
        players: 1,
        starts: 0,
        plays: 2,
        playSeconds: 60,
        totalSeconds: 60,
        ...none,
      },
    });
    expect(report.statsSince).toBe(STATS_SINCE);
    expect(report).not.toHaveProperty('allTimeSince');

    // only the days from STATS_SINCE on; orbsurge, played before then only, has no row
    expect(report.games.map((g) => g.gameId).sort()).toEqual([FIXTURE, 'snake']);
    const snake = report.games.find((g) => g.gameId === 'snake')!;
    expect(snake).toEqual({
      gameId: 'snake',
      window: { started: 3, finished: 2, playSeconds: 90, abandonedSeconds: 0, onlineStarted: 0 },
      playsByKind: { google: 0, registered: 4, guest: 0, unknown: 2 },
      playersByKind: { google: 0, registered: 1, guest: 0, unknown: 1 },
    });
    const fixture = report.games.find((g) => g.gameId === FIXTURE)!;
    // today's real runs
    expect(fixture.window.started).toBe(3);
    expect(fixture.window.finished).toBe(3);
    expect(fixture).toMatchObject({
      playsByKind: { google: 2, registered: 0, guest: 1, unknown: 0 },
      playersByKind: { google: 1, registered: 0, guest: 1, unknown: 0 },
    });

    expect(report.players.map((p) => [p.username, p.kind, p.plays])).toEqual([
      ['Bora', 'registered', 4],
      // equal plays: the one who played last first
      ['Ayla', 'google', 2],
      [null, 'unknown', 2],
      ['PixelFox4821', 'guest', 1],
    ]);
    // Bora's orbsurge stats were last played before STATS_SINCE
    expect(report.players[0]!.games.map((g) => g.gameId)).toEqual(['snake']);
    expect(report.players[1]!.games).toEqual([
      {
        gameId: FIXTURE,
        starts: 2,
        plays: 2,
        playSeconds: near(60),
        totalSeconds: near(60),
        ...none,
      },
    ]);
    expect(report.playerCount).toBe(4);
    expect(report.truncated).toBe(0);
    // no uid and no e-mail address leaves the function
    const text = JSON.stringify(report);
    for (const uid of [boss.uid, ayla.uid, bora, fox.uid]) expect(text).not.toContain(uid);
    expect(text).not.toContain('@example.com');
  });

  it('works on an empty project', async () => {
    const boss = await admin();
    const report = await boss.call<PlayReport>('getPlayReport', {});
    expect(report.players).toEqual([]);
    expect(report.games).toEqual([]);
    expect(report.summary.google.profiles).toBe(1);
  });
});
