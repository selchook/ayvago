# Ayvago — working agreement for Claude

Ayvago (https://ayvago.com) is a web game platform: a catalog of retro action, casual and puzzle
HTML5 games with accounts, leaderboards, voting, three UI themes (retro / cartoon / minimal),
rewarded ads with a `remove_ads` purchase, multiplayer, and later a third-party developer program.

## Language rules
- The owner writes instructions in Turkish; reply in Turkish in chat.
- **Everything committed to the repository is English**: code, comments, identifiers, commit messages,
  README and all docs under `docs/`.
- The product UI is localized with next-intl. User-facing text never appears in code: add a key to
  `apps/web/messages/en.json` first, then to every other locale file (`tr.json`) in the same change.
  The message test fails CI if a locale is missing a key.
- Supported locales live in `packages/shared/src/locales.ts`. English is the default and the fallback.
- Game-provided text (`ayvago.json`) is a `{ en, tr? }` map; English is required.

## Conventions
- Plans: `docs/plan/roadmap.md`. Decisions are ADRs in `docs/adr/`. Bringing in games from outside
  is planned in the studio (`selchook/ayvago-games`) when it starts.
- **Phase documentation is part of every slice** (owner request). In the same change that ships a slice:
  - Update `docs/plan/phase-N.md`. It holds the slice table, what shipped, deviations from the spec,
    tests and what is still open.
  - Update `docs/setup/phase-N.md` for every step the owner must take (⏳).
  - Every phase has **both** files, created when the phase starts. The setup file says so when the
    owner has nothing to do.
  - Tick the roadmap checklist (§12) and the functions table (§2.4).
  - Update the "Implementation status" section of the affected spec.
  - Update the phase table in `README.md`.
  - Record significant decisions as ADRs.
- Stack: pnpm workspaces + Turborepo, Next.js 16 (App Router) on Vercel, Firebase (Auth, Firestore,
  Realtime Database, Functions, Storage, App Check, Remote Config) in `europe-west1`,
  Cloudflare Realtime TURN for WebRTC relay.
- Games run in sandboxed iframes on their own origins and talk to the platform only through the
  postMessage SDK (`GHA_*` messages, v1-compatible). Games never call Firebase or Cloudflare directly.
- CrazyGames is not supported; do not add CrazyGames SDK code.
- Never commit secrets. `.env*` files are git-ignored; server secrets live in Vercel env vars or
  Firebase Secret Manager.
- Firestore/RTDB/Storage rules start from deny-all; every rule change ships with emulator tests.

## Studio and platform (ADR 0011)
- Games are made in `selchook/ayvago-games` (the studio: runtime, games, game skills and agents).
  This repo is the platform players see. Never edit `packages/shared/src/arcade-catalog.ts` by
  hand: the "Sync arcade catalog" workflow pulls it from the studio's `main` and opens a PR.
- `packages/platform-adapter` is the protocol's original; the studio's CI fails until its copy
  matches.
- Platform work: follow `.claude/skills/ayvago-platform-slice/SKILL.md`; use the
  `ayvago-platform-dev` and `ayvago-platform-qa` agents for larger slices.

## Commands
- `pnpm install` · `pnpm dev` · `pnpm build` · `pnpm typecheck` · `pnpm test` · `pnpm format`
- Node 22 (`.nvmrc`), pnpm 10 (`packageManager` field).

## Layout
- `apps/web` — Next.js platform app; `app/[locale]/` routes, `i18n/` config, `messages/` catalogs,
  `lib/catalog` (catalog access layer), `lib/gha` (game bridge protocol), `lib/leaderboard`
  (score sessions, board views)
- `packages/shared` — locales, categories, zod schemas (`ayvago.json` game manifest), the seed catalog
  (`seed-catalog.ts`, read by the web app and the functions), leaderboard and season helpers
- `packages/themes` — theme tokens, generated CSS, contrast tests (components read semantic tokens only)
- `packages/platform-adapter` — single-file adapter games vendor into `src/ayvago/`; change it here, then
  copy it into each game repository
- `tools/fixture-game` — local cross-origin test game (`pnpm fixture-game`, `AYVAGO_DEV_GAMES=1`)
- `firebase/` — Firebase config, security rules, emulator tests (`firebase/tests`) and Cloud Functions
  (`firebase/functions`, europe-west1, bundled with esbuild); rules and functions deploy from GitHub Actions
- `docs/` — plans, ADRs, setup checklists
