import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENT_IDS,
  ACHIEVEMENTS,
  achievementProgress,
  catalogCategories,
  meetsAchievement,
  newlyUnlocked,
} from './achievements';
import {
  applyRun,
  EMPTY_PROGRESS,
  levelForXp,
  levelProgress,
  MAX_LEVEL,
  MAX_TRACKED_GAMES,
  mergeProgress,
  readProgress,
  sessionXp,
  xpForLevel,
  XP_RULES,
  type ProgressSummary,
  type RunFacts,
} from './progress';
import { SEED_GAMES } from './seed-catalog';

const NOW = Date.parse('2026-11-07T12:00:00Z');
const CONTEXT = { categories: ['arcade', 'casual', 'puzzle'] };

const run = (overrides: Partial<RunFacts> = {}): RunFacts => ({
  gameId: 'orbsurge',
  categories: ['arcade'],
  seconds: 60,
  personalBest: false,
  weeklyPlaceBefore: null,
  weeklyPlace: null,
  now: NOW,
  ...overrides,
});

const summary = (overrides: Partial<ProgressSummary> = {}): ProgressSummary => ({
  ...EMPTY_PROGRESS,
  ...overrides,
});

describe('levels', () => {
  it('cost 100·n XP from level n to n+1', () => {
    expect([1, 2, 3, 4, 5].map(xpForLevel)).toEqual([0, 100, 300, 600, 1000]);
    expect(xpForLevel(0)).toBe(0);
    expect(xpForLevel(200)).toBe(xpForLevel(MAX_LEVEL));
  });

  it('turns XP into a level at the exact thresholds', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(-5)).toBe(1);
    expect(levelForXp(Number.NaN)).toBe(1);
    expect(levelForXp(99)).toBe(1);
    expect(levelForXp(100)).toBe(2);
    expect(levelForXp(299)).toBe(2);
    expect(levelForXp(300)).toBe(3);
    expect(levelForXp(600)).toBe(4);
    for (let level = 1; level <= MAX_LEVEL; level++) {
      expect(levelForXp(xpForLevel(level))).toBe(level);
      if (level > 1) expect(levelForXp(xpForLevel(level) - 1)).toBe(level - 1);
    }
  });

  it('stops at level 99', () => {
    expect(levelForXp(1e12)).toBe(MAX_LEVEL);
    expect(levelProgress(1e12)).toMatchObject({ level: MAX_LEVEL, needed: 0 });
  });

  it('reports the progress to the next level', () => {
    expect(levelProgress(0)).toEqual({ level: 1, into: 0, needed: 100 });
    expect(levelProgress(150)).toEqual({ level: 2, into: 50, needed: 200 });
    expect(levelProgress(300)).toEqual({ level: 3, into: 0, needed: 300 });
  });
});

describe('sessionXp', () => {
  it('gives 10 XP for a run of at least 20 s', () => {
    expect(sessionXp(run({ seconds: 20 }), false)).toBe(10);
    expect(sessionXp(run({ seconds: 19 }), false)).toBe(0);
  });

  it('adds the first-play, personal-best and weekly top 10 bonuses', () => {
    expect(sessionXp(run(), true)).toBe(30);
    expect(sessionXp(run({ personalBest: true }), false)).toBe(35);
    expect(sessionXp(run({ weeklyPlace: 10 }), false)).toBe(60);
    expect(sessionXp(run({ weeklyPlace: 11 }), false)).toBe(10);
    // Entering only: already in the top 10 earns no second bonus.
    expect(sessionXp(run({ weeklyPlaceBefore: 7, weeklyPlace: 3 }), false)).toBe(10);
    expect(sessionXp(run({ weeklyPlaceBefore: 14, weeklyPlace: 3 }), false)).toBe(60);
    expect(sessionXp(run({ seconds: 5, personalBest: true, weeklyPlace: 1 }), true)).toBe(
      XP_RULES.firstPlay + XP_RULES.personalBest + XP_RULES.weeklyTop10,
    );
  });

  it('gives a practice run half the run XP and no bonuses', () => {
    expect(XP_RULES.practiceRun).toBe(XP_RULES.run / 2);
    expect(sessionXp(run({ practice: true }), false)).toBe(5);
    expect(sessionXp(run({ practice: true, seconds: 19 }), false)).toBe(0);
    expect(
      sessionXp(
        run({ practice: true, personalBest: true, weeklyPlaceBefore: 30, weeklyPlace: 1 }),
        true,
      ),
    ).toBe(5);
  });
});

describe('applyRun', () => {
  it('counts the first run and unlocks first-run', () => {
    const award = applyRun(EMPTY_PROGRESS, run(), CONTEXT);
    expect(award.unlocked).toEqual(['first-run']);
    expect(award.xpGained).toBe(30 + XP_RULES.achievement);
    expect(award.levelUp).toBe(false);
    expect(award.summary).toMatchObject({
      xp: 60,
      level: 1,
      runs: 1,
      games: ['orbsurge'],
      categories: ['arcade'],
      playSeconds: 60,
      xpDay: '2026-11-07',
      xpToday: 30,
      xpGameToday: { orbsurge: 30 },
      achievements: { 'first-run': NOW },
    });
  });

  it('caps session XP per game and per day, but not achievement XP', () => {
    let state = summary({ xpDay: '2026-11-07', xpToday: 590, xpGameToday: { other: 140 } });
    let award = applyRun(state, run({ personalBest: true }), CONTEXT);
    // 10 left today; first-run (+30) is outside the cap.
    expect(award.xpGained).toBe(10 + 30);
    expect(award.summary.xpToday).toBe(600);

    state = summary({
      xpDay: '2026-11-07',
      xpToday: 100,
      xpGameToday: { orbsurge: 145 },
      games: ['orbsurge'],
      runs: 3,
      achievements: { 'first-run': 1 },
    });
    award = applyRun(state, run({ personalBest: true }), CONTEXT);
    expect(award.xpGained).toBe(5);
    expect(award.summary.xpGameToday.orbsurge).toBe(150);
    award = applyRun(award.summary, run({ personalBest: true }), CONTEXT);
    expect(award.xpGained).toBe(0);
    // Another game still earns.
    expect(applyRun(award.summary, run({ gameId: 'chromashift' }), CONTEXT).xpGained).toBe(30);
  });

  it('resets the daily counters on a new UTC day', () => {
    const state = summary({
      xpDay: '2026-11-06',
      xpToday: 600,
      xpGameToday: { orbsurge: 150 },
      games: ['orbsurge'],
      runs: 1,
      achievements: { 'first-run': 1 },
    });
    const award = applyRun(state, run(), CONTEXT);
    expect(award.xpGained).toBe(10);
    expect(award.summary).toMatchObject({ xpToday: 10, xpGameToday: { orbsurge: 10 } });
  });

  it('reports a level up', () => {
    const state = summary({
      xp: 95,
      runs: 1,
      games: ['orbsurge'],
      achievements: { 'first-run': 1 },
    });
    const award = applyRun(state, run(), CONTEXT);
    expect(award).toMatchObject({ xpGained: 10, levelUp: true, summary: { xp: 105, level: 2 } });
  });

  it('records bests, the weekly top 10 and #1, and unlocks their achievements', () => {
    const state = summary({
      runs: 4,
      bests: 9,
      games: ['orbsurge'],
      achievements: { 'first-run': 1 },
    });
    const award = applyRun(
      state,
      run({ personalBest: true, weeklyPlaceBefore: 12, weeklyPlace: 1 }),
      CONTEXT,
    );
    expect(award.unlocked).toEqual(['best-10', 'top-10', 'champion']);
    expect(award.summary).toMatchObject({ bests: 10, top10: true, champion: true });
    expect(award.xpGained).toBe(10 + 25 + 50 + 3 * 30);
  });

  it('never unlocks an achievement twice and keeps the first unlock time', () => {
    const first = applyRun(EMPTY_PROGRESS, run(), CONTEXT).summary;
    const second = applyRun(first, run({ now: NOW + 1000 }), CONTEXT);
    expect(second.unlocked).toEqual([]);
    expect(second.summary.achievements['first-run']).toBe(NOW);
  });

  it('unlocks all-rounder once every catalog category was played', () => {
    let state = applyRun(
      EMPTY_PROGRESS,
      run({ categories: ['arcade', 'casual'] }),
      CONTEXT,
    ).summary;
    expect(state.achievements['all-rounder']).toBeUndefined();
    const award = applyRun(
      state,
      run({ gameId: 'sudoku', categories: ['puzzle', 'strategy'] }),
      CONTEXT,
    );
    expect(award.unlocked).toContain('all-rounder');
    state = award.summary;
    expect(state.categories).toEqual(['arcade', 'casual', 'puzzle', 'strategy']);
  });

  it('counts a practice run for runs, games, categories and play time only', () => {
    const award = applyRun(EMPTY_PROGRESS, run({ practice: true }), CONTEXT);
    // 5 XP for the run, no first-play bonus; first-run is unlocked (+30, outside the caps).
    expect(award.unlocked).toEqual(['first-run']);
    expect(award.xpGained).toBe(5 + XP_RULES.achievement);
    expect(award.summary).toMatchObject({
      xp: 35,
      runs: 1,
      games: ['orbsurge'],
      categories: ['arcade'],
      playSeconds: 60,
      bests: 0,
      top10: false,
      champion: false,
      xpToday: 5,
      xpGameToday: { orbsurge: 5 },
    });
  });

  it('never counts a practice run towards best-10, top-10 or champion', () => {
    const state = summary({
      runs: 4,
      bests: 9,
      games: ['orbsurge'],
      achievements: { 'first-run': 1 },
    });
    // A caller passing board facts for a practice run is ignored.
    const award = applyRun(
      state,
      run({ practice: true, personalBest: true, weeklyPlaceBefore: 12, weeklyPlace: 1 }),
      CONTEXT,
    );
    expect(award.unlocked).toEqual([]);
    expect(award.xpGained).toBe(5);
    expect(award.summary).toMatchObject({ bests: 9, top10: false, champion: false, runs: 5 });
  });

  it('applies the daily caps to practice runs too', () => {
    const state = summary({
      xpDay: '2026-11-07',
      xpToday: 100,
      xpGameToday: { orbsurge: 148 },
      games: ['orbsurge'],
      runs: 3,
      achievements: { 'first-run': 1 },
    });
    const award = applyRun(state, run({ practice: true }), CONTEXT);
    expect(award.xpGained).toBe(2);
    expect(applyRun(award.summary, run({ practice: true }), CONTEXT).xpGained).toBe(0);
    const capped = summary({ ...state, xpToday: 600, xpGameToday: {} });
    expect(applyRun(capped, run({ practice: true }), CONTEXT).xpGained).toBe(0);
  });

  it('stops remembering games at the cap', () => {
    const games = Array.from({ length: MAX_TRACKED_GAMES }, (_, i) => `g${i}`);
    const award = applyRun(summary({ games, runs: 1 }), run({ gameId: 'new' }), CONTEXT);
    expect(award.summary.games).toHaveLength(MAX_TRACKED_GAMES);
  });
});

describe('achievements', () => {
  it('has the 12 launch achievements, each with an icon and a group', () => {
    expect(ACHIEVEMENTS.map((a) => a.id)).toEqual([...ACHIEVEMENT_IDS]);
    expect(ACHIEVEMENTS).toHaveLength(12);
  });

  it('measures progress against the targets', () => {
    const state = summary({
      games: Array.from({ length: 12 }, (_, i) => `g${i}`),
      playSeconds: 754,
    });
    const explorer = ACHIEVEMENTS.find((a) => a.id === 'explorer-20')!;
    expect(achievementProgress(explorer, state, CONTEXT)).toEqual({
      value: 12,
      target: 20,
      unlockedAt: null,
    });
    const marathon = ACHIEVEMENTS.find((a) => a.id === 'marathon')!;
    expect(achievementProgress(marathon, state, CONTEXT).value).toBe(12);
    expect(meetsAchievement(marathon, summary({ playSeconds: 3600 }), CONTEXT)).toBe(true);
    expect(
      achievementProgress(explorer, summary({ games: Array.from({ length: 30 }, String) }), CONTEXT)
        .value,
    ).toBe(20);
  });

  it('unlocks nothing from an empty summary, and all-rounder never from an empty catalog', () => {
    expect(newlyUnlocked(EMPTY_PROGRESS, CONTEXT)).toEqual([]);
    expect(newlyUnlocked(summary({ categories: [] }), { categories: [] })).toEqual([]);
  });

  it('takes the all-rounder categories from the catalog', () => {
    const categories = catalogCategories(SEED_GAMES.map((game) => game.manifest));
    expect(categories.length).toBeGreaterThan(3);
    expect(categories).toContain('arcade');
    expect(
      catalogCategories([
        { category: 'puzzle', categories: ['puzzle', 'word'] },
        { category: 'arcade' },
      ]),
    ).toEqual(['arcade', 'puzzle', 'word']);
  });
});

describe('readProgress', () => {
  it('turns a stored document into a clean summary', () => {
    const stored = {
      xp: 350,
      level: 99,
      runs: 4,
      games: ['a', 'b', 'a', 7],
      categories: ['arcade'],
      bests: -2,
      playSeconds: 90.6,
      top10: true,
      champion: 'yes',
      achievements: { 'first-run': { toMillis: () => 1234 }, bad: 'x' },
      xpDay: '2026-11-07',
      xpToday: 40,
      xpGameToday: { a: 40 },
    };
    expect(readProgress(stored)).toEqual({
      xp: 350,
      level: 3,
      runs: 4,
      games: ['a', 'b'],
      categories: ['arcade'],
      bests: 0,
      playSeconds: 90,
      top10: true,
      champion: false,
      achievements: { 'first-run': 1234 },
      xpDay: '2026-11-07',
      xpToday: 40,
      xpGameToday: { a: 40 },
    });
    expect(readProgress(undefined)).toEqual(EMPTY_PROGRESS);
  });
});

describe('mergeProgress', () => {
  it('adds counters, joins sets, keeps the earliest unlocks and recomputes the level', () => {
    const account = summary({
      xp: 250,
      runs: 10,
      games: ['a', 'b'],
      categories: ['arcade'],
      bests: 2,
      playSeconds: 600,
      achievements: { 'first-run': 500, 'top-10': 900 },
      xpDay: '2026-11-07',
      xpToday: 40,
      xpGameToday: { a: 40 },
    });
    const guest = summary({
      xp: 100,
      runs: 3,
      games: ['b', 'c'],
      categories: ['puzzle'],
      bests: 1,
      playSeconds: 120,
      champion: true,
      achievements: { 'first-run': 100 },
      xpDay: '2026-11-07',
      xpToday: 30,
      xpGameToday: { a: 10, c: 20 },
    });
    expect(mergeProgress(account, guest)).toEqual({
      xp: 350,
      level: 3,
      runs: 13,
      games: ['a', 'b', 'c'],
      categories: ['arcade', 'puzzle'],
      bests: 3,
      playSeconds: 720,
      top10: false,
      champion: true,
      achievements: { 'first-run': 100, 'top-10': 900 },
      xpDay: '2026-11-07',
      xpToday: 70,
      xpGameToday: { a: 50, c: 20 },
    });
  });

  it("keeps only the later day's caps", () => {
    const merged = mergeProgress(
      summary({ xpDay: '2026-11-06', xpToday: 600, xpGameToday: { a: 150 } }),
      summary({ xpDay: '2026-11-07', xpToday: 20, xpGameToday: { b: 20 } }),
    );
    expect(merged).toMatchObject({ xpDay: '2026-11-07', xpToday: 20, xpGameToday: { b: 20 } });
    expect(mergeProgress(EMPTY_PROGRESS, EMPTY_PROGRESS)).toEqual(EMPTY_PROGRESS);
  });
});
