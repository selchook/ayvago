import { describe, expect, it } from 'vitest';
import { SUPPORTED_LOCALES } from './locales';
import {
  allGuestWordPairs,
  generateGuestName,
  isValidUsername,
  usernameKey,
  usernameProblem,
} from './profile';

describe('usernames', () => {
  it('accepts letters, Turkish letters, digits and underscores', () => {
    for (const name of ['abc', 'PixelFox4821', 'HızlıTilki0007', 'Çağrı_99', 'a'.repeat(20)]) {
      expect(isValidUsername(name), name).toBe(true);
    }
  });

  it('rejects names that are too short, too long or start with a non-letter', () => {
    for (const name of [
      'ab',
      'a'.repeat(21),
      '1abc',
      '_abc',
      'has space',
      'emoji🙂',
      '<b>x</b>',
      '',
    ]) {
      expect(isValidUsername(name), name).toBe(false);
    }
  });
});

describe('guest names', () => {
  it('produces valid usernames for every word pair and digit range', () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const [adjective, noun] of allGuestWordPairs(locale)) {
        expect(isValidUsername(`${adjective}${noun}0000`), `${adjective}${noun}`).toBe(true);
        expect(isValidUsername(`${adjective}${noun}9999`), `${adjective}${noun}`).toBe(true);
      }
    }
  });

  it('is deterministic for a given random source', () => {
    const fixed = () => 0;
    expect(generateGuestName('en', fixed)).toBe('BraveComet0000');
    expect(generateGuestName('tr', fixed)).toBe('CesurTilki0000');
  });

  it('always ends with four digits', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateGuestName('tr')).toMatch(/\d{4}$/);
    }
  });
});

describe('username keys and filters', () => {
  it('folds case and Turkish letters', () => {
    expect(usernameKey('Ayşe')).toBe(usernameKey('AYSE'));
    expect(usernameKey('IŞIK_Çağrı')).toBe('isik_cagri');
    expect(usernameKey('Öğrenci')).toBe('ogrenci');
    expect(usernameKey('İstanbul')).toBe('istanbul');
  });

  it('accepts ordinary names, including ones that contain short blocked words', () => {
    for (const name of ['PixelFox', 'Ayşe_99', 'Gothic', 'Dickens', 'Mosik', 'Picasso', 'Sikke']) {
      expect(usernameProblem(name), name).toBeNull();
    }
  });

  it('rejects reserved and offensive names', () => {
    expect(usernameProblem('Admin')).toBe('reserved');
    expect(usernameProblem('ayvago_official')).toBe('reserved');
    expect(usernameProblem('Destek2')).toBe('reserved');
    expect(usernameProblem('Misafir')).toBe('reserved');
    expect(usernameProblem('xFuckx')).toBe('offensive');
    expect(usernameProblem('Orospu1')).toBe('offensive');
    expect(usernameProblem('amk')).toBe('offensive');
    expect(usernameProblem('Pic_1')).toBe('offensive');
  });

  it('reports invalid shapes first', () => {
    expect(usernameProblem('ab')).toBe('invalid');
    expect(usernameProblem('1abc')).toBe('invalid');
  });
});
