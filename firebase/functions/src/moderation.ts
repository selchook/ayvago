import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { seasonKey, type BoardKey } from '../../../packages/shared/src/leaderboard';
import { auth, db } from './admin';
import { fail } from './errors';
import { requireAdmin } from './roles';
import { leaderboardGame } from './games';
import { applyScore, syncPlayerRows } from './leaderboards';
import { removeVotes } from './votes';

// Admin panel v1 (docs/plan/phase-2.md §2.3). Admins carry the `admin` custom claim, granted
// with the "Grant admin role" workflow. Reading the review queues happens directly in Firestore
// under admin-only rules; every change goes through these callables.

type FlagAction = 'approve' | 'reject' | 'ban';

/**
 * reviewScoreFlag({ sessionId, action }): decides a flagged score.
 * - approve: the score goes on the all-time board, and on the weekly board when it was reached
 *   in the current season; it keeps its original time.
 * - reject: the score is dropped.
 * - ban: the player is banned (see setBan) and all their pending flags are rejected.
 */
export async function reviewScoreFlag(request: CallableRequest<unknown>) {
  const admin = requireAdmin(request);
  const data = (request.data ?? {}) as { sessionId?: unknown; action?: unknown };
  const sessionId = typeof data.sessionId === 'string' ? data.sessionId : '';
  const action = data.action as FlagAction;
  if (!['approve', 'reject', 'ban'].includes(action)) throw fail('invalid-argument', 'action');
  const flagRef = db().doc(`scoreFlags/${sessionId}`);
  const flag = sessionId ? await flagRef.get() : null;
  if (!flag?.exists) throw fail('not-found', 'no-flag');
  if (flag.get('status') !== 'pending') throw fail('failed-precondition', 'already-reviewed');

  const uid = flag.get('uid') as string;
  const now = Date.now();
  const review = { reviewedBy: admin.uid, reviewedAt: FieldValue.serverTimestamp() };

  if (action === 'approve') {
    const game = leaderboardGame(flag.get('gameId') as string);
    const player = await db().doc(`users/${uid}`).get();
    if (!game || !player.exists) {
      await flagRef.update({ status: 'rejected', note: 'player-or-game-gone', ...review });
      return { status: 'rejected' };
    }
    const achievedAt = (flag.get('achievedAt') as Timestamp).toMillis();
    const boards: BoardKey[] =
      seasonKey(achievedAt) === seasonKey(now) ? ['season', 'all'] : ['all'];
    await applyScore({
      game,
      uid,
      score: flag.get('score') as number,
      continued: flag.get('continued') === true,
      sessionId,
      now,
      achievedAt,
      boards,
    });
    await flagRef.update({ status: 'approved', ...review });
    return { status: 'approved' };
  }

  if (action === 'ban') {
    await setBan(uid, true, admin.uid);
    return { status: 'banned' };
  }
  await flagRef.update({ status: 'rejected', ...review });
  return { status: 'rejected' };
}

/**
 * Bans or unbans a player. A ban sets the `banned` claim (rules refuse their writes, functions
 * refuse their calls), signs them out everywhere, removes their leaderboard rows, votes and play
 * stats, and rejects their pending flags. Unbanning only lifts the claim. Admins cannot be banned.
 */
export async function setBan(uid: string, banned: boolean, by: string) {
  const user = await auth()
    .getUser(uid)
    .catch(() => null);
  if (!user) throw fail('not-found', 'no-player');
  const claims = { ...(user.customClaims ?? {}) };
  if (claims.admin === true) throw fail('failed-precondition', 'admin-target');
  if (banned) claims.banned = true;
  else delete claims.banned;
  await auth().setCustomUserClaims(uid, claims);

  const profile = db().doc(`users/${uid}`);
  if ((await profile.get()).exists) {
    await profile.update(
      banned
        ? { banned: true, bannedAt: FieldValue.serverTimestamp(), bannedBy: by }
        : {
            banned: FieldValue.delete(),
            bannedAt: FieldValue.delete(),
            bannedBy: FieldValue.delete(),
          },
    );
  }
  if (!banned) {
    logger.info('Player unbanned', { uid, by });
    return;
  }
  await auth().revokeRefreshTokens(uid);
  await syncPlayerRows(uid, null);
  await removeVotes(uid);
  const pending = await db()
    .collection('scoreFlags')
    .where('uid', '==', uid)
    .where('status', '==', 'pending')
    .get();
  const batch = db().batch();
  pending.docs.forEach((doc) =>
    batch.update(doc.ref, {
      status: 'banned',
      reviewedBy: by,
      reviewedAt: FieldValue.serverTimestamp(),
    }),
  );
  await batch.commit();
  logger.warn('Player banned', { uid, by, flags: pending.size });
}

/** setPlayerBan({ uid, banned }) */
export async function setPlayerBan(request: CallableRequest<unknown>) {
  const admin = requireAdmin(request);
  const data = (request.data ?? {}) as { uid?: unknown; banned?: unknown };
  if (typeof data.uid !== 'string' || typeof data.banned !== 'boolean') {
    throw fail('invalid-argument', 'player');
  }
  if (data.uid === admin.uid) throw fail('failed-precondition', 'admin-target');
  await setBan(data.uid, data.banned, admin.uid);
  return { banned: data.banned };
}
