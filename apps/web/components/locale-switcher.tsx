import { LOCALE_NATIVE_NAMES } from '@ayvago/shared';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';

export function LocaleSwitcher() {
  const t = useTranslations('localeSwitcher');
  const active = useLocale();

  return (
    <nav aria-label={t('label')} className="locale-switcher">
      {routing.locales.map((locale) => (
        <Link
          key={locale}
          href="/"
          locale={locale}
          hrefLang={locale}
          aria-current={locale === active ? 'true' : undefined}
        >
          {LOCALE_NATIVE_NAMES[locale]}
        </Link>
      ))}
    </nav>
  );
}
