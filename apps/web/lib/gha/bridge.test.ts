import { describe, expect, it } from 'vitest';
import {
  buildStartConfig,
  isTrustedGameMessage,
  originOf,
  parseGameMessage,
  relayableMove,
} from './bridge';

describe('isTrustedGameMessage', () => {
  const frame = {};
  const origin = 'https://orb-surge.vercel.app';

  it('accepts messages from the game frame and origin', () => {
    expect(isTrustedGameMessage({ origin, source: frame }, frame, origin)).toBe(true);
  });

  it('rejects another window with the right origin', () => {
    expect(isTrustedGameMessage({ origin, source: {} }, frame, origin)).toBe(false);
  });

  it('rejects the right window with another origin', () => {
    expect(
      isTrustedGameMessage({ origin: 'https://evil.example', source: frame }, frame, origin),
    ).toBe(false);
  });

  it('rejects everything before the frame exists', () => {
    expect(isTrustedGameMessage({ origin, source: null }, null, origin)).toBe(false);
  });
});

describe('parseGameMessage', () => {
  it('maps both v1 ready messages to ready', () => {
    expect(parseGameMessage({ type: 'GHA_READY' })).toEqual({ type: 'ready' });
    expect(parseGameMessage({ type: 'GHA_BRIDGE_READY' })).toEqual({ type: 'ready' });
  });

  it('accepts finite scores and rejects malformed ones', () => {
    expect(parseGameMessage({ type: 'GHA_SCORE', score: 4200 })).toEqual({
      type: 'score',
      score: 4200,
    });
    expect(parseGameMessage({ type: 'GHA_SCORE', score: '4200' })).toBeNull();
    expect(parseGameMessage({ type: 'GHA_SCORE', score: Infinity })).toBeNull();
    expect(parseGameMessage({ type: 'GHA_SCORE', score: 1e15 })).toBeNull();
  });

  it('keeps game-over messages even without a score', () => {
    expect(parseGameMessage({ type: 'GHA_END', won: false })).toEqual({
      type: 'end',
      score: null,
      won: false,
    });
  });

  it('clamps loading progress to 0..1', () => {
    expect(parseGameMessage({ type: 'GHA_LOADING', progress: 3 })).toEqual({
      type: 'loading',
      progress: 1,
    });
  });

  it('validates ad requests', () => {
    expect(
      parseGameMessage({
        type: 'GHA_AD_REQUEST',
        id: 3,
        format: 'rewarded',
        placement: 'continue',
      }),
    ).toEqual({ type: 'adRequest', id: 3, format: 'rewarded', placement: 'continue' });
    expect(parseGameMessage({ type: 'GHA_AD_REQUEST', id: '3', format: 'rewarded' })).toBeNull();
    expect(parseGameMessage({ type: 'GHA_AD_REQUEST', id: 3, format: 'popup' })).toBeNull();
  });

  it('ignores unknown and non-object payloads', () => {
    expect(parseGameMessage({ type: 'SOMETHING_ELSE' })).toBeNull();
    expect(parseGameMessage('GHA_READY')).toBeNull();
    expect(parseGameMessage(null)).toBeNull();
  });
});

describe('buildStartConfig', () => {
  it('includes the v1 fields and protocol 2 additions', () => {
    const config = buildStartConfig({
      theme: 'arcade',
      colorMode: 'dark',
      tokens: { '--accent': '#39ff88' },
      locale: 'tr',
      adsEnabled: false,
    });
    expect(config).toMatchObject({ mode: 'solo', isHost: true, playerIndex: 0, playerCount: 1 });
    expect(config).toMatchObject({ protocol: 2, theme: 'arcade', locale: 'tr' });
  });

  it('seats both players of an online match', () => {
    const base = {
      theme: 'arcade',
      colorMode: 'dark',
      tokens: {},
      locale: 'en',
      adsEnabled: false,
    } as const;
    expect(buildStartConfig(base, { isHost: true, peerName: 'Ayşe' })).toMatchObject({
      mode: 'multiplayer',
      isHost: true,
      playerIndex: 0,
      playerCount: 2,
      peerName: 'Ayşe',
    });
    expect(buildStartConfig(base, { isHost: false, peerName: 'Mert' })).toMatchObject({
      mode: 'multiplayer',
      isHost: false,
      playerIndex: 1,
    });
  });
  it('seats every player of a table game (protocol 2.3)', () => {
    const base = {
      theme: 'arcade',
      colorMode: 'dark',
      tokens: {},
      locale: 'en',
      adsEnabled: false,
    } as const;
    const config = buildStartConfig(base, {
      isHost: false,
      peerName: '',
      table: {
        index: 2,
        seats: [
          { name: 'Ayşe', character: 'explorer', bot: false },
          { name: 'Bot 1', character: 'zombie', bot: true },
          { name: 'Mert', character: 'not-a-character', bot: false },
          { name: 'Bot 2', bot: true },
        ],
      },
    });
    expect(config).toMatchObject({
      mode: 'multiplayer',
      isHost: false,
      playerIndex: 2,
      playerCount: 4,
    });
    // Bots never carry a character; unknown ids are left out.
    expect(config.seats).toEqual([
      { name: 'Ayşe', character: 'explorer', bot: false },
      { name: 'Bot 1', bot: true },
      { name: 'Mert', bot: false },
      { name: 'Bot 2', bot: true },
    ]);
  });
});

describe('buildStartConfig characters (protocol 2.2)', () => {
  const base = {
    theme: 'arcade',
    colorMode: 'dark',
    tokens: {},
    locale: 'en',
    adsEnabled: false,
  } as const;

  it("sends the player's chosen character in solo runs", () => {
    expect(buildStartConfig({ ...base, character: 'zombie' })).toMatchObject({
      mode: 'solo',
      character: 'zombie',
    });
  });

  it('omits the character when none is chosen or the id is unknown', () => {
    for (const character of [undefined, null, '', 'alien-red', 'alien-green', 'Zombie']) {
      const config = buildStartConfig({ ...base, character });
      expect(config, String(character)).not.toHaveProperty('character');
      expect(config).not.toHaveProperty('peerCharacter');
    }
  });

  it("sends both players' characters in an online match", () => {
    expect(
      buildStartConfig(
        { ...base, character: 'adventurer' },
        { isHost: false, peerName: 'Ayşe', peerCharacter: 'soldier' },
      ),
    ).toMatchObject({
      mode: 'multiplayer',
      character: 'adventurer',
      peerCharacter: 'soldier',
    });
  });

  it("omits the opponent's character when they have none or it is unknown", () => {
    for (const peerCharacter of [undefined, null, 'robot', 'alien-pink']) {
      const config = buildStartConfig(
        { ...base, character: 'rookie' },
        { isHost: true, peerName: 'Mert', peerCharacter },
      );
      expect(config).not.toHaveProperty('peerCharacter');
      expect(config).toMatchObject({ character: 'rookie', peerName: 'Mert' });
    }
  });

  it('never sends a peer character in solo runs', () => {
    expect(buildStartConfig({ ...base, character: 'explorer' })).not.toHaveProperty(
      'peerCharacter',
    );
  });
});

describe('relayableMove', () => {
  it('accepts small JSON moves and rejects the rest', () => {
    expect(relayableMove({ t: 'move', d: { col: 3 } })).toBe('{"t":"move","d":{"col":3}}');
    expect(relayableMove({ blob: 'x'.repeat(20_000) })).toBeNull();
    expect(relayableMove(undefined)).toBeNull();
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(relayableMove(cyclic)).toBeNull();
  });
});

describe('originOf', () => {
  it('drops the path', () => {
    expect(originOf('https://orb-surge.vercel.app/play?x=1')).toBe('https://orb-surge.vercel.app');
  });
});

describe('buildStartConfig best (protocol 2.4)', () => {
  const base = {
    theme: 'minimal',
    colorMode: 'light',
    tokens: {},
    locale: 'tr',
    adsEnabled: false,
  } as const;

  it("sends the player's server best as stored, zero included", () => {
    expect(buildStartConfig({ ...base, best: 4200 })).toMatchObject({ best: 4200 });
    expect(buildStartConfig({ ...base, best: 0 })).toMatchObject({ best: 0 });
    // Lower-is-better games send their lowest time; the platform passes it unchanged.
    expect(buildStartConfig({ ...base, best: 12.5 })).toMatchObject({ best: 12.5 });
  });

  it('sends null when the player has no score yet', () => {
    const config = buildStartConfig({ ...base, best: null });
    expect(config).toHaveProperty('best', null);
  });

  it('leaves best out when it is unknown or not a finite number', () => {
    for (const best of [undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(buildStartConfig({ ...base, best }), String(best)).not.toHaveProperty('best');
    }
  });

  it('sends best in online matches too', () => {
    expect(
      buildStartConfig({ ...base, best: null }, { isHost: true, peerName: 'Ayşe' }),
    ).toMatchObject({ mode: 'multiplayer', best: null });
  });
});
