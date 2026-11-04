# Third-party assets and their licenses

Every font, image and sound the web app ships, with its source and license. Add a row in the
same change that brings in a new asset. Only licenses that allow bundling without per-page
attribution are used (SIL OFL 1.1, CC0). Game art belongs to the games and is registered in the
studio (`selchook/ayvago-games` `docs/assets/LICENSES.md`).

## Fonts

All fonts are self-hosted from the app bundle (no runtime requests to font CDNs) and imported in
`apps/web/app/[locale]/layout.tsx`. The theme font stacks are in `packages/themes/src/tokens.ts`.

| Asset | Used by | Source | Author | License |
|---|---|---|---|---|
| Inter (variable) | minimal theme | `@fontsource-variable/inter` | The Inter Project Authors | SIL OFL 1.1 (package `LICENSE`) |
| Press Start 2P | retro and arcade headings, arcade mono | `@fontsource/press-start-2p` | The Press Start 2P Project Authors | SIL OFL 1.1 (package `LICENSE`); "Press Start 2P" is a Reserved Font Name |
| **Ayvago Pixel TR** (`apps/web/fonts/ayvago-pixel-tr/ayvago-pixel-tr.woff`): one glyph, the Turkish capital İ (U+0130) | first in every Press Start 2P stack; its `@font-face` is limited to U+0130 | Modified Version of Press Start 2P, built by the studio (`selchook/ayvago-games` `tools/build-tr-font.py`) and copied verbatim | The Press Start 2P Project Authors; modified for Ayvago (2026) | SIL OFL 1.1 (`apps/web/fonts/ayvago-pixel-tr/OFL.txt`); renamed because "Press Start 2P" is a Reserved Font Name |
| VT323 | retro body text | `@fontsource/vt323` | The VT323 Project Authors | SIL OFL 1.1 (package `LICENSE`) |
| Pixelify Sans (400, 700) | arcade body text | `@fontsource/pixelify-sans` | The Pixelify Sans Project Authors | SIL OFL 1.1 (package `LICENSE`) |
| Fredoka (variable) | cartoon headings | `@fontsource-variable/fredoka` | The Fredoka Project Authors | SIL OFL 1.1 (package `LICENSE`) |
| Baloo 2 (variable) | cartoon body text | `@fontsource-variable/baloo-2` | The Baloo 2 Project Authors | SIL OFL 1.1 (package `LICENSE`) |

Why Ayvago Pixel TR exists: Press Start 2P squashes every accented capital to five pixel rows so the
accent fits inside the cap height. For Ö or Ğ that still reads well, but its İ ends up the same
shape as a lowercase i, so Turkish headings read "OYUN BiTTi". The replacement draws a full-height I
with its dot above, one empty pixel row apart. The dot reaches a quarter em above the cap height, so
text in this font needs a line height of at least 1.5 where its box clips (`overflow: hidden`). To
update it, rebuild it in the studio and copy the woff (and `OFL.txt`, if it changed) over.

## Images

| Asset | Source | Author | License |
|---|---|---|---|
| Character previews (`apps/web/public/characters/*.png`, 144×176) | Kenney Platformer Characters 1 | Kenney (kenney.nl) | CC0 1.0 |
| Ayvago logo and app icons (`apps/web/public/brand`, `apps/web/public/icons`, `apps/web/app/icon.svg`, `apps/web/app/apple-icon.png`) | Ayvago brand art | Ayvago | Ayvago's own; not third-party |
