# ADR 0025 — A menu drawer on phones instead of the bottom tab bar

- Status: Accepted (2026-11-12)
- Supersedes: the phone bottom bar of the app shell (UI spec §2, "BottomNav")
- Related: [UI and themes spec](../specs/ui-and-themes.md#2-app-shell),
  [Phase 5 plan §5.26](../plan/phase-5.md#526-mobile-menu-drawer-)

## Context
On phones the side menu was hidden and a bottom tab bar showed four destinations: Home, New,
Recently played and Favorites. The categories were not reachable from the navigation at all on a
phone, only from the home shelves and the tags. The bar also took about 70 px of every screen,
and the content, the footer, the install banner, the ad consent notice and the invite toasts all
had to be kept above it.

The owner asked for a hamburger menu on phones with every category, as on desktop.

## Decision
- **Phones (below 640 px):** a menu button (☰) at the left of the top bar opens the side menu as
  a drawer from the left: a modal `<dialog>` over a dimmed backdrop. It holds exactly the
  desktop menu (Home, New, Recently played, Favorites, the categories, Multiplayer and "Install
  the app"), rendered by the same `NavMenu` component, so the menus cannot drift apart. The
  bottom tab bar is removed, together with the space every page reserved for it.
- **Tablets (640–1023 px):** the icon rail stays (now 72 px) and gets a toggle at its top that
  expands it to icons and text. The expanded rail pushes the content over instead of covering
  it, and the choice is remembered in `localStorage` (`ayvago-rail`), applied before the first
  paint by an inline head script.
- **Desktop (1024 px and wider):** unchanged.
- The breakpoints stay where the side menu already changed (640 and 1024 px), so the phone search
  icon, the footer stacking and the other phone rules keep one boundary.

## Consequences
- Reaching Home, New, Recent or Favorites on a phone takes two taps instead of one; every category
  is two taps away instead of a scroll through the home shelves. The logo still leads home in one
  tap, and the search icon stays in the top bar.
- Fixed elements at the bottom of the screen (install banner, ad consent notice, invite toasts)
  now sit 16 px above the bottom edge plus the safe area, as on larger screens.
- "Install the app" on phones lives in the drawer, like in the desktop menu; the extra link at
  the end of every page on phones is gone. The install banner still offers the app on the first
  visit.
- The top bar on phones has one more button, so the lockup is smaller (26 px tall) and shrinks
  further, down to 64 px wide, when the account menu or an invite bell needs the room.
- While the drawer is open the rest of the page, a running game's iframe included, is inert.
  Nothing listens for gestures or keys while it is closed, so it never takes input from a game.
