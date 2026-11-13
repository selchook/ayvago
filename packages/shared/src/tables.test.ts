import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TABLE_SETTINGS,
  isDuelTable,
  isTableHands,
  isTableTurnSeconds,
  readTableSettings,
  tableSettingsFor,
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

describe('two-seat tables (docs/adr/0026)', () => {
  it('are duels: two seats, never more', () => {
    expect(isDuelTable(2)).toBe(true);
    expect(isDuelTable(3)).toBe(false);
    expect(isDuelTable(4)).toBe(false);
  });

  it('never allow bots, whatever was chosen', () => {
    expect(tableSettingsFor(2)).toEqual({ ...DEFAULT_TABLE_SETTINGS, bots: false });
    expect(tableSettingsFor(2, { hands: 11, turnSeconds: 15, bots: true })).toEqual({
      hands: 11,
      turnSeconds: 15,
      bots: false,
    });
  });

  it('keep the chosen settings at bigger tables', () => {
    expect(tableSettingsFor(4)).toEqual(DEFAULT_TABLE_SETTINGS);
    const chosen = { hands: 11, turnSeconds: 60, bots: false } as const;
    expect(tableSettingsFor(4, chosen)).toEqual(chosen);
  });
});
