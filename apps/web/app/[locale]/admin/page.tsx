import type { Locale } from '@ayvago/shared';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AdminView, type AdminGame } from '@/components/admin/admin-view';
import { gameTitle, getAllGames } from '@/lib/catalog';

type Props = { params: Promise<{ locale: Locale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin' });
  return { title: t('title'), robots: { index: false, follow: false } };
}

export default async function AdminPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  // Access is decided in the browser from the `admin` claim; the data itself is protected by
  // Firestore rules and the admin-only functions.
  const games: AdminGame[] = getAllGames()
    .filter((game) => game.status === 'live')
    .map((game) => ({
      gameId: game.manifest.id,
      title: gameTitle(game, locale),
      scoreFormat: game.manifest.scoring.format,
    }));
  return <AdminView games={games} />;
}
