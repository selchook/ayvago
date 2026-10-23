import styles from './shell.module.css';
import { NavLink } from './nav-link';
import { getNavItems } from './nav-items';

// Phone navigation: the four primary destinations, fixed to the bottom edge.
export async function BottomNav() {
  const { primary, mainLabel } = await getNavItems();
  return (
    <nav className={styles.bottomNav} aria-label={mainLabel}>
      {primary.map((item) => (
        <NavLink key={item.href} href={item.href} className={styles.bottomItem}>
          {item.icon}
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
