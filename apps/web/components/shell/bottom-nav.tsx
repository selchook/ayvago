import { getTranslations } from 'next-intl/server';
import { SearchIcon } from '../icons';
import styles from './shell.module.css';
import { NavLink } from './nav-link';
import { getNavItems } from './nav-items';

// Phone navigation: the four primary destinations and search, fixed to the bottom edge.
export async function BottomNav() {
  const [{ primary, mainLabel }, t] = await Promise.all([getNavItems(), getTranslations('nav')]);
  const items = [...primary, { href: '/search', label: t('search'), icon: <SearchIcon /> }];
  return (
    <nav className={styles.bottomNav} aria-label={mainLabel}>
      {items.map((item) => (
        <NavLink key={item.href} href={item.href} className={styles.bottomItem}>
          {item.icon}
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
