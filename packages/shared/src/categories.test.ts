import { describe, expect, it } from 'vitest';
import { GAME_CATEGORIES, categoryFromSlug, categorySlug } from './categories';

describe('category slugs', () => {
  it('round-trips every category', () => {
    for (const category of GAME_CATEGORIES) {
      expect(categoryFromSlug(categorySlug(category))).toBe(category);
    }
  });

  it('rejects unknown slugs', () => {
    expect(categoryFromSlug('shooter')).toBeNull();
    // Retired before the categories matched the Ayvago Arcade genres (ADR 0009).
    expect(categoryFromSlug('retro-action')).toBeNull();
    expect(categoryFromSlug('board')).toBeNull();
  });

  it('matches the Ayvago Arcade genres', () => {
    expect([...GAME_CATEGORIES]).toEqual([
      'arcade',
      'action',
      'casual',
      'puzzle',
      'retro',
      'sports',
      'strategy',
      'card',
      'word',
    ]);
  });
});
