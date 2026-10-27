# Ayvago — Analysis and Roadmap

> Platform: **Ayvago** · Domain: **ayvago.com** (purchased)
> Stack: Next.js on Vercel · Firebase (`europe-west1`) · Cloudflare Realtime TURN · next-intl (en, tr)
> Related: [Game import plan](game-import-plan.md) · Phase docs: [Phase 0](phase-0.md) ([setup](../setup/phase-0.md)) · [Phase 1](phase-1.md) ([setup](../setup/phase-1.md)) · [Phase 2](phase-2.md) ([setup](../setup/phase-2.md)) · [ADRs](../adr/)
> Feature specs: [Accounts](../specs/accounts.md) · [Leaderboards](../specs/leaderboards.md) · [Voting](../specs/voting.md) · [UI and themes](../specs/ui-and-themes.md)

---

## 0. Summary

Ayvago brings the owner's existing PWA-style HTML5 games (retro action, casual, puzzle) under one platform with accounts, leaderboards, voting, three UI themes (retro / cartoon / minimal), rewarded ads plus a `remove_ads` purchase, multiplayer, and — later — a curated program for third-party developers. The UI is localized (English and Turkish at launch).

| Layer | Choice | Why |
|---|---|---|
| Platform app | **Next.js 16 (App Router) + TypeScript** on Vercel | Games already live on Vercel; game pages are server-rendered for SEO |
| Internationalization | **next-intl**, locales `en` (default) and `tr`, locale-prefixed routes (`/en`, `/tr`) | Type-safe ICU messages, per-locale URLs with hreflang for SEO, works with Server Components |
| Authentication | **Firebase Authentication** | Anonymous (guest) sign-in → upgrade via `linkWithPopup` to Google/Apple/email without losing data |
| Primary database | **Cloud Firestore** | Profiles, catalog, scores, votes, purchases; client access governed by Security Rules |
| Realtime data | **Firebase Realtime Database** | Presence, lobbies, matchmaking, WebRTC signaling; `onDisconnect` cleanup |
| Server logic | **Cloud Functions for Firebase (2nd gen)** | Score validation, vote counters, payment webhooks, TURN credentials, scheduled jobs |
| Abuse protection | **Firebase App Check** (reCAPTCHA Enterprise) | Only the real platform client may call Functions/Firestore |
| Files | **Cloud Storage for Firebase** | Cover art, avatars, developer uploads |
| Config / experiments | **Remote Config** | Ad frequency, reward amounts, feature flags without deploys |
| Analytics / messaging | **Google Analytics for Firebase**, **FCM** (web push) | Retention and revenue funnels; "your record was beaten" notifications |
| **TURN** | **Cloudflare Realtime TURN** | Multiplayer WebRTC works behind NAT/firewalls; global anycast network |
| Game integration | **iframe + postMessage SDK v2** (secure, backward-compatible successor to the GHA SDK) | Engine-agnostic: Phaser, Three.js, React, Canvas, Unity WebGL |
| Monorepo | **pnpm + Turborepo** | Platform, SDK, themes, functions and rules in one repository |
| Ads | **Google H5 Games Ads** (primary), AppLixir (fallback) | Official rewarded + interstitial support for web games |
| Payments (web) | **Paddle or Lemon Squeezy** (merchant of record), optional **iyzico** for TRY | Stripe does not support businesses registered in Turkey; a MoR handles VAT/tax |
| Payments (stores) | Google Play Billing / Apple IAP via **RevenueCat** (official Firebase extension) | Digital goods in store builds must use store billing |

**Firebase plan:** Cloud Functions require the **Blaze (pay as you go)** plan. Free quotas still apply; set **budget alerts** on day one (e.g. $10 / $25 / $50).

**Region:** the Firestore location **cannot be changed later**. `europe-west1` (Belgium) for latency to Turkey and data-protection (KVKK/GDPR) reasons; Functions and RTDB in the same region.

---

## 1. Current State Analysis

### 1.1 Access to gamehub-arena

The `gamehub-arena` platform code is on the owner's local machine and not on GitHub, so it could not be reviewed directly. Its **game-side contract** was reconstructed from two sources:

1. `selchook/game-factory` → `src/GameFactory.jsx`, the "GameHub Build" agent (single-file class module spec)
2. `selchook/crystal-runner-3d-three-js-r168` → `public/js/gha-game-sdk.js` (iframe SDK v1.0) and `docs/GHA-SUBMIT.md`

> Because Ayvago moves to Firebase, gamehub-arena's database code will not be ported. If it is pushed to GitHub, its auth flow, leaderboard rules and UI components can still be reused.

### 1.2 What we learned from GameHub Arena

**Model A — single-file class module loaded with `eval()`:** `constructor/start/receiveMove/handleRematch/destroy/getState/loadState`, `ClassName.meta = { id, name, players, scoring: { metric, order, format, label, accumulate } }`, `GHA.registerGame()`.

**Model B — iframe + postMessage SDK v1.0:**
- Game → platform: `GHA_READY`, `GHA_BRIDGE_READY`, `GHA_SESSION_START`, `GHA_SCORE`, `GHA_END`, `GHA_SESSION_END`, `GHA_MOVE_OUT`, `GHA_OPEN_LEADERBOARD`
- Platform → game: `GHA_START {config}`, `GHA_MOVE_IN`, `GHA_PAUSE`, `GHA_RESUME`

| Topic | Decision |
|---|---|
| Model A (`eval`) | **Dropped** — running third-party code in the platform page is an account-takeover risk. |
| Model B (iframe SDK) | **Adopted**; message names stay backward-compatible. |
| v1 security gap | `postMessage(..., '*')` and no `origin` check on incoming messages → fixed in v2 (§5). |
| Score integrity | v1 had no server validation → v2 adds session tokens and plausibility checks in Cloud Functions. |
| `GHA_MOVE_OUT / GHA_MOVE_IN` | **Kept** — multiplayer moves flow through it to the platform's WebRTC layer (§10). |

### 1.3 Game inventory (summary — details in the [import plan](game-import-plan.md))

| Game | Engine | Category (tentative) | Status |
|---|---|---|---|
| crystal-runner-3d | Three.js | Retro Action | GHA SDK v1 integrated ✅ |
| orb-surge | Phaser 3 | Retro Action | CrazyGames SDK (**to be removed**), **iframe blocked** |
| space-defender | TS / Canvas | Retro Action | CrazyGames SDK (**to be removed**), **iframe blocked** |
| pixel-cascade | Phaser 3 | Puzzle | CrazyGames SDK (**to be removed**), **iframe blocked** |
| chromashift | Phaser 3 | Casual / Puzzle | localStorage only, **iframe blocked** |
| gyroball-infinite | Three.js | Casual | localStorage only, **iframe blocked** |
| guess-number (Number Detective) | React | Puzzle / Multiplayer | **Ably** (2-player Bulls & Cows) |
| backgammon (Tavla) | React | Board / Multiplayer | **Ably** |
| battleships (Naval Strike) | React | Multiplayer | **Ably** (README says PeerJS, code uses Ably) |
| tito-multiplayer | Next.js | Multiplayer | **Ably** (wrapper with a PeerJS-style interface) |
| PyraStackInstant | Unity | — | Empty Unity template (SampleScene only); no game yet |

"iframe blocked": `vercel.json` sets `X-Frame-Options: SAMEORIGIN`, so a platform on another domain cannot embed the game. Fixed during import.

**CrazyGames is not supported.** The CrazyGames SDK is removed from every game during import.

### 1.4 Security findings ⚠️

1. **Anthropic API key:** `.env` is committed in `game-factory` and `game-factory-new`; in `game-factory` the variable is `VITE_ANTHROPIC_API_KEY`, which Vite bundles into browser JavaScript. → **Revoke/rotate** the key and remove `.env` from the repositories.
2. **Exposed Ably keys:** `battleships` (a **public** repository) contains an Ably API key in **plain text** in `src/App.jsx` — **revoke it in the Ably dashboard now**. `backgammon` (`VITE_ABLY_API_KEY`), `guess-number` (`VITE_ABLY_KEY`) and `tito-multiplayer` (`NEXT_PUBLIC_ABLY_KEY`) also ship the key to the browser, so anyone can use the account's Ably quota. Ably is removed entirely when these games move to Firebase + Cloudflare; until then restrict key capabilities or switch to token auth.

---

## 2. Target Architecture

```
                  ┌───────────────────── ayvago.com (Next.js, Vercel) ─────────────────────────┐
 User ──────────► │ /en · /tr — catalog · game page · profile · leaderboard · store · /admin    │
 (PWA)            │                                                                              │
                  │ GamePlayer ── sandboxed iframe ──► game.vercel.app  (SDK v2)                │
                  │     ▲ postMessage (origin + source checked)                                  │
                  │ Netcode (WebRTC DataChannel) ◄──► opponent's browser                         │
                  │     │ signaling: RTDB        │ relay when needed: Cloudflare TURN            │
                  │ Ad manager (H5 Games Ads) · entitlements · theme provider · App Check        │
                  └───────┬───────────────────────────────┬──────────────────────────────────────┘
                          │ Firebase Web SDK               │ firebase-admin (SSR, ISR 60 s)
             ┌────────────▼────────────────────────────────▼───────────┐
             │ Firebase (europe-west1)                                   │      ┌───────────────────────┐
             │  Auth · Firestore · Realtime DB · Storage · Remote Config │      │ Cloudflare Realtime   │
             │  Cloud Functions ─────────── getIceServers ──────────────────────►│ TURN (short-lived     │
             │       ▲ webhooks                                           │      │ ICE credentials)      │
             └───────┼────────────────────────────────────────────────────┘      └───────────────────────┘
                     │
        Paddle / Lemon Squeezy / RevenueCat
```

### 2.1 Monorepo layout (`selchook/ayvago`)

```
ayvago/
├─ apps/
│  ├─ web/                 # Next.js platform (player UI + /admin + /developers), next-intl
│  │  └─ messages/         # UI translations: en.json (source of truth), tr.json
│  └─ sdk-playground/      # Fake host page where developers test their game against the SDK
├─ packages/
│  ├─ game-sdk/            # SDK v2 (npm + a single CDN file)
│  ├─ platform-adapter/    # Single facade games use: SDK v2 inside Ayvago, standalone elsewhere
│  ├─ netcode/             # WebRTC DataChannel + RTDB signaling + TURN ICE handling
│  ├─ themes/              # retro / cartoon / minimal design tokens
│  ├─ ui/                  # Shared React components
│  ├─ shared/              # Locales, categories, Firestore types, zod schemas (ayvago.json manifest)
│  └─ cli/                 # `ayvago game:import` and other admin commands
├─ firebase/
│  ├─ functions/           # Cloud Functions (TypeScript)
│  ├─ firestore.rules · firestore.indexes.json
│  ├─ database.rules.json  # Realtime Database rules
│  ├─ storage.rules
│  └─ tests/               # Emulator Suite + @firebase/rules-unit-testing
├─ docs/                   # Plans, ADRs, setup checklists (English)
└─ .github/workflows/      # CI: format, typecheck, test, build; later rules tests and deploys
```

Repository rules: **everything in the repository is English** — code, comments, identifiers, commit messages and docs. User-facing text never appears in code; it lives in the message catalogs.

Environments: two Firebase projects, `ayvago-dev` and `ayvago-prod`. Local development runs against the **Firebase Emulator Suite** (Auth, Firestore, RTDB, Functions, Storage); CI runs rules and Functions tests against the emulators.

### 2.2 Firestore data model

Firestore has no joins and bills per document read, so frequently read data is **denormalized**.

| Path | Content | Written by |
|---|---|---|
| `users/{uid}` | Public profile: `username`, `avatarId`, `theme`, `locale`, `xp`, `level`, `country`, `isGuest`, `createdAt` | Owner (restricted fields) |
| `users/{uid}/private/account` | `birthYear`, notification preferences, consent record | Owner |
| `users/{uid}/stats/{gameId}` | `bestScore`, `plays`, `playSeconds`, `lastPlayedAt` | **Functions only** |
| `users/{uid}/favorites/{gameId}` | Favorite | Owner |
| `usernames/{lowercase}` | Username uniqueness (reserved in a transaction) | Functions |
| `games/{gameId}` | Catalog: `slug`, `title{en,tr}`, `description{en,tr}`, `category`, `tags`, `originUrl`, `status`, `scoring{}`, `likes`, `dislikes`, `plays`, `rating`, `editorPick`, `thumbUrl` | Admin / Functions |
| `games/{gameId}/versions/{v}` | Version history, `sdkVersion`, `reviewStatus` | Admin / Functions |
| `games/{gameId}/votes/{uid}` | `value: 1 \| -1` | Owner — rule: `stats/{gameId}.playSeconds >= 60` |
| `sessions/{sessionId}` | Play session: `uid`, `gameId`, `startedAt`, `endedAt`, `score`, `continues`, `flagged` | **Functions only** |
| `leaderboards/{gameId}/boards/{boardKey}` | `boardKey` = `season` or `all`; cached top 100 (`top: [...]`) — one read per page view | Functions |
| `leaderboards/{gameId}/boards/{boardKey}/entries/{uid}` | User's best score in the current period | Functions |
| `leaderboards/{gameId}/seasons/{seasonKey}` | Archived final top 100 of each weekly season | Functions |
| `entitlements/{uid}` | `removeAds`, `premiumUntil`, `source` | **Functions only** |
| `purchases/{id}`, `adRewards/{id}` | Payment and rewarded-ad records | Functions |
| `wallets/{uid}` + `/tx/{id}` | Platform currency (Phase 5) | Functions |
| `developers/{uid}`, `submissions/{id}`, `reviews/{id}` | Developer program (Phase 6) | Owner + Functions |
| `reports/{id}` | User reports | Anyone creates, admins read |

Season key: `s-2026-W42` (weekly seasons, Monday 09:00 UTC). Old season entries are deleted 8 weeks after the archive is written. Details: [leaderboards spec](../specs/leaderboards.md).

**User rank:** a `where('score', '>', myScore).count()` aggregation on `entries` (billed one read per 1,000 index entries) → "#1,284".

**Vote counters:** a function triggered by `votes` writes updates `likes/dislikes`; a nightly job computes `wilson`, `qualityScore` and `trendScore` ([voting spec](../specs/voting.md)). Switch to distributed counters if traffic demands.

**Roles:** Firebase Auth **custom claims** (`admin`, `editor`, `developer`), checked in rules via `request.auth.token.admin == true`.

**Localized content:** platform-authored catalog text is stored as locale maps (`{ en, tr }`); English is required and is the fallback. Game manifests follow the same shape.

### 2.3 Realtime Database layout

```
presence/{uid}                         { state: 'online', gameId, lastChanged }   ← onDisconnect → offline
lobbies/{gameId}/{roomCode}            { hostUid, players{}, status, createdAt }  ← room code + invite link
matchQueue/{gameId}/{uid}              { rating, joinedAt }                       ← quick match
signaling/{roomId}/{fromUid}_{toUid}   { offer, answer, candidates{} }            ← WebRTC handshake
relay/{roomId}/moves/{pushId}          { from, data, ts }                         ← fallback when WebRTC fails
```

RTDB rules: only players in a room can read/write it; rooms are deleted after two hours by a scheduled function.

### 2.4 Cloud Functions

| Function | Type | Purpose |
|---|---|---|
| `startSession` ✅ | Callable (App Check; enforcement switched in the admin panel) | Creates the session document and a random token (hash stored) |
| `finishSession` ✅ | Callable | Validates the score; updates `entries` and `top`, or flags it for review |
| `syncLeaderboardProfile` ✅ | Callable | Copies name/avatar into the player's board rows |
| `castVote` ✅ | Callable | Votes with eligibility, rate limit and feedback; updates the counters (replaces the planned `onVoteWritten` trigger) |
| `recomputeRankings` ✅ | Scheduled (hourly) | Wilson rating, engagement, `qualityScore`, `trendScore`, `rankings/catalog` |
| `deleteMyData` ✅ | Callable | Account deletion, server part: profile, library, username, board rows, votes, stats |
| `reserveUsername` ✅ | Callable | Unique usernames, profanity filter |
| `getIceServers` | Callable (auth + rate limit) | Short-lived TURN credentials from Cloudflare (§10) |
| `matchmake` | RTDB trigger | Pairs queued players and opens a lobby |
| `grantAdReward` | Callable | Grants rewarded-ad rewards (daily cap) |
| `paddleWebhook` / `lemonWebhook` | HTTPS | Signature check → `purchases` + `entitlements` |
| `revenuecatWebhook` | HTTPS (or the official extension) | Store purchases → `entitlements` |
| `closeLeaderboardSeason` ✅ | Scheduled (Monday 09:00 UTC) | Archives the weekly top 100, starts the new season (rewards in Phase 5) |
| `mergeGuestAccount` ✅ · `cleanupGuests` ✅ · `cleanupSessions` ✅ | Callable · Scheduled · Scheduled | Guest merge; guest cleanup (30 days); score session cleanup (14 days) |
| `cleanupLobbies` | Scheduled (hourly) | Removes stale rooms and signaling data |
| `reviewScoreFlag` ✅ · `setPlayerBan` ✅ | Callable (admin claim) | Admin panel: decide flagged scores; ban or unban players |
| `getAppCheckStatus` ✅ · `setAppCheckMode` ✅ | Callable (admin claim) | App Check rollout: verified share of recent sessions; monitor / enforce switch |
| `onUserDeleted` | Auth trigger | KVKK/GDPR: delete or anonymize user data (covered for now by `deleteMyData` and `cleanupGuests`) |
| `submissionChecks` | Firestore trigger / Cloud Run job | Automated checks for developer submissions (Phase 6) |

Secrets (Cloudflare API token, Paddle secret) live in **Secret Manager** (`defineSecret`) — never in the client.

### 2.5 Next.js ↔ Firebase

- Client: modular Firebase Web SDK (tree-shaken). Auth state in a React context.
- Server: catalog and game pages render with `firebase-admin` and **ISR** (60 s) → low Firestore cost, full SEO.
- Vercel holds `FIREBASE_SERVICE_ACCOUNT` (server only).
- Firebase App Hosting can also run Next.js, but the existing workflow is on Vercel, so the app stays there.

---

## 3. Internationalization (i18n)

**Library:** `next-intl` (App Router, Server Components, ICU message format, type-safe keys).

| Topic | Decision |
|---|---|
| Locales at launch | `en` (default, source of truth) and `tr` |
| URLs | Always prefixed: `/en/...`, `/tr/...`. `/` redirects using the `NEXT_LOCALE` cookie, then `Accept-Language` |
| SEO | `hreflang` alternates and canonical URL per locale; per-locale sitemap entries |
| Message catalogs | `apps/web/messages/{locale}.json`; keys type-checked against `en.json`; a test fails CI if any locale is missing a key or has an empty string |
| Formatting | Numbers, dates, durations and prices via next-intl formatters (`useFormatter`) — e.g. scores `12,450` vs `12.450`, relative times on leaderboards |
| Pluralization | ICU plural rules (`{count, plural, one {# win} other {# wins}}`) |
| User preference | Language switcher; the choice is stored in the `NEXT_LOCALE` cookie and in `users/{uid}.locale` for signed-in users (also used for push notifications and emails) |
| Game content | `ayvago.json` titles/descriptions/score labels are `{ en, tr? }` maps; English required, missing locales fall back to English |
| Games | The SDK passes `locale` in `GHA_START.config` and sends `GHA_LOCALE_CHANGE`; localizing in-game text is optional for games |
| Server-generated text | Functions (emails, push notifications) use the same catalogs via a shared message package when needed |
| Adding a language | Add the code to `SUPPORTED_LOCALES`, add `messages/<code>.json`, translate; CI enforces completeness. RTL languages need a layout review |
| Translation workflow | English is written first; Turkish is translated in the same PR. A translation management tool (e.g. Crowdin/Tolgee) is considered once there are 3+ locales |

The foundation (routing, proxy, message catalogs, language switcher, completeness test) is already in place in `apps/web`.

---

## 4. UI Themes (retro · cartoon · minimal)

`<html data-theme="retro">`; the choice is stored in `users/{uid}.theme` and `localStorage`. The GHA CSS variable names (`--bg`, `--bg-card`, `--accent`, `--text`, `--text-dim`, `--border`, `--radius`, `--success`) are **kept unchanged**.

| Token | Retro | Cartoon | Minimal |
|---|---|---|---|
| Font | Press Start 2P / VT323 | Fredoka / Baloo 2 | Inter |
| `--radius` | 0 | 20px | 8px |
| Borders | 2px, pixel shadow `4px 4px 0` | 3px dark outline | 1px hairline |
| Palette | CRT green/magenta/cyan, dark | Saturated yellow/blue/pink, light | Neutral + one accent, light & dark |
| Effects | Scanlines (can be turned off), 8-bit UI sounds | Spring animations, confetti | Quiet transitions |
| Game card | Arcade cabinet frame | Sticker card | Flat image |

- The theme is passed to games: `GHA_START.config.theme` + `GHA_THEME_CHANGE`; following it is optional for games.
- Pixel and display fonts must include Turkish glyphs (ç, ğ, ı, İ, ö, ş, ü); fonts without them are rejected or paired with a fallback.
- Default and seasonal themes can be managed through **Remote Config**.
- Token layers, components and page layouts: [UI and themes spec](../specs/ui-and-themes.md).
- Every theme meets WCAG AA contrast and respects `prefers-reduced-motion`.

---

## 5. Game SDK v2 (iframe protocol)

### 5.1 Security
- Platform: for every message, `event.source === iframe.contentWindow` **and** `event.origin === game.originUrl`.
- SDK: posts to the allow-listed platform origin, never `'*'`.
- iframe: `sandbox="allow-scripts allow-same-origin allow-pointer-lock"`, `allow="autoplay; fullscreen; gamepad"`, no top navigation.
- Games **never** talk to Firebase directly; users, scores, ads and multiplayer all go through the platform, so games never see Firebase config, tokens or TURN credentials.

### 5.2 API

```ts
// v1-compatible
GHA.ready() · GHA.onStart(cb) · GHA.startGame() · GHA.endGame({ score, won, message })
GHA.submitScore(n) · GHA.onPause(cb) · GHA.onResume(cb) · GHA.openLeaderboard()
GHA.sendMove(data) · GHA.onMove(cb)
// new in v2
GHA.loadingProgress(0..1)
GHA.requestAd('rewarded' | 'interstitial', { placement }) : Promise<{ shown, rewarded }>
GHA.hasEntitlement('remove_ads') : Promise<boolean>
GHA.getPlayer() : Promise<{ displayName, avatarUrl, isGuest } | null>
GHA.cloud.save(key, json) · GHA.cloud.load(key)          // stored in Firestore by the platform
GHA.unlockAchievement(id)
GHA.onThemeChange(cb) · GHA.onLocaleChange(cb) · GHA.onMute(cb)
GHA.multiplayer.onPeerJoin(cb) · onPeerLeave(cb) · getRoom()
GHA.track(event, props)                                   // forwarded to Google Analytics
// GHA_START config: { mode, isHost, playerIndex, playerCount, theme, locale, adsEnabled, protocol: 2 }
```

### 5.3 Score validation flow

```
1. GHA_READY            → platform: startSession() callable → { sessionId, token }
2. GHA_END {score}      → platform checks origin/source
3. finishSession({ sessionId, token, score, durationMs })
4. Function checks: session belongs to this uid and is open · duration ≥ minDurationMs ·
   score ≤ maxPerSecond × duration · score ≤ maxScore · per-uid rate limit · App Check token
5. Pass: stats + entries (all/week/day) + top[] if needed, in one transaction
   Suspicious: flagged=true, hidden from leaderboards, reviewed in /admin
```

Client-side games can never be fully cheat-proof; this layer stops casual cheating such as fake scores sent from the console. Seed + input replay verification for the top 10 can be added later.

---

## 6. User System

- **Guest first:** `signInAnonymously()` on the first game launch (not on page load, so crawlers and bounced visits create no accounts); the player can play immediately and scores are saved.
- **Account upgrade:** `linkWithPopup(GoogleAuthProvider / OAuthProvider('apple.com'))` or email link → **the same uid** is kept; scores, favorites and purchases survive. If the account already exists, a merge function runs.
- **Profile:** username (auto-generated for guests, `reserveUsername` with a 30-day change cooldown, profanity filter for every supported language), preset avatar set, theme, language, stats, badges, history.
- **Purchases require a registered account** so they can be restored on any device.
- **Age gate:** birth year; under 13 → non-personalized ads only, purchases restricted.
- **Account deletion / data export:** `onUserDeleted` + "Download my data" (KVKK, GDPR, Google Play requirement).
- Unused anonymous accounts are cleaned up automatically by Firebase (e.g. after 30 days).
- Legal texts (privacy policy, terms, KVKK notice, cookie consent) exist in every supported locale.
- Full details: [accounts spec](../specs/accounts.md).

## 7. Leaderboards

- Per game: **weekly season** (Monday 09:00 UTC reset, final standings archived, cosmetic season rewards) and **all-time**; global and country scopes, friends later; ordering from `scoring.order` (time trials: lower is better). A daily board can be enabled per game later.
- Guests appear on boards with a guest badge and are prompted to register to claim their record.
- The top 100 is read from a single document (`top[]`); the user's rank via `count()`.
- After a game: "personal best!", "you're #37 this week", FCM "your record was beaten" (opt-in).
- Scores achieved with a rewarded "continue" are marked; at most one continue per session.
- Full details: [leaderboards spec](../specs/leaderboards.md).

## 8. Voting and Discovery

- **Like / dislike** plus a separate favorite; rule: only users who played the game for ≥ 60 s (`stats.playSeconds`). A 👎 opens an optional reasons sheet (bugs, controls, too hard, …) for internal feedback.
- Like percentage shown from 20 votes; ranking combines the **Wilson score** of votes with engagement (session length, day-1 return, recent plays, completion); new games get a 14-day boost. Details: [voting spec](../specs/voting.md).
- Shelves: Editor's Picks, Popular, New, Retro Action / Casual / Puzzle, Continue Playing, Favorites.
- No public comments in the first phases.

---

## 9. Monetization

### 9.1 Ads

| Format | Where | Rule |
|---|---|---|
| **Rewarded** (primary) | In-game "continue", "2× reward", "hint"; on the platform: daily coins, cosmetic unlocks | Always user-initiated; rewards granted server-side by `grantAdReward`, capped daily |
| Interstitial | Between games, game over → "play again" | ≥ 3 min apart; **none** with `remove_ads` |
| Banner | Desktop side column | Not on mobile; none with `remove_ads` |

- Ads are always shown by the **top-level platform page**; games only request them via `GHA.requestAd()`.
- Frequency caps and reward amounts are tuned with **Remote Config** + A/B Testing.
- Provider: Google H5 Games Ads (needs an AdSense account and an H5 Games application; approval can take weeks → apply in Phase 0). Fallback: AppLixir.
- **CMP required:** a Google-certified TCF v2.2 CMP for EEA/UK traffic, wired to Google Analytics **Consent Mode v2**; consent UI localized. KVKK notice for Turkey.

### 9.2 In-app purchases

| SKU | Type | Suggested price | Effect |
|---|---|---|---|
| `remove_ads` | One-time | $2.99–4.99 | Removes interstitials + banners; rewarded stays optional or rewards are granted directly |
| `premium_pass` (later) | Monthly | $1.99–2.99 | remove_ads + extra theme variants + badge |
| Coin packs (later) | Consumable | — | Cosmetics only; nothing that affects scores |

Flow: checkout → webhook function → `purchases` + `entitlements/{uid}` → the client sees it immediately via `onSnapshot`. In store builds, RevenueCat's Firebase extension writes to the same document. Prices are shown in the visitor's currency where the provider supports it.

---

## 10. Multiplayer — Cloudflare TURN + Firebase signaling

### 10.1 Why TURN?
WebRTC connects two browsers directly (P2P), but behind symmetric NAT, mobile carrier CGNAT or corporate firewalls a direct connection fails. A TURN server relays the traffic in that case. Cloudflare's TURN service is anycast, so players connect to the nearest Cloudflare location.

### 10.2 Flow

```
Player A (platform)                     Firebase                           Player B (platform)
  │ getIceServers() ───────────────► Function ──► Cloudflare API             │
  │ ◄── iceServers (TTL ≈ match length)                                       │
  │ createOffer → signaling/{room}/A_B ──► RTDB ──► onValue ────────────────►│ (B also calls getIceServers)
  │ ◄──────────────────────────────── RTDB ◄── answer + ICE candidates ──────│
  │ ═══════════ RTCDataChannel (direct, else relayed via turn.cloudflare.com) ═══════════ │
  │ iframe ⇄ platform: GHA_MOVE_OUT / GHA_MOVE_IN (postMessage)                            │
```

- The **platform (top-level page)** owns the connection; the game iframe only sees `sendMove/onMove`, so TURN credentials never reach games and all games share one netcode.
- DataChannels: turn-based games use `ordered: true` (reliable); real-time action games add an `ordered: false, maxRetransmits: 0` channel.
- **Fallback:** if WebRTC cannot connect at all, moves go through `relay/{roomId}/moves` in RTDB (fast enough for turn-based games).

### 10.3 Cloudflare setup
1. In the Cloudflare dashboard, **Realtime → TURN**, create a TURN key (Key ID + API token).
2. Store the token in Firebase Secret Manager: `firebase functions:secrets:set CF_TURN_TOKEN`.
3. `getIceServers` POSTs to
   `https://rtc.live.cloudflare.com/v1/turn/keys/{KEY_ID}/credentials/generate-ice-servers`
   with `Authorization: Bearer <token>` and body `{ "ttl": 7200 }` → response: an `iceServers` array (STUN + TURN URLs, `username`, `credential`).
4. **Filter out port 53 URLs** before returning them (browsers can time out on that port).
5. Guards: signed-in users only + App Check + N requests per user per minute; TTL kept short.

> Re-check the endpoint and maximum TTL against the current Cloudflare docs during implementation (older docs mention a `/credentials/generate` path).

### 10.4 Cost
Cloudflare Realtime (SFU + TURN combined): **first 1,000 GB per month free**, then **$0.05/GB** egress. Turn-based move data is measured in kilobytes, so usage should stay within the free tier; most connections also never need TURN.

### 10.5 Existing multiplayer games
backgammon, battleships, guess-number and tito-multiplayer (all Ably) move to this layer → the Ably dependency and client-side Ably keys disappear. Details: [import plan](game-import-plan.md), wave 3.

---

## 11. Developer Program (later)

### 11.1 Flow
```
Draft → Submitted → Automated checks → Editorial review → Soft launch (5% traffic, 7–14 days) → Full launch
                          │ fail                        │ reject / revise
                          └──► Report                   └──► Feedback with reasons
```
The soft-launch traffic share is managed with Remote Config.

### 11.2 Rules
**Technical (automated — Playwright + Lighthouse, Cloud Run job):** HTTPS; `frame-ancestors` allows Ayvago; SDK v2 handshake (`GHA_READY` ≤ 10 s) and `GHA_END`; initial download ≤ 20 MB, total ≤ 100 MB; first playable frame < 8 s (4G); desktop + touch; pauses on `GHA_PAUSE`, honors mute; no critical console errors; no external ad/tracking scripts, outbound redirects or login walls; valid `ayvago.json` manifest with at least English text.

**Content:** no gambling, adult content, hate speech or copyright infringement; age rating declared.

**Editorial rubric (1–5):** originality, polish, fun in the first 30 s, controls, category fit, performance. Threshold: average ≥ 3.5 and no criterion < 2.

**Legal:** developer agreement, IP declaration, takedown rights; revenue share proposal: **50%** of net ad revenue (the old GHA doc's 70/30 is an alternative). Agreement and policies published in every supported locale.

### 11.3 Hosting
Developers provide their own HTTPS URL **or** upload a zip → Cloud Storage → served from a **second Firebase Hosting site** on a separate domain, isolated from `ayvago.com` cookies. Initially Firebase's free `ayvago-play.web.app` address is enough (`web.app` counts as a separate site, so it cannot read `ayvago.com` cookies). A subdomain such as `play.ayvago.com` is **not suitable**: it counts as the same site and weakens isolation. A branded separate domain (e.g. `ayvagoplay.com`) can be added later.

---

## 12. Phases and Timeline

### Phase 0 — Preparation (1 week)
- [ ] Security cleanup — Anthropic key revoked ✅; `.env` removal PRs open in `game-factory` and `game-factory-new`; Ably keys still to revoke/restrict
- [x] Platform name **Ayvago**, domain **ayvago.com** purchased
- [ ] Connect `ayvago.com` DNS to Vercel (apex + `www` redirect), add it to Firebase Auth authorized domains
- [ ] Email: SPF/DKIM/DMARC for `ayvago.com` (Firebase Auth email links and the support address)
- [ ] `ads.txt` on `ayvago.com` for AdSense verification (before Phase 3)
- [x] List the games' production Vercel URLs
- [x] `selchook/ayvago` monorepo scaffold, CI, ADRs 0001–0005, Firebase deny-all rules, i18n foundation (en/tr) — details: [phase 0 checklist](../setup/phase-0.md)
- [ ] Firebase projects `ayvago-dev` / `ayvago-prod` — `ayvago-prod` set up on the Blaze plan (Firestore + RTDB in `europe-west1`, Auth, web config in Vercel, rules and functions deployed from GitHub Actions); `ayvago-dev` web config and budget alerts still open
- [ ] Cloudflare account, Realtime TURN key
- [ ] **AdSense + H5 Games Ads application**, Paddle/Lemon Squeezy seller application

### Phase 1 — MVP platform (3–4 weeks) — done
Slice summary: [Phase 1 plan](phase-1.md); the open items below carry forward.
- [ ] Firestore model v1 + Security Rules + rules tests (emulator) — `users/{uid}` and `users/{uid}/library/state` done with 26 emulator tests, deployed automatically; catalog (`games`) still served from the seed
- [x] Guest (anonymous) + Google sign-in, upgrade that keeps the uid, profile document with a generated name — Spark plan, client writes under Firestore rules with emulator tests
- [x] Profile and settings page (`/profile`): preset avatars, theme/mode/language saved to the account and applied on new devices, personal bests, data download, account deletion
- [x] Username changes (`reserveUsername`: unique with Turkish letters folded, 30-day cooldown, reserved and offensive names blocked), guest merge into an existing account (`mergeGuestAccount`), nightly cleanup of guests unused for 30 days (`cleanupGuests`) — Cloud Functions in `europe-west1`, emulator-tested, deployed from GitHub Actions
- [x] Theme system (3 themes, 5 theme/mode combinations, WCAG AA contrast test in CI, no-flash persistence)
- [x] App shell: top bar, side rail, phone bottom bar, theme and language switchers
- [x] Catalog, category, new, multiplayer and game pages (static + SEO + JSON-LD `VideoGame`, sitemap, hreflang) in both locales — from a seed catalog until Firestore is connected
- [x] Recently played / favorites / personal best scores, synced to the account (`users/{uid}/library/state`) and cached in the browser
- [x] `GamePlayer`: sandboxed iframe, loading screen, fullscreen, theater, pause on hidden tab, mute, theme forwarding, origin + source checks (v1 message names) — verified end to end with `tools/fixture-game`
- [x] Platform adapter (`packages/platform-adapter`, protocol 2, vendored into games) — sdk-playground still open
- [ ] sdk-playground (developer test host)
- [x] **Import wave 1** (crystal-runner, orb-surge, pixel-cascade, chromashift) — integrated, deployed and live in the catalog with their own covers
- [x] Platform PWA (manifest, service worker, install prompt) — Phase 2 slice 2.9
- **Done when:** a guest picks a theme and a language, plays the 4 games and sees their scores on the profile.

### Phase 2 — Competition and community (2–3 weeks) — in progress
Slice plan and status: [Phase 2 plan](phase-2.md) · owner steps: [Phase 2 setup](../setup/phase-2.md)
- [x] `startSession` / `finishSession` + App Check — sessions, validation, flags, App Check client and an admin-panel enforcement switch guarded by the verified share ([ADR 0006](../adr/0006-score-sessions.md)); turning it on waits for the owner's reCAPTCHA Enterprise key
- [x] Leaderboards (weekly season + all-time, `top[]` cache, `count()` rank, season archive) with locale-aware number formatting — game page panel and `/games/{slug}/leaderboard`; country scope and season rewards deferred (see the plan)
- [x] Voting + Wilson/engagement ranking, negative-feedback reasons, favorites, Continue Playing shelf — `castVote`, hourly `recomputeRankings`, Popular and Continue Playing shelves; day-1 return and burst detection deferred (see the plan)
- [x] **Import wave 2** (space-defender, gyroball-infinite) — integrated, deployed and live in the catalog; Space Defender touch controls live (selchook/space-defender#2)
- [x] Admin panel v1 (custom claims): game management, flagged scores — `/admin` with flag review (approve / reject / ban), players, feedback and a games overview; editing games waits for the Firestore catalog
- [x] **Ayvago Arcade** (26 in-house games from `selchook/ayvago-games`, [ADR 0007](../adr/0007-ayvago-arcade.md)) — SDK v2 integration, generated catalog entries with covers and icons, deployed and live in the catalog
- [x] Imported games parked until they meet the platform standards ([ADR 0008](../adr/0008-park-imported-games.md)); the multiplayer ones return with import wave 3
- [x] Ayvago Arcade look: categories follow the arcade genres ([ADR 0009](../adr/0009-categories-follow-arcade-genres.md)), Ayvago Arcade theme, Ayvago Games logo
- **Done when:** a fake score sent from the console never reaches a leaderboard. ✅ (emulator-tested)

### Phase 3 — Monetization (3 weeks)
- [ ] CMP + Consent Mode v2, KVKK/GDPR texts (en + tr)
- [ ] Ad manager (H5 Games Ads), frequency via Remote Config
- [ ] Rewarded placements + `grantAdReward`
- [ ] Paddle/Lemon Squeezy checkout + webhook → `entitlements`; `remove_ads`
- [ ] Google Analytics revenue funnel (BigQuery export later)
- **Done when:** a `remove_ads` buyer never sees an interstitial; rewarded rewards arrive only after server confirmation.

### Phase 4 — Multiplayer (2–3 weeks)
- [ ] `packages/netcode`: RTDB signaling + WebRTC DataChannel + RTDB relay fallback
- [ ] `getIceServers` function + Cloudflare TURN
- [ ] Lobbies, room codes / invite links, quick match, presence, rematch
- [ ] **Import wave 3** (backgammon, battleships, guess-number, tito) — migration off Ably
- **Done when:** players on two different mobile carriers (with TURN forced in tests) can finish a match.

### Phase 5 — Retention (2 weeks)
- [ ] Achievements, XP/levels, badges
- [ ] Daily quests, login streaks
- [ ] FCM web push (localized)
- [ ] Cloud saves (`GHA.cloud`), coins + cosmetic store

### Phase 6 — Developer program (4–6 weeks)
- [ ] Developer accounts (custom claim), agreement, `ayvago.json` validator
- [ ] Submission form, zip → Storage → second Firebase Hosting site
- [ ] Automated check pipeline (Cloud Run job: Playwright + Lighthouse)
- [ ] Editorial queue + rubric, soft launch via Remote Config
- [ ] Developer dashboard, revenue-share reports, reports/moderation
- [ ] Public SDK documentation + Phaser/Three.js templates

### Phase 7 — App stores (2–3 weeks)
- [ ] Android TWA (Bubblewrap) + Play Billing, or Capacitor; iOS via Capacitor + StoreKit
- [ ] RevenueCat Firebase extension → `entitlements`
- [ ] AdMob rewarded in store builds
- [ ] Localized store listings (en + tr)

**Total:** ~9–10 weeks to a revenue-generating release; ~12–13 weeks including multiplayer; ~18–21 weeks including the developer program.

---

## 13. Agents and Skills to Use

| Work | Agent / skill |
|---|---|
| Monorepo | `developer-essentials:monorepo-architect`, `turborepo-caching` |
| Firestore/RTDB model + rules | `database-design:database-architect`, `backend-api-security:backend-security-coder` |
| Auth | `developer-essentials:auth-implementation-patterns` |
| Next.js + i18n | `frontend-mobile-development:nextjs-app-router-patterns`, `frontend-developer` |
| Themes | `ui-design:design-system-setup`, `design-system-architect`, `accessibility-expert` |
| SDK v2, netcode | `javascript-typescript:typescript-pro` |
| Anti-cheat, postMessage, TURN security | `security-scanning:threat-modeling-expert` |
| Tests | `developer-essentials:e2e-testing-patterns`, `javascript-testing-patterns` |
| CI/CD (Vercel + firebase deploy) | `cloud-infrastructure:deployment-engineer` |
| Game import (parallel, one agent per repository) | `agent-teams:team-feature` |
| End-of-phase review | `/code-review`, `/security-review` |

---

## 14. Success Metrics

| Metric | Target (first 3 months) |
|---|---|
| D1 / D7 retention | ≥ 25% / ≥ 8% |
| Sessions per DAU | ≥ 2.5 |
| Rewarded opt-in rate | ≥ 20% |
| Guest → account conversion | ≥ 10% |
| `remove_ads` conversion | 0.5–1.5% |
| Leaderboard participation | ≥ 30% |
| Multiplayer connection success | ≥ 98% (including TURN) |
| Firebase monthly cost per DAU | Tracked, with budget alerts |
| Traffic share by locale | Tracked to decide on the next language |

---

## 15. Open Decisions

1. ~~Platform name and domain~~ → **Ayvago / ayvago.com** ✅
2. Firestore region: `europe-west1` (recommended) or `europe-west3`? (cannot change later)
3. Business entity (sole proprietor vs company) for the payment provider and AdSense.
4. The games' production URLs (for the import plan).
5. Rewarded behavior for `remove_ads` owners: optional ads or direct rewards?
6. Push gamehub-arena to GitHub (to reuse UI components)? Optional.
7. ~~Default locale~~ → **`en`** ✅ (Turkish browsers are still redirected to `/tr`)
