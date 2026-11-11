import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import type { CallableRequest } from 'firebase-functions/v2/https';
import {
  adDayKey,
  adPlacement,
  readAdSettings,
  type AdSettings,
} from '../../../packages/shared/src/ads';
import { db } from './admin';
import { requirePlayer } from './appcheck';
import { fail } from './errors';
import { leaderboardGame } from './games';

// Rewarded ads (Phase 3, docs/adr/0023-ads-behind-an-admin-switch.md). A rewarded ad pays out in
// two steps of one callable, so a reward needs a ticket the server issued before the ad and a
// claim after it, once:
//
//   grantAdReward({ step: 'begin', gameId?, placement }) → { ticket, remaining }
//     before the ad: checks the switch and the player's daily cap, opens a pending ticket
//   grantAdReward({ step: 'claim', ticket }) → { rewarded: true, amount, remaining }
//     after the provider reported the ad as watched: grants the ticket and counts it, in one
//     transaction that only a pending ticket of this player passes
//
// The platform answers the game with `rewarded: true` only after the claim succeeded. Records:
// users/{uid}/adRewards/{ticket} (the player reads them) and users/{uid}/adQuota/{day} (the daily
// counter; functions only). Both go with the account on deletion (deleteMyData's recursive delete).

/** A claim sooner than this after its ticket cannot follow a watched ad. */
export const MIN_AD_MS = 5_000;
/** A ticket older than this can no longer be claimed. */
export const TICKET_MAX_AGE_MS = 10 * 60 * 1000;
/** Tickets a player may open per day beyond the rewarded cap (ads that never filled). */
export const EXTRA_DAILY_TICKETS = 20;

const TICKET_ID = /^[A-Za-z0-9]{1,40}$/;

// Each function instance re-reads the settings at most every 30 s (always in the emulator), so
// the admin switch takes effect within half a minute everywhere.
const CACHE_MS = process.env.FUNCTIONS_EMULATOR === 'true' ? 0 : 30_000;
let cached: { settings: AdSettings; at: number } | null = null;

export async function adSettings(): Promise<AdSettings> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.settings;
  const settings = readAdSettings((await db().doc('config/ads').get()).data());
  cached = { settings, at: Date.now() };
  return settings;
}

type Quota = { granted: number; tickets: number };

function readQuota(data: FirebaseFirestore.DocumentData | undefined): Quota {
  return {
    granted: typeof data?.granted === 'number' ? data.granted : 0,
    tickets: typeof data?.tickets === 'number' ? data.tickets : 0,
  };
}

export type BeginResult = { ticket: string; remaining: number };
export type ClaimResult = { rewarded: true; amount: number; remaining: number };

/** grantAdReward({ step, ... }) → BeginResult | ClaimResult */
export async function grantAdReward(
  request: CallableRequest<unknown>,
): Promise<BeginResult | ClaimResult> {
  const caller = await requirePlayer(request);
  const data = (request.data ?? {}) as Record<string, unknown>;
  const settings = await adSettings();
  if (!settings.enabled || !settings.rewarded) throw fail('failed-precondition', 'ads-off');
  if (data.step === 'begin') return begin(caller.uid, data, settings, request.app !== undefined);
  if (data.step === 'claim') return claim(caller.uid, data, settings);
  throw fail('invalid-argument', 'step');
}

async function begin(
  uid: string,
  data: Record<string, unknown>,
  settings: AdSettings,
  appCheck: boolean,
): Promise<BeginResult> {
  // A game's placement names its own id; platform placements (later) leave it out.
  const gameId = data.gameId === undefined ? null : data.gameId;
  if (gameId !== null && (typeof gameId !== 'string' || !leaderboardGame(gameId))) {
    throw fail('not-found', 'unknown-game');
  }
  const placement = adPlacement(data.placement);
  const now = Date.now();
  const day = adDayKey(now);
  const quotaRef = db().doc(`users/${uid}/adQuota/${day}`);
  const ticketRef = db().collection(`users/${uid}/adRewards`).doc();

  return db().runTransaction(async (tx) => {
    const quota = readQuota((await tx.get(quotaRef)).data());
    if (quota.granted >= settings.rewardedPerDay) throw fail('resource-exhausted', 'capped');
    if (quota.tickets >= settings.rewardedPerDay + EXTRA_DAILY_TICKETS) {
      throw fail('resource-exhausted', 'rate-limited');
    }
    tx.set(ticketRef, {
      status: 'pending',
      gameId,
      placement,
      day,
      startedAt: Timestamp.fromMillis(now),
      appCheck,
    });
    tx.set(quotaRef, { tickets: FieldValue.increment(1), day }, { merge: true });
    return { ticket: ticketRef.id, remaining: settings.rewardedPerDay - quota.granted };
  });
}

async function claim(
  uid: string,
  data: Record<string, unknown>,
  settings: AdSettings,
): Promise<ClaimResult> {
  const ticket = data.ticket;
  if (typeof ticket !== 'string' || !TICKET_ID.test(ticket)) {
    throw fail('invalid-argument', 'ticket');
  }
  const now = Date.now();
  const ticketRef = db().doc(`users/${uid}/adRewards/${ticket}`);

  const result = await db().runTransaction(async (tx) => {
    const snapshot = await tx.get(ticketRef);
    // Another player's ticket id simply does not exist under this player.
    if (!snapshot.exists) throw fail('not-found', 'no-ticket');
    if (snapshot.get('status') !== 'pending') throw fail('failed-precondition', 'claimed');
    const age = now - (snapshot.get('startedAt') as Timestamp).toMillis();
    if (age < MIN_AD_MS) throw fail('failed-precondition', 'too-fast');
    if (age > TICKET_MAX_AGE_MS) {
      tx.update(ticketRef, { status: 'expired', closedAt: Timestamp.fromMillis(now) });
      return { expired: true as const };
    }
    // The cap counts the day the ad was started, so a claim just after midnight cannot pass it.
    const quotaRef = db().doc(`users/${uid}/adQuota/${snapshot.get('day') as string}`);
    const quota = readQuota((await tx.get(quotaRef)).data());
    if (quota.granted >= settings.rewardedPerDay) throw fail('resource-exhausted', 'capped');
    tx.update(ticketRef, {
      status: 'granted',
      amount: settings.rewardAmount,
      grantedAt: Timestamp.fromMillis(now),
    });
    tx.set(quotaRef, { granted: FieldValue.increment(1) }, { merge: true });
    return {
      expired: false as const,
      remaining: settings.rewardedPerDay - quota.granted - 1,
      gameId: snapshot.get('gameId') as string | null,
      placement: snapshot.get('placement') as string,
    };
  });
  // An expired ticket is closed above, then refused (the update must commit first).
  if (result.expired) throw fail('deadline-exceeded', 'expired');
  logger.info('Ad reward granted', { gameId: result.gameId, placement: result.placement });
  return { rewarded: true, amount: settings.rewardAmount, remaining: result.remaining };
}
