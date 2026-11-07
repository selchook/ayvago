import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bestForStart,
  entryScore,
  isPersonalBest,
  START_BEST_TIMEOUT_MS,
  type StartBestSources,
} from './best';

const sources = (overrides: Partial<StartBestSources> = {}): StartBestSources => ({
  enabled: () => true,
  uid: () => Promise.resolve('u1'),
  read: () => Promise.resolve(4200),
  ...overrides,
});

afterEach(() => {
  vi.useRealTimers();
});

describe('entryScore', () => {
  it('reads the score of an all-time entry', () => {
    expect(entryScore({ score: 4200, periodKey: 'all' })).toBe(4200);
    expect(entryScore({ score: 0, periodKey: 'all' })).toBe(0);
  });

  it('is null without a usable entry', () => {
    for (const data of [undefined, null, {}, { score: '12' }, { score: Number.NaN }]) {
      expect(entryScore(data), JSON.stringify(data)).toBeNull();
    }
    expect(entryScore({ score: 10, periodKey: '2026-W45' })).toBeNull();
  });
});

describe('bestForStart (GHA_START best, protocol 2.4)', () => {
  it("sends the player's stored best", async () => {
    await expect(bestForStart(sources())).resolves.toBe(4200);
  });

  it('sends null when the player has no score or nobody is signed in yet', async () => {
    await expect(bestForStart(sources({ read: async () => null }))).resolves.toBeNull();
    const read = vi.fn(async () => 1);
    await expect(bestForStart(sources({ uid: async () => null, read }))).resolves.toBeNull();
    expect(read).not.toHaveBeenCalled();
  });

  it('leaves best unknown when Firebase is off or the read fails', async () => {
    const uid = vi.fn(async () => 'u1');
    await expect(bestForStart(sources({ enabled: () => false, uid }))).resolves.toBeUndefined();
    expect(uid).not.toHaveBeenCalled();
    await expect(
      bestForStart(sources({ read: () => Promise.reject(new Error('offline')) })),
    ).resolves.toBeUndefined();
    await expect(
      bestForStart(sources({ uid: () => Promise.reject(new Error('no auth')) })),
    ).resolves.toBeUndefined();
  });

  it('never holds the game longer than the timeout', async () => {
    vi.useFakeTimers();
    const pending = bestForStart(sources({ read: () => new Promise(() => {}) }));
    await vi.advanceTimersByTimeAsync(START_BEST_TIMEOUT_MS);
    await expect(pending).resolves.toBeUndefined();
    expect(START_BEST_TIMEOUT_MS).toBeLessThanOrEqual(1500);
  });
});

describe('isPersonalBest', () => {
  const board = { best: 500, rank: 3 };

  it('marks a run that beat an earlier best', () => {
    expect(isPersonalBest({ ...board, improved: true, previous: 400, previousRank: 5 })).toBe(true);
  });

  it('does not mark a first score or a run below the best', () => {
    expect(isPersonalBest({ ...board, improved: true, previous: null, previousRank: null })).toBe(
      false,
    );
    expect(isPersonalBest({ ...board, improved: false, previous: 900, previousRank: null })).toBe(
      false,
    );
  });

  it('falls back to the previous rank for servers that do not send previous', () => {
    expect(isPersonalBest({ ...board, improved: true, previousRank: 5 })).toBe(true);
    expect(isPersonalBest({ ...board, improved: true, previousRank: null })).toBe(false);
  });
});
