import { GAME_CATEGORIES, type Locale } from '@ayvago/shared';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CoverArt } from '@/components/catalog/cover-art';
import { GameTile } from '@/components/catalog/game-tile';
import { ContinueShelf } from '@/components/catalog/continue-shelf';
import { Shelf } from '@/components/catalog/shelf';
import catalog from '@/components/catalog/catalog.module.css';
import styles from '@/components/page.module.css';
import { Link } from '@/i18n/navigation';
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
import { getTileLabels, toTiles } from '@/lib/catalog/tiles';

export default async function HomePage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  const [lead, ...others] = getFeaturedGames();
  const [spotlightTiles, allTiles, labels, rankings] = await Promise.all([
    toTiles(lead ? [lead, ...others.slice(0, 2)] : [], locale),
    toTiles(getAllGames(), locale),
    getTileLabels(),
    getRankings(),
  ]);
  const [leadTile, ...sideTiles] = spotlightTiles;
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
      {lead && leadTile ? (
        <section aria-labelledby="spotlight-heading">
          <h2 id="spotlight-heading" className={styles.eyebrow}>
            {t('home.spotlight')}
          </h2>
          <div className={styles.spotlight}>
            <Link href={gamePath(lead)} className={styles.spotlightMain}>
              <CoverArt
                id={lead.manifest.id}
                title={gameTitle(lead, locale)}
                category={lead.manifest.category}
                size="hero"
                image={lead.coverUrl}
              />
              <span className={styles.spotlightBody}>
                <strong>{gameTitle(lead, locale)}</strong>
                <p>{gameDescription(lead, locale)}</p>
                <span className={`${catalog.tags} ${styles.spotlightTags}`}>
                  {leadTile.categoryLabels.map((label, index) => (
                    <span key={label} className={catalog.tag} data-tone={index}>
                      {label}
                    </span>
                  ))}
                </span>
              </span>
            </Link>
            <ul className={styles.spotlightSide}>
              {sideTiles.map((tile) => (
                <li key={tile.slug}>
                  <GameTile tile={tile} labels={labels} />
                </li>
              ))}
            </ul>
          </div>
        </section>
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
