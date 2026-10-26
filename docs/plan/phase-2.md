# Phase 2 — Competition and community

- Status: In progress (started 2026-10-25)
- Roadmap: [§12 Phase 2](roadmap.md#phase-2--competition-and-community-23-weeks) · Specs: [Leaderboards](../specs/leaderboards.md), [Voting](../specs/voting.md) · Owner steps: [Phase 2 setup](../setup/phase-2.md) · Decision: [ADR 0006](../adr/0006-score-sessions.md)

**Done when:** a fake score sent from the console never reaches a leaderboard.

Legend: ✅ done · 🚧 in progress · ⏳ owner action · ⬜ not started

## Slices

| # | Slice | Status |
|---|---|---|
| 2.1 | Score sessions (`startSession` / `finishSession`) and weekly + all-time leaderboards | ✅ code, ⏳ deploy check and App Check key |
| 2.2 | Voting (like/dislike, feedback reasons), Wilson + engagement ranking, Continue Playing shelf | ✅ code |
| 2.3 | Admin panel v1: `admin` custom claim, flagged-score review (approve / reject / ban), game management | ⬜ |
| 2.4 | App Check enforcement (after the verified share reaches ~100%) | ⬜ waits on ⏳ |
| 2.5 | Space Defender touch controls (needed before it is promoted on mobile) | ⬜ |

## 2.1 Score sessions and leaderboards ✅

What shipped:
- **Functions** (`firebase/functions/src/sessions.ts`, `leaderboards.ts`):
  - `startSession({ gameId })` → `{ sessionId, token }`. Only live games (the seed catalog, now in
    `packages/shared/src/seed-catalog.ts`). At most 60 starts per player per game per hour.
  - `finishSession({ sessionId, token, score, durationMs, continues })` → `recorded` (with the
    weekly and all-time rank, best and previous rank), `flagged` or `rejected` (with a reason).
  - `syncLeaderboardProfile()`: copies a new avatar into the player's board rows (account
    deletion removes them through `deleteMyData`, slice 2.2). `reserveUsername` refreshes the rows itself; guest
    merge moves the guest's better scores to the account; guest cleanup removes the rows.
  - `closeLeaderboardSeason` (Monday 09:00 UTC) archives last week's top 100 to
    `leaderboards/{gameId}/seasons/{seasonKey}`; `cleanupSessions` deletes sessions after 14 days.
- **Rules and indexes:** boards, entries and season archives are public read-only; `sessions/` and
  `scoreFlags/` are Functions-only. Composite indexes for rank counts and the rate limit are in
  `firebase/firestore.indexes.json`, deployed by the rules workflow.
- **Web:**
  - `GamePlayer` registers a run on `GHA_SESSION_START` and submits the score on `GHA_END`.
  - The toolbar shows "#3 this week (up from #7)", "being reviewed" or "too short to count".
  - Game page side panel: This week / All time tabs, top 10, the player's own row when outside
    it, season countdown and a guest "sign in to keep your place" note.
  - `/{locale}/games/{slug}/leaderboard`: top 100 for both boards and last week's top 10. Listed
    in the sitemap for live games.
  - Locale-aware numbers (`12,450` / `12.450`), and the score label comes from the manifest.
  - App Check client (reCAPTCHA Enterprise) is enabled when
    `NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY` is set.
- **Tests:**
  - `firebase/tests/leaderboards.test.ts` (14 tests) covers sessions, forged and replayed
    sessions, limits, flags, ranks, season archive, username/avatar sync, guest merge and leaving.
  - Rules tests for the new collections.
  - Shared season helpers (`packages/shared/src/leaderboard.test.ts`).
  - The UI flow was checked end to end against the emulators with the fixture game.

Deviations from the spec (deliberate, revisit later):
- **Country scope** is not shipped: profiles have no `country` yet. It comes with public profiles.
- **Season rewards and notifications** (spec §8 steps 2–3) move to Phase 5 (XP, badges, push).
- **Outlier check** compares with 3 × the all-time #1 (once 10 players are on the board) instead of
  3 × p99.9, until there is enough data for percentiles.
- **Accumulating boards** (`accumulate: true`, wins per week) are not implemented. Only multiplayer
  games use them and none is live; they arrive with Phase 4.
- **`allowContinues`** is not in the manifest yet; continues are recorded (`continued` marker) but
  rewarded continues are not live until Phase 3.
- **Neighbors ±2** around the player's own row are not shown yet; the panel shows the own row and
  rank.
- **In-game overlay** (`GHA.openLeaderboard()`) scrolls to the panel instead of opening an overlay.

## 2.2 Voting and ranking ✅

What shipped:
- **Play stats from sessions** (`firebase/functions/src/stats.ts`). Every finished run, accepted or
  not, adds to `users/{uid}/stats/{gameId}` (`plays`, `playSeconds`, server clock, at most 3 h per
  run). `games/{gameId}/daily/{day}` counts `started`, `finished` and `playSeconds` for ranking.
- **`castVote({ gameId, value: 1 | -1 | 0, reasons?, comment? })`** (`votes.ts`) is the only way to
  vote. It enforces the following and updates `games/{gameId}` in one transaction (`likes`,
  `dislikes`, `likePercent`, `wilson`):
  - At least 60 s of play in the game.
  - 30 vote changes per player per hour.
  - Reasons from a fixed list, only with a dislike.
  - A comment of up to 280 characters with the offensive-word filter.

  Feedback is counted per day in `games/{gameId}/feedback/{day}`; comments stay on the vote
  document, readable by admins only.
- **`recomputeRankings`** (hourly) computes Wilson, engagement, `qualityScore` and `trendScore`
  per game (`packages/shared/src/ranking.ts`). It writes them to `games/{gameId}` and to
  `rankings/catalog`, one public document with every game's numbers.
- **Data removal:** `deleteMyData` (called by Delete account) removes everything server-side:
  - the profile, library and username reservation;
  - leaderboard rows and entries;
  - votes, with the counters adjusted;
  - play stats.

  The client then deletes the sign-in. Guest merge moves the guest's votes (when the account has
  none for that game) and play time. Guest cleanup removes them.
- **Web:**
  - 👍 / 👎 in the player toolbar. Tapping again removes the vote. The like percentage shows
    from 20 votes.
  - After 👎, an optional "What could be better?" form appears (7 reasons and a comment).
  - A "Rate this game" nudge appears after the third run or a run over 5 minutes, once per game.
  - Like percentages on game tiles.
  - Home: a **Continue playing** shelf (from the player's library) and a **Popular this week**
    shelf (by `trendScore`, hidden until there are scores).
  - Category shelves, category pages and related games are ordered by `qualityScore`.
  - Rankings are read on the server from the public REST API with ISR (1 h), so pages stay static.
- **Tests:**
  - `firebase/tests/votes.test.ts` (9): eligibility, counter consistency, validation, rate limit,
    feedback, ranking job, deletion, merge.
  - Rules tests for the new collections.
  - `ranking.test.ts` (Wilson: 3/0 ranks below 950/50).
  - The UI flow was checked end to end against the emulators.

Deviations from the spec (deliberate, revisit later):
- **No Firestore trigger** (`onVoteWritten`): votes go through a callable, which also enforces
  eligibility and the rate limit server-side, and avoids Eventarc setup.
- **Day-1 return rate** is not measured yet, so the engagement score uses session length, plays
  and completion with the same relative weights. The mean replaces the median session length.
- **Weights are constants** in `packages/shared/src/ranking.ts`, not Remote Config yet.
- **Burst detection** (votes far above plays) is not implemented; it belongs to the admin panel.
- **Scores are recomputed hourly**, not nightly, so new games find their place quickly at today's
  catalog size.
- **Long-press to favorite on mobile tiles** is not implemented; the heart is in the player
  toolbar.

## 2.3 Admin panel v1 ⬜
Daily feedback aggregates (`games/{gameId}/feedback/{day}`) and vote comments are ready for an admin feedback view. Flagged scores are already collected in `scoreFlags/{sessionId}` (`status: 'pending'`, reasons,
player, score, durations), indexed by `status` + `createdAt`. Approving one will apply it with the
same transaction as `finishSession` (`applyScore`).
