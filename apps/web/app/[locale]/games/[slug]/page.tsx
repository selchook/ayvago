import { pickLocalized, type Locale } from '@ayvago/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CoverArt } from '@/components/catalog/cover-art';
import { GameTile } from '@/components/catalog/game-tile';
import { GamePlayer } from '@/components/game/game-player';
import { LeaderboardPanel } from '@/components/leaderboard/leaderboard-panel';
import styles from '@/components/game/game.module.css';
import { TrophyIcon, UsersIcon } from '@/components/icons';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import {
  categoryPath,
  gameDescription,
  gamePath,
  gameTitle,
  getAllGames,
  getGameBySlug,
  getRelatedGames,
  type CatalogGame,
} from '@/lib/catalog';
import { getRankings } from '@/lib/catalog/rankings';
import { getTileLabels, toTiles } from '@/lib/catalog/tiles';
import { SITE_URL, localizedAlternates } from '@/lib/seo';

type Props = { params: Promise<{ locale: Locale; slug: string }> };

export function generateStaticParams() {
  return getAllGames().map((game) => ({ slug: game.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const game = getGameBySlug(slug);
  if (!game) return {};
  const t = await getTranslations({ locale, namespace: 'metadata' });
  const title = gameTitle(game, locale);
  const description = `${gameDescription(game, locale)} ${t('gameDescriptionSuffix')}`;
  return {
    title,
    description,
    alternates: localizedAlternates(locale, gamePath(game)),
    openGraph: {
      title,
      description,
      type: 'website',
      ...(game.coverUrl ? { images: [{ url: game.coverUrl, width: 1920, height: 1080 }] } : {}),
    },
    ...(game.coverUrl ? { twitter: { card: 'summary_large_image', images: [game.coverUrl] } } : {}),
  };
}

// schema.org VideoGame data so search engines can show rich results for game pages.
function jsonLd(game: CatalogGame, locale: Locale, categoryLabel: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'VideoGame',
    name: gameTitle(game, locale),
    description: gameDescription(game, locale),
    url: `${SITE_URL}/${locale}${gamePath(game)}`,
    genre: categoryLabel,
    keywords: game.manifest.tags.join(', '),
    ...(game.coverUrl ? { image: game.coverUrl } : {}),
    gamePlatform: 'Web browser',
    applicationCategory: 'Game',
    operatingSystem: 'Any',
    playMode: game.multiplayer ? 'MultiPlayer' : 'SinglePlayer',
    inLanguage: routing.locales,
    offers: { '@type': 'Offer', price: 0, priceCurrency: 'USD' },
  };
}

export default async function GamePage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const game = getGameBySlug(slug);
  if (!game) notFound();

  const t = await getTranslations();
  const { manifest } = game;
  const title = gameTitle(game, locale);
  const categoryLabel = t(`categories.${manifest.category}`);
  const rankings = await getRankings();
  const [related, labels] = await Promise.all([
    toTiles(getRelatedGames(game, rankings), locale),
    getTileLabels(),
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        // JSON.stringify output contains no HTML; "<" is escaped to keep it inert inside <script>.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd(game, locale, categoryLabel)).replace(/</g, '\\u003c'),
        }}
      />
      <div className={styles.layout}>
        <div>
          <GamePlayer
            slug={game.slug}
            gameId={manifest.id}
            title={title}
            entry={manifest.entry}
            comingSoon={game.status === 'coming_soon'}
            orientation={manifest.orientation}
            scoreOrder={manifest.scoring.order}
            scoreFormat={manifest.scoring.format}
            cover={
              <CoverArt
                id={manifest.id}
                title={title}
                category={manifest.category}
                size="hero"
                plain
                image={game.coverUrl}
              />
            }
          />

          <div className={styles.details}>
            <div className={styles.titleRow}>
              <h1>{title}</h1>
              <p className={styles.meta}>
                <Link href={categoryPath(manifest.category)}>{categoryLabel}</Link>
                <span>{t('game.players', { count: manifest.players.max })}</span>
              </p>
            </div>

            {game.multiplayer && game.status === 'live' ? (
              <section className={styles.card} aria-labelledby="online-heading">
                <h2 id="online-heading">
                  <UsersIcon />
                  {t('online.playWithFriend')}
                </h2>
                <p>{t('online.playWithFriendHint')}</p>
                <Link
                  href={`${gamePath(game)}/room`}
                  className={styles.friendButton}
                  prefetch={false}
                >
                  {t('online.createRoom')}
                </Link>
              </section>
            ) : null}

            <section className={styles.section} aria-labelledby="about-heading">
              <h2 id="about-heading">{t('game.description')}</h2>
              <p>{gameDescription(game, locale)}</p>
            </section>

            <section className={styles.section} aria-labelledby="controls-heading">
              <h2 id="controls-heading">{t('game.controls')}</h2>
              <ul className={styles.chips}>
                {manifest.input.map((input) => (
                  <li key={input}>{t(`input.${input}`)}</li>
                ))}
              </ul>
            </section>

            {manifest.tags.length > 0 ? (
              <section className={styles.section} aria-labelledby="tags-heading">
                <h2 id="tags-heading">{t('game.tags')}</h2>
                <ul className={styles.chips}>
                  {manifest.tags.map((tag) => (
                    <li key={tag}>#{tag}</li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        </div>

        <aside className={styles.aside}>
          <section id="leaderboard" className={styles.card} aria-labelledby="leaderboard-heading">
            <h2 id="leaderboard-heading">
              <TrophyIcon />
              {t('game.leaderboard')}
            </h2>
            {game.status === 'live' ? (
              <LeaderboardPanel
                gameId={manifest.id}
                slug={game.slug}
                order={manifest.scoring.order}
                scoreFormat={manifest.scoring.format}
                scoreLabel={pickLocalized(manifest.scoring.label, locale)}
                limit={10}
              />
            ) : (
              <p>{t('game.leaderboardSoon')}</p>
            )}
          </section>

          <section className={styles.section} aria-labelledby="related-heading">
            <h2 id="related-heading">{t('game.related')}</h2>
            <ul className={styles.related}>
              {related.map((tile) => (
                <li key={tile.slug}>
                  <GameTile tile={tile} labels={labels} />
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </>
  );
}
