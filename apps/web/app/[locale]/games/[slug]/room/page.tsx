import type { Locale } from '@ayvago/shared';
import type { Metadata } from 'next';
import { RoomPage, roomMetadata } from '@/components/game/room-page';
import { getMultiplayerGames } from '@/lib/catalog';

// "Play with a friend": creates a room and moves to its invite address.
type Props = { params: Promise<{ locale: Locale; slug: string }> };

export function generateStaticParams() {
  return getMultiplayerGames().map((game) => ({ slug: game.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  return roomMetadata(locale, slug);
}

export default async function NewRoomPage({ params }: Props) {
  const { locale, slug } = await params;
  return <RoomPage locale={locale} slug={slug} code={null} />;
}
