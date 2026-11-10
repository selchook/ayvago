// The time a solo run was on screen (slice 5.22). A run left without GHA_END reports this to
// abandonSession, which counts the smallest of it, the server's clock and the cap. Time with the
// page hidden is left out: the game is paused then (game-player.tsx), so a forgotten background
// tab adds nothing.

export type RunClock = {
  /** The page became hidden (true) or visible again (false) at `now`. */
  setHidden(hidden: boolean, now: number): void;
  /** Milliseconds on screen since the run started. */
  visibleMs(now: number): number;
};

export function runClock(startedAt: number, hidden: boolean): RunClock {
  let total = 0;
  let visibleSince: number | null = hidden ? null : startedAt;
  return {
    setHidden(nowHidden, now) {
      if (nowHidden && visibleSince !== null) {
        total += Math.max(0, now - visibleSince);
        visibleSince = null;
      } else if (!nowHidden && visibleSince === null) {
        visibleSince = now;
      }
    },
    visibleMs(now) {
      return total + (visibleSince === null ? 0 : Math.max(0, now - visibleSince));
    },
  };
}

/** The callable protocol's request body, for the keepalive request the SDK cannot send. */
export function callableBody(data: unknown): string {
  return JSON.stringify({ data });
}
