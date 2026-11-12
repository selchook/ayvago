import { describe, expect, it } from 'vitest';
import {
  firstDirection,
  nextSort,
  parseSort,
  sortRows,
  sortStorageKey,
  type SortValue,
} from './table-sort';

const tr = new Intl.Collator('tr', { numeric: true });
const en = new Intl.Collator('en', { numeric: true });

type Row = { id: string; value: SortValue };
const rows = (...values: SortValue[]): Row[] =>
  values.map((value, i) => ({ id: String.fromCharCode(97 + i), value }));
const ids = (list: Row[]) => list.map((row) => row.id).join('');
const byValue = (row: Row) => row.value;

describe('sortRows', () => {
  it('sorts numbers both ways', () => {
    const list = rows(3, 10, 1, 7);
    expect(ids(sortRows(list, byValue, 'number', 'ascending', en))).toBe('cadb');
    expect(ids(sortRows(list, byValue, 'number', 'descending', en))).toBe('bdac');
  });

  it('sorts durations in seconds, not as text', () => {
    // 9 minutes, 1 h 30 min, 45 s, 2 h
    const list = rows(540, 5400, 45, 7200);
    expect(ids(sortRows(list, byValue, 'duration', 'descending', en))).toBe('dbac');
    expect(ids(sortRows(list, byValue, 'duration', 'ascending', en))).toBe('cabd');
  });

  it('sorts dates with missing ones last in both directions', () => {
    const list = rows(
      Date.parse('2026-11-10T10:00:00Z'),
      null,
      Date.parse('2026-11-12T08:00:00Z'),
      undefined,
      new Date('2026-11-11T00:00:00Z'),
    );
    expect(ids(sortRows(list, byValue, 'date', 'descending', en))).toBe('ceabd');
    expect(ids(sortRows(list, byValue, 'date', 'ascending', en))).toBe('aecbd');
  });

  it('puts missing numbers last too', () => {
    const list = rows(null, 0.4, Number.NaN, 0.9);
    expect(ids(sortRows(list, byValue, 'number', 'descending', en))).toBe('dbac');
    expect(ids(sortRows(list, byValue, 'number', 'ascending', en))).toBe('bdac');
  });

  it('collates Turkish text with the Turkish alphabet', () => {
    const list = rows('Çamur', 'Cadı', 'Cuma');
    // c < ç in Turkish: Cuma comes before Çamur
    expect(sortRows(list, byValue, 'text', 'ascending', tr).map((r) => r.value)).toEqual([
      'Cadı',
      'Cuma',
      'Çamur',
    ]);
    // English treats Ç as a C, so Çamur sits between Cadı and Cuma
    expect(sortRows(list, byValue, 'text', 'ascending', en).map((r) => r.value)).toEqual([
      'Cadı',
      'Çamur',
      'Cuma',
    ]);
    expect(sortRows(list, byValue, 'text', 'descending', tr).map((r) => r.value)).toEqual([
      'Çamur',
      'Cuma',
      'Cadı',
    ]);
  });

  it('keeps dotless ı before i, and I before İ, in Turkish', () => {
    const list = rows('inek', 'İnci', 'ılık', 'Irmak', 'Ozan', 'Öykü', 'Su', 'Şeker', 'Gül', 'ğ');
    expect(sortRows(list, byValue, 'text', 'ascending', tr).map((r) => r.value)).toEqual([
      'Gül',
      'ğ',
      'ılık',
      'Irmak',
      'İnci',
      'inek',
      'Ozan',
      'Öykü',
      'Su',
      'Şeker',
    ]);
  });

  it('compares numbers inside text by value', () => {
    const list = rows('Level 10', 'Level 2', 'Level 1');
    expect(ids(sortRows(list, byValue, 'text', 'ascending', en))).toBe('cba');
  });

  it('keeps the incoming order for ties, in both directions', () => {
    const list = rows(5, 2, 5, 2, 5);
    expect(ids(sortRows(list, byValue, 'number', 'descending', en))).toBe('acebd');
    expect(ids(sortRows(list, byValue, 'number', 'ascending', en))).toBe('bdace');
    const names = rows('Ada', 'Bora', 'Ada', null, null);
    expect(ids(sortRows(names, byValue, 'text', 'ascending', tr))).toBe('acbde');
    expect(ids(sortRows(names, byValue, 'text', 'descending', tr))).toBe('bacde');
  });

  it('returns a copy and leaves the input alone', () => {
    const list = rows(1, 2, 3);
    const sorted = sortRows(list, byValue, 'number', 'descending', en);
    expect(sorted).not.toBe(list);
    expect(ids(list)).toBe('abc');
  });
});

describe('nextSort', () => {
  it('starts numbers, durations and dates descending and text ascending', () => {
    expect(firstDirection('number')).toBe('descending');
    expect(firstDirection('duration')).toBe('descending');
    expect(firstDirection('date')).toBe('descending');
    expect(firstDirection('text')).toBe('ascending');
    expect(nextSort(null, 'plays', 'number')).toEqual({ key: 'plays', direction: 'descending' });
    expect(nextSort(null, 'player', 'text')).toEqual({ key: 'player', direction: 'ascending' });
  });

  it('flips on the second click and restores the default order on the third', () => {
    const first = nextSort(null, 'plays', 'number');
    const second = nextSort(first, 'plays', 'number');
    expect(second).toEqual({ key: 'plays', direction: 'ascending' });
    expect(nextSort(second, 'plays', 'number')).toBeNull();
    const text = nextSort(nextSort(null, 'player', 'text'), 'player', 'text');
    expect(text).toEqual({ key: 'player', direction: 'descending' });
    expect(nextSort(text, 'player', 'text')).toBeNull();
    // a fourth click starts the cycle again
    expect(nextSort(null, 'plays', 'number')).toEqual(first);
  });

  it('starts afresh on another heading', () => {
    const current = { key: 'plays', direction: 'ascending' } as const;
    expect(nextSort(current, 'time', 'duration')).toEqual({ key: 'time', direction: 'descending' });
    expect(nextSort(current, 'player', 'text')).toEqual({ key: 'player', direction: 'ascending' });
  });
});

describe('parseSort', () => {
  const keys = ['player', 'plays'];

  it('reads a stored sort of a known column', () => {
    expect(parseSort('{"key":"plays","direction":"ascending"}', keys)).toEqual({
      key: 'plays',
      direction: 'ascending',
    });
  });

  it('ignores nothing stored, other columns, bad directions and damaged entries', () => {
    expect(parseSort(null, keys)).toBeNull();
    expect(parseSort('null', keys)).toBeNull();
    expect(parseSort('{"key":"gone","direction":"ascending"}', keys)).toBeNull();
    expect(parseSort('{"key":"plays","direction":"up"}', keys)).toBeNull();
    expect(parseSort('{"key":', keys)).toBeNull();
  });

  it('keeps each table under its own key', () => {
    expect(sortStorageKey('report.players')).toBe('ayvago.admin.sort.report.players');
    expect(sortStorageKey('games')).not.toBe(sortStorageKey('report.games'));
  });
});
