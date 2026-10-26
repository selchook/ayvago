import { Timestamp } from 'firebase/firestore';
import { describe, expect, it } from 'vitest';
import { admin, FIXTURE, guest, outcome, start, useEmulators, write } from './helpers';

useEmulators();

// Emulator calls carry no App Check token, so they behave like an unverified client.

async function seedSessions(total: number, verified: number) {
  for (let i = 0; i < total; i++) {
    await write(`sessions/seed${i}`, {
      uid: 'someone',
      gameId: FIXTURE,
      startedAt: Timestamp.fromMillis(Date.now() - 60_000),
      appCheck: i < verified,
    });
  }
}

describe('App Check rollout', () => {
  it('reports the verified share of the last day to admins only', async () => {
    const boss = await admin();
    await seedSessions(10, 7);
    await expect(boss.call('getAppCheckStatus', {})).resolves.toEqual({
      mode: 'monitor',
      sessions: 10,
      verified: 7,
      ready: false,
    });
    const player = await guest();
    expect(await outcome(player.call('getAppCheckStatus', {}))).toBe('admin-only');
    expect(await outcome(player.call('setAppCheckMode', { mode: 'enforce', force: true }))).toBe(
      'admin-only',
    );
  });

  it('refuses to enforce until 95% of at least 20 sessions were verified', async () => {
    const boss = await admin();
    await seedSessions(20, 18);
    expect(await outcome(boss.call('setAppCheckMode', { mode: 'enforce' }))).toBe('not-ready');
    await write('sessions/seed19', { appCheck: true }, true); // 19 of 20 = 95%
    await expect(boss.call('setAppCheckMode', { mode: 'enforce' })).resolves.toMatchObject({
      mode: 'enforce',
      ready: true,
    });
  });

  it('refuses unverified calls while enforcing and accepts them again in monitor mode', async () => {
    const boss = await admin();
    const player = await guest();
    expect(await outcome(start(player))).toBe('ok');

    await boss.call('setAppCheckMode', { mode: 'enforce', force: true });
    expect(await outcome(start(player))).toBe('app-check');
    expect(await outcome(player.call('castVote', { gameId: FIXTURE, value: 1 }))).toBe('app-check');

    await boss.call('setAppCheckMode', { mode: 'monitor' });
    expect(await outcome(start(player))).toBe('ok');
  });
});
