import { getTranslations } from 'next-intl/server';
import { AdHost } from '../ads/ad-host';
import { InstallLink } from '../pwa/install-link';
import { InstallPrompt } from '../pwa/install-prompt';
import { BottomNav } from './bottom-nav';
import { SideNav } from './side-nav';
import { SiteFooter } from './site-footer';
import { TopBar } from './top-bar';
import styles from './shell.module.css';

export async function AppShell({ children }: { children: React.ReactNode }) {
  const t = await getTranslations('nav');
  return (
    <div className={styles.shell}>
      <a href="#content" className={styles.skipLink}>
        {t('skipToContent')}
      </a>
      <TopBar />
      <SideNav />
      <main id="content" className={styles.content}>
        {/* Grows to fill the column, so the footer ends even a short page at the bottom. */}
        <div className={styles.page}>{children}</div>
        {/* Phones have no side menu: the install link closes the page instead. */}
        <div className={styles.phoneInstall}>
          <InstallLink className={styles.navItem} />
        </div>
        <SiteFooter />
      </main>
      <BottomNav />
      <InstallPrompt />
      {/* Ads (Phase 3): renders and loads nothing unless ads are configured and switched on. */}
      <AdHost />
    </div>
  );
}
