'use client';

import { useTranslations } from 'next-intl';
import { toggleFavorite, useFavorites } from '@/lib/library';
import { HeartIcon } from '../icons';
import styles from './game.module.css';

export function FavoriteButton({ slug }: { slug: string }) {
  const t = useTranslations('player');
  const favorite = useFavorites().includes(slug);
  const label = favorite ? t('unfavorite') : t('favorite');
  return (
    <button
      type="button"
      className={styles.toolButton}
      data-active={favorite}
      onClick={() => toggleFavorite(slug)}
      aria-pressed={favorite}
      aria-label={label}
      title={label}
    >
      <HeartIcon filled={favorite} />
    </button>
  );
}
