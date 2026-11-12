'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import styles from './admin.module.css';
import type { SortHeading } from './use-table-sort';

/**
 * A sortable column heading (slice 5.25): the heading's content is a button, the active column
 * carries `aria-sort` and an arrow, the others show a faint double arrow on hover and focus.
 * `label` is the plain column name for the button's accessible name ("Sort by Plays, descending",
 * what a click does); `children` is what the heading shows, `label` when omitted.
 */
export function SortableTh({
  label,
  children,
  className,
  rowSpan,
  direction,
  next,
  onSort,
}: SortHeading & {
  label: string;
  children?: ReactNode;
  className?: string;
  rowSpan?: number;
}) {
  const t = useTranslations('admin.sort');
  return (
    <th scope="col" className={className} rowSpan={rowSpan} aria-sort={direction ?? undefined}>
      <button
        type="button"
        className={styles.sortButton}
        data-active={direction ? 'true' : undefined}
        aria-label={t(next, { column: label })}
        onClick={onSort}
      >
        <span>{children ?? label}</span>
        <SortArrow direction={direction} />
      </button>
    </th>
  );
}

// One centred triangle for the active direction, both halves of a double arrow otherwise.
const ARROWS = {
  ascending: 'M5 3.5 9.5 10H.5Z',
  descending: 'M5 10.5.5 4h9Z',
  none: 'M5 1 9 6H1ZM5 13 1 8h8Z',
} as const;

/** ▲ / ▼ on the active column, a faint ↕ elsewhere (shown on hover and focus by the CSS). */
function SortArrow({ direction }: { direction: SortHeading['direction'] }) {
  return (
    <svg
      className={styles.sortArrow}
      width="10"
      height="14"
      viewBox="0 0 10 14"
      aria-hidden="true"
      focusable="false"
    >
      <path d={ARROWS[direction ?? 'none']} fill="currentColor" />
    </svg>
  );
}
