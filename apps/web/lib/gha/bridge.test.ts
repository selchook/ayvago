import { describe, expect, it } from 'vitest';
import { buildStartConfig, isTrustedGameMessage, originOf, parseGameMessage } from './bridge';

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
      theme: 'retro',
      colorMode: 'dark',
      tokens: { '--accent': '#39ff88' },
      locale: 'tr',
      adsEnabled: false,
    });
    expect(config).toMatchObject({ mode: 'solo', isHost: true, playerIndex: 0, playerCount: 1 });
    expect(config).toMatchObject({ protocol: 2, theme: 'retro', locale: 'tr' });
  });
});

describe('originOf', () => {
  it('drops the path', () => {
    expect(originOf('https://orb-surge.vercel.app/play?x=1')).toBe('https://orb-surge.vercel.app');
  });
});
