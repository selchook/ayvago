# Game Import Plan

> Related: [Roadmap](roadmap.md) (Firebase + Cloudflare TURN)

---

## 1. Goals and Principles

- Games **stay on their own Vercel deployments**; the platform embeds them in an iframe. Game source code is not copied into the platform repository.
- Each game keeps **a single build** that runs both standalone (on its own URL, as a PWA) and inside Ayvago. A shared `platform-adapter` makes this possible.
- **No CrazyGames integration.** The CrazyGames SDK in the games (script tag, `CrazyGamesSDK.ts` helpers, `requestAd('midgame')`, etc.) is **removed completely** during import; ad and lifecycle calls move to the adapter.
- Games **never** connect to Firebase or Cloudflare directly; scores, ads, users and multiplayer go through the platform.
- Work on each game is done as a PR on an `ayvago-integration` branch in that game's repository, tested on its Vercel preview URL and then merged.
- Every game must provide **English** title, description and score label; Turkish is strongly recommended (missing locales fall back to English).

---

## 2. Inventory and Waves

| # | Game | Repository | Engine | Category | Current state | Blockers | Effort | Wave |
|---|---|---|---|---|---|---|---|---|
| 1 | Crystal Runner 3D | `crystal-runner-3d-three-js-r168` | Three.js | Retro Action | GHA SDK v1 ✅, CORP header present | — | **S** (move to SDK v2) | 1 |
| 2 | Orb Surge | `orb-surge` | Phaser 3 (TS) | Retro Action | CrazyGames SDK → remove | `X-Frame-Options: SAMEORIGIN` | **M** | 1 |
| 3 | Pixel Cascade | `pixel-cascade` | Phaser 3 (JS) | Puzzle | CrazyGames SDK → remove | `X-Frame-Options` | **M** | 1 |
| 4 | ChromaShift | `chromashift` | Phaser 3 (TS) | Casual / Puzzle | localStorage only | `X-Frame-Options` | **M** | 1 |
| 5 | Space Defender | `space-defender` | TS / Canvas | Retro Action | CrazyGames SDK (inline in index.html) → remove | `X-Frame-Options` | **M** | 2 |
| 6 | Gyroball Infinite | `gyroball-infinite` | Three.js | Casual | localStorage only | `X-Frame-Options`; gyroscope permission inside an iframe | **M** | 2 |
| 7 | Number Detective | `guess-number` | React | Puzzle / MP | Ably (2 players) | Ably → netcode | **M** | 3 |
| 8 | Tavla (Backgammon) | `backgammon` | React | Board / MP | Ably + chat | Ably → netcode; chat moderation | **L** | 3 |
| 9 | Naval Strike | `battleships` | React | MP | Ably (key in source!) | Ably → netcode | **M** | 3 |
| 10 | Tito | `tito-multiplayer` | Next.js | MP | Ably (wrapper with a PeerJS-style interface) | Ably → netcode; Next.js build | **M** | 3 |
| — | PyraStack | `PyraStackInstant` | Unity | — | Empty Unity template | No game yet | — | Out of scope |

Effort: **S** ≈ half a day, **M** ≈ 1–2 days, **L** ≈ 3–4 days (with Claude).

**Why this order?**
- **Wave 1** (end of Phase 1): crystal-runner validates the protocol; the other three cover three distinct cases (Phaser TS to strip of CrazyGames, Phaser JS to strip of CrazyGames, Phaser without any SDK) → the adapter matures. Two Retro Action + two Puzzle/Casual titles give a balanced launch catalog.
- **Wave 2** (Phase 2): the Canvas and Three.js variants, plus special permissions such as the gyroscope.
- **Wave 3** (Phase 4): the four multiplayer games, once the Firebase + Cloudflare TURN netcode is ready.

---

## 3. Shared Integration Kit

Built in the platform repository and applied the same way to every game.

### 3.1 Vercel header fix (iframe permission) — **required**

`X-Frame-Options: SAMEORIGIN`, present in five games, prevents the platform from embedding them. Change:

```json
{
  "source": "/(.*)",
  "headers": [
    { "key": "Content-Security-Policy",
      "value": "frame-ancestors 'self' https://ayvago.com https://*.ayvago.com http://localhost:3000" },
    { "key": "Cross-Origin-Resource-Policy", "value": "cross-origin" }
  ]
}
```

- The `X-Frame-Options` line is **deleted** (CSP `frame-ancestors` is its modern replacement and supports an allow-list).
- `Cross-Origin-Opener-Policy: same-origin` has no effect inside an iframe and can stay.
- A temporary entry for the platform's Vercel preview domains (`https://ayvago-*.vercel.app`).

### 3.2 `@ayvago/platform-adapter` — a single facade

Game code only knows this interface. At runtime it picks one of two implementations: **AyvagoAdapter** (SDK v2) when the game runs inside an Ayvago iframe, or **StandaloneAdapter** (no ads, localStorage high scores, previous behavior) when it runs on its own URL.

```ts
// Single facade the game talks to. Picks Ayvago or standalone at runtime.
export interface PlatformAdapter {
  readonly name: 'ayvago' | 'standalone';
  readonly locale: string;                    // platform locale, or navigator.language standalone
  init(): Promise<void>;
  loadingProgress(progress: number): void;   // 0..1
  loadingDone(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  submitScore(score: number): void;           // mid-run checkpoint
  endGame(result: { score?: number; won?: boolean; message?: string }): void;
  requestRewarded(placement: string): Promise<boolean>;  // true = reward granted
  requestInterstitial(placement: string): Promise<void>;
  celebrate(): void;                           // platform confetti / highlight on big moments
  getBestScore(): Promise<number | null>;      // server best on Ayvago, localStorage elsewhere
  onPause(cb: () => void): void;
  onResume(cb: () => void): void;
  onMute(cb: (muted: boolean) => void): void;
  onThemeChange(cb: (theme: 'retro' | 'cartoon' | 'minimal') => void): void;
  onLocaleChange(cb: (locale: string) => void): void;
}

export async function createPlatformAdapter(opts: { gameId: string }): Promise<PlatformAdapter> {
  // Embedded in Ayvago: the SDK v2 handshake succeeds within the timeout
  if (window.self !== window.top && (await detectAyvago(1500))) return new AyvagoAdapter(opts);
  return new StandaloneAdapter(opts);
}
```

**Removing the CrazyGames SDK — old call → replacement** (from scanning orb-surge, pixel-cascade and space-defender):

| CrazyGames v3 call to remove | Adapter call that replaces it | Ayvago SDK v2 message |
|---|---|---|
| `SDK.game.loadingStart/Stop` | `loadingProgress` / `loadingDone` | `GHA_LOADING` / `GHA_READY` |
| `SDK.game.gameplayStart/Stop` | `gameplayStart` / `gameplayStop` | `GHA_SESSION_START` / follows `GHA_PAUSE` |
| `SDK.ad.requestAd('midgame')` | `requestInterstitial` | `GHA_AD_REQUEST {format:'interstitial'}` |
| `SDK.ad.requestAd('rewarded')` | `requestRewarded` | `GHA_AD_REQUEST {format:'rewarded'}` |
| `SDK.game.happytime()` | `celebrate` | (confetti effect in the cartoon theme) |
| `SDK.game.settings` (audio etc.) | `onMute` | `GHA_MUTE` |
| — (none) | `endGame` | `GHA_END` → score validation |

**Files and lines to remove:**
- The `<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js">` tag in `index.html` (3 games)
- `orb-surge/src/utils/CrazyGamesSDK.ts` and the scenes that call it (`MenuScene`, `GameScene`, `GameOverScene`); `space-defender/src/managers/CrazyGamesSDK.ts` and the inline CrazyGames helpers in `space-defender/index.html`
- Direct `window.CrazyGames` calls in `pixel-cascade` (`BootScene`, `PreloadScene`, `MenuScene`, `GameOverScene`, `GameState.js`)
- `window.CrazyGames` type declarations (`src/types/index.ts`)
- Check: after import, `grep -ri crazygames src index.html` returns nothing; the harness fails if any request goes to `sdk.crazygames.com`.

**Distribution:** npm package (`@ayvago/platform-adapter`) or, for games that prefer no dependency, a single file from the CDN.

### 3.3 `ayvago.json` manifest (in each game's `public/` folder)

```json
{
  "$schema": "https://ayvago.com/schemas/manifest.v1.json",
  "id": "orbsurge",
  "title": { "en": "Orb Surge", "tr": "Orb Surge" },
  "description": { "en": "…", "tr": "…" },
  "category": "retro_action",
  "tags": ["arcade", "reflex", "neon"],
  "entry": "https://orb-surge.vercel.app/",
  "orientation": "any",
  "input": ["touch", "mouse", "keyboard"],
  "players": { "min": 1, "max": 1 },
  "scoring": {
    "metric": "points", "order": "desc", "format": "number", "label": { "en": "Score", "tr": "Puan" },
    "minDurationMs": 5000, "maxPerSecond": 250, "maxScore": 1000000
  },
  "ads": { "rewarded": ["continue", "double_reward"], "interstitial": ["game_over"] },
  "ageRating": "3+",
  "sdkVersion": 2,
  "assets": { "icon": "/ayvago/icon-512.png", "cover": "/ayvago/cover-1920x1080.jpg", "preview": "/ayvago/preview.mp4" },
  "version": "1.3.0"
}
```

The schema is defined with zod in `packages/shared` (already implemented, with tests); the import CLI and, later, developer submissions use the same validator. Localized fields require `en`; `tr` is optional.

### 3.4 Engine-specific hooks

| Engine | Pause / resume | Mute | Game over | Rewarded "continue" |
|---|---|---|---|---|
| **Phaser 3** | `game.loop.sleep()` / `wake()` or `scene.pause()` on the active scene | `game.sound.mute = muted` | GameOverScene `create()` → `adapter.endGame()` | Modal on death → `requestRewarded('continue')` → if `true`, resume the scene |
| **Three.js** | `renderer.setAnimationLoop(null)` / restart, `clock.stop()` | `AudioListener.setMasterVolume(0)` | Death branch in GameScene | Same |
| **Canvas 2D** | Stop the rAF loop, reset `lastTime` | `AudioContext.suspend()` | Game-over function | Same |
| **React** | `paused` flag in game state, stop timers | Web Audio `suspend()` | When a winner is decided | Hint button |

**Platform overlays:** inside Ayvago the game's own "Game Over / Play Again" screen is **kept** (the games are already polished); the SDK's default overlay is disabled with `useNativeOverlays: false`. The start screen stays too — only a platform leaderboard button is added (`openLeaderboard` via the adapter).

**In-game text:** games may localize their own UI using `adapter.locale` / `onLocaleChange`. Not required for import; English in-game text is acceptable.

### 3.5 Local high scores (localStorage)

Browsers now **partition** iframe storage by top-level site: the `orbSurgeHighScore` a player saved while playing directly on `orb-surge.vercel.app` is **not visible** to the Ayvago iframe. Therefore:
- On Ayvago the source of truth for records is the **server** (`users/{uid}/stats/{gameId}`); `adapter.getBestScore()` returns it.
- Old local records are **not migrated** to leaderboards (they cannot be verified), so platform leaderboards start fresh and fair.
- In standalone mode the existing localStorage keys (`orbSurgeHighScore`, `crystalRunner3D_highScore`, `gyroball-best-score`, …) keep working.

### 3.6 PWA / service worker compatibility

- A game's own service worker may also register inside the iframe; that is fine, but the SDK/adapter file must be **network-first** so an old version never gets stuck in the cache.
- Manifest fields such as `start_url` and `display` have no effect inside an iframe; games keep their own PWA install behavior.

---

## 4. Step-by-Step Procedure for One Game

The same checklist for every game (Claude applies these steps through a skill — §8).

1. **Branch:** `ayvago-integration` in the game repository.
2. **Headers:** `vercel.json` → delete `X-Frame-Options`, add `frame-ancestors` (§3.1).
3. **Remove CrazyGames, add the adapter:** delete the CrazyGames script tag, helper files and every `window.CrazyGames` call (list in §3.2); replace them with `@ayvago/platform-adapter` calls.
4. **Lifecycle:** loading progress, `gameplayStart/Stop`, pause/resume, mute (§3.4).
5. **Score:** `endGame({ score })` at the end of a run; `submitScore` for checkpoints if needed.
6. **Ad placements:** rewarded/interstitial points per the table in §6.
7. **Theme (optional):** map UI colors to platform CSS variables via `onThemeChange`.
8. **Manifest + assets:** `public/ayvago.json` (English + Turkish text), `public/ayvago/icon-512.png`, `cover-1920x1080.jpg`, (optional) a 10–15 s `preview.mp4`.
9. **Standalone regression:** confirm the game still opens and plays as before on its own URL.
10. **PR + Vercel preview** → test on the platform's dev environment with `?gameUrl=<preview>`.
11. **Automated harness** (§7) passes.
12. **Import CLI** adds the game to the catalog as `draft` (§5) → internal testing → `live`.

**Definition of done:**
- [ ] Opens inside an iframe on the Ayvago dev environment with no console errors
- [ ] `GHA_READY` ≤ 10 s (4G throttling), the loading bar progresses
- [ ] The final score passes `finishSession` and appears on the leaderboard
- [ ] Pauses when the tab is hidden, honors the platform mute
- [ ] Rewarded "continue" works; no interstitial for `remove_ads` users
- [ ] Controls work on mobile (portrait + landscape) and desktop
- [ ] Standalone mode still works
- [ ] No CrazyGames references left in the code, no requests to `sdk.crazygames.com`
- [ ] `ayvago.json` passes the validator (English required, Turkish provided), assets uploaded
- [ ] Catalog page renders correctly in both `/en` and `/tr`

---

## 5. Import CLI (`packages/cli`)

```
pnpm ayvago game:import --manifest https://orb-surge.vercel.app/ayvago.json --env dev
```

What it does:
1. Downloads the manifest and validates it with the zod schema.
2. Checks the `entry` URL's headers (`frame-ancestors` includes the platform, no `X-Frame-Options`).
3. Runs the harness (§7); stops on failure.
4. Downloads the icon/cover/preview, checks dimensions and ratios, uploads them to **Cloud Storage** (`games/{id}/…`) and generates WebP/AVIF variants.
5. Writes `games/{id}` (`status: 'draft'`) and `games/{id}/versions/{version}` to Firestore (firebase-admin with a service account).
6. Prints a summary report, including which locales the game's text covers.

Additional commands: `game:publish <id>` (draft → live, editor role), `game:update <id>` (new version), `game:list`. The same actions are available as buttons in `/admin`; the CLI is for bulk imports and CI.

---

## 6. Per-Game Score and Ad Plan

Values are **first estimates**; each game is calibrated (§6.1).

| Game | Score metric | Order | Rewarded placements | Interstitial |
|---|---|---|---|---|
| Crystal Runner 3D | Points / distance | desc | "Continue" on death (1×), "2× crystals" at the end | Game over → play again |
| Orb Surge | Points | desc | "Continue", "start with a shield" | Game over |
| Pixel Cascade | Points | desc | "Extra moves / shuffle", "hint" | Between levels (every 3 levels) |
| ChromaShift | Points | desc | "Continue", "hint" | Game over |
| Space Defender | Points | desc | "Extra life", "start with a power-up" | Between waves / game over |
| Gyroball Infinite | Distance | desc | "Continue" | Game over |
| Number Detective | Wins | desc (accumulate) | "Hint: reveal a digit" (single-player practice mode only) | Between matches |
| Tavla | Wins / Elo | desc | — (competitive fairness) | Between matches |
| Naval Strike | Wins | desc | — | Between matches |
| Tito | Wins | desc | — | Between matches |

Multiplayer matches have **no** in-game rewarded ads (it would be an advantage over the opponent); ads only run between matches.

### 6.1 Calibrating score limits
1. Wave games are first played in `draft` mode during internal testing; `score` and `durationMs` are collected from `sessions`.
2. For each game: 99.9th percentile of `score / second` × 1.5 → `maxPerSecond`; shortest realistic run → `minDurationMs`.
3. For the first two weeks live, limits **only flag** (no blocking); they are tightened once the false-positive rate is known.
4. Limits live in `games/{id}.scoring` and can be updated without a deploy.

---

## 7. Automated Test Harness (Playwright)

Lives in `apps/sdk-playground`; used by both the import CLI and CI:

1. Loads the game in an iframe on a host page that mimics the real platform (different origin).
2. Header check: the iframe actually loads (frame-ancestors).
3. Waits for `GHA_READY` (10 s timeout, 4G throttling).
4. Sends `GHA_START` (with `locale: 'en'` and again with `'tr'`); takes a screenshot (blank/black screen detection).
5. Sends fake input (clicks/keys), plays for 15 s; `GHA_PAUSE` → frames stop changing, `GHA_RESUME` → they continue.
6. Collects console errors and failed network requests.
7. Measures total transferred bytes (initial load).
8. Looks for forbidden requests (unknown ad/tracking domains, `sdk.crazygames.com`).
9. Repeats for a mobile viewport (390×844) and desktop (1280×800).
10. Produces a JSON + HTML report.

Ending a run differs per game, so the manifest optionally supports `testHooks` (e.g. `?ayvagoTest=endgame` ends the game after 3 s); active only in test environments.

---

## 8. Automation with Claude

- The platform repository gets `.claude/skills/integrate-game/SKILL.md`: the 12 steps from §4, the engine patterns from §3.4 and the definition of done. Command: `/integrate-game selchook/orb-surge`.
- Each game is a **separate repository**, so there are no file conflicts → games within a wave are integrated **in parallel** with `agent-teams:team-feature` (one `team-implementer` per game, a `team-reviewer` at the end).
- Each PR gets `/code-review` and the harness report in its description.

---

## 9. Wave 3 — Migrating the Multiplayer Games

All four games use Ably, and tito/backgammon already have a "PeerJS DataConnection-style" wrapper → the migration can be limited to replacing what sits under that wrapper.

| Step | Details |
|---|---|
| 1. Common interface | `adapter.multiplayer`: `createRoom()`, `joinRoom(code)`, `send(data)`, `onMessage(cb)`, `onPeerJoin/Leave(cb)`, `getRole()` (host/guest) |
| 2. Ayvago implementation | Connects to the platform's `netcode` package: RTDB lobby + signaling, WebRTC DataChannel, **Cloudflare TURN** (`getIceServers`), RTDB relay fallback. The game only sees `GHA_MOVE_OUT/IN`. |
| 3. Standalone implementation | Instead of Ably, the same Firebase project's **guest** flow (anonymous auth + RTDB), so the games no longer need Ably on their own URLs either. Alternative: standalone multiplayer redirects to Ayvago. |
| 4. Room codes / invites | Existing `?room=XXXXXX` deep links map to `ayvago.com/{locale}/play/backgammon?room=XXXXXX`; WhatsApp sharing is kept, with the invite text in the sender's language. |
| 5. State sync | In games that send full state (Tavla: `publish(eventName, { state })`) the host stays authoritative; on reconnect the last state is read from RTDB. |
| 6. Chat (Tavla) | Platform chat component + profanity filter (en + tr) + reporting; disabled for child accounts. |
| 7. Remove Ably | Delete the package and key references; revoke every key in the Ably dashboard. |
| 8. Tests | Force TURN (`iceTransportPolicy: 'relay'`) and play across two networks; connection drops/reconnects; mobile backgrounding. |

Score: number of wins (`accumulate: true`), later Elo for Tavla; a result counts **only if both sides report the same outcome**, mismatches flag the match.

---

## 10. Timeline

| When (roadmap phase) | Work |
|---|---|
| Phase 1, week 2 | SDK v2 + `platform-adapter` + harness + import CLI skeleton (the `ayvago.json` schema already exists) |
| Phase 1, week 3 | Crystal Runner (pilot) — protocol and score flow end to end |
| Phase 1, weeks 3–4 | Orb Surge, Pixel Cascade, ChromaShift (in parallel) |
| Phase 2 | Space Defender, Gyroball Infinite + score-limit calibration (using wave 1 data) |
| Phase 3 | Rewarded/interstitial placements in all live games |
| Phase 4 | Number Detective (multiplayer pilot), then Naval Strike, Tito, Tavla |

---

## 11. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| A missed header change leaves the game blank on the platform | The CLI and harness check headers first |
| Removing CrazyGames breaks game flow (e.g. an `await` on an ad never resolves) | Adapter calls always return a resolving Promise; standalone ad calls resolve `false` immediately; the harness tests the full game loop |
| iOS Safari audio/fullscreen restrictions inside an iframe | `AudioContext.resume()` on first touch; fullscreen handled by the platform (enlarging the iframe) |
| Gyroball gyroscope permission inside an iframe | `allow="accelerometer; gyroscope"` on the iframe + the iOS permission prompt triggered by a platform button |
| Wrong score limits block legitimate players | Flag-only mode for the first two weeks |
| Exposed Ably keys are abused | Revoke/rotate in Phase 0; Ably removed entirely in wave 3 |
| Production URLs change | Stored in `games/{id}.originUrl`, which also feeds origin validation |
| Game text only in one language | Validator requires English; the CLI report lists missing Turkish text |

---

## 12. Needed from the Owner

1. Each game's **production Vercel URL** (or custom domain).
2. Approval to open `ayvago-integration` branches and PRs in the game repositories.
3. **Revocation of the Ably key in the battleships repository** (plain text in a public repository).
4. Cover art: is there existing artwork, or should covers be generated from in-game screenshots?
