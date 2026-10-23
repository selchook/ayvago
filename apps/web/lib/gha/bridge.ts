import type { ColorMode, ThemeId } from '@ayvago/themes';

// Platform side of the game SDK protocol (v1-compatible GHA_* messages, protocol 2).
// Pure functions only, so the security-relevant parts can be unit tested.

export const PROTOCOL_VERSION = 2;

export type GameMessage =
  | { type: 'ready' }
  | { type: 'sessionStart' }
  | { type: 'loading'; progress: number }
  | { type: 'score'; score: number }
  | { type: 'end'; score: number | null; won: boolean | null }
  | { type: 'moveOut'; data: unknown }
  | { type: 'openLeaderboard' }
  | { type: 'adRequest'; id: number; format: 'rewarded' | 'interstitial'; placement: string };

export type StartConfig = {
  mode: 'solo' | 'multiplayer';
  isHost: boolean;
  playerIndex: number;
  playerCount: number;
  theme: ThemeId;
  colorMode: ColorMode;
  tokens: Record<string, string>;
  locale: string;
  adsEnabled: boolean;
  protocol: number;
};

export type PlatformMessage =
  | { type: 'GHA_START'; config: StartConfig }
  | { type: 'GHA_PAUSE' }
  | { type: 'GHA_RESUME' }
  | { type: 'GHA_MUTE'; muted: boolean }
  | {
      type: 'GHA_THEME_CHANGE';
      theme: ThemeId;
      colorMode: ColorMode;
      tokens: Record<string, string>;
    }
  | { type: 'GHA_LOCALE_CHANGE'; locale: string }
  | { type: 'GHA_AD_RESULT'; id: number; shown: boolean; rewarded: boolean };

// Highest score accepted from a game message; larger values are treated as malformed.
const MAX_REPORTED_SCORE = 1e12;

/**
 * A message is trusted only if it comes from the game's own iframe window AND from the
 * game's registered origin. Checking only one of the two is not enough: another frame on the
 * page could share the origin, or a navigated iframe could change origin.
 */
export function isTrustedGameMessage(
  event: { origin: string; source: unknown },
  frameWindow: unknown,
  gameOrigin: string,
): boolean {
  return frameWindow != null && event.source === frameWindow && event.origin === gameOrigin;
}

export function originOf(url: string): string {
  return new URL(url).origin;
}

function scoreValue(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    Math.abs(value) <= MAX_REPORTED_SCORE
    ? value
    : null;
}

// Validates and normalizes a raw postMessage payload from a game. Unknown or malformed
// messages return null and are ignored.
export function parseGameMessage(data: unknown): GameMessage | null {
  if (typeof data !== 'object' || data === null) return null;
  const msg = data as Record<string, unknown>;

  switch (msg.type) {
    case 'GHA_READY':
    case 'GHA_BRIDGE_READY':
      return { type: 'ready' };
    case 'GHA_SESSION_START':
      return { type: 'sessionStart' };
    case 'GHA_LOADING': {
      const progress = typeof msg.progress === 'number' ? msg.progress : NaN;
      return Number.isFinite(progress)
        ? { type: 'loading', progress: Math.min(1, Math.max(0, progress)) }
        : null;
    }
    case 'GHA_SCORE': {
      const score = scoreValue(msg.score);
      return score === null ? null : { type: 'score', score };
    }
    case 'GHA_END':
      return {
        type: 'end',
        score: scoreValue(msg.score),
        won: typeof msg.won === 'boolean' ? msg.won : null,
      };
    case 'GHA_MOVE_OUT':
      return { type: 'moveOut', data: msg.data };
    case 'GHA_OPEN_LEADERBOARD':
      return { type: 'openLeaderboard' };
    case 'GHA_AD_REQUEST': {
      const { id, format, placement } = msg;
      if (typeof id !== 'number' || !Number.isInteger(id)) return null;
      if (format !== 'rewarded' && format !== 'interstitial') return null;
      return {
        type: 'adRequest',
        id,
        format,
        placement: typeof placement === 'string' ? placement : '',
      };
    }
    default:
      // GHA_SESSION_END duplicates GHA_END in the v1 SDK; GHA_GAMEPLAY_STOP and GHA_HAPPY_TIME
      // are accepted by the protocol but not used by the platform yet.
      return null;
  }
}

export function buildStartConfig(options: {
  theme: ThemeId;
  colorMode: ColorMode;
  tokens: Record<string, string>;
  locale: string;
  adsEnabled: boolean;
}): StartConfig {
  return {
    mode: 'solo',
    isHost: true,
    playerIndex: 0,
    playerCount: 1,
    protocol: PROTOCOL_VERSION,
    ...options,
  };
}
