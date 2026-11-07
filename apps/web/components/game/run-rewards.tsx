'use client';

import { ACHIEVEMENTS } from '@ayvago/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { progressNotes, type ProgressNote, type RunProgress } from '@/lib/progress/notes';
import { AchievementIcon } from '../account/achievement-icon';
import styles from '../account/progress.module.css';

/** How long each note stays; notes take turns so only one strip of the stage is covered. */
const NOTE_MS = 1800;
const FADE_MS = 300;

/**
 * What a finished run earned ("+35 XP", "Level 5!", "Achievement unlocked: Explorer"), shown one
 * after another in a single strip at the top edge of the stage. It never takes clicks, so the
 * game's own result screen stays usable underneath (docs/adr/0016-achievements-and-xp.md).
 */
export function RunRewards({ progress }: { progress: RunProgress | null }) {
  const t = useTranslations('progress');
  const ta = useTranslations('achievements');
  const [shown, setShown] = useState<{ note: ProgressNote; leaving: boolean } | null>(null);

  useEffect(() => {
    const notes = progressNotes(progress ?? undefined);
    setShown(null);
    const timers = notes.flatMap((note, i) => [
      window.setTimeout(() => setShown({ note, leaving: false }), i * NOTE_MS),
      window.setTimeout(() => setShown({ note, leaving: true }), (i + 1) * NOTE_MS - FADE_MS),
    ]);
    timers.push(window.setTimeout(() => setShown(null), notes.length * NOTE_MS));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [progress]);

  const note = shown?.note;
  return (
    <ul
      className={styles.toasts}
      aria-live="polite"
      aria-label={t('toasts')}
      data-leaving={shown?.leaving ?? false}
      data-testid="run-rewards"
    >
      {note?.kind === 'xp' ? (
        <li key="xp" className={styles.toast} data-kind="xp">
          {t('toastXp', { xp: note.xp })}
        </li>
      ) : note?.kind === 'level' ? (
        <li key="level" className={styles.toast} data-kind="level">
          {t('toastLevel', { level: note.level })}
        </li>
      ) : note?.kind === 'achievement' ? (
        <li key={note.id} className={styles.toast} data-kind="achievement">
          <AchievementIcon
            icon={ACHIEVEMENTS.find((a) => a.id === note.id)?.icon ?? 'trophy'}
            size={16}
          />
          {t('toastAchievement', { name: ta(`${note.id}.name`) })}
        </li>
      ) : null}
    </ul>
  );
}
