import { InstallLink } from '../pwa/install-link';
import styles from './shell.module.css';
import { NavLink } from './nav-link';
import { getNavItems, type NavItem } from './nav-items';

function NavList({ items }: { items: NavItem[] }) {
  return (
    <ul className={styles.navList}>
      {items.map((item) => (
        <li key={item.href}>
          <NavLink href={item.href} className={styles.navItem} label={item.label}>
            {item.icon}
            <span className={styles.navLabel}>{item.label}</span>
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

// The menu itself: Home, New, Recently played, Favorites, the categories and "Install the app".
// One component for the desktop side menu, the tablet rail and the phone drawer, so the menus
// never drift apart (slice 5.26).
export async function NavMenu() {
  const { primary, categories, categoriesLabel } = await getNavItems();
  return (
    <>
      <NavList items={primary} />
      <p className={styles.navHeading}>{categoriesLabel}</p>
      <NavList items={categories} />
      <InstallLink
        className={`${styles.navItem} ${styles.installItem}`}
        labelClassName={styles.navLabel}
      />
    </>
  );
}
