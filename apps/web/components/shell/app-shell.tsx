import { getTranslations } from 'next-intl/server';
import { InstallPrompt } from '../pwa/install-prompt';
import { BottomNav } from './bottom-nav';
import { SideNav } from './side-nav';
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
        {children}
      </main>
      <BottomNav />
      <InstallPrompt />
    </div>
  );
}
