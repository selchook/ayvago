import { getTranslations } from 'next-intl/server';
import styles from './shell.module.css';
import { NavMenu } from './nav-menu';
import { RailToggle } from './rail-toggle';

export const SIDE_NAV_ID = 'side-nav';

// The side menu: the full menu on desktop, a collapsible icon rail on tablets (the toggle only
// shows there). Phones use the drawer behind the top bar's menu button instead.
export async function SideNav() {
  const t = await getTranslations('nav');
  return (
    <nav id={SIDE_NAV_ID} className={styles.sideNav} aria-label={t('main')}>
      <RailToggle controls={SIDE_NAV_ID} />
      <NavMenu />
    </nav>
  );
}
