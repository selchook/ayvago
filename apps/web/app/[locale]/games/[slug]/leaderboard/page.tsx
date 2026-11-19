import { pickLocalized, type Locale } from '@ayvago/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import styles from '@/components/game/game.module.css';
import { TrophyIcon } from '@/components/icons';
import { LastSeason } from '@/components/leaderboard/last-season';
import { LeaderboardPanel } from '@/components/leaderboard/leaderboard-panel';
import { Link } from '@/i18n/navigation';
import { gamePath, gameTitle, getAllGames, getGameBySlug } from '@/lib/catalog';
import { localizedAlternates } from '@/lib/seo';

type Props = { params: Promise<{ locale: Locale; slug: string }> };

export function generateStaticParams() {
  return getAllGames().map((game) => ({ slug: game.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const game = getGameBySlug(slug);
  if (!game) return {};
  const t = await getTranslations({ locale });
  const title = gameTitle(game, locale);
  return {
    title: t('leaderboard.pageTitle', { title }),
    description: t('metadata.leaderboardDescription', { title }),
    alternates: localizedAlternates(locale, `${gamePath(game)}/leaderboard`),
    // The board loads in the browser, so crawlers see a nearly empty page that repeats the game
    // page: kept out of the index (and the sitemap), its links still followed (slice 3.5).
    robots: { index: false, follow: true },
  };
}

export default async function LeaderboardPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const game = getGameBySlug(slug);
  if (!game) notFound();

  const t = await getTranslations('leaderboard');
  const { manifest } = game;
  const title = gameTitle(game, locale);
  const scoreLabel = pickLocalized(manifest.scoring.label, locale);

  return (
    <div className={styles.leaderboardPage}>
      <header className={styles.titleRow}>
        <h1>
          <TrophyIcon /> {t('pageTitle', { title })}
        </h1>
        <p className={styles.meta}>{t('pageIntro', { title })}</p>
        <p className={styles.meta}>
          <Link href={gamePath(game)}>{t('backToGame', { title })}</Link>
        </p>
      </header>

      {game.status === 'live' ? (
        <>
          <section className={styles.card} aria-label={t('boards')}>
            <LeaderboardPanel
              gameId={manifest.id}
              slug={game.slug}
              order={manifest.scoring.order}
              scoreFormat={manifest.scoring.format}
              scoreLabel={scoreLabel}
              limit={100}
              compact={false}
            />
          </section>
          <LastSeason
            gameId={manifest.id}
            scoreFormat={manifest.scoring.format}
            scoreLabel={scoreLabel}
          />
        </>
      ) : (
        <p className={styles.card}>{t('comingSoon')}</p>
      )}
    </div>
  );
}
