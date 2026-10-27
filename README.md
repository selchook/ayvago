# Ayvago

A web game platform that brings retro action, casual and puzzle games together in one place — [ayvago.com](https://ayvago.com).

## Status

**Phase 2 — Competition and community (in progress).** Server-validated scores with weekly and
all-time leaderboards, voting with catalog ranking, the admin panel and the App Check rollout switch
and touch controls for Space Defender are live. App Check is turned on once its site key is set
up.

| Phase | Scope | Status | Docs |
|---|---|---|---|
| 0 | Preparation: monorepo, CI, Firebase projects, i18n, ADRs | Done, owner items open | [Plan](docs/plan/phase-0.md) · [Setup](docs/setup/phase-0.md) |
| 1 | MVP platform: themes, catalog, game player, adapter, accounts, library, profile | Done (catalog in Firestore, sdk-playground and PWA carried forward) | [Plan](docs/plan/phase-1.md) · [Setup](docs/setup/phase-1.md) |
| 2 | Competition and community: score sessions, leaderboards, voting, admin panel, Ayvago Arcade | Code complete (2.1–2.7), owner steps open | [Plan](docs/plan/phase-2.md) · [Setup](docs/setup/phase-2.md) |
| 3 | Monetization: consent, ads, rewarded placements, `remove_ads` | Not started | [Roadmap](docs/plan/roadmap.md#12-phases-and-timeline) |
| 4 | Multiplayer: WebRTC + Cloudflare TURN, import wave 3 | Not started | |
| 5 | Retention: achievements, XP, quests, push, cloud saves | Not started | |
| 6 | Developer program | Not started | |
| 7 | App stores | Not started | |

Live games: the 26 in-house Ayvago Arcade games (`selchook/ayvago-games`, slice 2.6). The ten
imported games are parked until they meet the platform standards (slice 2.7,
[ADR 0008](docs/adr/0008-park-imported-games.md)).

- Roadmap: [`docs/plan/roadmap.md`](docs/plan/roadmap.md)
- Game import plan: [`docs/plan/game-import-plan.md`](docs/plan/game-import-plan.md)
- Feature specs: [`docs/specs/`](docs/specs/) (accounts, leaderboards, voting, UI and themes)
- Architecture decisions: [`docs/adr/`](docs/adr/)

## Layout

```
apps/web            Next.js platform app (Vercel), localized with next-intl
  messages/         UI translations (en.json is the source of truth, tr.json)
packages/shared     Shared constants, types and zod schemas (locales, categories, ayvago.json manifest),
                    seed catalog, leaderboard seasons, vote ranking
packages/themes     Theme tokens (minimal, retro, cartoon), generated CSS, contrast tests
packages/platform-adapter  Adapter games vendor to talk to Ayvago (protocol 2)
tools/fixture-game  Local test game for the iframe bridge
firebase/           Firebase configuration, security rules, indexes and emulator tests
  functions/        Cloud Functions (europe-west1): score sessions, leaderboards, votes, accounts, admin
docs/               Roadmap, ADRs, setup checklists
```

## Development

Requirements: Node 22, pnpm 10 (`corepack enable`).

```bash
pnpm install
pnpm dev          # http://localhost:3000 → redirects to /en or /tr
pnpm typecheck
pnpm test
pnpm build
```

### Testing the game bridge locally

`tools/fixture-game` is a tiny game that speaks the platform protocol from its own origin:

```bash
pnpm fixture-game                         # http://localhost:4173
AYVAGO_DEV_GAMES=1 pnpm dev               # lists "Bridge Fixture" in the catalog
```

With the Firebase emulators (`cd firebase && npx firebase emulators:start --only auth,firestore,functions --project demo-ayvago`) and `NEXT_PUBLIC_FIREBASE_EMULATORS=1`, accounts, leaderboards and votes work locally too.

Open `/en/games/bridge-fixture`, press Play, and the fixture shows the theme and locale it received; scores, mute and theme changes flow through the same `GHA_*` messages real games use.

To play a game's integration branch inside the platform before it is deployed, serve its build locally and point the catalog at it:

```bash
# in the game repository
npm run build && npx vite preview --port 4202
# in this repository
AYVAGO_DEV_GAMES=1 AYVAGO_DEV_ENTRY_OVERRIDES="orb-surge=http://localhost:4202/" pnpm dev
```

The Ayvago Arcade games all come from one build of `selchook/ayvago-games`:

```bash
# in ayvago-games
npm run build && npx vite preview --port 4173
# in this repository
AYVAGO_DEV_ARCADE_ORIGIN=http://localhost:4173 pnpm dev
```

Copy `apps/web/.env.example` to `apps/web/.env.local` for environment variables. Never commit real secrets.

## Internationalization

- Supported locales are defined in `packages/shared/src/locales.ts` (`en` default, `tr`).
- UI strings live in `apps/web/messages/<locale>.json`; never hardcode user-facing text in components.
- Add new keys to `en.json` first, then to every other locale in the same change — the test suite fails if a locale is missing a key.

## Deployment

- Web: Vercel project `ayvago-web`, **Root Directory** = `apps/web`, deployed on every push to `main`.
- Firestore rules and indexes: `.github/workflows/deploy-firebase-rules.yml` (tests against the emulator, then deploys).
- Cloud Functions: `.github/workflows/deploy-functions.yml` (same tests, then deploys).
- Admin role: `.github/workflows/grant-admin.yml` (run manually with an email).

Setup and the required roles are in [`docs/setup/phase-0.md`](docs/setup/phase-0.md) and [`docs/setup/phase-2.md`](docs/setup/phase-2.md).
