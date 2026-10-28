'use client';

import { useTranslations } from 'next-intl';
import { PaletteIcon } from './icons';
import styles from './popover.module.css';
import { ThemeControls } from './theme-controls';

export function ThemeSwitcher() {
  const t = useTranslations('theme');
  return (
    <details className={styles.popover} data-popover>
      <summary className={styles.trigger} aria-label={t('label')}>
        <PaletteIcon />
      </summary>
      <div className={styles.panel}>
        <ThemeControls name="ayvago-switcher" />
      </div>
    </details>
  );
}
