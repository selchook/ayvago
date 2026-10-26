// Votes and catalog ranking shared by the Cloud Functions (which compute the scores) and the web
// app (which shows like percentages and orders shelves). Spec: docs/specs/voting.md.

export type VoteValue = 1 | -1;

/** Reasons a player can give with a dislike; labels are message keys `vote.reasons.<id>`. */
export const NEGATIVE_REASONS = [
  'bugs',
  'controls',
  'too_hard',
  'boring',
  'performance',
  'too_many_ads',
  'other',
] as const;
export type NegativeReason = (typeof NEGATIVE_REASONS)[number];

export const VOTE_COMMENT_MAX = 280;
/** Seconds a player must have played a game before voting on it. */
export const VOTE_MIN_PLAY_SECONDS = 60;
/** The like percentage is shown from this many votes; before that a game shows as new. */
export const LIKE_PERCENT_MIN_VOTES = 20;

/** Wilson score lower bound (95% confidence) of the like ratio; 0 without votes. */
export function wilson(likes: number, dislikes: number): number {
  const n = likes + dislikes;
  if (n <= 0) return 0;
  const z = 1.96;
  const p = likes / n;
  const z2 = z * z;
  return (p + z2 / (2 * n) - z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
}

/** Rounded like percentage, or null below LIKE_PERCENT_MIN_VOTES votes. */
export function likePercent(likes: number, dislikes: number): number | null {
  const n = likes + dislikes;
  return n >= LIKE_PERCENT_MIN_VOTES ? Math.round((likes / n) * 100) : null;
}

/** Engagement inputs per game, from the last 10 days of score sessions. */
export type EngagementInput = {
  gameId: string;
  likes: number;
  dislikes: number;
  /** Runs finished in the last 7 days. */
  plays7d: number;
  /** Mean run length in seconds over the last 7 days (median needs per-run data). */
  avgSessionSeconds: number;
  /** Finished runs / started runs over the last 7 days. */
  completionRate: number;
  /** Runs finished in the last 3 days, and in the 7 days before those. */
  plays3d: number;
  playsPrev7d: number;
  /** Launched within NEW_GAME_DAYS. */
  isNew: boolean;
};

export type GameScores = {
  wilson: number;
  engagement: number;
  qualityScore: number;
  trendScore: number;
};

export const NEW_GAME_DAYS = 14;
const NEW_GAME_BOOST = 1.25;
const MAX_GROWTH = 3;

// Spec §4.2 weights. Day-1 return (0.25) is not measured yet, so the others are rescaled.
const ENGAGEMENT_WEIGHTS = { session: 0.35, plays: 0.25, completion: 0.15 };
const QUALITY_WEIGHTS = { wilson: 0.4, engagement: 0.6 };

/** Percentile (0–1) of each value within the list; ties share the middle rank. */
function percentiles(values: number[]): number[] {
  if (values.length <= 1) return values.map(() => 0.5);
  return values.map((value) => {
    const below = values.filter((other) => other < value).length;
    const equal = values.filter((other) => other === value).length - 1;
    return (below + equal / 2) / (values.length - 1);
  });
}

/** Ranking scores for the whole catalog at once (engagement is relative to the other games). */
export function computeScores(games: EngagementInput[]): Map<string, GameScores> {
  const session = percentiles(games.map((g) => g.avgSessionSeconds));
  const plays = percentiles(games.map((g) => g.plays7d));
  const completion = percentiles(games.map((g) => g.completionRate));
  const weightSum =
    ENGAGEMENT_WEIGHTS.session + ENGAGEMENT_WEIGHTS.plays + ENGAGEMENT_WEIGHTS.completion;

  return new Map(
    games.map((game, i) => {
      // A game nobody has played yet has no engagement to compare.
      const engagement =
        game.plays7d === 0
          ? 0
          : (ENGAGEMENT_WEIGHTS.session * session[i]! +
              ENGAGEMENT_WEIGHTS.plays * plays[i]! +
              ENGAGEMENT_WEIGHTS.completion * completion[i]!) /
            weightSum;
      const rating = wilson(game.likes, game.dislikes);
      const qualityScore =
        QUALITY_WEIGHTS.wilson * rating + QUALITY_WEIGHTS.engagement * engagement;
      const baseline = game.playsPrev7d / 7;
      const growth =
        baseline > 0 ? Math.min(MAX_GROWTH, game.plays3d / 3 / baseline) : game.plays3d > 0 ? 1 : 0;
      const trendScore = qualityScore * growth * (game.isNew ? NEW_GAME_BOOST : 1);
      return [game.gameId, { wilson: rating, engagement, qualityScore, trendScore }];
    }),
  );
}

/** One document with every game's public numbers, so shelves and tiles cost a single read. */
export type CatalogRankings = {
  games: Record<
    string,
    { likes: number; dislikes: number; qualityScore: number; trendScore: number }
  >;
};
