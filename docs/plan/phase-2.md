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
| 2.6 | Ayvago Arcade: 26 in-house games in the catalog ([ADR 0007](../adr/0007-ayvago-arcade.md)) | ✅ live (`ayvago-games.vercel.app` deployed, `ARCADE_STATUS = 'live'`) |
| 2.7 | Imported games parked until they meet the platform standards ([ADR 0008](../adr/0008-park-imported-games.md)) | ✅ code |
| 2.8 | Ayvago Arcade look: categories = arcade genres ([ADR 0009](../adr/0009-categories-follow-arcade-genres.md)), Ayvago Arcade theme, Ayvago Games logo | ✅ code |

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

## 2.6 Ayvago Arcade catalog

The 26 games are built in `selchook/ayvago-games`:
- **Retro action:** Alien Invaders, Asteroid Storm, Brick Breaker, City Defender, Hoop Shot,
  Lunar Lander, Neon Pong, Penalty Kick, Retro Snake, Sky Jumper, Space Blaster, Tank Arena,
  Tappy Plane, Tower Defense, Zombie Survivor.
- **Puzzle:** Block Blast, Bubble Pop, Gem Match, Lights Out, Merge 2048, Mini Golf, Box Pusher,
  Simon Says.
- **Board:** Connect Four, Reversi, Solitaire.

All 26 use one Phaser 3 runtime: the Ayvago boot intro, TR/EN text, touch and keyboard controls,
and the vendored platform adapter. See [ADR 0007](../adr/0007-ayvago-arcade.md).

What shipped:
- **Catalog:**
  - `packages/shared/src/arcade-catalog.ts` holds the 26 entries, generated by the games
    repository's `scripts/gen-platform.mjs`.
  - `SEED_GAMES` includes them, so the catalog pages, category shelves, sitemap and the score
    functions treat them like every other seed game.
  - Manifest ids are the slugs without hyphens.
  - Categories:
    - `retro_action`: 15 games
    - `puzzle`: 8 games
    - `board`: Connect Four, Reversi and Solitaire
- **Status switch:** `ARCADE_STATUS` kept all of them `coming_soon` until the origin was deployed.
  It is now `live`: the games are playable on ayvago.com and accept score sessions (the functions
  redeploy because `packages/shared` changed).
- **Local testing:** `AYVAGO_DEV_ARCADE_ORIGIN=http://localhost:4173` points every arcade game at
  a local build, like `AYVAGO_DEV_ENTRY_OVERRIDES` (listed in `turbo.json`).
- **Game side (in `selchook/ayvago-games`):**
  - The adapter 2.0.0 is vendored unchanged into the shared runtime:
    - `GHA_READY` is sent before the intro, so the intro shows inside the player.
    - It reports `GHA_LOADING`, `GHA_SESSION_START` on every run and `GHA_END { score, won }`.
    - It handles `GHA_PAUSE` (pause overlay), `GHA_MUTE` and `GHA_LOCALE_CHANGE`.
    - The menu shows a leaderboard button inside Ayvago.
  - `vercel.json` sets `frame-ancestors` for ayvago.com and localhost:3000, plus
    `Cross-Origin-Resource-Policy: cross-origin`.
  - Covers (1920×1080) and icons (512×512) are rendered from each game's own screenshots.
- **Tests:**
  - Catalog tests check every arcade entry (id, entry path, cover path) and the local origin
    switch. The existing cover test now resolves `assets.cover` instead of assuming
    `/ayvago/cover-1920x1080.jpg`.
  - In `selchook/ayvago-games`, all 26 games pass:
    - a Playwright smoke test: intro → menu → random play → game over → retry, with no console
      errors;
    - a GHA protocol test: embedded cross-origin from `http://localhost:3000` with this
      repository's iframe sandbox, checking READY → START(tr) → LOADING → SESSION_START → PAUSE
      → MUTE → END{score};
    - manifest validation against `gameManifestSchema`.

Deviations:
- **No ads yet.** `ads` placements are empty, because rewarded and interstitial ads arrive in
  Phase 3.
- **Generous scoring limits.** `maxPerSecond` 1000, `minDurationMs` 3 s and `maxScore` 10M apply
  to every arcade game until calibration. Games can override them in their `game.json`.

Status:
- ✅ `selchook/ayvago-games` deployed on Vercel (`https://ayvago-games.vercel.app`); the owner
  checked that the games open with the Ayvago intro and menu.
- ✅ `ARCADE_STATUS` switched to `live`.

Open:
- ⏳ Check one run on ayvago.com reaches the leaderboard ([setup](../setup/phase-2.md#7-ayvago-arcade-slice-26)).
- Calibrate the scoring limits per game after two weeks of sessions.

## 2.7 Imported games parked ✅

The owner decided to show only the Ayvago Arcade games for now. The ten imported games
(crystal-runner-3d, orb-surge, pixel-cascade, chromashift, space-defender, gyroball-infinite,
number-cracker, tavla, naval-strike, titos-tank) do not yet meet the platform standards. The
multiplayer ones return after they are made compatible. See [ADR 0008](../adr/0008-park-imported-games.md).

What shipped:
- **Catalog:** `PARKED_GAMES` in `packages/shared/src/seed-catalog.ts` holds the ten entries
  unchanged, and `SEED_GAMES` is the arcade catalog only. Their pages, the sitemap, score sessions
  and voting no longer list them. No Firestore data is deleted.
- **Navigation:** the Multiplayer link and its sitemap entry are hidden while no multiplayer game
  is in the catalog.
- **Arcade adjustments** (made in `selchook/ayvago-games` and regenerated into
  `arcade-catalog.ts`):
  - Brick Breaker, Gem Match and Space Blaster are featured, so the home spotlight has a lead game
    and two side tiles.
  - Tappy Plane, Sky Jumper, Hoop Shot, Penalty Kick and Mini Golf move to the Casual category,
    which would otherwise be empty.
  - The categories are now 11 retro action, 7 puzzle, 5 casual and 3 board.
- **Tests:**
  - Catalog tests now use arcade games for the override and ranking cases.
  - A new test checks that no parked game is in the catalog, that there are no multiplayer games,
    and that at least three games are featured.
  - The emulator suites are unchanged and pass: they reference parked game ids only as unknown
    games or as plain document ids.

Open:
- Bring the multiplayer games back with Phase 4 (import wave 3 in the
  [import plan](game-import-plan.md)), against the standards in ADR 0008.

## 2.8 Ayvago Arcade look ✅

The owner asked for three changes, so that the platform matches the Ayvago Arcade games.

What shipped:
- **Categories = arcade genres** ([ADR 0009](../adr/0009-categories-follow-arcade-genres.md)):
  - `GAME_CATEGORIES` is now `arcade, action, casual, puzzle, retro, sports, strategy, card, word`,
    the same list and order as `game.json` genres in `selchook/ayvago-games`.
  - Manifests gain an optional `categories` list next to the primary `category`, and
    `gameCategories()` resolves it. A game is listed under every category it has.
  - Arcade games take their categories straight from their genres.
  - Empty categories (`word` today) are hidden from the navigation and the sitemap.
  - `/c/retro-action` and `/c/board` redirect permanently to `/c/arcade` and `/c/strategy`.
  - New category icons: bolt, pixel grid, ball, crown, card, letter tile.
  - Labels follow the games portal (TR: Arcade, Aksiyon, Gündelik, Bulmaca, Retro, Spor, Strateji,
    Kart, Kelime).
- **Ayvago Arcade theme** (`arcade`, dark only), the look of the games and their portal:
  - Brand ink background, paper text and brand red accent. The red is `#e02a10`, a touch darker
    than the brand `#ec3013`, so white text on it passes AA.
  - Yellow display headings with a hard drop shadow.
  - Black outlines with hard drop shadows, square corners and a red rule under the top bar.
  - Scanlines.
  - Press Start 2P headings and Pixelify Sans body text (`@fontsource/pixelify-sans`). Both cover
    Turkish.
  - The pixel-font sizing rules that `retro` had now apply to both pixel themes.
  - The single-mode hint is generic ("This theme is always dark").
  - `firestore.rules` accepts `theme: 'arcade'` in profiles.
- **Ayvago Games logo:** the top bar shows the boot intro's closing lockup (`BrandLogo`): AYVAG
  with the mark in the O slot, then the red rule and GAMES.
  - It uses the intro geometry, drawn as SVG.
  - The letters and the ring take the theme's text color. The seeds and the rule stay brand red.
  - GAMES and the rule are drawn larger than in the intro so they stay legible at top-bar size.
  - The favicon (`app/icon.svg`) is the mark on brand ink.
- **Game side:** cover art is regenerated so its category chip shows the new primary category.
- **Tests:**
  - Contrast test: six theme/mode combinations, `arcade` included.
  - `resolveMode` forces `arcade` to dark.
  - The category list matches the arcade genres, and the old slugs are rejected.
  - `categories` must include the primary category, and `gameCategories()` order is checked.
  - The catalog lists a game under every category it has.
  - An emulator rules test accepts every theme id. It fails when `arcade` is missing from
    `firestore.rules`; this was checked.
  - The UI was checked in every theme on desktop and phone: the switcher selects and saves
    `arcade`, the logo follows the theme color, and the old category URL redirects.

Open:
- Nothing for the owner beyond merging. The rules workflow deploys the updated
  `firestore.rules`.

## Game fixes during the phase

| Game | Change | Status |
|---|---|---|
| ChromaShift | Fits phone screens: the board scales to the screen (24–60 px cells instead of a fixed 48, which cut off the outer columns on 360 px phones) and re-fits on rotation; menu, HUD and game-over screens adapt to short and narrow screens; stray markdown fences removed from `index.html` (they showed as text above the game) | ⏳ merge selchook/chromashift#3 (Vercel preview built) |
