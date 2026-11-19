import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { CopyrightNotice } from './copyright-notice';
import { NavLink } from './nav-link';
import styles from './shell.module.css';

// The site footer at the end of every page's content column: the copyright notice, then About,
// Privacy, Terms of use, the ad and cookie choice (on the privacy page) and Contact (slice 3.5).
export async function SiteFooter() {
  const t = await getTranslations('footer');
  return (
    <footer className={styles.footer}>
      <CopyrightNotice
        year={new Date().getUTCFullYear()}
        className={styles.copyright}
        signClassName={styles.copyrightSign}
      />
      <nav aria-label={t('label')}>
        <ul className={styles.footerLinks}>
          <li>
            <NavLink href="/about" className={styles.footerLink}>
              {t('about')}
            </NavLink>
          </li>
          <li>
            <NavLink href="/privacy" className={styles.footerLink}>
              {t('privacy')}
            </NavLink>
          </li>
          <li>
            <NavLink href="/terms" className={styles.footerLink}>
              {t('terms')}
            </NavLink>
          </li>
          <li>
            <Link href="/privacy#ads" className={styles.footerLink}>
              {t('cookies')}
            </Link>
          </li>
          <li>
            <NavLink href="/contact" className={styles.footerLink}>
              {t('contact')}
            </NavLink>
          </li>
        </ul>
      </nav>
    </footer>
  );
}
