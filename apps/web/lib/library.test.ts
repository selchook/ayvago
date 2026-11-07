import { describe, expect, it } from 'vitest';
import { BEST_EPOCH, resetBestsForEpoch, type BestStore } from './library';

// A Storage stand-in over a Map, in insertion order like the browser's.
function fakeStore(
  entries: Record<string, string>,
): BestStore & { dump(): Record<string, string> } {
  const map = new Map(Object.entries(entries));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
    key: (index) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
    dump: () => Object.fromEntries(map),
  };
}

const favorites = JSON.stringify(['tetrix']);
const recent = JSON.stringify([{ slug: 'tetrix', playedAt: 1 }]);
const best = JSON.stringify({ tetrix: { score: 9000, order: 'desc' } });

describe('resetBestsForEpoch', () => {
  it('clears old best scores once and keeps favorites and recently played', () => {
    const store = fakeStore({
      'ayvago:favorites': favorites,
      'ayvago:recent': recent,
      'ayvago:best': best,
      'ayvago:best:snake': '120',
    });
    expect(resetBestsForEpoch(store)).toBe(true);
    expect(store.dump()).toEqual({
      'ayvago:favorites': favorites,
      'ayvago:recent': recent,
      'ayvago:best': '{}',
      'ayvago:best-epoch': BEST_EPOCH,
    });
  });

  it('leaves bests made after the reset alone', () => {
    const store = fakeStore({ 'ayvago:best': best, 'ayvago:best-epoch': BEST_EPOCH });
    expect(resetBestsForEpoch(store)).toBe(false);
    expect(store.getItem('ayvago:best')).toBe(best);
  });

  it('resets again for a later epoch', () => {
    const store = fakeStore({ 'ayvago:best': best, 'ayvago:best-epoch': BEST_EPOCH });
    expect(resetBestsForEpoch(store, '2027-01-01')).toBe(true);
    expect(store.getItem('ayvago:best')).toBe('{}');
    expect(store.getItem('ayvago:best-epoch')).toBe('2027-01-01');
  });

  it('marks a fresh browser without touching anything else', () => {
    const store = fakeStore({});
    expect(resetBestsForEpoch(store)).toBe(true);
    expect(store.dump()).toEqual({ 'ayvago:best': '{}', 'ayvago:best-epoch': BEST_EPOCH });
  });
});
