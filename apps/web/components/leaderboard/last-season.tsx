'use client';

import { previousSeasonKey, type BoardDoc } from '@ayvago/shared';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { firebaseEnabled, loadFirestore } from '@/lib/firebase/client';
import { formatScore, type ScoreFormat } from '@/lib/format';
import gameStyles from '@/components/game/game.module.css';
import { LeaderboardRow } from './leaderboard-panel';
import styles from './leaderboard.module.css';

/** Top 10 of the season that ended most recently, from its archive document. */
export function LastSeason(props: {
  gameId: string;
  scoreFormat: ScoreFormat;
  scoreLabel: string;
}) {
  const { gameId, scoreFormat, scoreLabel } = props;
  const t = useTranslations('leaderboard');
  const locale = useLocale();
  const [archive, setArchive] = useState<BoardDoc | null>(null);

  useEffect(() => {
    if (!firebaseEnabled()) return;
    let cancelled = false;
    (async () => {
      const db = await loadFirestore();
      const { doc, getDoc } = await import('firebase/firestore');
      const snapshot = await getDoc(
        doc(db, 'leaderboards', gameId, 'seasons', previousSeasonKey(Date.now())),
      );
      if (!cancelled && snapshot.exists()) setArchive(snapshot.data() as BoardDoc);
    })().catch((error) => console.warn('[leaderboard] archive unavailable', error));
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  if (!archive || archive.top.length === 0) return null;
  return (
    <section className={gameStyles.card} aria-labelledby="last-season-heading">
      <h2 id="last-season-heading">{t('lastSeason')}</h2>
      <ol className={styles.rows}>
        <li className={styles.header} aria-hidden="true">
          <span>#</span>
          <span>{t('player')}</span>
          <span>{scoreLabel}</span>
        </li>
        {archive.top.slice(0, 10).map((row, index) => (
          <LeaderboardRow
            key={row.uid}
            row={row}
            rank={index + 1}
            own={false}
            score={formatScore(row.score, scoreFormat, locale)}
            guestLabel={t('guest')}
            continuedLabel={t('continued')}
            youLabel={t('you')}
          />
        ))}
      </ol>
    </section>
  );
}
