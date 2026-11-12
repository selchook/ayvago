import { describe, expect, it } from 'vitest';
import { LAUNCH_YEAR, copyrightYears } from './copyright';

describe('copyrightYears', () => {
  it('is the launch year alone in the launch year', () => {
    expect(LAUNCH_YEAR).toBe(2026);
    expect(copyrightYears(2026)).toBe('2026');
  });

  it('is a range with an en dash in later years', () => {
    expect(copyrightYears(2027)).toBe('2026–2027');
    expect(copyrightYears(2031)).toBe('2026–2031');
  });

  it('never goes before the launch year (a wrong device clock)', () => {
    expect(copyrightYears(2019)).toBe('2026');
  });

  it('takes another launch year', () => {
    expect(copyrightYears(2030, 2028)).toBe('2028–2030');
  });
});
