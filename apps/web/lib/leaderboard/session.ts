import {
  callableHeaders,
  callableUrl,
  firebaseEnabled,
  loadFunctions,
} from '@/lib/firebase/client';
import { isRunProgress, type RunProgress } from '@/lib/progress/notes';
import { callableBody, runClock } from './run-clock';

// Score sessions (docs/specs/leaderboards.md §7): a run is registered with startSession when the
// game reports that gameplay started, and its score is submitted with finishSession when the
// game ends. Only the server decides what reaches a leaderboard. A run left without an end is
// reported with abandonSession (slice 5.22), so its play time still counts.

type Session = { sessionId: string; token: string };

export type BoardResult = {
  improved: boolean;
  best: number;
  /**
   * The player's best on this board before the run (null: this is their first score there).
   * Sent since slice 5.13; absent from older servers.
   */
  previous?: number | null;
  rank: number;
  previousRank: number | null;
};

/** Mirrors FinishResult in firebase/functions/src/sessions.ts. */
export type RunResult =
  | { status: 'rejected'; reason: string }
  | { status: 'flagged' }
  | {
      status: 'recorded';
      boards: { season: BoardResult; all: BoardResult };
      /** XP, level and achievements the run earned (docs/adr/0016-achievements-and-xp.md). */
      progress?: RunProgress;
    }
  | {
      /**
       * A practice run (difficulty Easy, docs/adr/0018-difficulty-easy-is-practice.md): accepted
       * for play stats and XP, never ranked. Only answered to `practice: true`.
       */
      status: 'practice';
      progress?: RunProgress;
    };

/** Fired on window after a score reached the boards, so leaderboard views can refresh ranks. */
export const SCORE_RECORDED_EVENT = 'ayvago:score-recorded';

async function call<T>(name: string, data: unknown): Promise<T> {
  const [functions, { httpsCallable }] = await Promise.all([
    loadFunctions(),
    import('firebase/functions'),
  ]);
  return (await httpsCallable<unknown, T>(functions, name)(data)).data;
}

export type FinishOptions = {
  continues?: number;
  /** The run was played on Easy (protocol 2.6): practice, never ranked. */
  practice?: boolean;
};

export type Run = {
  /** Submits the final score; null when the run was not registered or the call failed. */
  finish(score: number, options?: FinishOptions): Promise<RunResult | null>;
  /**
   * The player left the run without GHA_END (a new run, another page, a reload). Its on-screen
   * time goes to abandonSession, never a score. `pageExit`: the page is going away (pagehide),
   * so the request is sent with `keepalive` and the headers read ahead of time. Never throws.
   */
  abandon(options?: { pageExit?: boolean }): void;
};

/** Credentials for a keepalive request are read again this often while a run is open. */
const HEADERS_REFRESH_MS = 15 * 60 * 1000;

/**
 * Registers a run of `gameId`. `identity` resolves once the player is signed in (a guest at
 * least); the run is registered after that. Never throws: leaderboards are optional to play.
 */
export function beginRun(gameId: string, identity: Promise<unknown>): Run {
  const startedAt = Date.now();
  const clock = runClock(startedAt, document.hidden);
  const onVisibility = () => clock.setHidden(document.hidden, Date.now());
  document.addEventListener('visibilitychange', onVisibility);

  // The session once registered, and the headers for a keepalive request (read ahead: a page
  // that is going away cannot wait for tokens).
  let registered: Session | null = null;
  let closed = false;
  let headers: Record<string, string> | null = null;
  let refresh: number | undefined;
  const readHeaders = () =>
    callableHeaders()
      .then((value) => {
        headers = value;
      })
      .catch((error) => console.warn('[leaderboard] no credentials for leaving a run', error));

  const session: Promise<Session | null> = firebaseEnabled()
    ? identity
        .then(() => call<Session>('startSession', { gameId }))
        .then((value) => {
          registered = value;
          if (!closed) {
            void readHeaders();
            refresh = window.setInterval(readHeaders, HEADERS_REFRESH_MS);
          }
          return value;
        })
        .catch((error) => {
          console.warn('[leaderboard] run not registered', error);
          return null;
        })
    : Promise.resolve(null);

  const close = () => {
    closed = true;
    document.removeEventListener('visibilitychange', onVisibility);
    window.clearInterval(refresh);
  };

  return {
    async finish(score, { continues = 0, practice = false } = {}) {
      if (closed) return null;
      close();
      const current = await session;
      if (!current) return null;
      try {
        const result = await call<RunResult>('finishSession', {
          ...current,
          score,
          durationMs: Date.now() - startedAt,
          continues,
          // Sent only for practice, so a normal run's request is unchanged.
          ...(practice ? { practice: true } : {}),
        });
        if (result.status === 'recorded' || result.status === 'practice') {
          if (!isRunProgress(result.progress)) delete result.progress;
        }
        // Practice runs leave the boards as they were: nothing for leaderboard views to refresh.
        if (result.status === 'recorded') {
          window.dispatchEvent(new CustomEvent(SCORE_RECORDED_EVENT, { detail: { gameId } }));
        }
        return result;
      } catch (error) {
        console.warn('[leaderboard] score not submitted', error);
        return null;
      }
    },

    abandon({ pageExit = false } = {}) {
      if (closed) return;
      close();
      const durationMs = Math.round(clock.visibleMs(Date.now()));
      if (pageExit) {
        // The page is going away: only a keepalive request can still reach the server. A run
        // whose session is not registered yet is left to the server's cleanup.
        const url = callableUrl('abandonSession');
        if (!registered || !headers || !url) return;
        try {
          void fetch(url, {
            method: 'POST',
            keepalive: true,
            headers,
            body: callableBody({ ...registered, durationMs }),
          }).catch(() => undefined);
        } catch {
          // keepalive refused (a very old browser): the server's cleanup closes the session.
        }
        return;
      }
      void session
        .then((current) =>
          current ? call('abandonSession', { ...current, durationMs }) : undefined,
        )
        .catch((error) => console.warn('[leaderboard] leaving the run not recorded', error));
    },
  };
}
