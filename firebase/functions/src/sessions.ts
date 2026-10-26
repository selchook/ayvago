import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { isBetterScore } from '../../../packages/shared/src/leaderboard';
import { db } from './admin';
import { fail } from './errors';
import { leaderboardGame, type LeaderboardGame } from './games';
import { applyScore, boardRef, playerCard, rankOf } from './leaderboards';

// Score sessions (docs/specs/leaderboards.md §7). A run starts with startSession when the game
// reports GHA_SESSION_START and ends with finishSession on GHA_END. sessions/{id} is written by
// these functions only; the client holds the session id and a random token.

/**
 * App Check is verified by the callable runtime whenever the client sends a token; this switch
 * decides whether calls without a valid token are refused. Keep it false until the web app ships
 * the App Check provider and the console shows nearly all sessions verified
 * (docs/setup/phase-2.md), then flip it in a commit.
 */
export const APP_CHECK_ENFORCED = false;

/** Sessions a player may start per game per hour. */
export const SESSIONS_PER_HOUR = 60;
/** A session older than this can no longer be finished. */
const SESSION_MAX_AGE_MS = 6 * 60 * 60 * 1000;
/** Allowed difference between the run length the client measured and the server's clock. */
const DURATION_TOLERANCE = 0.1;
const DURATION_SLACK_MS = 3000;
/** A score this many times the all-time #1 is held for review once the board is established. */
const OUTLIER_FACTOR = 3;
const OUTLIER_MIN_PLAYERS = 10;

const hash = (token: string) => createHash('sha256').update(token).digest();

function signedInPlayer(request: CallableRequest<unknown>) {
  const caller = request.auth;
  if (!caller) throw fail('unauthenticated', 'signed-out');
  if (caller.token.banned === true) throw fail('permission-denied', 'banned');
  if (APP_CHECK_ENFORCED && !request.app) throw fail('failed-precondition', 'app-check');
  return caller;
}

/** startSession({ gameId }) → { sessionId, token } */
export async function startSession(request: CallableRequest<unknown>) {
  const caller = signedInPlayer(request);
  const data = request.data as { gameId?: unknown } | null;
  const gameId = typeof data?.gameId === 'string' ? data.gameId : '';
  const game = leaderboardGame(gameId);
  if (!game) throw fail('not-found', 'unknown-game');

  const now = Date.now();
  const recent = await db()
    .collection('sessions')
    .where('uid', '==', caller.uid)
    .where('gameId', '==', gameId)
    .where('startedAt', '>', Timestamp.fromMillis(now - 60 * 60 * 1000))
    .count()
    .get();
  if (recent.data().count >= SESSIONS_PER_HOUR) throw fail('resource-exhausted', 'rate-limited');

  const token = randomBytes(24).toString('base64url');
  const ref = db().collection('sessions').doc();
  await ref.set({
    uid: caller.uid,
    gameId,
    tokenHash: hash(token).toString('hex'),
    status: 'open',
    startedAt: Timestamp.fromMillis(now),
    // Share of sessions that carry a verified App Check token, watched before enforcing.
    appCheck: request.app !== undefined,
  });
  return { sessionId: ref.id, token };
}

export type FinishResult =
  | { status: 'rejected'; reason: string }
  | { status: 'flagged' }
  | {
      status: 'recorded';
      boards: Record<
        'season' | 'all',
        { improved: boolean; best: number; rank: number; previousRank: number | null }
      >;
    };

type Verdict = { reject: string | null; flags: string[] };

/**
 * Checks a finished run against the game's limits. Impossible results are rejected; suspicious
 * ones are flagged for review. During a game's calibration window the speed and maximum limits
 * flag instead of reject, so the limits can be tuned on real play.
 */
export function judgeRun(options: {
  game: LeaderboardGame;
  score: number;
  clientMs: number;
  serverMs: number;
  allTimeBest: number | null;
  allTimePlayers: number;
  now: number;
}): Verdict {
  const { game, score, clientMs, serverMs, allTimeBest, allTimePlayers, now } = options;
  const { scoring } = game;
  const calibrating = now < game.calibrationEndsAt;
  const flags: string[] = [];
  const limit = (reason: string): Verdict | null => {
    if (calibrating) {
      flags.push(reason);
      return null;
    }
    return { reject: reason, flags };
  };

  if (serverMs < scoring.minDurationMs) return { reject: 'too-short', flags };
  if (score > scoring.maxScore) {
    const verdict = limit('max-score');
    if (verdict) return verdict;
  }
  if (score / Math.max(serverMs / 1000, 1) > scoring.maxPerSecond) {
    const verdict = limit('too-fast');
    if (verdict) return verdict;
  }
  if (Math.abs(clientMs - serverMs) > serverMs * DURATION_TOLERANCE + DURATION_SLACK_MS) {
    flags.push('duration-mismatch');
  }
  if (allTimeBest !== null && allTimePlayers >= OUTLIER_MIN_PLAYERS) {
    const outlier =
      scoring.order === 'desc'
        ? score > allTimeBest * OUTLIER_FACTOR
        : score < allTimeBest / OUTLIER_FACTOR;
    if (outlier) flags.push('outlier');
  }
  return { reject: null, flags };
}

/** finishSession({ sessionId, token, score, durationMs, continues }) → FinishResult */
export async function finishSession(request: CallableRequest<unknown>): Promise<FinishResult> {
  const caller = signedInPlayer(request);
  const data = (request.data ?? {}) as Record<string, unknown>;
  const { sessionId, token, score, durationMs } = data;
  const continues = data.continues ?? 0;
  if (typeof sessionId !== 'string' || !/^[A-Za-z0-9]{1,40}$/.test(sessionId)) {
    throw fail('invalid-argument', 'session');
  }
  if (typeof token !== 'string' || token.length > 64) throw fail('invalid-argument', 'token');
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0) {
    throw fail('invalid-argument', 'score');
  }
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs < 0) {
    throw fail('invalid-argument', 'duration');
  }
  if (continues !== 0 && continues !== 1) throw fail('invalid-argument', 'continues');

  const now = Date.now();
  const sessionRef = db().doc(`sessions/${sessionId}`);
  // Claim the session atomically so one run can never be finished twice.
  const session = await db().runTransaction(async (tx) => {
    const snapshot = await tx.get(sessionRef);
    if (!snapshot.exists) throw fail('not-found', 'no-session');
    if (snapshot.get('uid') !== caller.uid) throw fail('permission-denied', 'not-yours');
    if (snapshot.get('status') !== 'open') throw fail('failed-precondition', 'closed');
    const expected = Buffer.from(snapshot.get('tokenHash') as string, 'hex');
    if (!timingSafeEqual(hash(token), expected)) throw fail('permission-denied', 'bad-token');
    tx.update(sessionRef, { status: 'finishing', finishedAt: Timestamp.fromMillis(now) });
    return snapshot.data()!;
  });

  const serverMs = now - (session.startedAt as Timestamp).toMillis();
  const game = leaderboardGame(session.gameId as string);
  const close = (fields: Record<string, unknown>) =>
    sessionRef.update({ score, durationMs, serverDurationMs: serverMs, continues, ...fields });

  if (!game) {
    await close({ status: 'rejected', reason: 'unknown-game' });
    return { status: 'rejected', reason: 'unknown-game' };
  }
  if (serverMs > SESSION_MAX_AGE_MS) {
    await close({ status: 'rejected', reason: 'expired' });
    return { status: 'rejected', reason: 'expired' };
  }

  const allTime = await boardRef(game.gameId, 'all').get();
  const top = (allTime.get('top') as { score: number }[] | undefined) ?? [];
  const verdict = judgeRun({
    game,
    score,
    clientMs: durationMs,
    serverMs,
    allTimeBest: top[0]?.score ?? null,
    allTimePlayers: top.length,
    now,
  });

  if (verdict.reject) {
    await close({ status: 'rejected', reason: verdict.reject, flags: verdict.flags });
    return { status: 'rejected', reason: verdict.reject };
  }
  if (verdict.flags.length > 0) {
    const profile = await db().doc(`users/${caller.uid}`).get();
    await db()
      .doc(`scoreFlags/${sessionId}`)
      .set({
        uid: caller.uid,
        ...playerCard(profile.data()),
        gameId: game.gameId,
        score,
        durationMs,
        serverDurationMs: serverMs,
        continued: continues > 0,
        reasons: verdict.flags,
        status: 'pending',
        achievedAt: Timestamp.fromMillis(now),
        createdAt: FieldValue.serverTimestamp(),
      });
    await close({ status: 'flagged', flags: verdict.flags });
    logger.warn('Score flagged for review', {
      sessionId,
      gameId: game.gameId,
      flags: verdict.flags,
    });
    return { status: 'flagged' };
  }

  const outcomes = await applyScore({
    game,
    uid: caller.uid,
    score,
    continued: continues > 0,
    sessionId,
    now,
  });
  await close({ status: 'finished', improved: outcomes.some((o) => o.improved) });
  return { status: 'recorded', boards: await describeBoards(game, outcomes, score, now) };
}

async function describeBoards(
  game: LeaderboardGame,
  outcomes: Awaited<ReturnType<typeof applyScore>>,
  score: number,
  now: number,
) {
  const order = game.scoring.order;
  const described = await Promise.all(
    outcomes.map(async (outcome) => {
      const rank = await rankOf(
        game.gameId,
        outcome.board,
        order,
        outcome.best,
        outcome.achievedAt,
        now,
      );
      // The player's new entry now sits above their old score, so the old rank counts it once.
      const previousRank =
        outcome.improved &&
        outcome.previous !== null &&
        isBetterScore(score, outcome.previous, order)
          ? (await rankOf(game.gameId, outcome.board, order, outcome.previous, now, now)) - 1
          : null;
      return [
        outcome.board,
        { improved: outcome.improved, best: outcome.best, rank, previousRank },
      ] as const;
    }),
  );
  return Object.fromEntries(described) as Extract<FinishResult, { status: 'recorded' }>['boards'];
}
