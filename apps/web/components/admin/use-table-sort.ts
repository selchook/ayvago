'use client';

import { useLocale } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  nextSort,
  parseSort,
  sortRows,
  sortStorageKey,
  type SortDirection,
  type SortKind,
  type SortState,
  type SortValue,
} from '@/lib/admin/table-sort';

export type SortColumn<T> = { kind: SortKind; value: (row: T) => SortValue };

/** What a sortable heading needs (spread into `<SortableTh>`). */
export type SortHeading = {
  /** The column's direction while it is the active one, else null. */
  direction: SortDirection | null;
  /** What a click on the heading does: sort in that direction, or go back to the default order. */
  next: SortDirection | 'default';
  onSort: () => void;
};

function readStored(table: string, keys: readonly string[]): SortState {
  if (typeof window === 'undefined') return null;
  try {
    return parseSort(window.sessionStorage.getItem(sortStorageKey(table)), keys);
  } catch {
    return null; // storage blocked
  }
}

function store(table: string, sort: SortState) {
  try {
    if (sort) window.sessionStorage.setItem(sortStorageKey(table), JSON.stringify(sort));
    else window.sessionStorage.removeItem(sortStorageKey(table));
  } catch {
    // storage blocked or full: the sort still applies until the page is left
  }
}

/**
 * Click-to-sort for one admin table (slice 5.25). Without a choice the rows keep the order they
 * came in (the table's default); a choice is kept for the browser session under `table`.
 */
export function useTableSort<T, K extends string>(
  table: string,
  rows: readonly T[],
  columns: Record<K, SortColumn<T>>,
) {
  const locale = useLocale();
  const [sort, setSort] = useState<SortState>(() => readStored(table, Object.keys(columns)));
  const collator = useMemo(() => new Intl.Collator(locale, { numeric: true }), [locale]);
  const column = sort ? columns[sort.key as K] : undefined;

  const sorted = useMemo(
    () =>
      sort && column ? sortRows(rows, column.value, column.kind, sort.direction, collator) : rows,
    // `column` follows `sort.key`: the accessors read the same fields on every render
    [rows, sort, collator],
  );

  const heading = (key: K): SortHeading => {
    const kind = columns[key].kind;
    const direction = sort?.key === key ? sort.direction : null;
    return {
      direction,
      next: nextSort(sort, key, kind)?.direction ?? 'default',
      onSort: () => {
        const next = nextSort(sort, key, kind);
        setSort(next);
        store(table, next);
      },
    };
  };

  return { rows: sorted, sort, heading };
}
