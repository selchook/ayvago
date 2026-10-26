import { FieldValue } from 'firebase-admin/firestore';
import {
  NEW_GAME_DAYS,
  computeScores,
  type CatalogRankings,
  type EngagementInput,
} from '../../../packages/shared/src/ranking';
import { FIXTURE_GAME, SEED_GAMES } from '../../../packages/shared/src/seed-catalog';
import { db } from './admin';
import { leaderboardGames } from './games';
import { dayKey } from './stats';

const DAY_MS = 24 * 60 * 60 * 1000;

type Daily = { started?: number; finished?: number; playSeconds?: number };

function addedAt(gameId: string): number {
  const seed = [FIXTURE_GAME, ...SEED_GAMES].find((game) => game.manifest.id === gameId);
  return seed ? Date.parse(seed.addedAt) : 0;
}

/**
 * Recomputes the ranking scores of every live game from its votes and the last 10 days of play
 * (docs/specs/voting.md §4) and writes them to games/{gameId} and to rankings/catalog, the single
 * document the web app reads for shelves and like percentages. Returns the number of games.
 */
export async function recomputeGameScores(now = Date.now()): Promise<number> {
  const games = leaderboardGames();
  const days = Array.from({ length: 10 }, (_, i) => dayKey(now - i * DAY_MS));
  const inputs: EngagementInput[] = await Promise.all(
    games.map(async ({ gameId }) => {
      const [game, ...daily] = await db().getAll(
        db().doc(`games/${gameId}`),
        ...days.map((day) => db().doc(`games/${gameId}/daily/${day}`)),
      );
      const values = daily.map((doc) => (doc!.data() ?? {}) as Daily);
      const sum = (from: number, to: number, key: keyof Daily) =>
        values.slice(from, to).reduce((total, day) => total + (day[key] ?? 0), 0);
      const plays7d = sum(0, 7, 'finished');
      const started7d = sum(0, 7, 'started');
      return {
        gameId,
        likes: (game!.get('likes') as number | undefined) ?? 0,
        dislikes: (game!.get('dislikes') as number | undefined) ?? 0,
        plays7d,
        avgSessionSeconds: plays7d > 0 ? sum(0, 7, 'playSeconds') / plays7d : 0,
        completionRate: started7d > 0 ? Math.min(1, plays7d / started7d) : 0,
        plays3d: sum(0, 3, 'finished'),
        playsPrev7d: sum(3, 10, 'finished'),
        isNew: now - addedAt(gameId) < NEW_GAME_DAYS * DAY_MS,
      };
    }),
  );

  const scores = computeScores(inputs);
  const rankings: CatalogRankings = { games: {} };
  const batch = db().batch();
  for (const input of inputs) {
    const score = scores.get(input.gameId)!;
    batch.set(
      db().doc(`games/${input.gameId}`),
      { ...score, plays7d: input.plays7d, scoresUpdatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    rankings.games[input.gameId] = {
      likes: input.likes,
      dislikes: input.dislikes,
      qualityScore: score.qualityScore,
      trendScore: score.trendScore,
    };
  }
  batch.set(db().doc('rankings/catalog'), {
    ...rankings,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();
  return inputs.length;
}
