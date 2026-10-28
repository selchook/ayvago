import { gameCategories, type Locale } from '@ayvago/shared';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { gameTitle, getAllGames } from '@/lib/catalog';
import { gameSearchText } from '@/lib/catalog/tiles';
import { AccountMenu } from '../account/account-menu';
import { LocaleSwitcher } from '../locale-switcher';
import { PopoverCloser } from '../popover-closer';
import { TopSearch, type SearchEntry } from '../search/top-search';
import { ThemeSwitcher } from '../theme-switcher';
import { BrandLogo } from './brand-logo';
import { SloganTicker } from './slogan-ticker';
import styles from './shell.module.css';

// Slogans next to the logo (messages: slogans.*).
const SLOGAN_KEYS = [
  'count',
  'instant',
  'noDownload',
  'highScore',
  'genres',
  'leaderboard',
  'oneMore',
] as const;

export async function TopBar() {
  const [t, ts, tc, locale] = await Promise.all([
    getTranslations('metadata'),
    getTranslations('slogans'),
    getTranslations('categories'),
    getLocale() as Promise<Locale>,
  ]);
  const games = getAllGames();
  const slogans = SLOGAN_KEYS.map((key) => ts(key, { count: games.length }));
  const searchEntries: SearchEntry[] = games.map((game) => {
    const categories = gameCategories(game.manifest).map((category) => tc(category));
    return {
      slug: game.slug,
      title: gameTitle(game, locale),
      categories: categories.slice(0, 3).join(' · '),
      search: gameSearchText(game, categories),
    };
  });
  return (
    <header className={styles.topBar}>
      <Link href="/" className={styles.logo}>
        <BrandLogo />
        <span className="visually-hidden">{t('title')}</span>
      </Link>
      <SloganTicker slogans={slogans} />
      <TopSearch games={searchEntries} />
      <div className={styles.topActions}>
        <ThemeSwitcher />
        <LocaleSwitcher />
        <AccountMenu />
      </div>
      <PopoverCloser />
    </header>
  );
}
