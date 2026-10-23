import type { Locale } from '@ayvago/shared';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ListPage } from '@/components/catalog/list-page';
import { getNewestGames } from '@/lib/catalog';
import { localizedAlternates } from '@/lib/seo';

type Props = { params: Promise<{ locale: Locale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'list' });
  return {
    title: t('newTitle'),
    description: t('newIntro'),
    alternates: localizedAlternates(locale, '/new'),
  };
}

export default async function NewGamesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('list');
  return (
    <ListPage
      title={t('newTitle')}
      intro={t('newIntro')}
      games={getNewestGames()}
      locale={locale}
    />
  );
}
