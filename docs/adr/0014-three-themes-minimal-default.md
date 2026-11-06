# ADR 0014 — Three themes; Minimal in the system colours is the default

- Status: Accepted (2026-11-06)
- Supersedes: the default-theme choice of slice 2.18 (arcade for new visitors)
- Related: [UI and themes spec](../specs/ui-and-themes.md), [Phase 5 plan](../plan/phase-5.md)

## Context
The platform had four themes: minimal, retro, cartoon and arcade. Retro and arcade are both
dark-only pixel looks with scanlines, and the owner asked for Retro to go because Arcade already
covers that look. The owner also asked for new visitors to start in Minimal with the system's
colours instead of Arcade.

## Decision
- **Three themes:** `minimal`, `cartoon` and `arcade` (`THEME_IDS` in `packages/themes`).
- **Default:** `DEFAULT_THEME` is `minimal`, and the colour mode is "system" (light or dark from
  `prefers-color-scheme`) until the player picks one. A saved choice always wins.
- **Retired ids keep working.** `RETIRED_THEMES` maps `retro` to `arcade`:
  - the head script maps a `retro` cookie before first paint;
  - the account store reads a stored `retro` as `arcade` (`normalizeThemeId`);
  - the PWA manifest route does the same.
- **Firestore rules** accept only the three themes as a new choice. The theme is checked only when
  a write changes it, so a profile that still holds `retro` can update its other fields (the same
  pattern as retired characters in ADR 0013).
- Games still receive the theme id in `GHA_START`. Retro was never a game-facing contract: the
  studio's runtime hides its own scanlines under `arcade`, as it did under `retro`.

## Consequences
- Players who chose Retro see Arcade from now on, with no action on their side.
- Styles for `[data-theme='retro']` are gone. Rules that served both pixel themes now target
  Arcade only.
- The contrast test covers five theme and mode combinations instead of six.
