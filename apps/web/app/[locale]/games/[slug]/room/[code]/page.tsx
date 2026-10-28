import type { Locale } from '@ayvago/shared';
import type { Metadata } from 'next';
import { RoomPage, roomMetadata } from '@/components/game/room-page';

// An online room from an invite link: the host's own room or a seat for the friend.
type Props = { params: Promise<{ locale: Locale; slug: string; code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  return roomMetadata(locale, slug);
}

export default async function JoinRoomPage({ params }: Props) {
  const { locale, slug, code } = await params;
  return <RoomPage locale={locale} slug={slug} code={code} />;
}
