import { GAME_CATEGORIES, categoryFromSlug, categorySlug, type Locale } from '@ayvago/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ListPage } from '@/components/catalog/list-page';
import { categoryPath, getGamesByCategory } from '@/lib/catalog';
import { getRankings, rankGames } from '@/lib/catalog/rankings';
import { localizedAlternates } from '@/lib/seo';

type Props = { params: Promise<{ locale: Locale; category: string }> };

export function generateStaticParams() {
  return GAME_CATEGORIES.map((category) => ({ category: categorySlug(category) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, category: slug } = await params;
  const category = categoryFromSlug(slug);
  if (!category) return {};
  const t = await getTranslations({ locale });
  const label = t(`categories.${category}`);
  return {
    title: label,
    description: t('list.categoryIntro', { category: label }),
    alternates: localizedAlternates(locale, categoryPath(category)),
  };
}

export default async function CategoryPage({ params }: Props) {
  const { locale, category: slug } = await params;
  setRequestLocale(locale);
  const category = categoryFromSlug(slug);
  if (!category) notFound();
  const [t, rankings] = await Promise.all([getTranslations(), getRankings()]);
  const label = t(`categories.${category}`);
  return (
    <ListPage
      title={label}
      intro={t('list.categoryIntro', { category: label })}
      games={rankGames(getGamesByCategory(category), rankings, 'qualityScore')}
      locale={locale}
    />
  );
}
