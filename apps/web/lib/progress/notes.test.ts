import { ACHIEVEMENT_IDS } from '@ayvago/shared';
import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import tr from '../../messages/tr.json';
import { isRunProgress, progressNotes } from './notes';

const base = { xpGained: 0, xp: 0, level: 1, levelUp: false, unlocked: [] as string[] };

describe('progressNotes', () => {
  it('shows nothing without progress or when nothing was earned', () => {
    expect(progressNotes(undefined)).toEqual([]);
    expect(progressNotes(base)).toEqual([]);
  });

  it('lists the XP, the new level and each achievement, in that order', () => {
    expect(
      progressNotes({
        xpGained: 95,
        xp: 310,
        level: 3,
        levelUp: true,
        unlocked: ['first-run', 'explorer-5'],
      }),
    ).toEqual([
      { kind: 'xp', xp: 95 },
      { kind: 'level', level: 3 },
      { kind: 'achievement', id: 'first-run' },
      { kind: 'achievement', id: 'explorer-5' },
    ]);
  });

  it('skips achievements this build does not know', () => {
    expect(progressNotes({ ...base, xpGained: 30, unlocked: ['from-the-future'] })).toEqual([
      { kind: 'xp', xp: 30 },
    ]);
  });
});

describe('isRunProgress', () => {
  it('accepts the server shape only', () => {
    expect(isRunProgress(base)).toBe(true);
    expect(isRunProgress(null)).toBe(false);
    expect(isRunProgress({ ...base, unlocked: 'first-run' })).toBe(false);
    expect(isRunProgress({ xp: 1 })).toBe(false);
  });
});

describe('achievement texts', () => {
  it('name and describe every achievement in both languages', () => {
    for (const messages of [en, tr]) {
      const texts = messages.achievements as Record<string, { name?: string; desc?: string }>;
      for (const id of ACHIEVEMENT_IDS) {
        expect(texts[id]?.name, id).toBeTruthy();
        expect(texts[id]?.desc, id).toBeTruthy();
      }
    }
  });
});
