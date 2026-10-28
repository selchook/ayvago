# Spec — UI Components and Theme System

- Status: Draft (2026-10-18)
- Related: [Roadmap §3–4](../plan/roadmap.md), [ADR 0005](../adr/0005-internationalization.md), [Accounts](accounts.md), [Leaderboards](leaderboards.md), [Voting](voting.md)

## 1. Goals

- A catalog that feels instant: browse, hover, click, play.
- Distinct looks — **retro**, **cartoon**, **minimal** and **arcade** (the Ayvago Arcade look) — from one component library.
- Accessible (WCAG 2.2 AA), localized (en, tr) and mobile-first.

### Lessons taken from CrazyGames
CrazyGames uses a persistent **left navigation** (home, recently played, new, trending, categories), a top bar with **search** and account, a home page made of **horizontal shelves**, game tiles that **play a short video preview on hover**, a game page with the game in the center, rating and favorite controls under it and **related games** beside it, and a "new games" shelf that gives fresh releases exposure. Ayvago keeps this proven browsing model and differentiates through themes, leaderboards and a cleaner, ad-light player area.

## 2. App shell

| Region | Desktop (≥ 1024 px) | Tablet | Phone |
|---|---|---|---|
| **TopBar** | Logo (the Ayvago Games lockup from the boot intro), rotating slogans (≥ 900 px), search with suggestions, theme switch, language, coins (later), avatar menu | Same, without slogans | Logo, theme, language, avatar (search is in the BottomNav) |
| **SideNav** | Collapsible rail: Home, Recently played, New, Popular, Favorites, divider, the categories (the Ayvago Arcade genres: Arcade, Action, Casual, Puzzle, Retro, Sports, Strategy, Card, Word; empty ones hidden), Multiplayer (hidden while empty) | Icon-only rail | Hidden |
| **BottomNav** | — | — | Home, New, Recent, Favorites, Search |
| **Content** | Max width 1440 px, fluid grid | Fluid | Single column, shelves scroll horizontally |

The theme, language and account popovers close each other, and close on an outside click or tap and on Escape.

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
*Implementation (slice 2.10):* `/search?q=` filters the catalog as the player types. Matching ignores case and accents and folds the Turkish ı, so "yilan" finds "Yılan". A game matches on its titles in every locale, its slug and its category names. The top bar suggests up to six games and Enter opens the page. The page is `noindex`.

## 4. Components (`packages/ui`)

| Group | Components |
|---|---|
| **Primitives** | `Button`, `IconButton`, `Chip`, `Badge`, `Avatar` (+ frame), `Tooltip`, `Tabs`, `Dialog`, `Sheet` (mobile bottom sheet), `Menu`, `Switch`, `Toast`, `Skeleton`, `ProgressBar`, `Countdown`, `FormattedNumber`, `FormattedScore` |
| **Catalog** | `GameTile`, `Shelf` (horizontal scroll with snap, arrow buttons on desktop), `GameGrid`, `HeroCarousel`, `CategoryNav`, `SearchBox` |
| **Player** | `GamePlayer` (iframe host + SDK bridge), `PlayerToolbar`, `VoteButtons`, `FavoriteButton`, `ShareButton` |
| **Engagement** | `LeaderboardPanel`, `LeaderboardTable`, `EndOfRunPanel`, `VoteReasonSheet`, `SignUpPrompt`, `RewardedAdDialog` (countdown, "watch an ad to continue"), `SeasonCountdown` |
| **Shell** | `TopBar`, `SideNav`, `BottomNav`, `ThemeSwitcher`, `LocaleSwitcher`, `AccountMenu` |

### `GameTile` behavior
- 16:9 cover (AVIF/WebP with blur placeholder), title, up to three category tags (primary first), like percentage, badges (**New**, **Hot**, **Multiplayer**, **Updated**). The pixel themes (retro, arcade) show the manifest's in-game `screenshot` instead of the cover, in the games portal's card style. That includes the home spotlight, where the lead game keeps its cover as a portal card. All these cards have the same height: the image is always 9:12, with landscape screenshots fitted on a blurred copy of themselves, the title takes two lines and the tags take two rows.
- Desktop hover (after 300 ms) plays the muted `preview.mp4` from the manifest; stops on leave; disabled when `prefers-reduced-motion` or Save-Data is on.
- Fully keyboard accessible (focus shows the same state as hover, without autoplay).

### Implementation choices
- **React Server Components** for pages; client components only where interactive.
- **Radix UI primitives** for Dialog, Tabs, Tooltip, Menu, Switch (accessible behavior, unstyled), added when the first dialog/menu is built. The theme and language popovers use native `<details>`/`<summary>` and need no library.
- *Implementation note:* components live in `apps/web/components` for now and move to `packages/ui` when a second app (sdk-playground) needs them.
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
| **retro** | dark only | CRT palette (green/magenta/cyan on near-black), 0 radius, 2 px borders with hard pixel shadows, optional scanlines, pixel icons. Tiles are the games portal's cards, as in arcade |
| **cartoon** | light + dark | Saturated yellow/blue/pink, 20 px radius, 3 px dark outlines, springy hover, confetti on personal bests |
| **arcade** (labelled "Arcade") | dark only | The Ayvago Arcade look: brand ink, paper and red, yellow display headings, 0 radius, 3 px black outlines with hard drop shadows, red top-bar rule, scanlines. Tiles are the games portal's cards: the in-game screenshot (9:12, 16:12 for landscape) and cyan / yellow / pink category tags |

Selection is expressed as `<html data-theme="retro" data-mode="dark">`.

### 5.3 Typography (all with Latin Extended subsets for Turkish)

| Theme | Display | Body |
|---|---|---|
| minimal | Inter (600–800) | Inter |
| retro | Press Start 2P (headings only, small sizes) | VT323 or IBM Plex Mono |
| cartoon | Fredoka | Baloo 2 |
| arcade | Press Start 2P | Pixelify Sans |

Fonts load through `next/font` with `latin` + `latin-ext` subsets. A glyph test page (`/dev/glyphs`) renders `ç ğ ı İ ö ş ü Ç Ğ Ö Ş Ü` in every font; fonts that fail are replaced.

### 5.4 Theme effects
Optional layers that never change layout:
- Retro: scanline overlay (`::after`, can be turned off in settings), `image-rendering: pixelated` for pixel art, 8-bit UI sounds (off by default).
- Cartoon: spring hover on tiles, confetti on personal bests.
- Retro and arcade: the logo's word and mark are pixelated by an SVG filter (3 px blocks); top-bar slogans step in like a marquee.
- All effects are disabled under `prefers-reduced-motion`.

### 5.5 Persistence without flashing
- The choice is stored in a cookie (`ayvago-theme`, `ayvago-mode`) and, for signed-in users, in `users/{uid}.theme/mode`.
- Pages stay statically rendered: a tiny inline script in `<head>` (`themeBootstrapScript` in `packages/themes`) reads the cookies and sets `data-theme`/`data-mode` before first paint, so there is no flash of the wrong theme. When the mode is "system", no `data-mode` is set and the CSS follows `prefers-color-scheme`.
- *Implementation note:* reading the cookie on the server was the original plan, but it would make every page dynamic; the inline script keeps static generation and ISR.

### 5.6 Games and themes
- The legacy GHA variables (`--bg`, `--bg-card`, `--accent`, `--text`, `--text-dim`, `--border`, `--radius`, `--success`) are kept as aliases of the semantic tokens.
- `GHA_START.config` includes `{ theme, mode, tokens }` (a flat map of the semantic token values), and `GHA_THEME_CHANGE` sends updates. Games may apply them; the SDK's own overlays always do.

### 5.7 Accessibility checks
- An automated test computes contrast for every text/background token pair in every theme and mode and fails CI below WCAG AA (4.5:1 body, 3:1 large text and UI).
- Visible focus ring in every theme (`--focus-ring`), keyboard navigation for shelves (arrow keys) and the player toolbar.
- Touch targets ≥ 44 × 44 px.

## 5.8 Installable app (PWA)
- **Manifest and icons.** `app/manifest.ts` declares a standalone app with brand ink colors and
  the Ayvago mark: 192/512 icons and a maskable icon. `app/apple-icon.png` and `appleWebApp`
  metadata cover iOS.
- **Service worker.** `public/sw.js` handles page navigations only, network first, with an
  offline page, and is served with `no-store`. Nothing else is cached, and games (cross-origin
  iframes) are untouched.
- **Install banner.** `InstallPrompt` sits above the phone bottom bar.
  - Chromium shows our "Install" button, which opens the browser's own prompt.
  - iOS shows a Share → Add to Home Screen hint.
  - It shows on the first visit. An inline script keeps an early `beforeinstallprompt` for it.
  - It is hidden when the app is installed and on game pages.
  - "Not now" snoozes it for 7 days, then 14, then 30 for every later dismissal.
- **System bars.** `theme-color` and the manifest's `theme_color`/`background_color` follow the
  active theme's bar color: the page retargets its manifest link to
  `/manifest.webmanifest?theme=&mode=`. The installed app's status and navigation bars then match
  the top and bottom bars.
- **Install link.** "Install the app" sits at the bottom of the side menu, and at the end of
  every page on phones. It shows until the app is installed.
  - It opens the browser's prompt when there is one.
  - Otherwise it opens the banner with the iOS hint, or with manual steps for other browsers.
  - Edge on Android gets a hint: some launchers need its "Home screen shortcuts" permission
    before it can add the app, and Chrome installs in one tap.

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
- Every component renders correctly in all 6 theme/mode combinations and both locales in Storybook.
- The contrast test passes for all themes.
- Lighthouse on the home page meets the budgets above on a mid-range phone profile.
