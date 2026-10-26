'use client';

import { seasonEnd, type BoardKey, type BoardRow } from '@ayvago/shared';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Avatar } from '@/components/account/avatar';
import { Link } from '@/i18n/navigation';
import { useAccount } from '@/lib/account/store';
import { formatScore, type ScoreFormat } from '@/lib/format';
import { useBoard, usePlayerStanding, useSeasonCountdown } from '@/lib/leaderboard/board';
import styles from './leaderboard.module.css';

export type LeaderboardPanelProps = {
  gameId: string;
  slug: string;
  order: 'asc' | 'desc';
  scoreFormat: ScoreFormat;
  /** The game's score label in the page locale ("Score", "Puan", …). */
  scoreLabel: string;
  /** Rows shown: 10 in the game page panel, 100 on the leaderboard page. */
  limit: number;
  /** Panel on the game page: adds a link to the full leaderboard page. */
  compact?: boolean;
};

const HOUR_MS = 60 * 60 * 1000;

export function LeaderboardPanel(props: LeaderboardPanelProps) {
  const { gameId, slug, order, scoreFormat, scoreLabel, limit, compact = true } = props;
  const t = useTranslations('leaderboard');
  const locale = useLocale();
  const account = useAccount();
  const [board, setBoard] = useState<BoardKey>('season');
  const view = useBoard(gameId, board);
  const uid = account.status === 'signedIn' ? account.uid : null;
  const standing = usePlayerStanding(gameId, board, uid, order);
  const left = useSeasonCountdown(seasonEnd);

  const score = (value: number) => formatScore(value, scoreFormat, locale);
  const rows = view.status === 'ready' ? view.top.slice(0, limit) : [];
  const ownShown = uid !== null && rows.some((row) => row.uid === uid);
  const profile = account.status === 'signedIn' ? account.profile : null;

  return (
    <div className={styles.panel} data-board={board}>
      <div className={styles.tabs} role="tablist" aria-label={t('boards')}>
        {(['season', 'all'] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={board === key}
            className={styles.tab}
            onClick={() => setBoard(key)}
          >
            {key === 'season' ? t('weekly') : t('allTime')}
          </button>
        ))}
      </div>

      {board === 'season' && left !== null ? (
        <p className={styles.countdown}>
          {t('endsIn', {
            days: Math.floor(left / (24 * HOUR_MS)),
            hours: Math.floor((left % (24 * HOUR_MS)) / HOUR_MS),
          })}
        </p>
      ) : null}

      {view.status === 'loading' ? (
        <p className={styles.note} role="status">
          {t('loading')}
        </p>
      ) : view.status === 'error' || view.status === 'disabled' ? (
        <p className={styles.note}>{t('unavailable')}</p>
      ) : rows.length === 0 ? (
        <p className={styles.note}>{board === 'season' ? t('emptyWeek') : t('empty')}</p>
      ) : (
        <ol className={styles.rows} aria-label={board === 'season' ? t('weekly') : t('allTime')}>
          <li className={styles.header} aria-hidden="true">
            <span>#</span>
            <span>{t('player')}</span>
            <span>{scoreLabel}</span>
          </li>
          {rows.map((row, index) => (
            <LeaderboardRow
              key={row.uid}
              row={row}
              rank={index + 1}
              own={row.uid === uid}
              score={score(row.score)}
              guestLabel={t('guest')}
              continuedLabel={t('continued')}
              youLabel={t('you')}
            />
          ))}
          {uid && !ownShown && standing && profile ? (
            <>
              <li className={styles.gap} aria-hidden="true">
                ⋯
              </li>
              <LeaderboardRow
                row={{
                  uid,
                  username: profile.username,
                  avatarId: profile.avatarId ?? null,
                  isGuest: profile.isGuest,
                  score: standing.score,
                  achievedAt: 0,
                  continued: standing.continued,
                }}
                rank={standing.rank}
                own
                score={score(standing.score)}
                guestLabel={t('guest')}
                continuedLabel={t('continued')}
                youLabel={t('you')}
              />
            </>
          ) : null}
        </ol>
      )}

      {account.status === 'signedIn' && account.isGuest && rows.some((row) => row.uid === uid) ? (
        <p className={styles.note}>{t('claimAsGuest')}</p>
      ) : null}

      {compact ? (
        <Link className={styles.more} href={`/games/${slug}/leaderboard`}>
          {t('seeAll')}
        </Link>
      ) : null}
    </div>
  );
}

export function LeaderboardRow(props: {
  row: BoardRow;
  rank: number;
  own: boolean;
  score: string;
  guestLabel: string;
  continuedLabel: string;
  youLabel: string;
}) {
  const { row, rank, own, score, guestLabel, continuedLabel, youLabel } = props;
  return (
    <li className={styles.row} data-own={own || undefined} data-rank={rank <= 3 ? rank : undefined}>
      <span className={styles.rank}>{rank}</span>
      <span className={styles.name}>
        <Avatar uid={row.uid} name={row.username} avatarId={row.avatarId} size={24} />
        <span className={styles.username}>{row.username}</span>
        {own ? <span className={styles.badge}>{youLabel}</span> : null}
        {/* The player's own guest status is explained below the list instead. */}
        {row.isGuest && !own ? <span className={styles.badge}>{guestLabel}</span> : null}
        {row.continued ? (
          <span className={styles.continued} title={continuedLabel} aria-label={continuedLabel}>
            ↻
          </span>
        ) : null}
      </span>
      <span className={styles.score}>{score}</span>
    </li>
  );
}
