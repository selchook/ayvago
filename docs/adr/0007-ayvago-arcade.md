# ADR 0007 — In-house Ayvago Arcade games share one runtime and one origin

- Status: Accepted (2026-10-27)
- Related: [ADR 0002](0002-iframe-game-sdk.md), [Phase 2 plan](../plan/phase-2.md#26-ayvago-arcade-catalog)

## Context
The launch catalog needs many more games than the ten imported titles. Ayvago now builds its own
retro arcade, action, casual and puzzle games in `selchook/ayvago-games`: Phaser 3 + TypeScript
games on one shared runtime. The runtime provides the Ayvago boot intro, menus, TR/EN text, touch
and keyboard controls, and the platform adapter. Giving each of dozens of small games its own
repository and Vercel project would multiply setup and deploy work without isolating anything
that matters.

## Decision
- **One repository, one Vercel project, one origin** for all in-house games. Each game is served
  from `<origin>/games/<slug>/` with its `ayvago.json`, `ayvago/icon-512.png` and
  `ayvago/cover-1920x1080.jpg` beside it. The origin is `https://ayvago-games.vercel.app` until a
  custom domain is chosen.
- **The games still integrate through the iframe + SDK v2 model of ADR 0002.** They vendor the
  platform adapter (`packages/platform-adapter`) into the shared runtime unchanged. They never call
  Firebase. Their origin allows the platform with `frame-ancestors`.
- **Catalog entries are generated, not hand-written.** The games repository generates
  `packages/shared/src/arcade-catalog.ts` (`scripts/gen-platform.mjs`) and validates every
  manifest against this repository's zod schema. `SEED_GAMES` includes `ARCADE_GAMES`, so the web
  app and the score functions see them like any other seed game.
- **Manifest ids are the slug without hyphens** (`space-blaster` → `spaceblaster`), as the schema
  requires.
- **The games are `coming_soon` until the origin is deployed and checked.** One constant
  (`ARCADE_STATUS`) switches all of them to `live`. `AYVAGO_DEV_ARCADE_ORIGIN` points them at a
  local build for testing, like `AYVAGO_DEV_ENTRY_OVERRIDES` does for single games.

## Consequences
- **Shared origin.** All arcade games share one origin and therefore one storage partition. This
  is acceptable because they are first-party code from one repository; third-party games keep
  their own origins.
- **Message routing still works.** Message trust is still per frame: the player checks
  `event.source` as well as the origin, so two arcade games on one page cannot read each other's
  messages.
- **One deploy ships every arcade game.** A broken shared runtime breaks all of them, so the games
  repository gates releases on a smoke test and a GHA protocol test of every game.
- **Scoring limits are generous at first.** They start at `maxPerSecond: 1000`, `minDurationMs: 3000`
  and `maxScore: 10,000,000`, and are calibrated per game from the first two weeks of sessions.
