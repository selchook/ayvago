import { describe, expect, it } from 'vitest';
import {
  isCloseSwipe,
  parseRailExpanded,
  RAIL_BOOTSTRAP_SCRIPT,
  RAIL_STORAGE_KEY,
  readRailExpanded,
  writeRailExpanded,
} from './rail';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

const blocked = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
  removeItem: () => {
    throw new Error('SecurityError');
  },
};

describe('parseRailExpanded', () => {
  it('expands only on the exact stored value', () => {
    expect(parseRailExpanded('expanded')).toBe(true);
    expect(parseRailExpanded('collapsed')).toBe(false);
    expect(parseRailExpanded('true')).toBe(false);
    expect(parseRailExpanded('')).toBe(false);
    expect(parseRailExpanded(null)).toBe(false);
    expect(parseRailExpanded(undefined)).toBe(false);
  });
});

describe('readRailExpanded / writeRailExpanded', () => {
  it('starts collapsed', () => {
    expect(readRailExpanded(memoryStorage())).toBe(false);
  });

  it('remembers the expanded choice and forgets it when collapsed', () => {
    const storage = memoryStorage();
    writeRailExpanded(storage, true);
    expect(storage.data.get(RAIL_STORAGE_KEY)).toBe('expanded');
    expect(readRailExpanded(storage)).toBe(true);
    writeRailExpanded(storage, false);
    expect(storage.data.has(RAIL_STORAGE_KEY)).toBe(false);
    expect(readRailExpanded(storage)).toBe(false);
  });

  it('reads a foreign value as collapsed', () => {
    expect(readRailExpanded(memoryStorage({ [RAIL_STORAGE_KEY]: '1' }))).toBe(false);
  });

  it('never throws when storage is blocked or missing', () => {
    expect(readRailExpanded(blocked)).toBe(false);
    expect(() => writeRailExpanded(blocked, true)).not.toThrow();
    expect(readRailExpanded(null)).toBe(false);
    expect(() => writeRailExpanded(undefined, true)).not.toThrow();
  });
});

describe('RAIL_BOOTSTRAP_SCRIPT', () => {
  function run(storage: unknown) {
    const attributes = new Map<string, string>();
    const documentElement = { setAttribute: (k: string, v: string) => attributes.set(k, v) };
    new Function('localStorage', 'document', RAIL_BOOTSTRAP_SCRIPT)(storage, { documentElement });
    return attributes;
  }

  it('marks <html> when the rail was left expanded', () => {
    expect(run(memoryStorage({ [RAIL_STORAGE_KEY]: 'expanded' })).get('data-rail')).toBe(
      'expanded',
    );
  });

  it('leaves <html> alone otherwise, also with blocked storage', () => {
    expect(run(memoryStorage()).size).toBe(0);
    expect(run(blocked).size).toBe(0);
  });
});

describe('isCloseSwipe', () => {
  it('closes on a long, mostly sideways swipe to the left', () => {
    expect(isCloseSwipe(-80, 10)).toBe(true);
    expect(isCloseSwipe(-60, 0)).toBe(true);
  });

  it('ignores short, rightward and vertical moves', () => {
    expect(isCloseSwipe(-40, 0)).toBe(false);
    expect(isCloseSwipe(120, 0)).toBe(false);
    expect(isCloseSwipe(-80, 70)).toBe(false);
    expect(isCloseSwipe(0, -200)).toBe(false);
  });
});
