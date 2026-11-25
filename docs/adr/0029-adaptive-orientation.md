# ADR 0029 — `orientation: 'any'` means an adaptive game: portrait on phones, landscape elsewhere

- Status: Accepted (2026-11-25)
- Related: [ADR 0002](0002-iframe-game-sdk.md) (the `ayvago.json` manifest),
  [ADR 0011](0011-studio-and-platform.md) (studio and platform),
  [ADR 0024](0024-game-card-art.md) (card art and screenshots),
  [UI and themes spec §3.3](../specs/ui-and-themes.md#33-game-page),
  [Phase 5 plan §5.34](../plan/phase-5.md#534-adaptive-games-portrait-on-phones-landscape-elsewhere--code)

## Context
The manifest's `orientation` has three values: `portrait`, `landscape` and `any`. Until now the
player treated `any` like `landscape` (a 16:9 stage), and no catalog game used it. The owner wants
games that open in landscape on desktops and tablets and in portrait on phones. The studio
(`selchook/ayvago-games`) is adding such "adaptive" games: one build that picks its shape when it
boots inside the iframe. The page around it must give the game a stage of the same shape, so both
sides need the same rule.

## Decision
- **`orientation: 'any'` means adaptive.** No new manifest value; `any` keeps its schema and
  becomes "follows the device" instead of "unspecified".
- **The phone rule (shared with the studio, identical on both sides):**

  ```js
  phone = matchMedia('(hover: none) and (pointer: coarse)').matches
    && Math.min(screen.width, screen.height) < 600
  ```

  On a phone an adaptive game runs portrait (720×1280); on desktops, laptops (touch screens with a
  mouse or trackpad included) and tablets (short side 600 px or more) it runs landscape
  (1280×720). The game decides once at boot and keeps that shape until it reloads. Changing the
  rule needs both repositories.
- **The player follows the same rule** (`apps/web/lib/orientation.ts`: `isPhone`,
  `stageOrientation`; `lib/use-is-phone.ts`). It is decided once after hydration and sets the
  stage's `data-orientation` to the resolved `portrait` or `landscape`, so the stage uses the
  existing portrait and landscape sizing. A media query alone cannot express the screen's short
  side, so this is client code; the server render and the first paint use the landscape stage
  and a phone switches right after hydration (before Play, the cover is all that is shown).
- **Fullscreen never locks an adaptive game's orientation:** it already runs in the shape that
  suits the device. Landscape games still lock (slice 5.8).
- **Adaptive games' art is landscape.** The studio captures the `screenshot` and the `card` of an
  adaptive game in landscape, so tiles (the Arcade theme's screenshot frame) and the player cover
  treat it as landscape art. On a phone's portrait stage the cover shows the whole card, logo
  included, on a blurred copy of itself instead of cropping it.

## Consequences
- Existing `portrait` and `landscape` games are unchanged on every device; the catalog had no
  `any` game. The parked imported games and the local bridge fixture, which declare `any`, now
  get a portrait stage on phones; the fixture page fits any frame.
- A phone held sideways still gets the portrait stage and game, as portrait games do; tablets and
  desktops never get a portrait stage for an adaptive game.
- On phones the stage changes shape once, right after hydration, before the player presses Play.

## Amendment: portrait card art (slice 5.35)
The owner asked that adaptive games show their cover art in portrait on phones too. An adaptive
game may now ship **portrait card art** next to its landscape card: `assets.cardPortrait`
(360×640 WebP, an in-game frame from a phone run with the small game logo) and
`assets.cardPortrait2x` (720×1280 WebP, only with `cardPortrait`), each one ref or a `{ en, tr? }`
map like `card`. On a phone (the rule above, resolved after hydration like the stage) the player
cover shows the portrait card in the player's language, filling the portrait stage; desktops and
tablets keep the 16:9 card and never load the portrait art. Without a portrait card the phone
keeps the fitted landscape card. The `screenshot` and `card` of adaptive games stay landscape;
tiles, the spotlight and the OG image do not use the portrait card. Fixed `portrait` and
`landscape` games ignore it.
