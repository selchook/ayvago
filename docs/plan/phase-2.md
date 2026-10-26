# Phase 2 — Competition and community

- Status: In progress (started 2026-10-25)
- Roadmap: [§12 Phase 2](roadmap.md#phase-2--competition-and-community-23-weeks) · Specs: [Leaderboards](../specs/leaderboards.md), [Voting](../specs/voting.md) · Owner steps: [Phase 2 setup](../setup/phase-2.md) · Decision: [ADR 0006](../adr/0006-score-sessions.md)

**Done when:** a fake score sent from the console never reaches a leaderboard.

Legend: ✅ done · 🚧 in progress · ⏳ owner action · ⬜ not started

## Slices

| # | Slice | Status |
|---|---|---|
| 2.1 | Score sessions (`startSession` / `finishSession`) and weekly + all-time leaderboards | ✅ code, ⏳ deploy check and App Check key |
| 2.2 | Voting (like/dislike, feedback reasons), Wilson + engagement ranking, Continue Playing shelf | ⬜ |
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
  - `syncLeaderboardProfile({ remove? })`: copies a new avatar into the player's board rows, or
    removes the rows before account deletion. `reserveUsername` refreshes the rows itself; guest
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

## 2.2 Voting ⬜
To be planned from the [voting spec](../specs/voting.md).

## 2.3 Admin panel v1 ⬜
Flagged scores are already collected in `scoreFlags/{sessionId}` (`status: 'pending'`, reasons,
player, score, durations), indexed by `status` + `createdAt`. Approving one will apply it with the
same transaction as `finishSession` (`applyScore`).
