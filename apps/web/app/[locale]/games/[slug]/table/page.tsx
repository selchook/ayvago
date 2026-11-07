import type { Locale } from '@ayvago/shared';
import type { Metadata } from 'next';
import { TablePage, tableMetadata } from '@/components/game/table-page';
import { getTableGames } from '@/lib/catalog';

// "Play at a table": opens a table and moves to its invite address.
type Props = { params: Promise<{ locale: Locale; slug: string }> };

export function generateStaticParams() {
  return getTableGames().map((game) => ({ slug: game.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  return tableMetadata(locale, slug);
}

export default async function NewTablePage({ params }: Props) {
  const { locale, slug } = await params;
  return <TablePage locale={locale} slug={slug} code={null} />;
}
