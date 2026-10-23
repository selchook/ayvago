# Ayvago

A web game platform that brings retro action, casual and puzzle games together in one place — [ayvago.com](https://ayvago.com).

## Status

**Phase 0 — Preparation.** Monorepo scaffold, CI, Firebase security-rule baseline, i18n foundation (English and Turkish) and the game manifest schema are in place.

- Roadmap: [`docs/plan/roadmap.md`](docs/plan/roadmap.md)
- Game import plan: [`docs/plan/game-import-plan.md`](docs/plan/game-import-plan.md)
- Phase 0 checklist: [`docs/setup/phase-0.md`](docs/setup/phase-0.md)
- Feature specs: [`docs/specs/`](docs/specs/) (accounts, leaderboards, voting, UI and themes)
- Architecture decisions: [`docs/adr/`](docs/adr/)

## Layout

```
apps/web            Next.js platform app (Vercel), localized with next-intl
  messages/         UI translations (en.json is the source of truth, tr.json)
packages/shared     Shared constants, types and zod schemas (locales, categories, ayvago.json manifest)
packages/themes     Theme tokens (minimal, retro, cartoon), generated CSS, contrast tests
packages/platform-adapter  Adapter games vendor to talk to Ayvago (protocol 2)
tools/fixture-game  Local test game for the iframe bridge
firebase/           Firebase configuration and security rules
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

Open `/en/games/bridge-fixture`, press Play, and the fixture shows the theme and locale it received; scores, mute and theme changes flow through the same `GHA_*` messages real games use.

To play a game's integration branch inside the platform before it is deployed, serve its build locally and point the catalog at it:

```bash
# in the game repository
npm run build && npx vite preview --port 4202
# in this repository
AYVAGO_DEV_GAMES=1 AYVAGO_DEV_ENTRY_OVERRIDES="orb-surge=http://localhost:4202/" pnpm dev
```

Copy `apps/web/.env.example` to `apps/web/.env.local` for environment variables. Never commit real secrets.

## Internationalization

- Supported locales are defined in `packages/shared/src/locales.ts` (`en` default, `tr`).
- UI strings live in `apps/web/messages/<locale>.json`; never hardcode user-facing text in components.
- Add new keys to `en.json` first, then to every other locale in the same change — the test suite fails if a locale is missing a key.

## Deployment

Vercel project **Root Directory** = `apps/web`. Firebase rules are deployed from `firebase/` with `firebase deploy --only firestore:rules,database,storage`.
