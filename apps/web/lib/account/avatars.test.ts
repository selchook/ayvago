import { describe, expect, it } from 'vitest';
import { AVATAR_COLORS, AVATAR_GLYPHS, avatarId, parseAvatarId } from './avatars';

// Same pattern as validPreferences() in firebase/firestore.rules.
const RULES_PATTERN = /^[a-z]{2,12}-[a-z]{2,12}$/;

describe('avatar presets', () => {
  it('round-trips every preset and matches the Firestore rules pattern', () => {
    for (const glyph of AVATAR_GLYPHS) {
      for (const color of Object.keys(AVATAR_COLORS) as (keyof typeof AVATAR_COLORS)[]) {
        const id = avatarId({ glyph, color });
        expect(id).toMatch(RULES_PATTERN);
        expect(parseAvatarId(id)).toEqual({ glyph, color });
      }
    }
  });

  it('rejects unknown ids', () => {
    for (const id of [
      '',
      'rocket',
      'rocket-neon',
      'sword-blue',
      'https://x/a.png',
      null,
      undefined,
    ]) {
      expect(parseAvatarId(id)).toBeNull();
    }
  });
});
