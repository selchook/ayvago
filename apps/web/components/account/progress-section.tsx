'use client';

import {
  ACHIEVEMENTS,
  achievementProgress,
  levelProgress,
  type AchievementContext,
  type ProgressSummary,
} from '@ayvago/shared';
import { useLocale, useTranslations } from 'next-intl';
import { useProgressSummary } from '@/lib/progress/summary';
import { AchievementIcon } from './achievement-icon';
import { LevelChip, useLevelLabel } from './level-chip';
import profileStyles from './profile.module.css';
import styles from './progress.module.css';

/**
 * The profile's Progress section (docs/adr/0016-achievements-and-xp.md): level, XP bar, the
 * counters behind them and every achievement as a badge.
 */
export function ProgressSection({ uid, categories }: { uid: string; categories: string[] }) {
  const t = useTranslations('progress');
  const summary = useProgressSummary(uid);
  return (
    <section
      className={profileStyles.card}
      aria-labelledby="progress-heading"
      data-testid="progress-section"
    >
      <h2 id="progress-heading">{t('title')}</h2>
      {summary ? (
        <ProgressBody summary={summary} context={{ categories }} />
      ) : (
        <p className={profileStyles.muted} role="status">
          {t('loading')}
        </p>
      )}
    </section>
  );
}

function ProgressBody({
  summary,
  context,
}: {
  summary: ProgressSummary;
  context: AchievementContext;
}) {
  const t = useTranslations('progress');
  const ta = useTranslations('achievements');
  const locale = useLocale();
  const levelLabel = useLevelLabel();
  const { level, into, needed } = levelProgress(summary.xp);
  const number = new Intl.NumberFormat(locale);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const minutes = Math.floor(summary.playSeconds / 60);
  const unlockedCount = ACHIEVEMENTS.filter((a) => a.id in summary.achievements).length;
  const playedCategories = context.categories.filter((c) => summary.categories.includes(c)).length;

  const stats: [string, string][] = [
    [t('statRuns'), number.format(summary.runs)],
    [t('statGames'), number.format(summary.games.length)],
    [
      t('statCategories'),
      t('count', { value: playedCategories, target: context.categories.length }),
    ],
    [t('statBests'), number.format(summary.bests)],
    [
      t('statPlayTime'),
      minutes >= 60
        ? t('playHours', { hours: Math.floor(minutes / 60), minutes: minutes % 60 })
        : t('playMinutes', { minutes }),
    ],
    [t('statBadges'), t('count', { value: unlockedCount, target: ACHIEVEMENTS.length })],
  ];

  return (
    <>
      <div className={styles.levelRow}>
        <LevelChip xp={summary.xp} size={64} label={levelLabel(summary.xp)} />
        <div className={styles.levelText}>
          <strong className={styles.levelTitle}>{t('level', { level })}</strong>
          <div
            className={styles.bar}
            role="progressbar"
            aria-label={levelLabel(summary.xp)}
            aria-valuemin={0}
            aria-valuemax={needed || 1}
            aria-valuenow={needed ? into : 1}
          >
            <span style={{ width: `${needed ? (into / needed) * 100 : 100}%` }} />
          </div>
          <p className={styles.levelMeta}>
            {needed ? (
              <>
                <span>
                  {t('xpOf', { into: number.format(into), needed: number.format(needed) })}
                </span>
                <span>{t('toNext', { xp: number.format(needed - into), next: level + 1 })}</span>
              </>
            ) : (
              <span>{t('maxLevel')}</span>
            )}
            <span>{t('totalXp', { xp: number.format(summary.xp) })}</span>
          </p>
        </div>
      </div>

      <dl className={styles.stats}>
        {stats.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className={profileStyles.muted}>{t('howTo')}</p>

      <h3>{t('badgesTitle')}</h3>
      <ul className={styles.badges} data-testid="badges">
        {ACHIEVEMENTS.map((achievement) => {
          const progress = achievementProgress(achievement, summary, context);
          const unlocked = progress.unlockedAt !== null;
          return (
            <li
              key={achievement.id}
              className={styles.badge}
              data-unlocked={unlocked}
              data-achievement={achievement.id}
            >
              <span className={styles.badgeIcon}>
                <AchievementIcon icon={achievement.icon} />
              </span>
              <span className={styles.badgeText}>
                <strong>{ta(`${achievement.id}.name`)}</strong>
                <span className={styles.badgeDesc}>{ta(`${achievement.id}.desc`)}</span>
                {unlocked ? (
                  <span className={styles.badgeState}>
                    {t('unlockedOn', { date: date.format(progress.unlockedAt!) })}
                  </span>
                ) : (
                  <span className={styles.badgeState}>
                    <span className="visually-hidden">{t('locked')}: </span>
                    <span className={styles.miniBar} aria-hidden="true">
                      <span style={{ width: `${(progress.value / progress.target) * 100}%` }} />
                    </span>
                    {t('count', { value: progress.value, target: progress.target })}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}
