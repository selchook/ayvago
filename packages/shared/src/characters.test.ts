import { describe, expect, it } from 'vitest';
import {
  CHARACTER_IDS,
  characterPreviewPath,
  DEFAULT_CHARACTER,
  isCharacterId,
} from './characters';

describe('characters', () => {
  it('lists the ten contract ids in display order, default first', () => {
    expect(CHARACTER_IDS).toEqual([
      'alien-green',
      'alien-blue',
      'alien-pink',
      'alien-yellow',
      'alien-beige',
      'adventurer',
      'explorer',
      'rookie',
      'soldier',
      'zombie',
    ]);
    expect(new Set(CHARACTER_IDS).size).toBe(CHARACTER_IDS.length);
    expect(CHARACTER_IDS[0]).toBe(DEFAULT_CHARACTER);
  });

  it('accepts every listed id and nothing else', () => {
    for (const id of CHARACTER_IDS) expect(isCharacterId(id), id).toBe(true);
    for (const value of ['', 'alien', 'Alien-Green', 'alien-red', ' zombie', null, 3, {}]) {
      expect(isCharacterId(value), String(value)).toBe(false);
    }
  });

  it('keeps ids safe for rules patterns and file names', () => {
    for (const id of CHARACTER_IDS) expect(id).toMatch(/^[a-z]+(-[a-z]+)?$/);
    expect(characterPreviewPath('zombie')).toBe('/characters/zombie.png');
  });
});
