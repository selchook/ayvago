import { describe, expect, it } from 'vitest';
import { formatScore } from './format';

describe('formatScore', () => {
  it('uses locale grouping for numbers', () => {
    expect(formatScore(12450, 'number', 'en')).toBe('12,450');
    expect(formatScore(12450, 'number', 'tr')).toBe('12.450');
  });

  it('formats times as m:ss.SSS with the locale decimal separator', () => {
    expect(formatScore(62345, 'time', 'en')).toBe('1:02.345');
    expect(formatScore(62345, 'time', 'tr')).toBe('1:02,345');
  });

  it('adds hours for long times', () => {
    expect(formatScore(3_723_004, 'time', 'en')).toBe('1:02:03.004');
  });
});
