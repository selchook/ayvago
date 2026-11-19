# ADR 0027 — Game guides as server-rendered page content

- Status: Accepted (2026-11-19)
- Related: [ADR 0002](0002-iframe-game-sdk.md) (the `ayvago.json` manifest),
  [ADR 0011](0011-studio-and-platform.md) (studio and platform, the catalog sync),
  [ADR 0023](0023-ads-behind-an-admin-switch.md) (ads),
  [UI and themes spec §3.3](../specs/ui-and-themes.md#33-game-page),
  [Phase 3 plan §3.5](../plan/phase-3.md#35-site-content-for-the-adsense-review--code)

## Context
Google AdSense turned ayvago.com down for "low value content": a site must offer original,
useful information of its own. The game itself runs in a cross-origin iframe, which crawlers do
not count as the page's content, so each game page carried only the manifest description (about
35 words), the input chips and the tags. With about 100 games in two locales, nearly every page of
the site was thin. Each live game also had an indexed leaderboard page whose table loads in the
browser, so crawlers saw it nearly empty.

Games need real written text: what the game is, how to play it, its controls, tips, features and
the questions players ask. The studio (`selchook/ayvago-games`) knows its games and writes that
text, in English and Turkish, as it writes the games.

## Decision

### A guide per game, written by the studio
A **game guide** is a structured text: `about` (2–3 paragraphs), `howToPlay` (3–8 steps),
`controls` (one or two sentences per input: keyboard, touch, mouse, gamepad), `tips` (3–8),
optional `features` (2–8) and an optional `faq` (2–6 questions). Every text is an `{ en, tr? }`
map like the manifest's, English required, with a length limit per field.

The schema lives in `packages/shared/src/guide.ts` and is **the contract between the repos**: the
studio vendors the same file verbatim and validates its guides with it. A change to the shape or
the limits is made in both repos together.

### One generated file, synced with the catalog
The studio generates `platform/arcade-guides.json` (`{ "version": 1, "guides": { "<slug>": … } }`)
on its `main`. The **Sync arcade catalog** workflow copies it into
`apps/web/content/arcade-guides.json` in the same run and the same PR as
`platform/arcade-catalog.ts`, so a game and its guide arrive together. While the studio has no
such file (a 404), the workflow keeps the platform's copy and does not fail. The file is
generated, so it is never edited by hand and Prettier skips it.

### Server only, in the web app
`apps/web/lib/catalog/guides.ts` imports the file, validates it with `parseGuideFile` once per
server process (an invalid file fails the build, not a page) and offers `getGameGuide(slug)` and
`localizeGuide(guide, locale)`. The game page renders a guide as plain HTML: h2 sections, an
ordered list of steps, a table of controls, lists of tips and features, and the FAQ as h3 + p, plus
`FAQPage` JSON-LD beside the `VideoGame` data. Without a guide the page is unchanged.

### Why not in the manifest or the seed catalog
- **Size.** A guide is 1–3 KB of text per locale. In `ayvago.json` or `arcade-catalog.ts` it would
  travel everywhere the catalog goes: `lib/catalog/index.ts` is imported by client components
  (search, spotlight, most played), so every guide would ship in the browser bundle.
- **The Cloud Functions bundle the seed catalog** (`finishSession` reads the scoring limits). They
  have no use for guides and should not grow with them, so the file stays out of
  `packages/shared`.
- **The manifest is the game's runtime contract** (entry, inputs, scoring, ads, assets). Long-form
  editorial text has its own life (it is reworded without a new game build) and its own review.

`lib/catalog/guides.ts` is therefore not re-exported from `lib/catalog/index.ts`, and a test fails
if a client component or that index imports it.

### Thin pages leave the index
In the same slice: leaderboard pages are `noindex, follow` and leave the sitemap; coming-soon
game pages (no game yet) are `noindex, follow`, leave the sitemap and show no banner. Category
pages get a hand-written intro, and the site gets About, Terms of use and Contact pages.

## Consequences
- Game pages carry several hundred words of their own text as soon as a game has a guide; pages
  without one keep today's short form until the studio writes it.
- The guide file grows with the catalog (roughly 200–300 KB for 100 games in two locales); it is
  read only on the server and by the build.
- The studio keeps its copy of `guide.ts` identical to this one, like the adapter (best checked
  by its CI).
- Guides do not reach games or the Functions; nothing changes in the protocol.
