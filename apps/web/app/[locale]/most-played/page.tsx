import type { Locale } from '@ayvago/shared';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { MostPlayedView } from '@/components/catalog/most-played-view';
import styles from '@/components/page.module.css';
import { getAllGames } from '@/lib/catalog';
import { parseTab, rankByPlays } from '@/lib/catalog/most-played';
import { getRankings } from '@/lib/catalog/rankings';
import { getTileLabels, toTiles } from '@/lib/catalog/tiles';
import { localizedAlternates } from '@/lib/seo';

type Props = {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'mostPlayed' });
  // One canonical URL for every tab; "Yours" is personal and only filled in the browser.
  return {
    title: t('title'),
    description: t('intro'),
    alternates: localizedAlternates(locale, '/most-played'),
  };
}

// The Most played page (slice 5.27). The weekly and all-time counts come from rankings/catalog,
// the public document the hourly ranking job writes and the home page already reads (one cached
// read per hour for the whole site); the selected tab comes from `?tab=` so a shared link opens it.
export default async function MostPlayedPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const games = getAllGames();
  const [t, tiles, labels, rankings, query] = await Promise.all([
    getTranslations('mostPlayed'),
    toTiles(games, locale),
    getTileLabels(),
    getRankings(),
    searchParams,
  ]);
  return (
    <>
      <header className={styles.header}>
        <h1>{t('title')}</h1>
        <p className={styles.intro}>{t('intro')}</p>
      </header>
      <MostPlayedView
        initialTab={parseTab(query.tab)}
        tiles={tiles}
        labels={labels}
        week={rankByPlays(games, rankings, 'plays7d')}
        all={rankByPlays(games, rankings, 'playsTotal')}
      />
    </>
  );
}
