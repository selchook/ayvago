import { describe, expect, it } from 'vitest';
import {
  CHARACTER_IDS,
  characterPreviewPath,
  DEFAULT_CHARACTER,
  isCharacterId,
  readCharacterId,
  RETIRED_CHARACTER_IDS,
} from './characters';

describe('characters', () => {
  it('lists the five contract ids in display order, default first', () => {
    expect(CHARACTER_IDS).toEqual(['adventurer', 'explorer', 'rookie', 'soldier', 'zombie']);
    expect(new Set(CHARACTER_IDS).size).toBe(CHARACTER_IDS.length);
    expect(CHARACTER_IDS[0]).toBe(DEFAULT_CHARACTER);
    expect(DEFAULT_CHARACTER).toBe('adventurer');
  });

  it('accepts every listed id and nothing else', () => {
    for (const id of CHARACTER_IDS) expect(isCharacterId(id), id).toBe(true);
    for (const value of ['', 'alien', 'Adventurer', 'alien-red', ' zombie', null, 3, {}]) {
      expect(isCharacterId(value), String(value)).toBe(false);
    }
  });

  it('never accepts a retired id again', () => {
    for (const id of RETIRED_CHARACTER_IDS) {
      expect(isCharacterId(id), id).toBe(false);
      expect((CHARACTER_IDS as readonly string[]).includes(id), id).toBe(false);
    }
  });

  it('reads stored values as a listed id or "not chosen"', () => {
    for (const id of CHARACTER_IDS) expect(readCharacterId(id)).toBe(id);
    // Profiles and rooms saved before slice 5.1b may hold an alien id.
    for (const value of [...RETIRED_CHARACTER_IDS, undefined, null, '', 'Zombie', 7]) {
      expect(readCharacterId(value), String(value)).toBeNull();
    }
  });

  it('keeps ids safe for rules patterns and file names', () => {
    for (const id of CHARACTER_IDS) expect(id).toMatch(/^[a-z]+(-[a-z]+)?$/);
    expect(characterPreviewPath('zombie')).toBe('/characters/zombie.png');
  });
});
