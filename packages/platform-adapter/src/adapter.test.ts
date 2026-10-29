import { describe, expect, it, vi } from 'vitest';
import {
  createPlatformAdapter,
  isAllowedPlatformOrigin,
  DEFAULT_PLATFORM_ORIGINS,
  type HostEnv,
  type StartConfig,
} from './adapter';

const PLATFORM = 'https://ayvago.com';

const START: StartConfig = {
  mode: 'solo',
  isHost: true,
  playerIndex: 0,
  playerCount: 1,
  theme: 'retro',
  colorMode: 'dark',
  tokens: { '--accent': '#39ff88', '--bg-card': '#0f141a' },
  locale: 'tr',
  adsEnabled: false,
  protocol: 2,
};

type Handler = (data: unknown, origin: string, fromParent: boolean) => void;

// Fake host: records posted messages and lets tests deliver messages to the game.
function fakeEnv(overrides: Partial<HostEnv> = {}) {
  const handlers = new Set<Handler>();
  const posted: { message: Record<string, unknown>; origin: string }[] = [];
  const styles: Record<string, string> = {};
  const env: HostEnv = {
    embedded: true,
    parentOrigin: PLATFORM,
    language: 'en',
    post: (message, origin) => posted.push({ message, origin }),
    listen: (handler) => {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    setTimeout: (cb, ms) => setTimeout(cb, ms),
    clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    rootStyle: { setProperty: (name, value) => (styles[name] = value) },
    ...overrides,
  };
  const deliver = (data: unknown, origin = PLATFORM, fromParent = true) =>
    handlers.forEach((h) => h(data, origin, fromParent));
  return { env, posted, deliver, styles };
}

async function connected(config: StartConfig = START) {
  const host = fakeEnv();
  const pending = createPlatformAdapter({ gameId: 'orbsurge', env: host.env });
  host.deliver({ type: 'GHA_START', config });
  return { adapter: await pending, ...host };
}

describe('origin allow-list', () => {
  it('accepts the platform and its preview deployments', () => {
    expect(isAllowedPlatformOrigin('https://ayvago.com', DEFAULT_PLATFORM_ORIGINS)).toBe(true);
    expect(
      isAllowedPlatformOrigin('https://ayvago-git-main.vercel.app', DEFAULT_PLATFORM_ORIGINS),
    ).toBe(true);
  });

  it('rejects look-alike origins', () => {
    for (const origin of [
      'https://ayvago.com.evil.example',
      'https://evil-ayvago.com',
      'https://ayvago-x.vercel.app.evil.example',
      'http://ayvago.com',
    ]) {
      expect(isAllowedPlatformOrigin(origin, DEFAULT_PLATFORM_ORIGINS), origin).toBe(false);
    }
  });
});

describe('createPlatformAdapter', () => {
  it('is standalone when not embedded', async () => {
    const { env, posted } = fakeEnv({ embedded: false, parentOrigin: null, language: 'tr' });
    const adapter = await createPlatformAdapter({ gameId: 'x', env });
    expect(adapter.name).toBe('standalone');
    expect(adapter.locale).toBe('tr');
    expect(posted).toEqual([]);
  });

  it('is standalone inside an unknown site and never talks to it', async () => {
    const { env, posted } = fakeEnv({ parentOrigin: 'https://portal.example' });
    const adapter = await createPlatformAdapter({ gameId: 'x', env });
    expect(adapter.name).toBe('standalone');
    expect(posted).toEqual([]);
  });

  it('falls back to standalone when the platform does not answer', async () => {
    vi.useFakeTimers();
    const { env } = fakeEnv();
    const pending = createPlatformAdapter({ gameId: 'x', env, handshakeTimeoutMs: 1000 });
    vi.advanceTimersByTime(1000);
    expect((await pending).name).toBe('standalone');
    vi.useRealTimers();
  });

  it('sends GHA_READY to the platform origin only and adopts GHA_START', async () => {
    const { adapter, posted } = await connected();
    expect(posted[0]).toEqual({
      message: { type: 'GHA_READY', gameId: 'orbsurge', adapter: '2.2.0' },
      origin: PLATFORM,
    });
    expect(adapter.name).toBe('ayvago');
    expect(adapter.locale).toBe('tr');
    expect(adapter.config?.theme).toBe('retro');
  });

  it('ignores a GHA_START that does not come from the parent platform', async () => {
    vi.useFakeTimers();
    const host = fakeEnv();
    const pending = createPlatformAdapter({ gameId: 'x', env: host.env, handshakeTimeoutMs: 500 });
    host.deliver({ type: 'GHA_START', config: START }, 'https://evil.example', true);
    host.deliver({ type: 'GHA_START', config: START }, PLATFORM, false);
    vi.advanceTimersByTime(500);
    expect((await pending).name).toBe('standalone');
    vi.useRealTimers();
  });
});

describe('ayvago adapter', () => {
  it('reports scores and game over', async () => {
    const { adapter, posted } = await connected();
    adapter.gameplayStart();
    adapter.submitScore(120);
    adapter.endGame({ score: 480, won: false });
    adapter.submitScore(Number.NaN);
    expect(posted.slice(1).map((p) => p.message)).toEqual([
      { type: 'GHA_SESSION_START' },
      { type: 'GHA_SCORE', score: 120 },
      { type: 'GHA_END', score: 480, won: false, message: undefined },
    ]);
    expect(posted.every((p) => p.origin === PLATFORM)).toBe(true);
  });

  it('dispatches pause, resume, mute, theme and locale callbacks', async () => {
    const { adapter, deliver } = await connected();
    const events: string[] = [];
    adapter.onPause(() => events.push('pause'));
    adapter.onResume(() => events.push('resume'));
    adapter.onMute((muted) => events.push(`mute:${muted}`));
    adapter.onThemeChange((t) => events.push(`theme:${t.theme}/${t.colorMode}`));
    adapter.onLocaleChange((l) => events.push(`locale:${l}`));

    deliver({ type: 'GHA_PAUSE' });
    deliver({ type: 'GHA_RESUME' });
    deliver({ type: 'GHA_MUTE', muted: true });
    deliver({ type: 'GHA_THEME_CHANGE', theme: 'cartoon', colorMode: 'light', tokens: {} });
    deliver({ type: 'GHA_LOCALE_CHANGE', locale: 'en' });
    deliver({ type: 'GHA_PAUSE' }, 'https://evil.example');

    expect(events).toEqual(['pause', 'resume', 'mute:true', 'theme:cartoon/light', 'locale:en']);
    expect(adapter.locale).toBe('en');
  });

  it('keeps working when a game callback throws', async () => {
    const { adapter, deliver } = await connected();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const calls: string[] = [];
    adapter.onPause(() => {
      throw new Error('boom');
    });
    adapter.onPause(() => calls.push('second'));
    deliver({ type: 'GHA_PAUSE' });
    expect(calls).toEqual(['second']);
    spy.mockRestore();
  });

  it('resolves ad requests immediately when ads are disabled', async () => {
    const { adapter, posted } = await connected();
    await expect(adapter.requestRewarded('continue')).resolves.toBe(false);
    await expect(adapter.requestInterstitial('game_over')).resolves.toBeUndefined();
    expect(posted.some((p) => p.message.type === 'GHA_AD_REQUEST')).toBe(false);
  });

  it('round-trips rewarded ads when enabled and times out safely', async () => {
    vi.useFakeTimers();
    const host = fakeEnv();
    const pending = createPlatformAdapter({ gameId: 'x', env: host.env, adTimeoutMs: 5000 });
    host.deliver({ type: 'GHA_START', config: { ...START, adsEnabled: true } });
    const adapter = await pending;

    const rewarded = adapter.requestRewarded('continue');
    const request = host.posted.at(-1)?.message;
    expect(request).toMatchObject({
      type: 'GHA_AD_REQUEST',
      format: 'rewarded',
      placement: 'continue',
    });
    host.deliver({ type: 'GHA_AD_RESULT', id: request?.id, shown: true, rewarded: true });
    await expect(rewarded).resolves.toBe(true);

    const unanswered = adapter.requestRewarded('continue');
    vi.advanceTimersByTime(5000);
    await expect(unanswered).resolves.toBe(false);
    vi.useRealTimers();
  });

  it('applies theme tokens as CSS custom properties', async () => {
    const { adapter, styles } = await connected();
    adapter.applyThemeTokens();
    expect(styles).toEqual({ '--accent': '#39ff88', '--bg-card': '#0f141a' });
  });
});

describe('multiplayer', () => {
  const MATCH: StartConfig = {
    ...START,
    mode: 'multiplayer',
    isHost: false,
    playerIndex: 1,
    playerCount: 2,
    peerName: 'Ayşe',
    character: 'zombie',
    peerCharacter: 'alien-pink',
  };

  it('is inactive in solo runs and standalone', async () => {
    const { adapter, posted } = await connected();
    expect(adapter.multiplayer.active).toBe(false);
    adapter.multiplayer.send({ col: 3 });
    expect(posted.some((p) => p.message.type === 'GHA_MOVE_OUT')).toBe(false);

    const { env } = fakeEnv({ embedded: false, parentOrigin: null });
    const standalone = await createPlatformAdapter({ gameId: 'connectfour', env });
    expect(standalone.multiplayer.active).toBe(false);
  });

  it('exposes the seat and the opponent', async () => {
    const { adapter } = await connected(MATCH);
    expect(adapter.multiplayer).toMatchObject({
      active: true,
      isHost: false,
      playerIndex: 1,
      peerName: 'Ayşe',
      peerCharacter: 'alien-pink',
    });
    expect(adapter.config?.character).toBe('zombie');
  });

  it('sends moves to the platform origin and drops oversized ones', async () => {
    const { adapter, posted } = await connected(MATCH);
    adapter.multiplayer.send({ col: 3 });
    expect(posted.at(-1)).toEqual({
      message: { type: 'GHA_MOVE_OUT', data: { col: 3 } },
      origin: PLATFORM,
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const before = posted.length;
    adapter.multiplayer.send({ blob: 'x'.repeat(20_000) });
    expect(posted.length).toBe(before);
    warn.mockRestore();
  });

  it('delivers moves and peer events from the platform only', async () => {
    const { adapter, deliver } = await connected(MATCH);
    const moves: unknown[] = [];
    const events: string[] = [];
    adapter.multiplayer.onMove((data) => moves.push(data));
    adapter.multiplayer.onPeerLeave(() => events.push('leave'));
    adapter.multiplayer.onPeerJoin((name) => events.push('join:' + name));
    deliver({ type: 'GHA_MOVE_IN', data: { col: 4 } });
    deliver({ type: 'GHA_MOVE_IN', data: { col: 5 } }, 'https://evil.example');
    deliver({ type: 'GHA_PEER_LEAVE' });
    deliver({ type: 'GHA_PEER_JOIN', name: 'Ayşe' });
    expect(moves).toEqual([{ col: 4 }]);
    expect(events).toEqual(['leave', 'join:Ayşe']);
  });
});
