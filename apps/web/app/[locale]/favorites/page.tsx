import type { Locale } from '@ayvago/shared';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LibraryList } from '@/components/catalog/library-list';
import styles from '@/components/page.module.css';
import { getAllGames } from '@/lib/catalog';
import { getTileLabels, toTiles } from '@/lib/catalog/tiles';

type Props = { params: Promise<{ locale: Locale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'library' });
  // Personal pages: useful to the player, not to search engines.
  return { title: t('favoritesTitle'), robots: { index: false } };
}

export default async function FavoritesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, tiles, labels] = await Promise.all([
    getTranslations('library'),
    toTiles(getAllGames(), locale),
    getTileLabels(),
  ]);
  return (
    <>
      <header className={styles.header}>
        <h1>{t('favoritesTitle')}</h1>
      </header>
      <LibraryList
        kind="favorites"
        tiles={tiles}
        labels={labels}
        emptyText={t('favoritesEmpty')}
        browseLabel={t('browse')}
      />
      <p className={styles.note}>{t('localNote')}</p>
    </>
  );
}
