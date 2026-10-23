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
  });
});
