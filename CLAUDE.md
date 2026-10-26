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
- Plans: `docs/plan/roadmap.md` and `docs/plan/game-import-plan.md`. Decisions are ADRs in `docs/adr/`.
- Stack: pnpm workspaces + Turborepo, Next.js 16 (App Router) on Vercel, Firebase (Auth, Firestore,
  Realtime Database, Functions, Storage, App Check, Remote Config) in `europe-west1`,
  Cloudflare Realtime TURN for WebRTC relay.
- Games run in sandboxed iframes on their own origins and talk to the platform only through the
  postMessage SDK (`GHA_*` messages, v1-compatible). Games never call Firebase or Cloudflare directly.
- CrazyGames is not supported; do not add CrazyGames SDK code.
- Never commit secrets. `.env*` files are git-ignored; server secrets live in Vercel env vars or
  Firebase Secret Manager.
- Firestore/RTDB/Storage rules start from deny-all; every rule change ships with emulator tests.

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
