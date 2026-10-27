# ADR 0008 — Park the imported games until they meet the platform standards

- Status: Accepted (2026-10-27)
- Related: [ADR 0007](0007-ayvago-arcade.md), [Game import plan](../plan/game-import-plan.md), [Phase 2 plan](../plan/phase-2.md)

## Context
The catalog had ten imported games: six live single-player titles and four multiplayer titles shown
as "coming soon". Their quality varied: each was built separately, and they differ in controls,
mobile support, localization and the Ayvago intro. The 26 Ayvago Arcade games now cover every
category with one consistent standard. The owner decided to show only those for now. The
multiplayer games come back once they are made compatible.

## Decision
- **Parked list.** The ten imported games move from `SEED_GAMES` to `PARKED_GAMES` in
  `packages/shared/src/seed-catalog.ts`. Nothing reads that list, so the catalog pages, the
  sitemap, the score functions and voting no longer know them. Their game pages return 404.
- **No data deleted.** Leaderboards, votes, stats and players' library entries for those game ids
  stay in Firestore. A parked game comes back by moving its entry into `SEED_GAMES`. Its old
  leaderboard is then still there.
- **Hide empty sections.** The Multiplayer navigation link and sitemap entry are hidden while the
  catalog has no multiplayer game.
- **Arcade fills the gaps.** Ayvago Arcade games take over the home spotlight: Brick Breaker, Gem
  Match and Space Blaster are featured. The casual arcade titles are in the Casual category, so
  every category keeps games.

## Consequences
- **Library entries.** Players who favorited or recently played a parked game no longer see it in
  their library shelves. The entries are kept, and the tiles return with the game.
- **Their own URLs.** The parked games' own deployments are untouched and keep working standalone.
- **Bringing a game back.** A returning game must meet the same bar as the arcade games: SDK v2
  adapter, touch and keyboard, the Ayvago intro, TR and EN, and passing the harness.
