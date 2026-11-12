import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { PRIVACY_CONTACT } from '@/lib/ads/config';
import { CopyrightNotice } from './copyright-notice';
import { NavLink } from './nav-link';
import styles from './shell.module.css';

// The site footer at the end of every page's content column: the copyright notice, then the
// privacy page, the ad and cookie choice (on the privacy page) and the privacy contact.
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
            <NavLink href="/privacy" className={styles.footerLink}>
              {t('privacy')}
            </NavLink>
          </li>
          <li>
            <Link href="/privacy#ads" className={styles.footerLink}>
              {t('cookies')}
            </Link>
          </li>
          <li>
            <a href={`mailto:${PRIVACY_CONTACT}`} className={styles.footerLink}>
              {t('contact')}
            </a>
          </li>
        </ul>
      </nav>
    </footer>
  );
}
