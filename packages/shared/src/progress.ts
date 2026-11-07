import { newlyUnlocked, type AchievementContext } from './achievements';

// XP, levels and the progress summary (docs/adr/0016-achievements-and-xp.md). The Cloud
// Functions award XP inside finishSession with these rules; the web app uses the level helpers
// to draw the level chip and the profile's Progress section. Never awarded on the client.

/** XP rules for one accepted score session. */
export const XP_RULES = {
  /** An accepted session that lasted at least `minRunSeconds`. */
  run: 10,
  minRunSeconds: 20,
  /** The player's first session of a game. */
  firstPlay: 20,
  /** A new personal best for the game. */
  personalBest: 25,
  /** Entering the game's weekly top 10. */
  weeklyTop10: 50,
  /** Each unlocked achievement; not counted towards the daily caps. */
  achievement: 30,
  /** Session XP a player can earn per UTC day, all games together. */
  dailyCap: 600,
  /** Session XP a player can earn per UTC day from one game. */
  dailyGameCap: 150,
} as const;

export const MAX_LEVEL = 99;
/** Played games remembered in the summary (the catalog is far smaller). */
export const MAX_TRACKED_GAMES = 500;

/** Total XP needed to reach `level`: reaching n+1 from n costs 100·n, so L2 = 100, L3 = 300. */
export function xpForLevel(level: number): number {
  const n = Math.min(Math.max(Math.floor(level), 1), MAX_LEVEL);
  return 50 * n * (n - 1);
}

/** The level a total of `xp` reaches (1 to MAX_LEVEL). */
export function levelForXp(xp: number): number {
  if (!Number.isFinite(xp) || xp <= 0) return 1;
  // 50·n·(n−1) ≤ xp  ⇔  n ≤ (1 + √(1 + xp/12.5)) / 2; the loops correct float rounding.
  let level = Math.min(Math.floor((1 + Math.sqrt(1 + xp / 12.5)) / 2), MAX_LEVEL);
  while (level < MAX_LEVEL && xpForLevel(level + 1) <= xp) level++;
  while (level > 1 && xpForLevel(level) > xp) level--;
  return level;
}

export type LevelProgress = {
  level: number;
  /** XP earned since reaching `level`. */
  into: number;
  /** XP between `level` and the next one; 0 at the top level. */
  needed: number;
};

export function levelProgress(xp: number): LevelProgress {
  const total = Math.max(0, Number.isFinite(xp) ? xp : 0);
  const level = levelForXp(total);
  const into = total - xpForLevel(level);
  return {
    level,
    into,
    needed: level >= MAX_LEVEL ? 0 : xpForLevel(level + 1) - xpForLevel(level),
  };
}

/** users/{uid}/progress/summary, with unlock times in milliseconds. */
export type ProgressSummary = {
  xp: number;
  level: number;
  /** Accepted score sessions. */
  runs: number;
  /** Manifest ids of the games played (accepted sessions), at most MAX_TRACKED_GAMES. */
  games: string[];
  /** Categories of the games played. */
  categories: string[];
  /** Personal bests beaten. */
  bests: number;
  playSeconds: number;
  /** Reached a weekly top 10 at least once. */
  top10: boolean;
  /** Was #1 on a weekly board at least once. */
  champion: boolean;
  /** Achievement id → unlock time (ms). */
  achievements: Record<string, number>;
  /** UTC day ('YYYY-MM-DD') the daily counters belong to. */
  xpDay: string;
  xpToday: number;
  xpGameToday: Record<string, number>;
};

export const EMPTY_PROGRESS: ProgressSummary = {
  xp: 0,
  level: 1,
  runs: 0,
  games: [],
  categories: [],
  bests: 0,
  playSeconds: 0,
  top10: false,
  champion: false,
  achievements: {},
  xpDay: '',
  xpToday: 0,
  xpGameToday: {},
};

export const utcDay = (time: number) => new Date(time).toISOString().slice(0, 10);

const count = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;

const strings = (value: unknown, max: number) =>
  Array.isArray(value)
    ? [...new Set(value.filter((v): v is string => typeof v === 'string'))].slice(0, max)
    : [];

function numberMap(value: unknown, read: (v: unknown) => number | null) {
  const out: Record<string, number> = {};
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, raw] of Object.entries(value)) {
      const v = read(raw);
      if (v !== null) out[key] = v;
    }
  }
  return out;
}

/** Milliseconds from a number, a Date or a Firestore Timestamp; null otherwise. */
export function toMillis(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === 'object' && 'toMillis' in value) {
    const millis = (value as { toMillis: unknown }).toMillis;
    if (typeof millis === 'function') return Number(millis.call(value));
  }
  return null;
}

/** Reads a stored summary (or nothing) into a well-formed one; the level follows the XP. */
export function readProgress(data: unknown): ProgressSummary {
  const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const xp = count(d.xp);
  return {
    xp,
    level: levelForXp(xp),
    runs: count(d.runs),
    games: strings(d.games, MAX_TRACKED_GAMES),
    categories: strings(d.categories, 64),
    bests: count(d.bests),
    playSeconds: count(d.playSeconds),
    top10: d.top10 === true,
    champion: d.champion === true,
    achievements: numberMap(d.achievements, toMillis),
    xpDay: typeof d.xpDay === 'string' ? d.xpDay : '',
    xpToday: count(d.xpToday),
    xpGameToday: numberMap(d.xpGameToday, (v) => count(v)),
  };
}

/** What one accepted score session did, as the server saw it. */
export type RunFacts = {
  gameId: string;
  /** Every category the game is listed under. */
  categories: readonly string[];
  /** Run length by the server's clock. */
  seconds: number;
  /** Beat the player's previous best for the game. */
  personalBest: boolean;
  /** The player's place on the game's weekly board before and after the session (null: not on it). */
  weeklyPlaceBefore: number | null;
  weeklyPlace: number | null;
  now: number;
};

export type RunAward = {
  summary: ProgressSummary;
  xpGained: number;
  levelUp: boolean;
  unlocked: string[];
};

const inTop10 = (place: number | null) => place !== null && place <= 10;

/** XP a session earns before the daily caps. */
export function sessionXp(run: RunFacts, firstPlay: boolean): number {
  let xp = run.seconds >= XP_RULES.minRunSeconds ? XP_RULES.run : 0;
  if (firstPlay) xp += XP_RULES.firstPlay;
  if (run.personalBest) xp += XP_RULES.personalBest;
  if (inTop10(run.weeklyPlace) && !inTop10(run.weeklyPlaceBefore)) xp += XP_RULES.weeklyTop10;
  return xp;
}

/**
 * Adds an accepted session to the summary: session XP within the daily caps, the counters, and
 * the achievements it unlocks (each worth XP_RULES.achievement, outside the caps).
 */
export function applyRun(
  previous: ProgressSummary,
  run: RunFacts,
  context: AchievementContext,
): RunAward {
  const day = utcDay(run.now);
  const sameDay = previous.xpDay === day;
  const today = sameDay ? previous.xpToday : 0;
  const gameToday = sameDay ? previous.xpGameToday : {};
  const known = previous.games.includes(run.gameId);
  const firstPlay = !known && previous.games.length < MAX_TRACKED_GAMES;

  const earned = Math.max(
    0,
    Math.min(
      sessionXp(run, firstPlay),
      XP_RULES.dailyCap - today,
      XP_RULES.dailyGameCap - (gameToday[run.gameId] ?? 0),
    ),
  );

  const counted: ProgressSummary = {
    ...previous,
    runs: previous.runs + 1,
    games: firstPlay ? [...previous.games, run.gameId] : previous.games,
    categories: [...new Set([...previous.categories, ...run.categories])],
    bests: previous.bests + (run.personalBest ? 1 : 0),
    playSeconds: previous.playSeconds + Math.max(0, Math.round(run.seconds)),
    top10: previous.top10 || inTop10(run.weeklyPlace),
    champion: previous.champion || run.weeklyPlace === 1,
    xpDay: day,
    xpToday: today + earned,
    xpGameToday:
      earned > 0
        ? { ...gameToday, [run.gameId]: (gameToday[run.gameId] ?? 0) + earned }
        : gameToday,
  };

  const unlocked = newlyUnlocked(counted, context);
  const xpGained = earned + unlocked.length * XP_RULES.achievement;
  const xp = previous.xp + xpGained;
  const level = levelForXp(xp);
  const summary: ProgressSummary = {
    ...counted,
    xp,
    level,
    achievements: {
      ...previous.achievements,
      ...Object.fromEntries(unlocked.map((id) => [id, run.now])),
    },
  };
  return { summary, xpGained, levelUp: level > levelForXp(previous.xp), unlocked };
}

/**
 * Joins a guest's progress into an account's (guest merge): counters add up, sets join, the
 * earlier unlock time of an achievement wins and the level follows the summed XP. Today's caps
 * keep the later day; on the same day both players' XP counts.
 */
export function mergeProgress(account: ProgressSummary, guest: ProgressSummary): ProgressSummary {
  const xp = account.xp + guest.xp;
  const achievements = { ...guest.achievements };
  for (const [id, time] of Object.entries(account.achievements)) {
    achievements[id] = id in achievements ? Math.min(achievements[id]!, time) : time;
  }
  const day = account.xpDay >= guest.xpDay ? account.xpDay : guest.xpDay;
  const onDay = [account, guest].filter((summary) => summary.xpDay === day && day !== '');
  const xpGameToday: Record<string, number> = {};
  for (const summary of onDay) {
    for (const [gameId, value] of Object.entries(summary.xpGameToday)) {
      xpGameToday[gameId] = (xpGameToday[gameId] ?? 0) + value;
    }
  }
  return {
    xp,
    level: levelForXp(xp),
    runs: account.runs + guest.runs,
    games: [...new Set([...account.games, ...guest.games])].slice(0, MAX_TRACKED_GAMES),
    categories: [...new Set([...account.categories, ...guest.categories])],
    bests: account.bests + guest.bests,
    playSeconds: account.playSeconds + guest.playSeconds,
    top10: account.top10 || guest.top10,
    champion: account.champion || guest.champion,
    achievements,
    xpDay: day,
    xpToday: onDay.reduce((sum, summary) => sum + summary.xpToday, 0),
    xpGameToday,
  };
}
