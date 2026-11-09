import { Timestamp } from 'firebase/firestore';
import { describe, expect, it } from 'vitest';
import type { PlayReport } from '../../packages/shared/src/play-report';
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
async function mailPlayer(username: string) {
  const user = await auth().createUser({ email: `${username}@example.com`, password: 'secret12' });
  await seedProfile(user.uid, { isGuest: false, username });
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
    // all-time counters from before the fresh start, and documents that are not play stats
    await write('games/snake/daily/2026-10-20', { started: 9, finished: 7, playSeconds: 500 });
    await write('games/snake/daily/2026-10-21', { started: 1, finished: 1, playSeconds: 30 });
    await write('games/snake/stats/total', { plays: 999 });
    await write('rankings/catalog/daily/2026-10-20', { finished: 999 });

    const report = await boss.call<PlayReport>('getPlayReport', {});

    // play time of real runs comes from the server clock, so it may be a second longer
    const near = (seconds: number) =>
      expect.toSatisfy((v: number) => v >= seconds && v <= seconds + 3);
    expect(report.summary).toEqual({
      google: { profiles: 2, players: 1, plays: 2, playSeconds: near(60) },
      registered: { profiles: 1, players: 1, plays: 4, playSeconds: 240 },
      guest: { profiles: 2, players: 1, plays: 1, playSeconds: near(20) },
      unknown: { profiles: null, players: 1, plays: 2, playSeconds: 60 },
    });
    expect(report.allTimeSince).toBe('2026-10-20');

    const snake = report.games.find((g) => g.gameId === 'snake')!;
    expect(snake).toMatchObject({
      allTime: { started: 10, finished: 8, playSeconds: 530 },
      plays: 6,
      playersByKind: { google: 0, registered: 1, guest: 0, unknown: 1 },
    });
    const fixture = report.games.find((g) => g.gameId === FIXTURE)!;
    expect(fixture.allTime.started).toBe(3);
    expect(fixture.allTime.finished).toBe(3);
    expect(fixture).toMatchObject({
      plays: 3,
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
    expect(report.players[1]!.games).toEqual([
      { gameId: FIXTURE, plays: 2, playSeconds: near(60) },
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
    expect(report.allTimeSince).toBeNull();
    expect(report.summary.google.profiles).toBe(1);
  });
});
