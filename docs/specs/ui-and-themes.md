# Spec — UI Components and Theme System

- Status: Draft (2026-10-18)
- Related: [Roadmap §3–4](../plan/roadmap.md), [ADR 0005](../adr/0005-internationalization.md), [Accounts](accounts.md), [Leaderboards](leaderboards.md), [Voting](voting.md)

## 1. Goals

- A catalog that feels instant: browse, hover, click, play.
- Three distinct looks — **retro**, **cartoon**, **minimal** — from one component library.
- Accessible (WCAG 2.2 AA), localized (en, tr) and mobile-first.

### Lessons taken from CrazyGames
CrazyGames uses a persistent **left navigation** (home, recently played, new, trending, categories), a top bar with **search** and account, a home page made of **horizontal shelves**, game tiles that **play a short video preview on hover**, a game page with the game in the center, rating and favorite controls under it and **related games** beside it, and a "new games" shelf that gives fresh releases exposure. Ayvago keeps this proven browsing model and differentiates through themes, leaderboards and a cleaner, ad-light player area.

## 2. App shell

| Region | Desktop (≥ 1024 px) | Tablet | Phone |
|---|---|---|---|
| **TopBar** | Logo, search (⌘K / Ctrl+K), theme switch, language, coins (later), avatar menu | Same, search collapses to an icon | Logo, search icon, avatar |
| **SideNav** | Collapsible rail: Home, Recently played, New, Popular, Favorites, divider, Retro Action, Casual, Puzzle, Board, Multiplayer | Icon-only rail | Hidden |
| **BottomNav** | — | — | Home, Search, Recent, Favorites, Profile |
| **Content** | Max width 1440 px, fluid grid | Fluid | Single column, shelves scroll horizontally |

All navigation labels are message keys; layout uses logical CSS properties (`margin-inline`, `inset-inline`) so a future RTL locale only needs a review.

## 3. Pages

### 3.1 Home
1. **Hero** — rotating editor's picks (max 5), large cover + short preview video, "Play" button.
2. **Continue playing** — personal (hidden when empty).
3. **New** — games younger than 14 days.
4. **Popular this week** — by `trendScore`.
5. **One shelf per category** — by `qualityScore`.
6. **Top rated** and **Multiplayer** shelves.

### 3.2 Category / list pages
Grid of `GameTile`s with sort (Popular, New, Top rated) and tag filters; infinite scroll with a real "Load more" fallback; SEO-friendly paginated URLs.

### 3.3 Game page
```
┌──────────────────────────────────────────────┬───────────────────┐
│                GamePlayer (iframe)            │ LeaderboardPanel  │
│                                               │ (weekly / all)    │
├──────────────────────────────────────────────┤                   │
│ Title · 👍 92% · 👎 · ❤ · Share · Theater · ⛶ │ Related games     │
├──────────────────────────────────────────────┤ (6 tiles)         │
│ Description · Controls · Tags · Developer     │ Ad slot (desktop) │
└──────────────────────────────────────────────┴───────────────────┘
```
- **Theater mode** widens the player and hides the side column; **fullscreen** uses the Fullscreen API on the player container.
- On phones the page shows a cover with a big Play button; playing opens an immersive view with a floating exit/pause control (respecting safe-area insets) and locks orientation when the manifest requires it.
- Ads never overlay the iframe during gameplay.

### 3.4 Profile, Leaderboard, Settings, Search
Profile and settings per the [accounts spec](accounts.md); full leaderboard page per the [leaderboards spec](leaderboards.md); search page with instant results (title, tags; localized titles in both locales).

## 4. Components (`packages/ui`)

| Group | Components |
|---|---|
| **Primitives** | `Button`, `IconButton`, `Chip`, `Badge`, `Avatar` (+ frame), `Tooltip`, `Tabs`, `Dialog`, `Sheet` (mobile bottom sheet), `Menu`, `Switch`, `Toast`, `Skeleton`, `ProgressBar`, `Countdown`, `FormattedNumber`, `FormattedScore` |
| **Catalog** | `GameTile`, `Shelf` (horizontal scroll with snap, arrow buttons on desktop), `GameGrid`, `HeroCarousel`, `CategoryNav`, `SearchBox` |
| **Player** | `GamePlayer` (iframe host + SDK bridge), `PlayerToolbar`, `VoteButtons`, `FavoriteButton`, `ShareButton` |
| **Engagement** | `LeaderboardPanel`, `LeaderboardTable`, `EndOfRunPanel`, `VoteReasonSheet`, `SignUpPrompt`, `RewardedAdDialog` (countdown, "watch an ad to continue"), `SeasonCountdown` |
| **Shell** | `TopBar`, `SideNav`, `BottomNav`, `ThemeSwitcher`, `LocaleSwitcher`, `AccountMenu` |

### `GameTile` behavior
- 16:9 cover (AVIF/WebP with blur placeholder), title, like percentage, badges (**New**, **Hot**, **Multiplayer**, **Updated**).
- Desktop hover (after 300 ms) plays the muted `preview.mp4` from the manifest; stops on leave; disabled when `prefers-reduced-motion` or Save-Data is on.
- Fully keyboard accessible (focus shows the same state as hover, without autoplay).

### Implementation choices
- **React Server Components** for pages; client components only where interactive.
- **Radix UI primitives** for Dialog, Tabs, Tooltip, Menu, Switch (accessible behavior, unstyled).
- **CSS Modules + CSS custom properties** for styling; no theme-specific code inside components — components read semantic tokens only.
- **Storybook** in `packages/ui` with a toolbar to switch theme, mode and locale; visual checks of every component in all theme/mode combinations.

## 5. Theme system (`packages/themes`)

### 5.1 Token layers
1. **Primitive tokens** — raw palettes and scales per theme (`--retro-green-500`, `--cartoon-yellow-300`, …). Never used by components.
2. **Semantic tokens** — what components use:
   `--bg`, `--surface`, `--surface-raised`, `--text`, `--text-muted`, `--accent`, `--accent-contrast`, `--success`, `--warning`, `--danger`, `--border`, `--focus-ring`,
   `--radius-sm/md/lg`, `--shadow-sm/md/lg`, `--border-width`,
   `--font-display`, `--font-body`, `--font-mono`, `--motion-fast/base/slow`, `--easing`.
3. **Component tokens** — optional overrides for one component (`--tile-radius`, `--button-shadow`, `--tile-hover-transform`).

### 5.2 Themes and modes

| Theme | Modes | Personality |
|---|---|---|
| **minimal** (default) | light + dark (follows the system unless chosen) | Neutral surfaces, one accent, 8 px radius, hairline borders, quiet motion |
| **retro** | dark only | CRT palette (green/magenta/cyan on near-black), 0 radius, 2 px borders with hard pixel shadows, optional scanlines, pixel icons |
| **cartoon** | light + dark | Saturated yellow/blue/pink, 20 px radius, 3 px dark outlines, springy hover, confetti on personal bests |

Selection is expressed as `<html data-theme="retro" data-mode="dark">`.

### 5.3 Typography (all with Latin Extended subsets for Turkish)

| Theme | Display | Body |
|---|---|---|
| minimal | Inter (600–800) | Inter |
| retro | Press Start 2P (headings only, small sizes) | VT323 or IBM Plex Mono |
| cartoon | Fredoka | Baloo 2 |

Fonts load through `next/font` with `latin` + `latin-ext` subsets. A glyph test page (`/dev/glyphs`) renders `ç ğ ı İ ö ş ü Ç Ğ Ö Ş Ü` in every font; fonts that fail are replaced.

### 5.4 Theme effects
Optional layers that never change layout:
- Retro: scanline overlay (`::after`, can be turned off in settings), `image-rendering: pixelated` for pixel art, 8-bit UI sounds (off by default).
- Cartoon: spring hover on tiles, confetti on personal bests.
- All effects are disabled under `prefers-reduced-motion`.

### 5.5 Persistence without flashing
- The choice is stored in a cookie (`ayvago-theme`, `ayvago-mode`) and, for signed-in users, in `users/{uid}.theme/mode`.
- The server reads the cookie and renders the right `data-theme`/`data-mode`, so there is no flash of the wrong theme. When the mode is "system", a tiny inline script in `<head>` applies `prefers-color-scheme` before first paint.

### 5.6 Games and themes
- The legacy GHA variables (`--bg`, `--bg-card`, `--accent`, `--text`, `--text-dim`, `--border`, `--radius`, `--success`) are kept as aliases of the semantic tokens.
- `GHA_START.config` includes `{ theme, mode, tokens }` (a flat map of the semantic token values), and `GHA_THEME_CHANGE` sends updates. Games may apply them; the SDK's own overlays always do.

### 5.7 Accessibility checks
- An automated test computes contrast for every text/background token pair in every theme and mode and fails CI below WCAG AA (4.5:1 body, 3:1 large text and UI).
- Visible focus ring in every theme (`--focus-ring`), keyboard navigation for shelves (arrow keys) and the player toolbar.
- Touch targets ≥ 44 × 44 px.

## 6. Performance budgets

| Metric | Budget (mobile, 4G) |
|---|---|
| LCP on home and game pages | ≤ 2.5 s |
| CLS | ≤ 0.1 |
| INP | ≤ 200 ms |
| JS shipped on the home page | ≤ 150 KB gzipped (excluding the game iframe) |

Covers are served as responsive AVIF/WebP; preview videos load only on hover intent.

## 7. Acceptance criteria

- Switching theme or mode updates the whole UI and a running game's SDK overlays without reloading.
- A first visit with a saved theme cookie renders the right theme with no flash.
- Every component renders correctly in all 5 theme/mode combinations and both locales in Storybook.
- The contrast test passes for all themes.
- Lighthouse on the home page meets the budgets above on a mid-range phone profile.
