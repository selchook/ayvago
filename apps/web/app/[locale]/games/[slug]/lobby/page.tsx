import type { Locale } from '@ayvago/shared';
import type { Metadata } from 'next';
import { LobbyPage, lobbyMetadata } from '@/components/lobby/lobby-page';
import { getTableGames } from '@/lib/catalog';

// The lobby of a table game: open tables, players online, invites (docs/adr/0019).
type Props = { params: Promise<{ locale: Locale; slug: string }> };

export function generateStaticParams() {
  return getTableGames().map((game) => ({ slug: game.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  return lobbyMetadata(locale, slug);
}

export default async function GameLobbyPage({ params }: Props) {
  const { locale, slug } = await params;
  return <LobbyPage locale={locale} slug={slug} />;
}
