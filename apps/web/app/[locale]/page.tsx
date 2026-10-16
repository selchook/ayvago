import { use } from 'react';
import { GAME_CATEGORIES, type Locale } from '@ayvago/shared';
import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { LocaleSwitcher } from '@/components/locale-switcher';

export default function HomePage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations();

  return (
    <main className="landing">
      <div className="topline">
        <p className="eyebrow">ayvago.com</p>
        <LocaleSwitcher />
      </div>
      <h1>{t('metadata.title')}</h1>
      <p className="lead">{t('home.tagline')}</p>
      <ul className="categories" aria-label={t('home.categoriesLabel')}>
        {GAME_CATEGORIES.map((key) => (
          <li key={key}>{t(`categories.${key}`)}</li>
        ))}
      </ul>
    </main>
  );
}
