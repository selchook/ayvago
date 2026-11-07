# ADR 0016 — Achievements, XP and levels

- Status: Accepted (2026-11-07)
- Related: [ADR 0006](0006-score-sessions.md) (score sessions),
  [Accounts spec §9](../specs/accounts.md#9-levels-and-xp), [Leaderboards spec](../specs/leaderboards.md),
  [Phase 5 plan](../plan/phase-5.md)

## Context
Phase 5 adds rewards that bring players back: XP, levels and achievement badges (slice 5.2). The
accounts spec sketched a model (XP per minute played, a `50 · n^1.5` level curve), but it was
written before score sessions existed. Score sessions now give the server a trustworthy record
of every finished run: `finishSession` checks the run's length and score, updates the play stats
and writes the leaderboards. Anything a player can earn must come from there, because the
client can be changed by anyone.

## Decision
1. **The server awards everything.**
   - XP and achievements are computed only inside `finishSession`, in the same Firestore
     transaction that writes the accepted score to the boards (`applyScore` takes a hook that
     reads the progress first and writes it after the board outcomes are known).
   - Clients never write `xp`, `level` or achievements.
   - A flagged or rejected session earns nothing; approving a flag later in the admin panel does
     not award XP either.
2. **XP rules** (pure functions in `packages/shared/src/progress.ts`, unit-tested):
   - an accepted session earns **10 XP** when it lasted at least **20 s** by the server's clock;
   - **+20** for the first session of a game;
   - **+25** for a new personal best: the run beat an earlier all-time best of that game. A
     first score is not a beaten best; it earns the first-play bonus instead;
   - **+50** for entering the game's weekly top 10. Entering means not in the top 10 of the
     cached weekly list before the run and in it after. Climbing inside the top 10 earns nothing
     more;
   - caps per UTC day: **600 XP** per player and **150 XP** per game, so nobody farms one short
     game;
   - each unlocked achievement grants **+30 XP**, outside the daily caps.
3. **Levels.** Going from level n to n+1 costs `100 · n` XP: L2 = 100, L3 = 300, L4 = 600, so
   `xpForLevel(n) = 50 · n · (n − 1)`. `levelForXp`, `xpForLevel` and `levelProgress`
   (`{ level, into, needed }`) are shared. The level is capped at 99. This replaces the curve in
   the accounts spec. The new curve is simpler to explain and its early levels come quickly.
4. **Achievements.** A typed catalog in `packages/shared/src/achievements.ts`. Each entry has:
   - an `id`, an `icon` key (mapped to the web app's SVG icons, so badges look right in every
     theme) and a `group`;
   - a `target` and a `value` over the progress summary; the predicate `meetsAchievement` is
     `value ≥ target`.
   - Names and descriptions are messages: `achievements.<id>.name` and `.desc`.
   - The first 12: `first-run`, `runs-25`, `runs-100`, `runs-500`, `explorer-5`, `explorer-20`,
     `explorer-50`, `all-rounder` (a game in every category the live catalog uses, computed from
     the catalog), `best-10`, `top-10`, `champion` (#1 on a weekly board) and `marathon`
     (60 minutes of play in total).
   - Unlocks are permanent.
5. **Data.**
   - One document per player, `users/{uid}/progress/summary`, written by the functions only:
     `xp`, `level`, `runs`, `games` (up to 500 ids), `categories`, `bests`, `playSeconds`,
     `top10`, `champion`, `achievements` (id → Timestamp), `xpDay`, `xpToday` and `xpGameToday`.
   - `xp` and `level` are copied onto `users/{uid}` (only when the profile exists), so the header
     shows the level without a second read.
   - Rules: the owner and admins read the summary; nobody writes it. `xp` and `level` stay out of
     the profile's client-writable keys.
   - The weekly top 10 and #1 come from the board's cached `top` list inside the transaction,
     not from count queries, so they are exact and cost no extra reads.
6. **Response.** `finishSession` adds `progress: { xpGained, xp, level, levelUp, unlocked }` to
   the `recorded` result; the other fields are unchanged. Flagged and rejected results carry no
   progress.
7. **Guests and merges.**
   - Guests earn XP like everyone else.
   - `mergeGuestAccount` joins the guest's summary into the account's (`mergeProgress`):
     counters add up, game and category sets join, the earlier unlock time wins, `top10` and
     `champion` are kept if either has them, and the level follows the summed XP. The daily
     counters keep the later day.
   - A merge unlocks no new achievements by itself; the account's next accepted run does.
   - `deleteMyData` and guest cleanup delete the summary.

## Consequences
- Every accepted run reads and writes one more document inside the score transaction, plus the
  profile copy. It adds no query and no index.
- Players see a reward right after a run (`+35 XP`, `Level 5!`, an unlocked badge) and their
  level in the header on every page.
- Out of scope, still open:
  - game-defined achievements (`GHA.unlockAchievement`);
  - levels on leaderboard rows;
  - quests and streaks (slice 5.3).
  - Achievement XP for runs played before this slice: summaries start at zero, with no backfill
    from the existing stats.
