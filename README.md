# Ayvago

A web game platform that brings retro action, casual and puzzle games together in one place — [ayvago.com](https://ayvago.com).

## Status

**Phase 0 — Preparation.** Monorepo scaffold, CI, Firebase security-rule baseline, i18n foundation (English and Turkish) and the game manifest schema are in place.

- Roadmap: [`docs/plan/roadmap.md`](docs/plan/roadmap.md)
- Game import plan: [`docs/plan/game-import-plan.md`](docs/plan/game-import-plan.md)
- Phase 0 checklist: [`docs/setup/phase-0.md`](docs/setup/phase-0.md)
- Architecture decisions: [`docs/adr/`](docs/adr/)

## Layout

```
apps/web            Next.js platform app (Vercel), localized with next-intl
  messages/         UI translations (en.json is the source of truth, tr.json)
packages/shared     Shared constants, types and zod schemas (locales, categories, ayvago.json manifest)
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

Copy `apps/web/.env.example` to `apps/web/.env.local` for environment variables. Never commit real secrets.

## Internationalization

- Supported locales are defined in `packages/shared/src/locales.ts` (`en` default, `tr`).
- UI strings live in `apps/web/messages/<locale>.json`; never hardcode user-facing text in components.
- Add new keys to `en.json` first, then to every other locale in the same change — the test suite fails if a locale is missing a key.

## Deployment

Vercel project **Root Directory** = `apps/web`. Firebase rules are deployed from `firebase/` with `firebase deploy --only firestore:rules,database,storage`.
