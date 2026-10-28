import { describe, expect, it } from 'vitest';
import { ROOM_CODE_PATTERN, generateRoomCode, parseRoomCode } from './room-code';

describe('room codes', () => {
  it('generates valid codes without look-alike characters', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateRoomCode();
      expect(code).toMatch(ROOM_CODE_PATTERN);
      expect(code).not.toMatch(/[01OIL]/);
    }
  });

  it('skips biased bytes', () => {
    // 248 and above would favor the first characters; they are skipped.
    let calls = 0;
    const random = (n: number) => new Uint8Array(n).fill(calls++ === 0 ? 255 : 0);
    expect(generateRoomCode(random)).toBe('AAAAAA');
  });

  it('normalizes typed codes', () => {
    expect(parseRoomCode(' abc-def ')).toBe('ABCDEF');
    expect(parseRoomCode('ab2 34z')).toBe('AB234Z');
    expect(parseRoomCode('ABC0EF')).toBeNull();
    expect(parseRoomCode('ABCDE')).toBeNull();
  });
});
