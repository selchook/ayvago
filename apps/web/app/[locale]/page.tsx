import { GAME_CATEGORIES, type Locale } from '@ayvago/shared';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ContinueShelf } from '@/components/catalog/continue-shelf';
import { Shelf } from '@/components/catalog/shelf';
import { SpotlightCarousel, type SpotlightSlide } from '@/components/catalog/spotlight-carousel';
import styles from '@/components/page.module.css';
import {
  categoryPath,
  gameDescription,
  gamePath,
  gameTitle,
  getFeaturedGames,
  getGamesByCategory,
  getAllGames,
  getMultiplayerGames,
  getNewestGames,
} from '@/lib/catalog';
import { getRankings, rankGames } from '@/lib/catalog/rankings';
import { pickSpotlight } from '@/lib/catalog/spotlight';
import { getTileLabels, toTiles } from '@/lib/catalog/tiles';

export default async function HomePage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  const [allTiles, labels, rankings] = await Promise.all([
    toTiles(getAllGames(), locale),
    getTileLabels(),
    getRankings(),
  ]);
  // Spotlight: the games trending today, filled up with this week's trend and the featured games
  // (slice 5.17). The ranking job runs hourly, so the carousel follows the day.
  const picks = pickSpotlight(getAllGames(), getFeaturedGames(), rankings);
  const slides: SpotlightSlide[] = picks.map(({ game, reason, rank }) => ({
    slug: game.slug,
    href: gamePath(game),
    id: game.manifest.id,
    title: gameTitle(game, locale),
    description: gameDescription(game, locale),
    category: game.manifest.category,
    cover: game.coverUrl,
    categoryLabels: allTiles.find((tile) => tile.slug === game.slug)?.categoryLabels ?? [],
    badge:
      reason === 'today'
        ? t('home.spotlightToday', { rank })
        : reason === 'week'
          ? t('home.spotlightWeek')
          : t('home.spotlightFeatured'),
    reason,
  }));
  // "Popular this week" needs play data; it stays hidden until the ranking job has scores.
  const popular = rankGames(getAllGames(), rankings, 'trendScore').filter(
    (game) => (rankings?.games[game.manifest.id]?.trendScore ?? 0) > 0,
  );

  return (
    <>
      <h1 className="visually-hidden">{t('home.tagline')}</h1>
      <ContinueShelf
        title={t('home.continueShelf')}
        seeAllLabel={t('home.seeAll')}
        tiles={allTiles}
        labels={labels}
      />
      {slides.length > 0 ? (
        <div>
          <h2 id="spotlight-heading" className={styles.eyebrow}>
            {t('home.spotlight')}
          </h2>
          <SpotlightCarousel slides={slides} labelledBy="spotlight-heading" />
        </div>
      ) : null}

      <Shelf id="popular" title={t('home.popularShelf')} games={popular} locale={locale} />

      <Shelf
        id="new"
        title={t('home.newShelf')}
        games={getNewestGames()}
        locale={locale}
        seeAllHref="/new"
      />

      {GAME_CATEGORIES.map((category) => (
        <Shelf
          key={category}
          id={category}
          title={t('home.categoryShelf', { category: t(`categories.${category}`) })}
          games={rankGames(getGamesByCategory(category), rankings, 'qualityScore')}
          locale={locale}
          seeAllHref={categoryPath(category)}
        />
      ))}

      <Shelf
        id="multiplayer"
        title={t('home.multiplayerShelf')}
        games={getMultiplayerGames()}
        locale={locale}
        seeAllHref="/multiplayer"
      />
    </>
  );
}
