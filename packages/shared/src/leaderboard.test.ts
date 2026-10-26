import { describe, expect, it } from 'vitest';
import {
  calibrationEndsAt,
  previousSeasonKey,
  rankInTop,
  seasonEnd,
  seasonKey,
  seasonStart,
  TOP_SIZE,
  upsertRow,
  type BoardRow,
} from './leaderboard';

const at = (iso: string) => Date.parse(iso);
const row = (uid: string, score: number, achievedAt = 0): BoardRow => ({
  uid,
  username: uid,
  avatarId: null,
  isGuest: false,
  score,
  achievedAt,
  continued: false,
});

describe('weekly seasons', () => {
  it('turn over on Monday at 09:00 UTC', () => {
    expect(seasonKey(at('2026-10-25T12:00:00Z'))).toBe('s-2026-W43');
    expect(seasonKey(at('2026-10-26T08:59:59Z'))).toBe('s-2026-W43');
    expect(seasonKey(at('2026-10-26T09:00:00Z'))).toBe('s-2026-W44');
    expect(seasonStart(at('2026-10-25T12:00:00Z'))).toBe(at('2026-10-19T09:00:00Z'));
    expect(seasonEnd(at('2026-10-25T12:00:00Z'))).toBe(at('2026-10-26T09:00:00Z'));
    expect(previousSeasonKey(at('2026-10-26T09:00:00Z'))).toBe('s-2026-W43');
  });

  it('use the ISO week-year around new year', () => {
    // Monday 2026-12-28 is in ISO week 53 of 2026; the season runs into January.
    expect(seasonKey(at('2027-01-04T08:00:00Z'))).toBe('s-2026-W53');
    expect(seasonKey(at('2027-01-04T09:00:00Z'))).toBe('s-2027-W01');
  });
});

describe('top list', () => {
  it('keeps one row per player, best first, earlier score first on ties', () => {
    let top = [row('a', 50, 1), row('b', 40, 1)];
    top = upsertRow(top, row('c', 50, 0), 'desc');
    top = upsertRow(top, row('b', 70, 2), 'desc');
    expect(top.map((r) => r.uid)).toEqual(['b', 'c', 'a']);
    expect(rankInTop(top, 'a')).toBe(3);
    expect(rankInTop(top, 'z')).toBeNull();
  });

  it('sorts ascending boards lowest first and cuts the list', () => {
    let top: BoardRow[] = [];
    for (let i = 0; i < TOP_SIZE + 5; i++) top = upsertRow(top, row(`p${i}`, 1000 - i), 'asc');
    expect(top).toHaveLength(TOP_SIZE);
    expect(top[0]!.score).toBe(1000 - (TOP_SIZE + 4));
  });
});

describe('calibration', () => {
  it('starts at the later of the game launch and the leaderboards launch', () => {
    expect(calibrationEndsAt('2026-10-20')).toBe(at('2026-11-09T00:00:00Z'));
    expect(calibrationEndsAt('2026-12-01')).toBe(at('2026-12-15T00:00:00Z'));
  });
});
