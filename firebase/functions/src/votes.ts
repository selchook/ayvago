import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { containsOffensiveWord } from '../../../packages/shared/src/profile';
import {
  NEGATIVE_REASONS,
  VOTE_COMMENT_MAX,
  VOTE_MIN_PLAY_SECONDS,
  likePercent,
  wilson,
  type NegativeReason,
} from '../../../packages/shared/src/ranking';
import { db } from './admin';
import { requirePlayer } from './appcheck';
import { fail } from './errors';
import { leaderboardGame, leaderboardGames } from './games';
import { dayKey, statsRef } from './stats';

// Votes (docs/specs/voting.md). Written through castVote only, so eligibility, the rate limit
// and the counters stay consistent without a Firestore trigger:
//   games/{gameId}                   { likes, dislikes, likePercent, wilson, votesUpdatedAt }
//   games/{gameId}/votes/{uid}       { value, reasons, comment?, updatedAt }   owner can read
//   games/{gameId}/feedback/{day}    { count, reasons: { <reason>: n } }      admins
//   voteRate/{uid}                   { windowStart, changes }

/** Vote changes a player may make per hour across all games. */
export const VOTE_CHANGES_PER_HOUR = 30;
const HOUR_MS = 60 * 60 * 1000;

const gameRef = (gameId: string) => db().doc(`games/${gameId}`);
const voteRef = (gameId: string, uid: string) => db().doc(`games/${gameId}/votes/${uid}`);

type Vote = { value: 1 | -1; reasons?: NegativeReason[]; comment?: string };

function counters(likes: number, dislikes: number) {
  return {
    likes,
    dislikes,
    likePercent: likePercent(likes, dislikes),
    wilson: wilson(likes, dislikes),
    votesUpdatedAt: FieldValue.serverTimestamp(),
  };
}

/**
 * castVote({ gameId, value, reasons?, comment? }) → { value, likes, dislikes }
 * value 1 likes, -1 dislikes, 0 removes the vote. Reasons and the comment go with a dislike and
 * may be sent again without changing the value (the feedback sheet after 👎).
 */
export async function castVote(request: CallableRequest<unknown>) {
  const caller = await requirePlayer(request);
  const data = (request.data ?? {}) as Record<string, unknown>;
  const gameId = typeof data.gameId === 'string' ? data.gameId : '';
  if (!leaderboardGame(gameId)) throw fail('not-found', 'unknown-game');
  const value = data.value;
  if (value !== 1 && value !== -1 && value !== 0) throw fail('invalid-argument', 'value');
  const reasons = data.reasons ?? [];
  if (
    !Array.isArray(reasons) ||
    reasons.length > NEGATIVE_REASONS.length ||
    !reasons.every((r) => (NEGATIVE_REASONS as readonly unknown[]).includes(r)) ||
    (reasons.length > 0 && value !== -1)
  ) {
    throw fail('invalid-argument', 'reasons');
  }
  const comment = typeof data.comment === 'string' ? data.comment.trim() : '';
  if (comment.length > VOTE_COMMENT_MAX || (comment && value !== -1)) {
    throw fail('invalid-argument', 'comment');
  }
  if (containsOffensiveWord(comment)) throw fail('invalid-argument', 'offensive');

  const stats = await statsRef(caller.uid, gameId).get();
  const played = (stats.get('playSeconds') as number | undefined) ?? 0;
  if (played < VOTE_MIN_PLAY_SECONDS) {
    throw fail('failed-precondition', 'not-eligible', { needed: VOTE_MIN_PLAY_SECONDS - played });
  }

  const now = Date.now();
  const rateRef = db().doc(`voteRate/${caller.uid}`);
  return db().runTransaction(async (tx) => {
    const [vote, game, rate] = await Promise.all([
      tx.get(voteRef(gameId, caller.uid)),
      tx.get(gameRef(gameId)),
      tx.get(rateRef),
    ]);
    const previous = (vote.get('value') as 1 | -1 | undefined) ?? 0;
    let likes = (game.get('likes') as number | undefined) ?? 0;
    let dislikes = (game.get('dislikes') as number | undefined) ?? 0;

    if (value !== previous) {
      const windowStart = (rate.get('windowStart') as Timestamp | undefined)?.toMillis() ?? 0;
      const fresh = now - windowStart > HOUR_MS;
      const changes = fresh ? 0 : ((rate.get('changes') as number | undefined) ?? 0);
      if (changes >= VOTE_CHANGES_PER_HOUR) throw fail('resource-exhausted', 'rate-limited');
      tx.set(rateRef, {
        windowStart: fresh ? Timestamp.fromMillis(now) : rate.get('windowStart'),
        changes: changes + 1,
      });
      if (previous === 1) likes--;
      if (previous === -1) dislikes--;
      if (value === 1) likes++;
      if (value === -1) dislikes++;
      tx.set(gameRef(gameId), counters(likes, dislikes), { merge: true });
    }

    if (value === 0) {
      if (vote.exists) tx.delete(vote.ref);
    } else {
      const next: Vote & { updatedAt: FieldValue } = {
        value,
        reasons: value === -1 ? (reasons as NegativeReason[]) : [],
        updatedAt: FieldValue.serverTimestamp(),
        ...(comment ? { comment } : {}),
      };
      tx.set(vote.ref, next);
    }

    if (reasons.length > 0 || comment) {
      tx.set(
        db().doc(`games/${gameId}/feedback/${dayKey(now)}`),
        {
          count: FieldValue.increment(1),
          comments: FieldValue.increment(comment ? 1 : 0),
          reasons: Object.fromEntries(
            (reasons as string[]).map((reason) => [reason, FieldValue.increment(1)]),
          ),
        },
        { merge: true },
      );
    }
    return { value, likes, dislikes };
  });
}

/**
 * Removes the player's votes (counters adjusted) and play stats: account deletion and guest
 * cleanup. With `moveTo`, a guest's votes and play time move to the account instead, unless the
 * account already voted on that game.
 */
export async function removeVotes(uid: string, moveTo?: string) {
  for (const { gameId } of leaderboardGames()) {
    await db().runTransaction(async (tx) => {
      const [vote, stats] = await Promise.all([
        tx.get(voteRef(gameId, uid)),
        tx.get(statsRef(uid, gameId)),
      ]);
      const target = moveTo ? await tx.get(voteRef(gameId, moveTo)) : null;
      const game = vote.exists ? await tx.get(gameRef(gameId)) : null;

      if (moveTo && stats.exists) {
        tx.set(
          statsRef(moveTo, gameId),
          {
            plays: FieldValue.increment((stats.get('plays') as number) ?? 0),
            playSeconds: FieldValue.increment((stats.get('playSeconds') as number) ?? 0),
            lastPlayedAt: stats.get('lastPlayedAt'),
          },
          { merge: true },
        );
      }
      if (stats.exists) tx.delete(stats.ref);
      if (!vote.exists) return;

      if (target && !target.exists) {
        tx.set(target.ref, vote.data()!);
      } else {
        let likes = (game!.get('likes') as number | undefined) ?? 0;
        let dislikes = (game!.get('dislikes') as number | undefined) ?? 0;
        if (vote.get('value') === 1) likes = Math.max(0, likes - 1);
        else dislikes = Math.max(0, dislikes - 1);
        tx.set(gameRef(gameId), counters(likes, dislikes), { merge: true });
      }
      tx.delete(vote.ref);
    });
  }
  await db().doc(`voteRate/${uid}`).delete();
}
