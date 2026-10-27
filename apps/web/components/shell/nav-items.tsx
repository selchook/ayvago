import { GAME_CATEGORIES } from '@ayvago/shared';
import { getTranslations } from 'next-intl/server';
import { CategoryIcon } from '../category-icon';
import { ClockIcon, HeartIcon, HomeIcon, SparkleIcon, UsersIcon } from '../icons';
import { categoryPath, getGamesByCategory, getMultiplayerGames } from '@/lib/catalog';

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
    // Categories without games stay out of the navigation.
    ...GAME_CATEGORIES.filter((category) => getGamesByCategory(category).length > 0).map(
      (category) => ({
        href: categoryPath(category),
        label: t(`categories.${category}`),
        icon: <CategoryIcon category={category} />,
      }),
    ),
  ];
  // Hidden while the catalog has no multiplayer games, so the link never leads to an empty page.
  if (getMultiplayerGames().length > 0) {
    categories.push({ href: '/multiplayer', label: t('nav.multiplayer'), icon: <UsersIcon /> });
  }
  return { primary, categories, categoriesLabel: t('nav.categories'), mainLabel: t('nav.main') };
}
