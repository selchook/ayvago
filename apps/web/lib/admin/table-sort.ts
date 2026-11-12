// Sorting for the admin panel's report tables (slice 5.25): pure helpers, so the order rules are
// unit-tested without a browser. The hook and the heading component live in components/admin.

/** How a column compares: counts and durations as numbers, dates by time, text by collation. */
export type SortKind = 'number' | 'duration' | 'date' | 'text';
export type SortDirection = 'ascending' | 'descending';
/** The chosen column and direction. */
export type ActiveSort = { key: string; direction: SortDirection };
/** null keeps the order the rows came in (the table's default). */
export type SortState = ActiveSort | null;
/** A cell's sort value; null (no value, e.g. never played) always goes last. */
export type SortValue = number | string | Date | null | undefined;

/** Numbers, durations and dates start with the biggest or most recent; text starts at A. */
export const firstDirection = (kind: SortKind): SortDirection =>
  kind === 'text' ? 'ascending' : 'descending';

/** A click on a heading: the same column flips its direction, another one starts afresh. */
export function nextSort(current: SortState, key: string, kind: SortKind): ActiveSort {
  if (current?.key === key) {
    return { key, direction: current.direction === 'ascending' ? 'descending' : 'ascending' };
  }
  return { key, direction: firstDirection(kind) };
}

const isMissing = (value: SortValue): value is null | undefined =>
  value === null ||
  value === undefined ||
  (typeof value === 'number' && Number.isNaN(value)) ||
  (value instanceof Date && Number.isNaN(value.getTime()));

const numeric = (value: number | string | Date): number =>
  value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Number(value);

/**
 * A sorted copy of `rows`. Rows with no value come last in both directions, and ties keep the
 * order of `rows`, so sorting falls back to the table's default order and is stable. Text uses
 * the collator (the UI locale's, so Turkish ç ğ ı İ ö ş ü fall into place).
 */
export function sortRows<T>(
  rows: readonly T[],
  accessor: (row: T) => SortValue,
  kind: SortKind,
  direction: SortDirection,
  collator: Intl.Collator,
): T[] {
  const sign = direction === 'ascending' ? 1 : -1;
  const keyed = rows.map((row, index) => ({ row, index, value: accessor(row) }));
  keyed.sort((a, b) => {
    const aMissing = isMissing(a.value);
    const bMissing = isMissing(b.value);
    if (aMissing || bMissing) {
      return aMissing === bMissing ? a.index - b.index : aMissing ? 1 : -1;
    }
    const x = a.value as number | string | Date;
    const y = b.value as number | string | Date;
    const order =
      kind === 'text' ? collator.compare(String(x), String(y)) : numeric(x) - numeric(y);
    return sign * Math.sign(order) || a.index - b.index;
  });
  return keyed.map(({ row }) => row);
}

/** sessionStorage key of a table's sort. */
export const sortStorageKey = (table: string) => `ayvago.admin.sort.${table}`;

/** A stored sort, if it still names one of the table's columns; anything else reads as none. */
export function parseSort(raw: string | null, keys: readonly string[]): SortState {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { key?: unknown; direction?: unknown };
    if (
      typeof value?.key === 'string' &&
      keys.includes(value.key) &&
      (value.direction === 'ascending' || value.direction === 'descending')
    ) {
      return { key: value.key, direction: value.direction };
    }
  } catch {
    // a damaged entry is ignored
  }
  return null;
}
