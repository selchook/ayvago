# Ayvago — working agreement for Claude

Ayvago (https://ayvago.com) is a web game platform: a catalog of retro action, casual and puzzle
HTML5 games with accounts, leaderboards, voting, three UI themes (retro / cartoon / minimal),
rewarded ads with a `remove_ads` purchase, multiplayer, and later a third-party developer program.

## Conventions
- The owner writes instructions in Turkish. **All code comments, identifiers and commit messages are in English.**
  Planning docs under `docs/` may be Turkish.
- Plans: `docs/plan/yol-haritasi.md` (roadmap) and `docs/plan/oyun-import-plani.md` (game import plan).
  Decisions are recorded as ADRs in `docs/adr/`.
- Stack: pnpm workspaces + Turborepo, Next.js (App Router) on Vercel, Firebase (Auth, Firestore,
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
- `apps/web` — Next.js platform app
- `packages/shared` — shared types and zod schemas (`ayvago.json` game manifest)
- `firebase/` — Firebase config and security rules
- `docs/` — plans, ADRs, setup checklists
