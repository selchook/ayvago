# Phase 5 — Retention

- Status: In progress (started 2026-10-29)
- Roadmap: [§12 Phases and timeline](roadmap.md#12-phases-and-timeline) · Specs:
  [Accounts and profiles](../specs/accounts.md), [Online two-player matches](../specs/multiplayer.md)
  · Owner steps: [Phase 5 setup](../setup/phase-5.md) · Decisions:
  [ADR 0013](../adr/0013-player-characters.md)

**Done when:** a returning player finds their progress, rewards and choices (character, cosmetics)
on every device and in every game that supports them.

Phase 3 (monetization) has still not started; the owner asked for player characters first.

Legend: ✅ done · 🚧 in progress · ⏳ owner action · ⬜ not started

## Slices

| # | Slice | Status |
|---|---|---|
| 5.1 | Player characters: ten free characters picked on the profile page, sent to games in `GHA_START` (protocol 2.2), solo and online | ✅ code |
| 5.1b | Five characters: the five aliens retired, `adventurer` the default; old stored ids read as "no choice" | ✅ code |
| 5.2 | Achievements, XP and levels, badges | ⬜ |
| 5.3 | Daily quests, login streaks | ⬜ |
| 5.4 | FCM web push (localized) | ⬜ |
| 5.5 | Cloud saves (`GHA.cloud`), coins and a cosmetic store | ⬜ |
| 5.6 | Equal card heights: game cards in every list and theme have the same height (owner request) | ✅ code |
| 5.7 | Turkish İ in the pixel font: "Ayvago Pixel TR" draws a full-height İ for Press Start 2P | ✅ code |
| 5.8 | Landscape games turn the phone sideways in fullscreen; portrait games unchanged (owner request) | ✅ code |
| 5.9 | Phones: the game toolbar (score, votes, favorite, share, sound, fullscreen) keeps to one line (owner request) | ✅ code |
| 5.10 | The game stage always fits on screen below the top bar (landscape phones cut off the bottom of the game) (owner request) | ✅ code |

## 5.1 Player characters ✅

> Slice 5.1b below cut the list to five characters. This section describes 5.1 as it shipped.

The owner asked for ten characters that players choose in their profile settings. Games that use
a character, like Jetpack Rush, swap their hero for the chosen one. Decided with the owner:
- all ten are free and unlocked;
- at first only games whose art matches use them (the studio handles the games).

Contract and reasons: [ADR 0013](../adr/0013-player-characters.md).

What shipped:
- **Character list** (`packages/shared/src/characters.ts`):
  - `CHARACTER_IDS`: `alien-green` (default), `alien-blue`, `alien-pink`, `alien-yellow`,
    `alien-beige`, `adventurer`, `explorer`, `rookie`, `soldier`, `zombie`;
  - `DEFAULT_CHARACTER`, the `isCharacterId` guard and `characterPreviewPath`.
  - The previews are Kenney CC0 PNGs (144×176) in `apps/web/public/characters/`.
- **Protocol 2.2** (adapter 2.2.0, shipped in the previous commit of this branch):
  - `GHA_START.config.character`: the player's choice, left out when there is none;
  - `peerCharacter`: the other player's choice in an online match;
  - the adapter's `multiplayer.peerCharacter`.
  - `apps/web/lib/gha/bridge.ts`: `buildStartConfig` takes `character` and the seat's
    `peerCharacter`. Unknown ids and empty values are left out.
- **Profile** (`apps/web/lib/account/store.ts`):
  - `characterId` on `users/{uid}`, read with the profile and saved with `updateProfile`. Clearing
    it removes the field.
  - `chosenCharacter()` gives the game player the choice once the profile is known. It waits at
    most 2.5 s, so a slow profile never holds a game back.
- **Profile settings UI** (`components/account/character-picker.tsx` and its CSS module): a
  **Character** section under the avatar.
  - The ten previews in a 5×2 grid. It is a native radio group: Tab enters the group, the arrow
    keys move the choice, and each radio is named by its character.
  - The current choice is marked with the accent border, a tint and a check mark, so it does not
    rely on color alone.
  - Each choice is saved at once, with a status line ("Saved. You play as Zombie now.") and an
    alert when saving fails. Without a choice the line says games use their own character.
  - Names scale with the cell, so the longest word stays on one line at 360 px.
  - Text in `en.json` and `tr.json` (`profile.character*`, `profile.characters.*`); the settings
    note now mentions the character.
- **Game player** (`components/game/game-player.tsx`):
  - Solo runs send the profile's character in `GHA_START`.
  - Online matches send the seat's character and the other seat's as `peerCharacter`.
  - The player counts as connected (moves and presence start to flow) only after `GHA_START` has
    gone out. A reload while the character is being read sends nothing to the old window.
- **Online rooms** (`lib/netcode/rooms.ts`, `components/game/room-view.tsx`):
  - The host's character is stored as `hostCharacter` when the room is created. The guest's is
    stored as `guestCharacter` with the seat claim.
  - A player who rejoins after choosing another character updates their own seat.
- **Rules:**
  - Firestore: `characterId` is one of the ten ids or absent. The owner may set or remove it,
    guests included; banned players and other users may not. It cannot be set at profile
    creation.
  - Realtime Database: `hostCharacter` and `guestCharacter` must be one of the ten ids. Only the
    seat's own player may set, change or remove it, and the guest character needs a guest seat.

Deviations from the spec:
- The accounts spec planned 48 theme-styled avatars with unlocks; characters are a separate,
  game-facing choice next to the avatar, and all ten are free for now
  ([ADR 0013](../adr/0013-player-characters.md)). Unlocks through XP or achievements can come with
  slice 5.2.

Tests:
- Unit tests:
  - shared `characters.test.ts` (3): the ids and their order, the guard, ids safe for rules and
    file names;
  - bridge (5 new): solo character, no character or unknown ids, both characters in a match, no
    unknown peer character, no peer character in solo runs.
- Emulator tests:
  - `firebase/tests/firestore.test.ts` (4 new): every id for guests and registered players,
    removal, unknown values / other players / banned players refused, no character at creation;
  - `firebase/tests/database.test.ts` (2 new): seat characters set by their own seat (create,
    claim, change, update), and refused for unknown ids, a guest character without a guest, the
    other seat's character (set or remove) and strangers.
- End to end on `next dev` against the emulators (Playwright):
  - The choice is saved and survives a reload in every theme.
  - Keyboard: Tab enters the group, the arrow keys move and save the choice, and the focus ring
    shows.
  - The bridge fixture game received `GHA_START` without `character` for a new guest and with
    `character: "soldier"` after the choice.
  - Connect Four pointed at the fixture game with `AYVAGO_DEV_ENTRY_OVERRIDES`, two players:
    - both chose: each game got its own `character` and the other's `peerCharacter`;
    - only the host chose: the guest's game got only `peerCharacter`, the host's only
      `character`.
- Screenshots checked:
  - themes: arcade, minimal light, minimal dark, retro, cartoon;
  - sizes: 390×844, 360×780 and 1366×900;
  - English and Turkish, with no choice and with a choice.

Still open:
- The games: the studio adds character support game by game, starting with Jetpack Rush
  (`selchook/ayvago-games`). Until a game supports it, the choice changes nothing there.
- A guest who signs in to an existing Google account keeps that account's character. The guest's
  choice is not merged, like the avatar.
- `web lint`: the repository has no lint script; `pnpm format:check` and `pnpm typecheck` cover the
  checks CI runs.

## 5.1b Five characters ✅

The owner decided to remove the five alien characters. The games now show each character's own
Kenney poses (kick, hang, cheer, ...) instead of drawing extra limbs on top, and only the human
figures of Kenney Platformer Characters 1 have those poses. The studio (`selchook/ayvago-games`)
has already dropped the aliens; a game that receives an unknown id falls back to `adventurer`.
Decision: [ADR 0013 amendment](../adr/0013-player-characters.md#amendment-2026-11-04-five-characters-slice-51b).

What shipped:
- **Character list** (`packages/shared/src/characters.ts`):
  - `CHARACTER_IDS`: `adventurer` (default), `explorer`, `rookie`, `soldier`, `zombie`;
  - `RETIRED_CHARACTER_IDS` keeps the five alien ids so they are never reused;
  - `readCharacterId(value)`: a listed id, or `null` ("not chosen") for anything else.
  - The alien previews are gone from `apps/web/public/characters/`.
- **Reading old data** (no migration; some profiles and rooms still hold an alien id):
  - The profile (`lib/account/store.ts`) and rooms (`lib/netcode/room-data.ts`, split out of
    `rooms.ts` so it can be unit-tested) read the stored id with `readCharacterId`. `GHA_START`
    already left out ids that are not listed (`buildStartConfig`).
  - The profile picker marks `adventurer` when nothing (or a retired id) is stored. The status
    line says so: "No character chosen yet: games use Adventurer, the default."
  - Picking a character overwrites the old value.
- **Rules:**
  - Firestore: `characterId` must be one of the five ids, but only when the write changes it.
    Before, the whole document was checked, so a profile holding an alien id could not have
    changed its language or theme, or been marked registered after a Google link.
  - Realtime Database: `hostCharacter` / `guestCharacter` must be one of the five ids when set or
    changed. An unchanged old value is accepted as it is, so a room created before the change can
    still be joined and closed.
- **Profile UI:** the five previews fill one row (the grid already had five columns), on phones and
  desktops, in every theme. The alien name keys are removed from `en.json` and `tr.json`, and
  `profile.characterNone` takes the default's name.
- **Adapter:** the doc comment's example id is now `"adventurer"`. This is a comment only, with no
  behaviour change; the studio copies the file verbatim.

Deviations: none.

Tests:
- Unit tests:
  - shared `characters.test.ts` (5, 2 new): the five ids with `adventurer` first, the guard,
    retired ids never accepted, `readCharacterId` for listed, retired and malformed values;
  - web `room-data.test.ts` (2 new): listed seat characters, and missing, unknown and alien ids
    read as `null`;
  - bridge: alien ids are among the unknown values left out of `GHA_START`.
- Emulator tests:
  - `firebase/tests/firestore.test.ts` (3 new):
    - a profile holding `alien-green` is updated to `explorer`; one holding `alien-pink` removes it;
    - a profile holding an alien id can still change locale and theme and link Google. This test
      fails against the old rule;
    - no alien id is accepted as a new value, nor a switch from one alien id to another.
  - `firebase/tests/database.test.ts` (1 new, 2 updated): a room whose host holds `alien-green`
    can be claimed and closed. The guest cannot replace the host's value, nobody can set an alien
    id, and the host can overwrite it with a listed id.
- End to end on `next dev` against the emulators (Playwright):
  - a signed-in profile seeded with `alien-green` shows five radios with `adventurer` checked
    (English and Turkish);
  - choosing Explorer stores `explorer` through the rules and survives a reload.
- Screenshots checked:
  - themes: arcade, minimal light, minimal dark, retro, cartoon;
  - sizes: 360×780 and 1366×900; English everywhere, Turkish in arcade and cartoon;
  - the default marked and a choice made. Measured at 360 and 390 px: no overflow, and no name
    is cut off.

Still open: nothing on the platform. Players who had picked an alien play as `adventurer` until
they pick again.

## 5.6 Equal card heights ✅

The owner reported that in the minimal and cartoon themes the game cards on a page were not all
the same height. The pixel themes (retro, arcade) already were.

What was wrong:
- The tag row wrapped. Cards with a multiplayer tag or three categories needed a second row of
  tags, so they were 24 px taller than their neighbours (measured: 211–235 px in one shelf on a
  desktop; 158–206 px in one phone grid).
- The card (`.tile`, a link inside each list item) took its content height, so it did not stretch
  to the height of its row.

What shipped (`components/catalog/catalog.module.css`, CSS only; every card list uses `GameTile`):
- The card is a flex column that fills its list item (`height: 100%`; every list that holds cards
  is a CSS grid, whose items stretch to the row).
- The cover keeps its fixed aspect ratio and never shrinks or grows (`min-height: 0`, so a tall
  portrait screenshot no longer stretches its 9:12 frame in the pixel themes).
- The title takes a fixed area: one line with an ellipsis on normal cards, and two lines on narrow
  cards (a `tile` container query, 230 px or less: phone grids and the phone spotlight). Long
  Turkish titles such as "Mağara Helikopteri" or "Zombi Hayatta Kalma" no longer get cut off on
  phones.
- The footer (tags and like share) is pinned to the bottom of the card and is always two tag rows
  high. A single row of tags sits on the bottom edge; a third row is cut off, and the multiplayer
  tag comes first so it is never the one cut. The like share sits at the end of the footer
  instead of wrapping after the tags, so it is never cut off.
- The pixel themes keep their look: their own title and tag rules still apply, and their tags stay
  at the top of the footer.

Pages covered: home (continue playing, spotlight, every shelf), new, category pages, multiplayer,
search, recently played, favorites and the related games on a game page.

Deviations: none.

Tests:
- Measured with Playwright on `next dev`, pointed at a local build of the studio for the art: the
  height of every card in every list on the eight pages above, in arcade, minimal light, minimal
  dark, retro and cartoon, at 360, 390 and 1366 px wide, in English and Turkish (240
  combinations). Every list has a single card height everywhere, with no horizontal overflow of a
  card or the page. The pixel themes kept their earlier heights.
- Same check with like shares shown on half of the cards (a temporary local change, not
  committed).
- Screenshots checked: the same pages, themes, sizes and languages.

Still open: nothing.

## 5.7 Turkish İ in the pixel font ✅

Press Start 2P draws every accented capital squashed to five pixel rows so the accent fits inside
the cap height. Its İ (U+0130) ends up the same shape as a lowercase i, so Turkish headings in the
retro and arcade themes read "AYVAGO'DA YENi". The studio built a one-glyph replacement,
"Ayvago Pixel TR" (`selchook/ayvago-games` `tools/build-tr-font.py`): a full-height I with its dot
above. It is a SIL OFL 1.1 Modified Version with its own family name, because "Press Start 2P" is
a Reserved Font Name.

What shipped:
- The font, copied verbatim from the studio: `apps/web/fonts/ayvago-pixel-tr/` (the woff, 1 KB,
  and its `OFL.txt`), with an `@font-face` (`ayvago-pixel-tr.css`, `unicode-range: U+0130`)
  imported in the root layout next to the other fonts.
- `packages/themes` `PIXEL_FONT`: `'Ayvago Pixel TR', 'Press Start 2P', …`, used for every stack
  that had Press Start 2P (retro `fontDisplay`, arcade `fontDisplay` and `fontMono`). The theme CSS
  is generated at runtime by `buildThemeCss()`, so there is no generated file to refresh. Games get
  the same stack in `GHA_START` tokens; a game without the face skips it.
- Because the face has no space character, Press Start 2P stays the first available font, so line
  metrics do not change.
- The dot reaches a quarter em above the cap height, which fits exactly in a line height of 1.5.
  Headings and tile titles in the pixel themes already use 1.5 or more; `h3` in the pixel themes
  now gets 1.5 too (it had the global 1.15).
- The font is listed in the new asset register, [docs/assets/LICENSES.md](../assets/LICENSES.md),
  with the other bundled fonts and images.

Deviations: none.

Tests:
- themes `themes.test.ts` (1 new): every stack that uses Press Start 2P is `PIXEL_FONT`, with
  Ayvago Pixel TR first. The contrast tests are unchanged and pass.
- Playwright on `next dev` (Turkish, arcade and retro): `document.fonts` reports Ayvago Pixel TR
  loaded. 3× zoomed screenshots of shelf headings ("AYVAGO'DA YENİ") and tile titles ("Uzaylı
  İstilası", "Ay İnişi", "İp Salıncağı") show a full-height I with its dot, not clipped in the
  tile titles' clamped boxes. Body text (Pixelify Sans, VT323) was already right and is unchanged.

Still open: nothing.

## 5.8 Landscape games go fullscreen in landscape ✅

The fullscreen button put a landscape game (1280×720, such as Tito's Tank, Archery and Head Soccer)
in fullscreen in whatever way the phone was held. Held upright, the game filled only a thin band in
the middle of the screen until the player turned the phone and the screen rotated. The owner asked for
landscape games to go fullscreen in landscape straight away, with portrait games left as they were.

What shipped:
- `apps/web/lib/orientation.ts`:
  - `locksInFullscreen(orientation)` is true for `landscape` games only;
  - `lockLandscape()` calls `screen.orientation.lock('landscape')` and reports whether the browser
    accepted;
  - `unlockOrientation()` releases the lock.
  - A refused or missing lock is not an error: the game stays in the device's own orientation.
- `GamePlayer`:
  - after `requestFullscreen()` succeeds, a landscape game (manifest `orientation: 'landscape'`)
    locks to landscape;
  - leaving fullscreen with the button, Esc or the system back gesture (the `fullscreenchange`
    event) unlocks;
  - portrait and `any` games never lock.

Where it works: the lock needs fullscreen and browser support. Chrome on Android, including the
installed app, rotates at once. iOS Safari has no element fullscreen on the iPhone (theater mode is
used there, as before) and no orientation lock, so iPhones are unchanged. Desktop browsers refuse the
lock, which changes nothing.

Deviations: none. This also fills in the spec's line on locking the orientation when the manifest
requires it (`docs/specs/ui-and-themes.md`), for the fullscreen case.

Tests:
- web `lib/orientation.test.ts` (5 new):
  - only landscape games lock;
  - the lock asks for landscape;
  - a refused lock and a missing API return false without throwing;
  - unlocking never throws.

Still open: a CSS rotation fallback for browsers that refuse the lock while the phone is held
upright (not done: rotating the stage would also rotate touch coordinates inside the game).

## 5.9 One-line game toolbar on phones ✅

On a phone the toolbar under the game wrapped to a second line. It holds the score, like and
dislike with the like percentage, favorite, share, sound and fullscreen. At 360 px the buttons left
the best-score text ("En iyi skorun: 128.450") too little room, so it took a line of its own (113 px
instead of 55). The owner asked for one line.

What shipped (`components/game/game-player.tsx`, `game.module.css`), below 420 px:
- The toolbar no longer wraps. Buttons are 38 px wide (34 px below 360 px) instead of 44, with
  tighter padding.
- The score shows its short form: the best score as a trophy and the number, and the last score as
  the number with a trophy when it is a new best. The full sentence stays in the page for screen
  readers.
- The like percentage is left out: it is information, and the buttons stay.
- Passing notes float above the toolbar instead of taking a line: the toast, the season-rank note
  and the vote prompt.
- If space still runs out, the score ends in an ellipsis rather than wrapping.
- Desktop and tablets (420 px and up) are unchanged.

Deviations: none.

Tests: Playwright on `next dev`, Turkish, with the toolbar filled as in production (like, %87,
dislike, favorite, share, sound, fullscreen):
- at 320, 360, 390 and 412 px the toolbar is one line (55 px) and nothing overflows;
- at 1280 px it is unchanged (63 px);
- a toast and a rank note float above the toolbar at 360 px.

Still open: nothing.

## 5.10 The game stage fits on screen ✅

On a phone held sideways, outside fullscreen, the bottom of a landscape game was off the screen.
For Tito's Tank that was the FIRE button, the angle and power readout and the hint. The stage starts
under the 60 px top bar and was capped at 80% of the screen height only. On an 844×390 phone it
ended at 399 px, and less is visible with the browser's own bars.

What shipped (`components/game/game.module.css`):
- The stage's height is now capped at the smaller of two values: 80% of the screen height, and the
  room below the top bar (`100dvh - var(--topbar-h) - 36px`).
- This applies to the landscape stage (`max-height`) and to the portrait stage (`height`).
- On larger screens and in fullscreen nothing changes.

The studio moved Tito's Tank's FIRE button in from the corner and its hint to the top. It also
enlarged the tank's HUD text for small frames (selchook/ayvago-games, Tito's Tank 1.0.1).

Deviations: none.

Tests: Playwright on `next dev` with the arcade games served locally (`AYVAGO_DEV_ARCADE_ORIGIN`):
- the stage measured 844×390: 87–381 px (was 87–399);
- 915×412: 87–405 px (was 87–417);
- 1280×650 and 1366×768: unchanged;
- screenshots show Tito's Tank whole at 844×390, 412×860 and 1366×768.

Still open: nothing.
