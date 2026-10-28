# ADR 0011 — ayvago-games is the studio, ayvago is the platform

- Status: Accepted (2026-10-28)
- Related: [ADR 0002](0002-iframe-game-sdk.md) (iframe game SDK), [ADR 0007](0007-ayvago-arcade.md)
  (Ayvago Arcade), [ADR 0010](0010-online-matches.md) (online matches)

## Context
Two repositories grew side by side:
- `selchook/ayvago-games` has the game runtime, 54 games, the skills and agents that make games, a
  smoke test, a two-player bench and a small portal page. Its scaffolding is easy to follow, but
  it has no accounts, leaderboards, themes, admin panel or categories.
- `selchook/ayvago` (this repo) is ayvago.com: accounts, score sessions, leaderboards, voting,
  themes, the admin panel, PWA and online rooms, on Firebase.

The owner asked which one should lead. Shipping online play showed the costs of the current
setup: two PRs per cross-cutting change, a hand-copied catalog file and a merge order that matters.

## Decision
- **ayvago-games is the studio.** It makes, tests and deploys games on its own origin. It never
  talks to Firebase; games speak the GHA protocol to the page around them. Its portal page is an
  internal tool at `/portal/` (`noindex`); its root redirects to ayvago.com.
- **ayvago is the platform** players see. Everything about players (identity, scores, votes,
  rooms, themes, moderation) lives here.
- **The catalog flows by itself.** The studio's CI fails when `platform/arcade-catalog.ts` on its
  `main` is stale. The platform's "Sync arcade catalog" workflow copies that file hourly or on
  demand and opens one PR, then starts CI on it. Games are deployed before their entry arrives, so
  the order is always right.
- **The protocol has one source.** `packages/platform-adapter` here is the original; the studio's
  CI fails when its vendored copy differs from `main` here.
- **Both repos are equally easy to work in.** The platform gets its own skill
  (`.claude/skills/ayvago-platform-slice`) and agents (`ayvago-platform-dev`, `ayvago-platform-qa`)
  next to the studio's `ayvago-new-game`, `ayvago-game-dev` and `ayvago-game-qa`.
- New visitors get the studio's look: **Arcade becomes the default theme** (slice 2.18).

## Alternatives
- **Build the platform features into ayvago-games.** It would duplicate months of tested work
  (sessions, rules, App Check, admin) and drop the iframe boundary that keeps game bugs away from
  player data.
- **One monorepo with `apps/games`.** Cross-cutting changes would be one PR. But every platform
  PR would build and smoke-test 54 games, the studio's simple layout would be buried in a
  workspace, and the third-party developer program (roadmap §11) expects games to come from
  outside the platform repo anyway. The automatic catalog flow covers most of the benefit.

## Consequences
- A protocol change still needs two PRs: the adapter here first, then the copy in the studio
  (its CI turns red until then, which is the reminder).
- Catalog PRs are opened by `github-actions[bot]`; the repository setting that allows Actions to
  open PRs must stay on.
