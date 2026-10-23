'use client';

import { LOCALE_NATIVE_NAMES } from '@ayvago/shared';
import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { GlobeIcon } from './icons';
import styles from './popover.module.css';

// Switches language while staying on the same page.
export function LocaleSwitcher() {
  const t = useTranslations('localeSwitcher');
  const active = useLocale();
  const pathname = usePathname();

  return (
    <details className={styles.popover}>
      <summary className={styles.trigger} aria-label={t('label')}>
        <GlobeIcon />
        <span className={styles.triggerText}>{active.toUpperCase()}</span>
      </summary>
      <div className={styles.panel}>
        <ul className={styles.menu}>
          {routing.locales.map((locale) => (
            <li key={locale}>
              <Link
                href={pathname}
                locale={locale}
                hrefLang={locale}
                lang={locale}
                aria-current={locale === active ? 'true' : undefined}
              >
                {LOCALE_NATIVE_NAMES[locale]}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
