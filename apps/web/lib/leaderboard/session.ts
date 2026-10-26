import { firebaseEnabled, loadFunctions } from '@/lib/firebase/client';

// Score sessions (docs/specs/leaderboards.md §7): a run is registered with startSession when the
// game reports that gameplay started, and its score is submitted with finishSession when the
// game ends. Only the server decides what reaches a leaderboard.

type Session = { sessionId: string; token: string };

export type BoardResult = {
  improved: boolean;
  best: number;
  rank: number;
  previousRank: number | null;
};

/** Mirrors FinishResult in firebase/functions/src/sessions.ts. */
export type RunResult =
  | { status: 'rejected'; reason: string }
  | { status: 'flagged' }
  | { status: 'recorded'; boards: { season: BoardResult; all: BoardResult } };

/** Fired on window after a score reached the boards, so leaderboard views can refresh ranks. */
export const SCORE_RECORDED_EVENT = 'ayvago:score-recorded';

async function call<T>(name: string, data: unknown): Promise<T> {
  const [functions, { httpsCallable }] = await Promise.all([
    loadFunctions(),
    import('firebase/functions'),
  ]);
  return (await httpsCallable<unknown, T>(functions, name)(data)).data;
}

export type Run = {
  /** Submits the final score; null when the run was not registered or the call failed. */
  finish(score: number, continues?: number): Promise<RunResult | null>;
};

/**
 * Registers a run of `gameId`. `identity` resolves once the player is signed in (a guest at
 * least); the run is registered after that. Never throws: leaderboards are optional to play.
 */
export function beginRun(gameId: string, identity: Promise<unknown>): Run {
  const startedAt = Date.now();
  const session: Promise<Session | null> = firebaseEnabled()
    ? identity
        .then(() => call<Session>('startSession', { gameId }))
        .catch((error) => {
          console.warn('[leaderboard] run not registered', error);
          return null;
        })
    : Promise.resolve(null);

  let finished = false;
  return {
    async finish(score, continues = 0) {
      if (finished) return null;
      finished = true;
      const current = await session;
      if (!current) return null;
      try {
        const result = await call<RunResult>('finishSession', {
          ...current,
          score,
          durationMs: Date.now() - startedAt,
          continues,
        });
        if (result.status === 'recorded') {
          window.dispatchEvent(new CustomEvent(SCORE_RECORDED_EVENT, { detail: { gameId } }));
        }
        return result;
      } catch (error) {
        console.warn('[leaderboard] score not submitted', error);
        return null;
      }
    },
  };
}
