import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TABLE_SETTINGS,
  isTableHands,
  isTableTurnSeconds,
  readTableSettings,
} from './tables';

describe('table settings', () => {
  it('accepts only the offered values', () => {
    expect([5, 11].every(isTableHands)).toBe(true);
    expect([0, 7, '5', null].some(isTableHands)).toBe(false);
    expect([15, 30, 60].every(isTableTurnSeconds)).toBe(true);
    expect([10, 45, '30'].some(isTableTurnSeconds)).toBe(false);
  });

  it('reads stored settings field by field, with the defaults for the rest', () => {
    expect(readTableSettings(undefined)).toEqual(DEFAULT_TABLE_SETTINGS);
    expect(readTableSettings({ hands: 11, turnSeconds: 60, bots: false })).toEqual({
      hands: 11,
      turnSeconds: 60,
      bots: false,
    });
    expect(readTableSettings({ hands: 11, turnSeconds: 99 })).toEqual({
      hands: 11,
      turnSeconds: 30,
      bots: true,
    });
  });
});
