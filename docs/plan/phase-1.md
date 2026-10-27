# Phase 1 — MVP platform

- Status: Done, except three items moved on (see "Still open") — 2026-10-23 → 2026-10-25, written up retroactively on 2026-10-26
- Previous: [Phase 0](phase-0.md) · Roadmap: [§12 Phases and timeline](roadmap.md#12-phases-and-timeline) · Owner steps: [Phase 1 setup](../setup/phase-1.md) (commands in [Phase 0 setup](../setup/phase-0.md)) · Specs: [Accounts](../specs/accounts.md), [UI and themes](../specs/ui-and-themes.md) · Next: [Phase 2](phase-2.md)

**Done when:** a guest picks a theme and a language, plays the 4 games and sees their scores on the
profile. ✅ Verified end to end against the emulators; guest and Google sign-in confirmed by the
owner on ayvago.com.

Legend: ✅ done · ⏳ owner action · ⬜ not started

## Slices

| # | Slice | Status |
|---|---|---|
| 1.1 | Theme system and app shell | ✅ |
| 1.2 | Seed catalog and catalog pages (SEO, both locales) | ✅ |
| 1.3 | `GamePlayer` and the game bridge | ✅ |
| 1.4 | Platform adapter (protocol 2) and local integration testing | ✅ |
| 1.5 | Import wave 1 (and wave 2) with real gameplay covers | ✅ |
| 1.6 | Accounts: guest + Google, profile documents, rules tests | ✅ |
| 1.7 | Library sync (favorites, recently played, best scores) | ✅ |
| 1.8 | Firestore rules deploy from GitHub Actions | ✅ |
| 1.9 | Profile and settings page | ✅ |
| 1.10 | Blaze plan and Cloud Functions: usernames, guest merge, guest cleanup | ✅ |

## What shipped

### 1.1 Theme system and app shell
- `packages/themes`: three themes (retro, cartoon, minimal). Cartoon and minimal have light and dark modes and retro is dark only, which gives 5 theme/mode combinations.
  - Semantic tokens and generated CSS.
  - A WCAG AA contrast test in CI.
  - No-flash persistence through cookies.
- App shell:
  - Top bar, side rail and phone bottom bar.
  - Theme and language switchers.
  - `ThemeRestorer`, which keeps the theme across locale changes.

### 1.2 Catalog pages
- Home, category, new, multiplayer, recently played, favorites and game pages in `/en` and `/tr`.
- Static generation, metadata, JSON-LD `VideoGame`, sitemap and hreflang alternates.
- The catalog comes from a seed behind an access layer (`apps/web/lib/catalog`). The seed itself now lives in `packages/shared/src/seed-catalog.ts`, so pages do not change when the catalog moves to Firestore.

### 1.3 GamePlayer and bridge
- Sandboxed iframe on the game's own origin.
- Loading screen with progress, slow-load hint and retry.
- Fullscreen, theater mode, mute and share.
- Pauses when the tab is hidden; forwards theme and locale changes to the game.
- Security:
  - Every message is checked for origin and source (`apps/web/lib/gha/bridge.ts`, unit-tested).
  - Messages always go to the registered origin, never `*`.
- `tools/fixture-game`: a cross-origin test game used for end-to-end checks.

### 1.4 Platform adapter
- `packages/platform-adapter`: one vendorable file. Games copy it into `src/ayvago/`; protocol 2 keeps the v1-compatible `GHA_*` message names.
- Inside Ayvago it talks to the platform; standalone it falls back to local behavior (13 tests).
- `AYVAGO_DEV_ENTRY_OVERRIDES` plays a game's local build inside the platform before it is deployed.

### 1.5 Game imports
- **Wave 1:** crystal-runner-3d, orb-surge, pixel-cascade, chromashift.
- **Wave 2:** space-defender, gyroball-infinite. Done in the same week; the roadmap lists it under Phase 2.
- For every game:
  - Integrated with the adapter, CrazyGames SDK removed.
  - iframe embedding allowed for Ayvago.
  - Deployed on Vercel and live in the catalog.
- Covers are real gameplay screenshots, captured with Playwright and served from each game's own origin.

### 1.6 Accounts
- Firebase Auth:
  - A guest (anonymous) account is created on the first press of Play, never on page load.
  - Google sign-in links to the same uid.
  - When the Google account already belongs to an Ayvago account, the player switches to that account.
- `users/{uid}` profile with a generated name ("PixelFox4821", "HızlıTilki4821"). It is created in a transaction, under rules that pin the allowed fields, server timestamps and the guest flag.
- Emulator rules tests (`firebase/tests`). The web app can run against the emulators (`NEXT_PUBLIC_FIREBASE_EMULATORS=1`) with a test hook for the Google flow.
- Build-log diagnostics for missing or malformed `NEXT_PUBLIC_FIREBASE_*` values.

### 1.7 Library sync
- `users/{uid}/library/state` holds favorites, recently played games and best scores in one document, so loading it costs one read; the browser keeps a copy.
- The first time a browser meets an account, the two libraries are merged; after that the account copy wins.
- Writes are batched every 2 s, and signing out clears the browser copy.

### 1.8 Rules deploy
- `.github/workflows/deploy-firebase-rules.yml` tests the rules against the emulator and deploys them to `ayvago-prod`.
- It uses the service account in `FIREBASE_SERVICE_ACCOUNT_AYVAGO_PROD` and reports failures as annotations.

### 1.9 Profile and settings
- `/{locale}/profile` (not indexed):
  - 12 × 8 preset avatars.
  - Theme, mode and language saved to the account and applied on new devices.
  - Personal bests.
  - Download my data, and Delete account (with re-authentication when needed).

### 1.10 Cloud Functions
- Blaze plan; `firebase/functions` in `europe-west1`, bundled with esbuild.
- `reserveUsername`:
  - Unique names, with case and Turkish letters folded.
  - 30-day cooldown; reserved and offensive names refused.
- `mergeGuestAccount`: a guest's library joins an existing account.
- `cleanupGuests`: deletes guests unused for 30 days, every night.
- `.github/workflows/deploy-functions.yml` tests and deploys on every change.

## Deviations from the plan
- The **catalog is served from the seed**, not from Firestore `games/{gameId}`. Pages read it through the access layer, so the switch only touches `apps/web/lib/catalog`.
- **Avatars are presets only** (no uploads); Apple and email-link sign-in are postponed.
- Accounts first shipped on the **Spark plan** without functions. Usernames, merge and cleanup followed on Blaze.

## Still open (carried forward)
- ⬜ Catalog in Firestore (`games/{gameId}`), editable from the admin panel.
- ⬜ sdk-playground (developer test host), needed before the developer program (Phase 6).
- ✅ Platform PWA (manifest, service worker, install prompt): shipped in Phase 2, slice 2.9.
- ⏳ `ayvago-dev` web config in Vercel Preview/Development and budget alerts ([Phase 0 setup §3](../setup/phase-0.md#3-firebase)).

## Tests at the end of the phase
118 tests in CI:

| Suite | Tests |
|---|---|
| themes | 12 |
| shared | 29 |
| platform adapter | 13 |
| web | 27 |
| Firestore rules and functions (emulator) | 37 |

Each slice was also checked in a real browser (Playwright) against the emulators.
