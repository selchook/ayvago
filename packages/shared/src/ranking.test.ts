import { describe, expect, it } from 'vitest';
import { computeScores, likePercent, wilson, type EngagementInput } from './ranking';

const game = (gameId: string, overrides: Partial<EngagementInput> = {}): EngagementInput => ({
  gameId,
  likes: 0,
  dislikes: 0,
  plays7d: 100,
  avgSessionSeconds: 120,
  completionRate: 0.8,
  plays3d: 40,
  playsPrev7d: 70,
  isNew: false,
  ...overrides,
});

describe('wilson', () => {
  it('ranks 3 likes and no dislikes below 950 likes and 50 dislikes', () => {
    expect(wilson(3, 0)).toBeLessThan(wilson(950, 50));
    expect(wilson(0, 0)).toBe(0);
    expect(wilson(950, 50)).toBeCloseTo(0.9347, 4);
  });

  it('shows the like percentage only from 20 votes', () => {
    expect(likePercent(18, 1)).toBeNull();
    expect(likePercent(18, 2)).toBe(90);
  });
});

describe('computeScores', () => {
  it('rewards engagement relative to the catalog', () => {
    const scores = computeScores([
      game('long', { avgSessionSeconds: 600 }),
      game('short', { avgSessionSeconds: 30 }),
    ]);
    expect(scores.get('long')!.engagement).toBeGreaterThan(scores.get('short')!.engagement);
  });

  it('gives unplayed games no engagement and growth only to rising games', () => {
    const scores = computeScores([
      game('idle', { plays7d: 0, plays3d: 0, playsPrev7d: 0 }),
      game('steady'),
      game('rising', { plays3d: 300 }),
    ]);
    expect(scores.get('idle')).toMatchObject({ engagement: 0, trendScore: 0 });
    expect(scores.get('rising')!.trendScore).toBeGreaterThan(scores.get('steady')!.trendScore);
  });

  it('boosts new games in the trend score', () => {
    const scores = computeScores([game('old'), game('fresh', { isNew: true })]);
    expect(scores.get('fresh')!.trendScore).toBeCloseTo(scores.get('old')!.trendScore * 1.25);
  });
});
