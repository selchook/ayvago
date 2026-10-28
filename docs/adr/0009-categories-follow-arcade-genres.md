# ADR 0009 — Catalog categories follow the Ayvago Arcade genres

- Status: Accepted (2026-10-27)
- Related: [ADR 0007](0007-ayvago-arcade.md), [ADR 0008](0008-park-imported-games.md), [Phase 2 plan](../plan/phase-2.md)

## Context
The catalog had four broad categories: `retro_action`, `casual`, `puzzle` and `board`. Each game
had exactly one. The Ayvago Arcade games (the whole catalog since ADR 0008) describe themselves
with a list of genres in `game.json`: arcade, action, casual, puzzle, retro, sports, strategy, card
and word. The games portal filters by those genres. The owner wants the platform's categories to
be the same.

## Decision
- **Categories are the arcade genres.** `GAME_CATEGORIES` is exactly that list, in the same order:
  `arcade, action, casual, puzzle, retro, sports, strategy, card, word`.
- **A game has more than one category.**
  - The manifest keeps `category`, the primary one, used for the icon, the breadcrumb and the
    cover chip.
  - It gains an optional `categories` list that must include the primary one.
  - `gameCategories(manifest)` returns all of them, primary first. Category pages and shelves
    list a game under each of them.
  - For arcade games, the generator maps `game.json` genres directly: the first genre is primary.
- **Empty categories are hidden.** They stay out of the navigation and the sitemap, so no link
  leads to an empty page. At launch that was `word`; Word Hunt filled it in slice 2.12.
- **Old category URLs redirect permanently.** `/c/retro-action` goes to `/c/arcade` and `/c/board`
  goes to `/c/strategy`.
- **Parked games are remapped** so their manifests stay valid: `retro_action` becomes `arcade` and
  `board` becomes `strategy`.

## Consequences
- **Overlapping shelves.** The categories overlap. Most arcade games are also retro or casual, so
  the same game can appear on several home shelves. This matches the games portal and is
  intended.
- **Manifests are still valid.** External `ayvago.json` files without `categories` keep working:
  they are listed under their primary category only. A category value from the old list fails
  validation and must be renamed.
- **No Firestore data changes.** Category is not stored in Firestore.
