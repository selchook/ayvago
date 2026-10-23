import styles from './shell.module.css';
import { NavLink } from './nav-link';
import { getNavItems } from './nav-items';

export async function SideNav() {
  const { primary, categories, categoriesLabel, mainLabel } = await getNavItems();
  return (
    <nav className={styles.sideNav} aria-label={mainLabel}>
      <ul className={styles.navList}>
        {primary.map((item) => (
          <li key={item.href}>
            <NavLink href={item.href} className={styles.navItem}>
              {item.icon}
              <span className={styles.navLabel}>{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
      <p className={styles.navHeading}>{categoriesLabel}</p>
      <ul className={styles.navList}>
        {categories.map((item) => (
          <li key={item.href}>
            <NavLink href={item.href} className={styles.navItem}>
              {item.icon}
              <span className={styles.navLabel}>{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
