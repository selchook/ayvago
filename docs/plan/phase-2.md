# Phase 2 — Competition and community

- Status: In progress (started 2026-10-25)
- Roadmap: [§12 Phases and timeline](roadmap.md#12-phases-and-timeline) · Specs: [Leaderboards](../specs/leaderboards.md), [Voting](../specs/voting.md) · Owner steps: [Phase 2 setup](../setup/phase-2.md) · Decision: [ADR 0006](../adr/0006-score-sessions.md)

**Done when:** a fake score sent from the console never reaches a leaderboard.

Legend: ✅ done · 🚧 in progress · ⏳ owner action · ⬜ not started

## Slices

| # | Slice | Status |
|---|---|---|
| 2.1 | Score sessions (`startSession` / `finishSession`) and weekly + all-time leaderboards | ✅ code, ⏳ deploy check and App Check key |
| 2.2 | Voting (like/dislike, feedback reasons), Wilson + engagement ranking, Continue Playing shelf | ✅ code |
| 2.3 | Admin panel v1: `admin` custom claim, flagged-score review (approve / reject / ban), players, feedback, game overview | ✅ code, ⏳ grant the admin role |
| 2.4 | App Check enforcement (after the verified share reaches ~100%) | ✅ code, ⏳ site key, then the switch in the panel |
| 2.5 | Space Defender touch controls (needed before it is promoted on mobile) | ✅ live (selchook/space-defender#2 merged) |

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

## 2.3 Admin panel v1 ✅

What shipped:
- **Role:**
  - Admins carry the `admin` custom claim, granted (or revoked) by email with the
    **Grant admin role** workflow (`.github/workflows/grant-admin.yml`, script
    `firebase/functions/scripts/set-admin.mjs`). Setup: [Phase 2 setup §4](../setup/phase-2.md).
  - Rules give admins read access to the review data, with no extra writes: `scoreFlags`,
    `sessions`, `usernames`, player profiles and stats, votes, daily play counts and feedback.
- **Functions** (`firebase/functions/src/moderation.ts`):
  - `reviewScoreFlag({ sessionId, action })`:
    - **approve** puts the score on the all-time board, and on the weekly board when it was
      reached in the current season, keeping its original time;
    - **reject** drops it;
    - **ban** bans the player.
  - `setPlayerBan({ uid, banned })`. A ban:
    - sets the `banned` claim (rules refuse the player's writes, functions their calls);
    - revokes their sessions;
    - removes their leaderboard rows, votes and play stats;
    - marks their pending flags.

    Unbanning lifts the claim only. Admins cannot be banned.
- **Web:**
  - `/{locale}/admin` (not indexed), linked from the account menu for admins. A "Refresh access"
    button picks up a newly granted role without signing out.
  - Tabs:
    - **Flagged scores:** reasons, server versus browser run length, Approve / Reject / Ban with a
      confirmation step.
    - **Games:** plays in 7 days, votes, quality and trend scores.
    - **Feedback:** reasons over 14 days and the latest comments per game.
    - **Players:** find by username or uid, ban and lift bans.
- **Tests:**
  - `firebase/tests/moderation.test.ts` (6): admin only, approve (current and earlier week),
    reject, ban clears the player's traces, unban, admins cannot be banned.
  - Admin rules tests.
  - The flow was checked end to end against the emulators.
  - The "flagged" session test no longer depends on the fixture game's calibration window, which
    ends on 2026-11-09.

Deviations (deliberate, revisit later):
- **Game management is read-only:** the catalog still comes from the seed. Editing games (status,
  featured, text) follows the move of the catalog to Firestore (carried over from Phase 1).
- **No board reset action yet** (spec: reset the all-time board after a scoring change). Today it
  is done by deleting the board documents in the console.
- **Burst detection** for votes is still open.

## 2.4 App Check enforcement ✅ (code)

What shipped:
- **Runtime switch:** `config/appCheck.mode` (`monitor` by default, or `enforce`) replaces the
  `APP_CHECK_ENFORCED` constant. Every player-facing callable checks it through `requirePlayer`
  (`firebase/functions/src/appcheck.ts`): `startSession`, `finishSession` and `castVote`.
  - Each function instance caches the mode for a minute.
  - While enforcing, calls without a verified token fail with `app-check`. The game keeps
    running; only the leaderboard and voting calls are refused.
- **Readiness:** `getAppCheckStatus` (admins) counts the score sessions of the last 24 hours and
  how many carried a verified token. Sessions record `appCheck` since slice 2.1; a composite
  index serves the count.
- **Guarded switch:** `setAppCheckMode({ mode, force? })` (admins) refuses `enforce` until at
  least 20 sessions were seen, 95% of them verified, unless forced. Monitoring can always be
  restored.
- **Admin panel:** an **App Check** tab with the mode, the verified share, **Turn on
  enforcement**, **Enforce anyway** (with a confirmation step) and **Back to monitoring**.
- **Tests:**
  - `firebase/tests/appcheck.test.ts` (3): status for admins only, the readiness guard, unverified
    calls refused while enforcing and accepted again after.
  - Checked end to end against the emulators: switch, refused run, game still running, recovery.

Deviations (deliberate):
- **Firestore is not App Check-enforced:** the server reads `rankings/catalog` through the REST API
  without a token, and the rules already protect every write.
- **No replay protection** (`consumeAppCheckToken` / limited-use tokens) yet. Score sessions
  already carry their own single-use token.

What remains for the owner: the reCAPTCHA Enterprise key, registering it in App Check and the Vercel
variable ([setup §2](../setup/phase-2.md#2-app-check-recaptcha-enterprise)); then the switch in the panel.

## 2.5 Space Defender touch controls ✅

What shipped (in `selchook/space-defender`, PR selchook/space-defender#2):
- **Buttons:** rotate left, rotate right, thrust and fire appear on touch screens, or after the
  first touch on hybrid devices.
  - They press the same keys as the keyboard, so the game logic is unchanged.
  - Multi-touch uses pointer events with pointer capture; holding fire keeps firing, and fire
    restarts after game over.
- **Size:** the buttons sit outside the scaled 800×600 game box. They are 72 px on phones and
  shrink down to 48 px inside the small Ayvago player; in landscape they stack in columns at the
  sides.
- **Phone layout fix:** the game box is now fixed and centered. Before, phone browsers widened
  the page to 800 px and zoomed out, which cut off part of the game.
- **Other:** keys are released when the window loses focus. `ayvago.json` and the Ayvago seed
  catalog list `touch` input, so the game page shows "Touch" under Controls.
- **Tests:** Playwright with Pixel 7 emulation.
  - Portrait and landscape: the page keeps the screen width, all buttons are on screen at 72 px,
    pressed and released states work, and the ship rotates, thrusts and fires.
  - Desktop shows no buttons.
  - Inside Ayvago on a phone the buttons fit the player at 48 px.

Status:
- ✅ selchook/space-defender#2 merged on 2026-10-26; Vercel redeployed the live game.
- Promoting Space Defender on mobile shelves is now an editorial choice.

## Game fixes during the phase

| Game | Change | Status |
|---|---|---|
| ChromaShift | Fits phone screens: the board scales to the screen (24–60 px cells instead of a fixed 48, which cut off the outer columns on 360 px phones) and re-fits on rotation; menu, HUD and game-over screens adapt to short and narrow screens; stray markdown fences removed from `index.html` (they showed as text above the game) | ⏳ merge selchook/chromashift#3 (Vercel preview built) |
