import { Timestamp } from 'firebase/firestore';
import { DEFAULT_AD_SETTINGS, adDayKey } from '@ayvago/shared';
import { describe, expect, it } from 'vitest';
import {
  FIXTURE,
  guest,
  outcome,
  read,
  registered,
  useEmulators,
  write,
  type Player,
} from './helpers';

useEmulators();

// grantAdReward (Phase 3, docs/adr/0023-ads-behind-an-admin-switch.md). Emulator calls carry no
// App Check token, so they behave like an unverified client.

type Begin = { ticket: string; remaining: number };
type Claim = { rewarded: boolean; amount: number; remaining: number };

async function adsOn(changes: Record<string, unknown> = {}) {
  await write('config/ads', {
    ...DEFAULT_AD_SETTINGS,
    enabled: true,
    updatedAt: Timestamp.now(),
    ...changes,
  });
}

const begin = (player: Player, extra: Record<string, unknown> = {}) =>
  player.call<Begin>('grantAdReward', {
    step: 'begin',
    gameId: FIXTURE,
    placement: 'continue',
    ...extra,
  });

const claim = (player: Player, ticket: string) =>
  player.call<Claim>('grantAdReward', { step: 'claim', ticket });

/** Pretends the ad started `ms` ago, so tests need not wait for a real ad. */
async function watched(player: Player, ticket: string, ms = 30_000) {
  await write(
    `users/${player.uid}/adRewards/${ticket}`,
    { startedAt: Timestamp.fromMillis(Date.now() - ms) },
    true,
  );
}

async function rewardOnce(player: Player) {
  const { ticket } = await begin(player);
  await watched(player, ticket);
  return claim(player, ticket);
}

describe('grantAdReward', () => {
  it('refuses while ads are off: no document, the switch off, or rewarded off', async () => {
    const player = await guest();
    expect(await outcome(begin(player))).toBe('ads-off');
    await write('config/ads', { ...DEFAULT_AD_SETTINGS, updatedAt: Timestamp.now() });
    expect(await outcome(begin(player))).toBe('ads-off');
    await adsOn({ rewarded: false });
    expect(await outcome(begin(player))).toBe('ads-off');
  });

  it('grants a watched ad once, after the server confirmed it', async () => {
    await adsOn({ rewardedPerDay: 5, rewardAmount: 10 });
    const player = await guest();
    const { ticket, remaining } = await begin(player);
    expect(remaining).toBe(5);
    expect(await read(`users/${player.uid}/adRewards/${ticket}`)).toMatchObject({
      status: 'pending',
      gameId: FIXTURE,
      placement: 'continue',
    });

    // Straight after the ticket: no ad could have played yet.
    expect(await outcome(claim(player, ticket))).toBe('too-fast');

    await watched(player, ticket);
    await expect(claim(player, ticket)).resolves.toEqual({
      rewarded: true,
      amount: 10,
      remaining: 4,
    });
    expect(await read(`users/${player.uid}/adRewards/${ticket}`)).toMatchObject({
      status: 'granted',
      amount: 10,
    });
    expect(await read(`users/${player.uid}/adQuota/${adDayKey(Date.now())}`)).toMatchObject({
      granted: 1,
      tickets: 1,
    });

    // The same ad cannot pay twice.
    expect(await outcome(claim(player, ticket))).toBe('claimed');
  });

  it('enforces the daily cap at the ticket and at the claim', async () => {
    await adsOn({ rewardedPerDay: 2 });
    const player = await guest();
    const early = await begin(player); // opened before the cap was reached
    await rewardOnce(player);
    await rewardOnce(player);
    expect(await outcome(begin(player))).toBe('capped');
    await watched(player, early.ticket);
    expect(await outcome(claim(player, early.ticket))).toBe('capped');

    // Another player has their own cap.
    const other = await registered('other@example.com');
    expect(await outcome(rewardOnce(other))).toBe('ok');
  });

  it('refuses when the switch goes off between the ad and the claim', async () => {
    await adsOn();
    const player = await guest();
    const { ticket } = await begin(player);
    await watched(player, ticket);
    await adsOn({ enabled: false });
    expect(await outcome(claim(player, ticket))).toBe('ads-off');
  });

  it("refuses another player's ticket, stale tickets and bad input", async () => {
    await adsOn();
    const alice = await guest();
    const bob = await guest();
    const { ticket } = await begin(alice);
    await watched(alice, ticket);
    expect(await outcome(claim(bob, ticket))).toBe('no-ticket');

    await watched(alice, ticket, 11 * 60 * 1000);
    expect(await outcome(claim(alice, ticket))).toBe('expired');
    expect(await read(`users/${alice.uid}/adRewards/${ticket}`)).toMatchObject({
      status: 'expired',
    });

    expect(await outcome(claim(alice, '../x'))).toBe('ticket');
    expect(await outcome(alice.call('grantAdReward', { step: 'grant' }))).toBe('step');
    expect(await outcome(begin(alice, { gameId: 'nope' }))).toBe('unknown-game');
  });

  it('keeps placement names plain and allows platform placements without a game', async () => {
    await adsOn();
    const player = await guest();
    const { ticket } = await begin(player, { gameId: undefined, placement: '<b>bad</b>' });
    expect(await read(`users/${player.uid}/adRewards/${ticket}`)).toMatchObject({
      gameId: null,
      placement: 'default',
    });
  });

  it('needs a signed-in, unbanned player', async () => {
    await adsOn();
    const { client } = await import('./helpers');
    expect(await outcome(client().call('grantAdReward', { step: 'begin' }))).toBe('signed-out');
    const { auth } = await import('../functions/src/admin');
    const player = await guest();
    await auth().setCustomUserClaims(player.uid, { banned: true });
    await player.user.getIdToken(true);
    expect(await outcome(begin(player))).toBe('banned');
  });

  it('follows the App Check switch like the other player callables', async () => {
    await adsOn();
    const player = await guest();
    expect(await outcome(begin(player))).toBe('ok');
    await write('config/appCheck', { mode: 'enforce' });
    expect(await outcome(begin(player))).toBe('app-check');
  });
});
