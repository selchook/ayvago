import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { AccountMenu } from '../account/account-menu';
import { LocaleSwitcher } from '../locale-switcher';
import { ThemeSwitcher } from '../theme-switcher';
import { BrandLogo } from './brand-logo';
import styles from './shell.module.css';

export async function TopBar() {
  const t = await getTranslations('metadata');
  return (
    <header className={styles.topBar}>
      <Link href="/" className={styles.logo}>
        <BrandLogo />
        <span className="visually-hidden">{t('title')}</span>
      </Link>
      <div className={styles.topActions}>
        <ThemeSwitcher />
        <LocaleSwitcher />
        <AccountMenu />
      </div>
    </header>
  );
}
