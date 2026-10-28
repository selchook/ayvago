import type { Locale } from '@ayvago/shared';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import styles from '@/components/page.module.css';
import { SearchView } from '@/components/search/search-view';
import { getAllGames } from '@/lib/catalog';
import { getTileLabels, toTiles } from '@/lib/catalog/tiles';
import { localizedAlternates } from '@/lib/seo';

type Props = {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ q?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'search' });
  return {
    title: t('title'),
    alternates: localizedAlternates(locale, '/search'),
    // Result pages are endless query variations; the catalog pages are what search engines need.
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { q } = await searchParams;
  const [t, tiles, labels] = await Promise.all([
    getTranslations('search'),
    toTiles(getAllGames(), locale),
    getTileLabels(),
  ]);
  return (
    <>
      <header className={styles.header}>
        <h1>{t('title')}</h1>
      </header>
      <SearchView tiles={tiles} labels={labels} initialQuery={Array.isArray(q) ? q[0] : q} />
    </>
  );
}
