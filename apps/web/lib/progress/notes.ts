import { isAchievementId, type AchievementId } from '@ayvago/shared';

// What a finished run earned, as finishSession reports it (firebase/functions/src/progress.ts),
// turned into the short notes the game page shows over the stage.

export type RunProgress = {
  xpGained: number;
  xp: number;
  level: number;
  levelUp: boolean;
  unlocked: string[];
};

export type ProgressNote =
  | { kind: 'xp'; xp: number }
  | { kind: 'level'; level: number }
  | { kind: 'achievement'; id: AchievementId };

/** Notes in the order they are shown: XP, a new level, then each unlocked achievement. */
export function progressNotes(progress: RunProgress | undefined): ProgressNote[] {
  if (!progress) return [];
  const notes: ProgressNote[] = [];
  if (progress.xpGained > 0) notes.push({ kind: 'xp', xp: progress.xpGained });
  if (progress.levelUp) notes.push({ kind: 'level', level: progress.level });
  for (const id of progress.unlocked) {
    // An achievement this build does not know yet (a newer server) has no text to show.
    if (isAchievementId(id)) notes.push({ kind: 'achievement', id });
  }
  return notes;
}

/** True when the response carries a well-formed progress object. */
export function isRunProgress(value: unknown): value is RunProgress {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.xpGained === 'number' &&
    typeof p.xp === 'number' &&
    typeof p.level === 'number' &&
    typeof p.levelUp === 'boolean' &&
    Array.isArray(p.unlocked)
  );
}
