import { GAME_CATEGORIES, type GameCategory } from './categories';
import { gameCategories, type GameManifestInput } from './manifest';
import type { ProgressSummary } from './progress';

// Platform achievements (docs/adr/0016-achievements-and-xp.md). Each one is a target over the
// progress summary that finishSession keeps; the server unlocks them, the profile page shows
// them. Names and descriptions live in the web app's messages under achievements.<id>.name and
// achievements.<id>.desc. Unlocked achievements are permanent.

export const ACHIEVEMENT_IDS = [
  'first-run',
  'runs-25',
  'runs-100',
  'runs-500',
  'explorer-5',
  'explorer-20',
  'explorer-50',
  'all-rounder',
  'best-10',
  'top-10',
  'champion',
  'marathon',
] as const;

export type AchievementId = (typeof ACHIEVEMENT_IDS)[number];

/** Icon keys the web app maps to its SVG icons. */
export type AchievementIcon =
  'play' | 'joystick' | 'globe' | 'sparkle' | 'bolt' | 'trophy' | 'crown' | 'clock';

export type AchievementGroup = 'runs' | 'explore' | 'compete' | 'time';

/** What achievements are measured against besides the summary: the catalog's categories. */
export type AchievementContext = { categories: readonly string[] };

export type Achievement = {
  id: AchievementId;
  icon: AchievementIcon;
  group: AchievementGroup;
  /** How far the player must get, in the unit of `value`. */
  target: (context: AchievementContext) => number;
  /** Where the player stands now. */
  value: (summary: ProgressSummary, context: AchievementContext) => number;
};

const fixed = (n: number) => () => n;
const flag = (on: boolean) => (on ? 1 : 0);

export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'first-run', icon: 'play', group: 'runs', target: fixed(1), value: (s) => s.runs },
  { id: 'runs-25', icon: 'joystick', group: 'runs', target: fixed(25), value: (s) => s.runs },
  { id: 'runs-100', icon: 'joystick', group: 'runs', target: fixed(100), value: (s) => s.runs },
  { id: 'runs-500', icon: 'joystick', group: 'runs', target: fixed(500), value: (s) => s.runs },
  {
    id: 'explorer-5',
    icon: 'globe',
    group: 'explore',
    target: fixed(5),
    value: (s) => s.games.length,
  },
  {
    id: 'explorer-20',
    icon: 'globe',
    group: 'explore',
    target: fixed(20),
    value: (s) => s.games.length,
  },
  {
    id: 'explorer-50',
    icon: 'globe',
    group: 'explore',
    target: fixed(50),
    value: (s) => s.games.length,
  },
  {
    id: 'all-rounder',
    icon: 'sparkle',
    group: 'explore',
    // Every category the catalog uses; never fewer than one, so an empty catalog unlocks nothing.
    target: (c) => Math.max(c.categories.length, 1),
    value: (s, c) => c.categories.filter((category) => s.categories.includes(category)).length,
  },
  { id: 'best-10', icon: 'bolt', group: 'compete', target: fixed(10), value: (s) => s.bests },
  { id: 'top-10', icon: 'trophy', group: 'compete', target: fixed(1), value: (s) => flag(s.top10) },
  {
    id: 'champion',
    icon: 'crown',
    group: 'compete',
    target: fixed(1),
    value: (s) => flag(s.champion),
  },
  {
    id: 'marathon',
    icon: 'clock',
    group: 'time',
    // In minutes, so the profile can show "12/60".
    target: fixed(60),
    value: (s) => Math.floor(s.playSeconds / 60),
  },
];

export function isAchievementId(value: unknown): value is AchievementId {
  return typeof value === 'string' && (ACHIEVEMENT_IDS as readonly string[]).includes(value);
}

/** The predicate: the summary reaches the achievement's target. */
export function meetsAchievement(
  achievement: Achievement,
  summary: ProgressSummary,
  context: AchievementContext,
): boolean {
  return achievement.value(summary, context) >= achievement.target(context);
}

/** Progress towards an achievement, the value capped at the target ("12/20"). */
export function achievementProgress(
  achievement: Achievement,
  summary: ProgressSummary,
  context: AchievementContext,
): { value: number; target: number; unlockedAt: number | null } {
  const target = achievement.target(context);
  return {
    value: Math.min(achievement.value(summary, context), target),
    target,
    unlockedAt: summary.achievements[achievement.id] ?? null,
  };
}

/** Achievements the summary meets that are not unlocked yet, in catalog order. */
export function newlyUnlocked(
  summary: ProgressSummary,
  context: AchievementContext,
): AchievementId[] {
  return ACHIEVEMENTS.filter(
    (achievement) =>
      !(achievement.id in summary.achievements) && meetsAchievement(achievement, summary, context),
  ).map((achievement) => achievement.id);
}

/** The categories a catalog uses, in GAME_CATEGORIES order (for all-rounder). */
export function catalogCategories(
  manifests: readonly Pick<GameManifestInput, 'category' | 'categories'>[],
): GameCategory[] {
  const used = new Set(manifests.flatMap((manifest) => gameCategories(manifest)));
  return GAME_CATEGORIES.filter((category) => used.has(category));
}
