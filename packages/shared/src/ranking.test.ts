import { describe, expect, it } from 'vitest';
import {
  computeScores,
  likePercent,
  todayScore,
  wilson,
  type EngagementInput,
  type TodayInput,
} from './ranking';

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

describe('todayScore', () => {
  const at = (time: string) => Date.parse(`2026-11-09T${time}Z`);
  const runs = (overrides: Partial<TodayInput> = {}): TodayInput => ({
    finishedToday: 0,
    finishedYesterday: 0,
    likes: 0,
    dislikes: 0,
    ...overrides,
  });

  it('counts the last 24 hours: today plus the share of yesterday still in the window', () => {
    // No votes: weight 0.75.
    expect(todayScore(runs({ finishedToday: 10, finishedYesterday: 40 }), at('00:00:00'))).toBe(
      (10 + 40) * 0.75,
    );
    expect(todayScore(runs({ finishedToday: 10, finishedYesterday: 40 }), at('06:00:00'))).toBe(
      (10 + 30) * 0.75,
    );
    expect(todayScore(runs({ finishedToday: 10, finishedYesterday: 40 }), at('18:00:00'))).toBe(
      (10 + 10) * 0.75,
    );
    expect(
      todayScore(runs({ finishedToday: 10, finishedYesterday: 40 }), at('23:59:59.999')),
    ).toBeCloseTo(10 * 0.75, 3);
  });

  it('is 0 without runs in the window, whatever the votes', () => {
    expect(todayScore(runs({ likes: 50 }), at('12:00:00'))).toBe(0);
    expect(todayScore(runs({ finishedYesterday: 5 }), at('23:59:59.999'))).toBeCloseTo(0, 3);
  });

  it('weights plays lightly by votes', () => {
    const now = at('12:00:00');
    const liked = todayScore(runs({ finishedToday: 20, likes: 30 }), now);
    const plain = todayScore(runs({ finishedToday: 20 }), now);
    const disliked = todayScore(runs({ finishedToday: 20, dislikes: 30 }), now);
    expect(liked).toBeGreaterThan(plain);
    expect(plain).toBeGreaterThan(disliked);
    // Between half and all of the plays.
    expect(liked).toBeLessThanOrEqual(20);
    expect(disliked).toBeGreaterThanOrEqual(10);
    // Plays still decide: twice the runs beat a perfect rating.
    expect(todayScore(runs({ finishedToday: 40, dislikes: 30 }), now)).toBeGreaterThan(liked);
  });

  it('ignores missing or malformed counters', () => {
    const now = at('12:00:00');
    expect(todayScore(runs({ finishedToday: Number.NaN, finishedYesterday: -3 }), now)).toBe(0);
    expect(todayScore(runs({ finishedToday: 4, likes: -2, dislikes: Number.NaN }), now)).toBe(3);
  });
});
