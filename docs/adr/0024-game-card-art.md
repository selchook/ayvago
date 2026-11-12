# ADR 0024 — Card art for catalog tiles

- Status: Accepted (2026-11-12)
- Related: [ADR 0002](0002-iframe-game-sdk.md) (the `ayvago.json` manifest),
  [ADR 0007](0007-ayvago-arcade.md) (studio covers and icons),
  [ADR 0011](0011-studio-and-platform.md) (studio and platform),
  [UI and themes spec](../specs/ui-and-themes.md#gametile-behavior),
  [Phase 5 plan §5.24](../plan/phase-5.md#524-game-card-art-)

## Context
Catalog tiles in the Minimal and Cartoon themes showed each game's 1920×1080 store cover. That
cover is a branded banner: the title, a paragraph of description and two small phone mock-ups. At
tile size (about 250 px wide) the text is unreadable and the game itself is tiny, so the tiles did
not make the games stand out. Each cover is about 200 KB, so a home page with about 40 tiles
pulled about 8 MB of images.

The owner chose a dedicated card image per game, made from in-game frames with no text block and
a small game logo in a corner. The studio (`selchook/ayvago-games`) generates the images. The
Arcade theme already shows the in-game `screenshot` in the games portal's card style and stays as
it is.

## Decision

### Two optional manifest asset refs
`ayvago.json` gets two new optional entries under `assets`, validated like the other asset refs (a
path on the game's origin or an https URL; plain http only for localhost):

| Field | What | Size and format |
|---|---|---|
| `assets.card` | Card art for catalog tiles | 640×360 WebP |
| `assets.card2x` | The same art for dense screens | 1280×720 WebP |

- Both are optional, so every existing manifest stays valid. The schema stays a strict object, so
  a platform without this change rejects manifests that use the fields.
- `card2x` is only used together with `card`. A manifest with `card2x` alone is valid, and the
  platform ignores the `card2x`.
- Studio games serve them at `/games/<slug>/ayvago/card-640x360.webp` and
  `/games/<slug>/ayvago/card-1280x720.webp`. The studio's `arcadeGame()` helper in the synced
  `arcade-catalog.ts` adds both refs.
- The change stays inside `packages/shared/src/manifest.ts`, the module the studio vendors
  verbatim (`scripts/vendor/manifest.ts`).

### Platform behaviour
- The catalog resolves `cardUrl` and `card2xUrl` like the cover, with the same own-assets rule:
  coming-soon games and games with generated covers get no URLs (`resolveGameArt` in
  `apps/web/lib/catalog`).
- Minimal and Cartoon tiles show the card full-bleed in the 16:9 media area with
  `srcset="card 640w, card2x 1280w"`, lazy and async. Without a card they show the cover, and
  without a cover the generated gradient placeholder, as before. The gradient stays underneath
  as the loading and failure background.
- Arcade tiles are unchanged: the screenshot, or the cover when a game has no screenshot.
- The home spotlight keeps the full cover. The player overlay on the game, room and table pages shows the card art in Minimal and Cartoon (follow-up), and Arcade keeps the cover there.

## Consequences
- **Merge order.** This change must reach `main` before the first "Sync arcade catalog" PR whose
  `arcade-catalog.ts` contains `card`. Without it the strict schema would reject every studio
  manifest, so that PR would fail CI (and the catalog would fail to load).
- **Studio CI.** The studio copies the new `manifest.ts` into `scripts/vendor/manifest.ts`.
- **Third-party games** may ship card art from the developer program on. Without it their tiles
  look as they do today. The developer docs (Phase 6) list the two fields and their sizes.
- **Weight.** A 640×360 WebP is a few tens of KB instead of about 200 KB per tile. Phones with
  dense screens get the 1280×720 copy.
