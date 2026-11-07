import { ALL_TIME_PERIOD } from '@ayvago/shared';
import type { BoardResult } from './session';

// The player's best score on the server (docs/adr/0017-server-best-and-fresh-start.md), pure
// helpers; the Firestore reads are in server-best.ts. The all-time leaderboard entry,
// leaderboards/{gameId}/boards/all/entries/{uid}, holds it: written only by finishSession and the
// admin review, moved with a guest merge and removed with the account, so it is the one value
// every device agrees on. The browser library (lib/library.ts) is only the fallback for when the
// server cannot answer.

/** Longest wait for the server best before GHA_START goes out without it. */
export const START_BEST_TIMEOUT_MS = 1500;

/** The best score in an all-time entry document, or null when there is no usable one. */
export function entryScore(data: unknown): number | null {
  if (typeof data !== 'object' || data === null) return null;
  const { score, periodKey } = data as { score?: unknown; periodKey?: unknown };
  if (periodKey !== undefined && periodKey !== ALL_TIME_PERIOD) return null;
  return typeof score === 'number' && Number.isFinite(score) ? score : null;
}

/** Resolves to the promise's value, or undefined when it fails or takes longer than `ms`. */
export function within<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(undefined);
      },
    );
  });
}

export type StartBestSources = {
  enabled(): boolean;
  /** The signed-in uid once the auth state is known; null when nobody is signed in. */
  uid(): Promise<string | null>;
  /** The player's stored best, null when they have none. */
  read(uid: string): Promise<number | null>;
};

/**
 * The `best` for GHA_START (protocol 2.4):
 * - a number: the player's best on the server, as stored (lowest for lower-is-better games);
 * - null: nobody is signed in yet (a new guest is being made) or the player has no score;
 * - undefined: Firebase is off, or the read failed or took longer than `timeoutMs`, so the game
 *   keeps its own value.
 */
export function bestForStart(
  sources: StartBestSources,
  timeoutMs = START_BEST_TIMEOUT_MS,
): Promise<number | null | undefined> {
  if (!sources.enabled()) return Promise.resolve(undefined);
  const lookup = (async () => {
    const uid = await sources.uid();
    return uid ? sources.read(uid) : null;
  })();
  return within(lookup, timeoutMs);
}

/**
 * Whether a recorded run beat the player's earlier best on the all-time board. A first score is
 * not a personal best. Servers before slice 5.13 do not send `previous`; for them a previous
 * rank is set exactly when an earlier best was beaten.
 */
export function isPersonalBest(board: BoardResult): boolean {
  if (!board.improved) return false;
  if (board.previous !== undefined) return board.previous !== null;
  return board.previousRank !== null;
}
