# ADR 0018 — Difficulty: easy runs are practice

- Status: Accepted (2026-11-08)
- Related: [ADR 0002](0002-iframe-game-sdk.md) (game protocol), [ADR 0006](0006-score-sessions.md)
  (score sessions), [ADR 0016](0016-achievements-and-xp.md) (XP and achievements),
  [ADR 0017](0017-server-best-and-fresh-start.md) (server-synced bests),
  [Leaderboards spec](../specs/leaderboards.md),
  [Phase 5 plan, slice 5.15](../plan/phase-5.md#515-difficulty-easy-runs-are-practice--code)

## Context
Studio games are getting an optional two-level difficulty, **Easy** and **Normal**, chosen on the
game's own menu. Normal is the default, and online matches always play on Normal. Until now
every solo run went through the same score session: `finishSession` validated it, wrote the
weekly and all-time boards and awarded XP (ADR 0016). An Easy score on the same board as a
Normal score would not be comparable, and an Easy run that earns full XP would make Easy the
best way to level up.

## Decision
1. **Protocol 2.6.** The adapter's `endGame({ score, won, difficulty })` sends `difficulty` in
   `GHA_END` only when it is `'easy'` or `'normal'`. Games that do not offer a difficulty send
   nothing, which means Normal. The bridge reads `'easy'` as Easy and anything else (missing,
   `'normal'`, malformed) as Normal.
2. **Leaderboards stay Normal-only.** A board ranks players who played the same game; Easy changes
   the game (slower enemies, more lives), so its scores are not comparable with Normal ones.
   A separate Easy board would split every game's small player base in two and double the
   board, rank and season work, for runs that are meant as practice. So Easy runs never reach
   a board, and the server best sent in `GHA_START.config.best` (protocol 2.4), which is the
   all-time board entry, is Normal-only as well. Games compare against it only on Normal.
3. **Easy runs are practice.** The game player calls `finishSession` with `practice: true`. The
   run goes through exactly the same checks as a ranked run (open session of the caller,
   token, server clock, minimum length, maximum score and score per second, duration
   mismatch, outlier). Then:
   - `applyScore` is not called and no board, entry or season archive is written;
   - the play stats count it as usual (`users/{uid}/stats/{gameId}` plays and play time, the
     game's daily counters), since those already count every finished run;
   - progress is awarded with `applyRun(..., { practice: true })` in a transaction of its own.
4. **Easy earns reduced XP.**
   - The run XP is halved: **5 XP** (`XP_RULES.practiceRun`) for a run of at least 20 s.
   - No first-play, personal-best or weekly top 10 bonus: none of them can happen without a
     board.
   - The run counts towards runs, games, categories and play time, so the `first-run`,
     `runs-*`, `explorer-*`, `all-rounder` and `marathon` achievements can unlock. It never
     counts towards `best-10`, `top-10` or `champion`: `applyRun` ignores any board facts passed
     with a practice run.
   - The same daily caps apply (600 XP a day, 150 a game).
   Practice still rewards playing, which keeps Easy worth choosing for new or younger players,
   but Normal stays the better way to progress, so Easy is never the optimal grind.
5. **Result shape.** An accepted practice run returns `{ status: 'practice', progress }`, a new
   member of the `FinishResult` union, rather than `recorded` with `boards: null`. A `recorded`
   result keeps its `boards` non-null, so no client that reads `boards.all` can break, and only
   callers that send `practice: true` ever see the new status. Rejected and flagged practice
   runs return the usual `rejected` and `flagged`.
6. **Flagged practice runs are not queued for review.** A practice run with a flag returns
   `flagged`, keeps its flags on `sessions/{id}` (with `practice: true`) and earns nothing, like
   any flagged run. It writes no `scoreFlags/{sessionId}` document, because approving one would
   put an Easy score on the boards and there is nothing else to decide.

### Trust model
The client decides whether a run was Easy: the game reports it and the platform passes it on.
The server cannot verify it, and does not need to. Claiming Easy can only **lower** the
player's own rewards (no board, half the run XP, no bonuses); it never unlocks anything a
Normal run would not. The only dishonest direction is claiming Normal for an Easy run, and that
is the same as a game reporting a score it did not earn: the existing score-session checks
apply to it exactly as before, and nothing in this change makes it easier. The `practice` field
is validated (a boolean or absent; anything else is refused with `invalid-argument` before the
session is touched).

## Consequences
- Older games and older adapters keep working unchanged: they send no difficulty, so every run
  is Normal and ranked.
- The client shows "Easy mode: not ranked" after an Easy run, never marks it as a personal best
  and keeps it out of the browser's local best fallback.
- A practice run that is a player's first run of a game uses up that game's first-play bonus:
  the game joins the played list (for the explorer achievements), so a later Normal run is not
  a first play.
- Practice runs and ranked runs share the hourly session limit and the daily XP caps.
- Practice sessions are marked `practice: true` on `sessions/{id}`, so their share can be
  measured later.
