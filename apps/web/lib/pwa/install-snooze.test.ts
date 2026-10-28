import { describe, expect, it } from 'vitest';
import { isSnoozed, nextDismissal, parseDismissal } from './install-snooze';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 28);

describe('install banner snooze', () => {
  it('is not snoozed before the first "Not now"', () => {
    expect(isSnoozed(parseDismissal(null), NOW)).toBe(false);
  });

  it('grows with every dismissal: 14, 30, then 90 days', () => {
    const first = nextDismissal(null, NOW);
    expect(isSnoozed(first, NOW + 13 * DAY)).toBe(true);
    expect(isSnoozed(first, NOW + 14 * DAY)).toBe(false);

    const second = nextDismissal(first, NOW);
    expect(second.count).toBe(2);
    expect(isSnoozed(second, NOW + 29 * DAY)).toBe(true);
    expect(isSnoozed(second, NOW + 30 * DAY)).toBe(false);

    const fifth = { at: NOW, count: 5 };
    expect(isSnoozed(fifth, NOW + 89 * DAY)).toBe(true);
    expect(isSnoozed(fifth, NOW + 90 * DAY)).toBe(false);
  });

  it('reads what it stores and the bare timestamp of slice 2.9', () => {
    const stored = JSON.stringify(nextDismissal({ at: 1, count: 1 }, NOW));
    expect(parseDismissal(stored)).toEqual({ at: NOW, count: 2 });
    expect(parseDismissal(String(NOW))).toEqual({ at: NOW, count: 1 });
    expect(parseDismissal('not json')).toBeNull();
    expect(parseDismissal('{"at":1,"count":0}')).toBeNull();
  });
});
