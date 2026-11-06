import type { Locale } from '@ayvago/shared';
import type { Metadata } from 'next';
import { TablePage, tableMetadata } from '@/components/game/table-page';

// A table from an invite link: the host's own table or a free seat for a friend.
type Props = { params: Promise<{ locale: Locale; slug: string; code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  return tableMetadata(locale, slug);
}

export default async function JoinTablePage({ params }: Props) {
  const { locale, slug, code } = await params;
  return <TablePage locale={locale} slug={slug} code={code} />;
}
