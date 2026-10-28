import { describe, expect, it } from 'vitest';
import { matchesSearch, normalizeSearch } from './search';

describe('game search', () => {
  it('folds case, accents and the Turkish dotless i', () => {
    expect(normalizeSearch('  Yılan   OYUNU ')).toBe('yilan oyunu');
    expect(normalizeSearch('Çekiç Ğ Ş Ö Ü İ')).toBe('cekic g s o u i');
  });

  it('needs every word of the query, in any order', () => {
    const text = normalizeSearch('Retro Snake Retro Yılan retro-snake Arcade Retro');
    expect(matchesSearch(text, 'yilan')).toBe(true);
    expect(matchesSearch(text, 'SNAKE arc')).toBe(true);
    expect(matchesSearch(text, 'snake golf')).toBe(false);
  });

  it('matches everything for an empty query', () => {
    expect(matchesSearch('anything', '   ')).toBe(true);
  });
});
