import { describe, expect, it } from 'vitest';
import { toRoom } from './room-data';

const base = {
  gameId: 'connectfour',
  slug: 'connect-four',
  hostUid: 'host',
  hostName: 'PixelFox4821',
  createdAt: 1,
  status: 'open',
};

describe('toRoom characters', () => {
  it("reads each seat's listed character", () => {
    expect(
      toRoom('ABC234', { ...base, hostCharacter: 'explorer', guestCharacter: 'zombie' }),
    ).toMatchObject({ hostCharacter: 'explorer', guestCharacter: 'zombie' });
  });

  it('reads missing, unknown and retired alien characters as no choice', () => {
    for (const value of [undefined, '', 'robot', 'Zombie', 'alien-green', 'alien-pink']) {
      expect(
        toRoom('ABC234', { ...base, hostCharacter: value, guestCharacter: value }),
        String(value),
      ).toMatchObject({ hostCharacter: null, guestCharacter: null });
    }
  });
});
