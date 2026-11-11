import { DEFAULT_AD_SETTINGS } from '@ayvago/shared';
import { describe, expect, it, vi } from 'vitest';
import { createAdManager, type AdDeps } from '../ads/manager';
import { EMPTY_LOG } from '../ads/policy';
import {
  adResult,
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
      difficulty: 'normal',
    });
  });

  it('reads the run difficulty from GHA_END (protocol 2.6)', () => {
    expect(parseGameMessage({ type: 'GHA_END', score: 40, difficulty: 'easy' })).toEqual({
      type: 'end',
      score: 40,
      won: null,
      difficulty: 'easy',
    });
    expect(parseGameMessage({ type: 'GHA_END', score: 40, difficulty: 'normal' })).toMatchObject({
      difficulty: 'normal',
    });
    // Older games send nothing; anything other than 'easy' is a normal (ranked) run.
    for (const difficulty of [undefined, null, 'EASY', 'hard', 1, true, { easy: true }]) {
      expect(parseGameMessage({ type: 'GHA_END', score: 40, difficulty })).toMatchObject({
        difficulty: 'normal',
      });
    }
  });

  it("reads the game's sound switch and rejects malformed ones", () => {
    expect(parseGameMessage({ type: 'GHA_MUTE_STATE', muted: true })).toEqual({
      type: 'muteState',
      muted: true,
    });
    expect(parseGameMessage({ type: 'GHA_MUTE_STATE', muted: 'yes' })).toBeNull();
    expect(parseGameMessage({ type: 'GHA_MUTE_STATE' })).toBeNull();
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

describe('buildStartConfig table settings (protocol 2.7)', () => {
  const base = {
    theme: 'minimal',
    colorMode: 'light',
    tokens: {},
    locale: 'tr',
    adsEnabled: false,
  } as const;
  const seats = [
    { name: 'Ayşe', bot: false },
    { name: 'Mert', bot: false },
    { name: 'Bot 1', bot: true },
  ];

  it('sends the settings and the host seat to table games', () => {
    const config = buildStartConfig(base, {
      isHost: true,
      peerName: '',
      table: {
        index: 1,
        seats,
        settings: { hands: 11, turnSeconds: 60, bots: true },
        hostSeat: 1,
      },
    });
    expect(config.table).toEqual({
      settings: { hands: 11, turnSeconds: 60, bots: true },
      hostSeat: 1,
    });
    expect(config).toMatchObject({ isHost: true, playerIndex: 1, playerCount: 3 });
  });

  it('falls back to seat 0 for a host seat outside the table', () => {
    const config = buildStartConfig(base, {
      isHost: false,
      peerName: '',
      table: { index: 1, seats, settings: { hands: 5, turnSeconds: 30, bots: false }, hostSeat: 7 },
    });
    expect(config.table?.hostSeat).toBe(0);
  });

  it('leaves table out of rooms, solo runs and tables without settings', () => {
    expect(buildStartConfig(base).table).toBeUndefined();
    expect(buildStartConfig(base, { isHost: true, peerName: 'Mert' }).table).toBeUndefined();
    expect(
      buildStartConfig(base, { isHost: true, peerName: '', table: { index: 0, seats } }).table,
    ).toBeUndefined();
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

// Ads while the admin switch is off (Phase 3, docs/adr/0023): exactly the behaviour before ads
// existed. GHA_START says adsEnabled: false and every GHA_AD_REQUEST is answered "not shown"
// at once, without loading anything.
describe('ads while off (regression)', () => {
  function offManager(clientId: string) {
    const deps: AdDeps = {
      clientId,
      bannerSlot: '',
      firebase: () => true,
      provider: {
        id: 'fake',
        load: vi.fn(async () => true),
        interstitial: vi.fn(async () => 'viewed' as const),
        rewarded: vi.fn(async () => 'viewed' as const),
        fillBanner: vi.fn(),
      },
      rewards: { begin: vi.fn(), claim: vi.fn() },
      storage: { readLog: () => EMPTY_LOG, writeLog: vi.fn() },
      consentDefaults: vi.fn(),
      track: vi.fn(),
      now: () => 0,
    };
    return { manager: createAdManager(deps), deps };
  }

  const theme = { theme: 'minimal' as const, colorMode: 'dark' as const, tokens: {}, locale: 'en' };

  it.each([
    ['no client ID', ''],
    ['the switch off', 'ca-pub-1234567890123456'],
  ])('sends adsEnabled: false in GHA_START with %s', async (_, clientId) => {
    const { manager } = offManager(clientId);
    manager.setSettings(DEFAULT_AD_SETTINGS);
    manager.setRemoveAds(false);
    const adsEnabled = await manager.startAdsEnabled(false);
    expect(buildStartConfig({ ...theme, adsEnabled }).adsEnabled).toBe(false);
  });

  it.each(['rewarded', 'interstitial'] as const)(
    'answers a %s request "not shown" at once',
    async (format) => {
      const { manager, deps } = offManager('');
      const message = parseGameMessage({ type: 'GHA_AD_REQUEST', id: 7, format, placement: 'x' });
      expect(message?.type).toBe('adRequest');
      if (message?.type !== 'adRequest') return;
      const answer = await manager.request({
        format: message.format,
        placement: message.placement,
        gameId: 'g',
        moment: { online: false, inRun: false },
      });
      expect(adResult(message.id, answer)).toEqual({
        type: 'GHA_AD_RESULT',
        id: 7,
        shown: false,
        rewarded: false,
      });
      expect(deps.provider.load).not.toHaveBeenCalled();
      expect(deps.rewards.begin).not.toHaveBeenCalled();
    },
  );

  it('never reports a reward for an ad that was not shown', () => {
    expect(adResult(1, { shown: false, rewarded: true })).toMatchObject({ rewarded: false });
    expect(adResult(1, { shown: true, rewarded: true })).toMatchObject({ rewarded: true });
  });
});
