import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { LocaleSwitcher } from '../locale-switcher';
import { ThemeSwitcher } from '../theme-switcher';
import styles from './shell.module.css';

export async function TopBar() {
  const t = await getTranslations('metadata');
  return (
    <header className={styles.topBar}>
      <Link href="/" className={styles.logo}>
        {t('title')}
      </Link>
      <div className={styles.topActions}>
        <ThemeSwitcher />
        <LocaleSwitcher />
      </div>
    </header>
  );
}
