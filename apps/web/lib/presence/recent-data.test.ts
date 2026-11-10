import type { SitePresence } from '@ayvago/shared';
import { describe, expect, it } from 'vitest';
import { recentAction, timeAgo } from './recent-data';

const presence = (changes: Partial<SitePresence> = {}): SitePresence => ({
  uid: 'b',
  name: 'Mert',
  character: null,
  level: 3,
  state: 'online',
  gameId: null,
  since: 0,
  dnd: false,
  ...changes,
});

describe('recent players', () => {
  it('says how long ago in minutes, hours or days', () => {
    const now = 10 * 24 * 3600_000;
    expect(timeAgo(now - 30_000, now)).toEqual({ unit: 'minutes', count: 0 });
    expect(timeAgo(now - 59 * 60_000, now)).toEqual({ unit: 'minutes', count: 59 });
    expect(timeAgo(now - 2 * 3600_000 - 5, now)).toEqual({ unit: 'hours', count: 2 });
    expect(timeAgo(now - 3 * 24 * 3600_000, now)).toEqual({ unit: 'days', count: 3 });
    // A clock running a bit ahead never shows a negative time.
    expect(timeAgo(now + 5000, now)).toEqual({ unit: 'minutes', count: 0 });
  });

  it('offers an invite only to online players who take invites and are not seated', () => {
    expect(recentAction(undefined, false)).toBe('loading');
    expect(recentAction(null, false)).toBe('offline');
    expect(recentAction(presence(), false)).toBe('invite');
    expect(recentAction(presence({ state: 'playing', gameId: 'okey' }), false)).toBe('invite');
    expect(recentAction(presence({ dnd: true }), false)).toBe('noInvites');
    expect(recentAction(presence(), true)).toBe('seated');
  });
});
