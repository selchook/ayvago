import { gameCategories, type Locale } from '@ayvago/shared';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { gameTitle, getAllGames, getTableGames } from '@/lib/catalog';
import { gameSearchText } from '@/lib/catalog/tiles';
import { getTickerContent } from './ticker-items';
import { AccountMenu } from '../account/account-menu';
import { InviteCenter } from '../lobby/invite-center';
import { LocaleSwitcher } from '../locale-switcher';
import { PopoverCloser } from '../popover-closer';
import { TopSearch, type SearchEntry } from '../search/top-search';
import { SearchIcon } from '../icons';
import popover from '../popover.module.css';
import { ThemeSwitcher } from '../theme-switcher';
import { BrandLogo } from './brand-logo';
import { MobileMenu } from './mobile-menu';
import { NavMenu } from './nav-menu';
import { SloganTicker } from './slogan-ticker';
import styles from './shell.module.css';

export async function TopBar() {
  const games = getAllGames();
  const [t, tn, ticker, tc, locale] = await Promise.all([
    getTranslations('metadata'),
    getTranslations('nav'),
    getTickerContent(games.length),
    getTranslations('categories'),
    getLocale() as Promise<Locale>,
  ]);
  const searchEntries: SearchEntry[] = games.map((game) => {
    const categories = gameCategories(game.manifest).map((category) => tc(category));
    return {
      slug: game.slug,
      title: gameTitle(game, locale),
      categories: categories.slice(0, 3).join(' · '),
      search: gameSearchText(game, categories),
    };
  });
  // Titles for table invites (docs/adr/0019): only table games are invited to.
  const tableTitles = Object.fromEntries(
    getTableGames().map((game) => [game.slug, gameTitle(game, locale)]),
  );
  return (
    <header className={styles.topBar}>
      {/* Phones: the menu button and its drawer (the side menu's content). */}
      <MobileMenu
        logo={
          <>
            <BrandLogo height={30} idSuffix="-drawer" />
            <span className="visually-hidden">{t('title')}</span>
          </>
        }
      >
        <nav className={styles.drawerNav} aria-label={tn('main')}>
          <NavMenu />
        </nav>
      </MobileMenu>
      <Link href="/" className={styles.logo}>
        <BrandLogo />
        <span className="visually-hidden">{t('title')}</span>
      </Link>
      <SloganTicker {...ticker} />
      <TopSearch games={searchEntries} />
      <div className={styles.topActions}>
        {/* Phones: search sits here as an icon (the field above is hidden below 640 px). */}
        <Link
          href="/search"
          className={`${popover.trigger} ${styles.phoneSearch}`}
          aria-label={tn('search')}
          title={tn('search')}
        >
          <SearchIcon />
        </Link>
        <InviteCenter titles={tableTitles} />
        <ThemeSwitcher />
        <LocaleSwitcher />
        <AccountMenu />
      </div>
      <PopoverCloser />
    </header>
  );
}
