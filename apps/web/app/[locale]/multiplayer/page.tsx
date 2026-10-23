import type { Locale } from '@ayvago/shared';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ListPage } from '@/components/catalog/list-page';
import { getMultiplayerGames } from '@/lib/catalog';
import { localizedAlternates } from '@/lib/seo';

type Props = { params: Promise<{ locale: Locale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'list' });
  return {
    title: t('multiplayerTitle'),
    description: t('multiplayerIntro'),
    alternates: localizedAlternates(locale, '/multiplayer'),
  };
}

export default async function MultiplayerPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('list');
  return (
    <ListPage
      title={t('multiplayerTitle')}
      intro={t('multiplayerIntro')}
      games={getMultiplayerGames()}
      locale={locale}
    />
  );
}
