# Phase 0 — Preparation

- Status: Done for the codebase (2026-10-16 → 2026-10-18); owner items still open are tracked in the [Phase 0 setup checklist](../setup/phase-0.md) — written up retroactively on 2026-10-26
- Roadmap: [§12 Phases and timeline](roadmap.md#12-phases-and-timeline) · Owner steps: [Phase 0 setup](../setup/phase-0.md) · Next: [Phase 1](phase-1.md)

Legend: ✅ done · ⏳ owner action · ⬜ not started

## Slices

| # | Slice | Status |
|---|---|---|
| 0.1 | Analysis: GameHub Arena contract, game inventory, security findings, roadmap | ✅ |
| 0.2 | Monorepo scaffold, CI and the `ayvago.json` manifest schema | ✅ |
| 0.3 | Internationalization foundation (`en`, `tr`) | ✅ |
| 0.4 | ADRs 0001–0005 and the feature specs | ✅ |
| 0.5 | Firebase projects with a deny-all rules baseline | ✅ code, ⏳ `ayvago-dev` web config and budget alerts |
| 0.6 | Security cleanup of the game repositories | ✅ Anthropic key, ⏳ Ably keys and the `.env` PRs |
| 0.7 | Domain, email, Cloudflare and revenue applications | ⏳ owner |

## What shipped

### 0.1 Analysis
- The GameHub Arena game contract was reconstructed from `game-factory` and the Crystal Runner SDK:
  - the `GHA_*` postMessage names, which are kept;
  - the `eval` module model, which was dropped as unsafe.
- Game inventory and import plan ([game import plan](game-import-plan.md)): 11 repositories, the
  iframe blockers (`X-Frame-Options`), the CrazyGames SDK to remove, and the Ably-based multiplayer
  games for Phase 4.
- Security findings:
  - a committed Anthropic key, bundled into browser code in `game-factory`;
  - exposed Ably keys.
- The [roadmap](roadmap.md) with the target architecture, the data model and the phases.

### 0.2 Monorepo and CI
- `selchook/ayvago` (private): pnpm workspaces, Turborepo, Next.js app in `apps/web`, `packages/shared`.
- `packages/shared` holds the zod schema of `ayvago.json` with tests.
- GitHub Actions CI runs format, typecheck, tests and the build.

### 0.3 Internationalization
- next-intl with locale-prefixed routes (`/en`, `/tr`), and English as the default and fallback (ADR 0005).
- Message catalogs, with a test that fails when a locale misses a key.
- Everything committed is English; the UI text lives only in the catalogs.

### 0.4 Decisions and specs
- ADRs:
  - 0001 Firebase backend (`europe-west1`);
  - 0002 iframe game SDK;
  - 0003 Cloudflare TURN;
  - 0004 Monorepo with Next.js;
  - 0005 Internationalization.
- Feature specs: [accounts](../specs/accounts.md), [leaderboards](../specs/leaderboards.md),
  [voting](../specs/voting.md) and [UI and themes](../specs/ui-and-themes.md).

### 0.5 Firebase baseline
- `firebase/` config with deny-all Firestore, Realtime Database and Storage rules, and emulator ports.
- The owner created `ayvago-dev` and `ayvago-prod`. Firestore and the Realtime Database are in `europe-west1`.

### 0.6 Security cleanup
- The Anthropic API key was revoked by the owner.
- PRs that stop tracking `.env` are open: selchook/game-factory#1 and selchook/game-factory-new#1.

## Deviations from the plan
- The Firebase web config, the Blaze plan and automatic deploys were finished during Phase 1, when
  accounts first needed them ([Phase 1 setup](../setup/phase-1.md)).

## Still open (owner)
- ⏳ Revoke or restrict the Ably keys (`battleships` is public).
- ⏳ Merge the `.env` PRs in `game-factory` and `game-factory-new`.
- ⏳ `ayvago-dev` web config in Vercel Preview/Development; budget alerts.
- ⏳ Email DNS (SPF, DKIM, DMARC).
- ⏳ Cloudflare TURN key (needed in Phase 4).
- ⏳ AdSense, H5 Games Ads and payment provider applications (needed in Phase 3).
- ⏳ Business entity decision.

All of these are in the [Phase 0 setup checklist](../setup/phase-0.md).
