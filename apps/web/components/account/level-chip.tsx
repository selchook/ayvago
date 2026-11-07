'use client';

import { levelProgress } from '@ayvago/shared';
import { useLocale, useTranslations } from 'next-intl';
import styles from './progress.module.css';

/** "Level 5: 120 XP to level 6", or the top-level wording. */
export function useLevelLabel() {
  const t = useTranslations('progress');
  const number = new Intl.NumberFormat(useLocale());
  return (xp: number) => {
    const { level, into, needed } = levelProgress(xp);
    return needed === 0
      ? t('chipLabelMax', { level })
      : t('chipLabel', { level, xp: number.format(needed - into), next: level + 1 });
  };
}

/**
 * The player's level with a ring that fills towards the next level (docs/adr/0016). Pass
 * `label` when the chip stands alone; inside a labelled control it stays decorative.
 */
export function LevelChip({ xp, size = 26, label }: { xp: number; size?: number; label?: string }) {
  const { level, into, needed } = levelProgress(xp);
  const share = needed === 0 ? 1 : into / needed;
  const stroke = Math.max(2.5, size / 11);
  const radius = (size - stroke) / 2;
  return (
    <span
      className={styles.chip}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      data-testid="level-chip"
      data-level={level}
      {...(label ? { role: 'img', 'aria-label': label, title: label } : { 'aria-hidden': true })}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          className={styles.chipTrack}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
        />
        <circle
          className={styles.chipFill}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          pathLength={100}
          strokeDasharray="100 100"
          strokeDashoffset={100 - Math.round(share * 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className={styles.chipLevel}>{level}</span>
    </span>
  );
}
