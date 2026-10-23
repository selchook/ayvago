import { GAME_CATEGORIES } from '@ayvago/shared';
import { getTranslations } from 'next-intl/server';
import { CategoryIcon } from '../category-icon';
import { ClockIcon, HeartIcon, HomeIcon, SparkleIcon, UsersIcon } from '../icons';
import { categoryPath } from '@/lib/catalog';

export type NavItem = { href: string; label: string; icon: React.ReactNode };

export async function getNavItems() {
  const t = await getTranslations();
  const primary: NavItem[] = [
    { href: '/', label: t('nav.home'), icon: <HomeIcon /> },
    { href: '/new', label: t('nav.new'), icon: <SparkleIcon /> },
    { href: '/recent', label: t('nav.recent'), icon: <ClockIcon /> },
    { href: '/favorites', label: t('nav.favorites'), icon: <HeartIcon /> },
  ];
  const categories: NavItem[] = [
    ...GAME_CATEGORIES.map((category) => ({
      href: categoryPath(category),
      label: t(`categories.${category}`),
      icon: <CategoryIcon category={category} />,
    })),
    { href: '/multiplayer', label: t('nav.multiplayer'), icon: <UsersIcon /> },
  ];
  return { primary, categories, categoriesLabel: t('nav.categories'), mainLabel: t('nav.main') };
}
