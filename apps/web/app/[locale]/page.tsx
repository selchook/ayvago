import { GAME_CATEGORIES, type Locale } from '@ayvago/shared';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CoverArt } from '@/components/catalog/cover-art';
import { GameTile } from '@/components/catalog/game-tile';
import { Shelf } from '@/components/catalog/shelf';
import styles from '@/components/page.module.css';
import { Link } from '@/i18n/navigation';
import {
  categoryPath,
  gameDescription,
  gamePath,
  gameTitle,
  getFeaturedGames,
  getGamesByCategory,
  getMultiplayerGames,
  getNewestGames,
} from '@/lib/catalog';
import { getTileLabels, toTiles } from '@/lib/catalog/tiles';

export default async function HomePage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  const [lead, ...others] = getFeaturedGames();
  const [sideTiles, labels] = await Promise.all([
    toTiles(others.slice(0, 2), locale),
    getTileLabels(),
  ]);

  return (
    <>
      <h1 className="visually-hidden">{t('home.tagline')}</h1>
      {lead ? (
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
              />
              <span className={styles.spotlightBody}>
                <strong>{gameTitle(lead, locale)}</strong>
                <p>{gameDescription(lead, locale)}</p>
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
          games={getGamesByCategory(category)}
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
