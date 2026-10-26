import { describe, expect, it } from 'vitest';
import { seasonKey } from '@ayvago/shared';
import { auth } from '../functions/src/admin';
import {
  admin,
  FIXTURE,
  age,
  guest,
  outcome,
  read,
  registered,
  start,
  useEmulators,
  write,
} from './helpers';
import { Timestamp } from 'firebase/firestore';

useEmulators();

const ALL = `leaderboards/${FIXTURE}/boards/all`;
const SEASON = `leaderboards/${FIXTURE}/boards/season`;

/** A run the server flags (client duration far from the server's). */
async function flaggedRun(player: Awaited<ReturnType<typeof guest>>, score: number) {
  const session = await start(player);
  await age(session, 60_000);
  await player.call('finishSession', { ...session, score, durationMs: 600_000 });
  return session.sessionId;
}

const topScores = async (path: string) =>
  (((await read(path))?.top ?? []) as { uid: string; score: number }[]).map((row) => row.score);

describe('reviewScoreFlag', () => {
  it('is for admins only', async () => {
    const player = await guest();
    const id = await flaggedRun(player, 500);
    expect(
      await outcome(player.call('reviewScoreFlag', { sessionId: id, action: 'approve' })),
    ).toBe('admin-only');
  });

  it('approves a flagged score onto the boards with its original time', async () => {
    const boss = await admin();
    const player = await guest({ username: 'Lucky' });
    const id = await flaggedRun(player, 500);
    expect(await read(ALL)).toBeUndefined();

    await expect(
      boss.call('reviewScoreFlag', { sessionId: id, action: 'approve' }),
    ).resolves.toEqual({ status: 'approved' });
    expect(await topScores(ALL)).toEqual([500]);
    expect(await topScores(SEASON)).toEqual([500]);
    expect(await read(`scoreFlags/${id}`)).toMatchObject({
      status: 'approved',
      reviewedBy: boss.uid,
    });
    expect(await outcome(boss.call('reviewScoreFlag', { sessionId: id, action: 'reject' }))).toBe(
      'already-reviewed',
    );
  });

  it('puts an approved score from an earlier week on the all-time board only', async () => {
    const boss = await admin();
    const player = await guest();
    const id = await flaggedRun(player, 500);
    const lastWeek = Date.now() - 8 * 24 * 3600 * 1000;
    expect(seasonKey(lastWeek)).not.toBe(seasonKey(Date.now()));
    await write(`scoreFlags/${id}`, { achievedAt: Timestamp.fromMillis(lastWeek) }, true);
    await boss.call('reviewScoreFlag', { sessionId: id, action: 'approve' });
    expect(await topScores(ALL)).toEqual([500]);
    expect(await read(SEASON)).toBeUndefined();
  });

  it('rejects, or bans the player and clears their traces', async () => {
    const boss = await admin();
    const cheater = await guest();
    const first = await flaggedRun(cheater, 900);
    const second = await flaggedRun(cheater, 950);
    await boss.call('reviewScoreFlag', { sessionId: first, action: 'reject' });
    expect(await read(`scoreFlags/${first}`)).toMatchObject({ status: 'rejected' });

    // An accepted score of the cheater, to be removed by the ban.
    const session = await start(cheater);
    await age(session, 60_000);
    await cheater.call('finishSession', { ...session, score: 100, durationMs: 60_000 });
    expect(await topScores(ALL)).toEqual([100]);

    await expect(
      boss.call('reviewScoreFlag', { sessionId: second, action: 'ban' }),
    ).resolves.toEqual({
      status: 'banned',
    });
    expect(await read(`scoreFlags/${second}`)).toMatchObject({ status: 'banned' });
    expect(await topScores(ALL)).toEqual([]);
    expect((await auth().getUser(cheater.uid)).customClaims).toMatchObject({ banned: true });
    expect(await read(`users/${cheater.uid}`)).toMatchObject({ banned: true, bannedBy: boss.uid });

    // A banned player's token (refreshed) is refused by the functions.
    await cheater.auth.currentUser!.getIdToken(true).catch(() => undefined);
    expect(await outcome(start(cheater))).not.toBe('ok');
  });
});

describe('setPlayerBan', () => {
  it('bans and unbans players but never admins', async () => {
    const boss = await admin();
    const player = await guest();
    await expect(boss.call('setPlayerBan', { uid: player.uid, banned: true })).resolves.toEqual({
      banned: true,
    });
    await expect(boss.call('setPlayerBan', { uid: player.uid, banned: false })).resolves.toEqual({
      banned: false,
    });
    expect((await auth().getUser(player.uid)).customClaims?.banned).toBeUndefined();
    expect((await read(`users/${player.uid}`))?.banned).toBeUndefined();

    expect(await outcome(boss.call('setPlayerBan', { uid: boss.uid, banned: true }))).toBe(
      'admin-target',
    );
    expect(await outcome(player.call('setPlayerBan', { uid: boss.uid, banned: true }))).toBe(
      'admin-only',
    );
  });
});
