import type { Locale } from '@ayvago/shared';
import { pickLocalized } from '@ayvago/shared';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ProfileView, type ProfileGame } from '@/components/account/profile-view';
import { gameTitle, getAllGames } from '@/lib/catalog';

type Props = { params: Promise<{ locale: Locale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'profile' });
  // Personal page: useful to the player, not to search engines.
  return { title: t('title'), robots: { index: false } };
}

export default async function ProfilePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  // The profile itself is loaded in the browser; the page only supplies catalog details for
  // the best-score list.
  const games: ProfileGame[] = getAllGames().map((game) => ({
    slug: game.slug,
    title: gameTitle(game, locale),
    scoreFormat: game.manifest.scoring.format,
    scoreLabel: pickLocalized(game.manifest.scoring.label, locale),
  }));
  return <ProfileView games={games} />;
}
