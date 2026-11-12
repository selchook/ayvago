# Phase 5 — Retention

- Status: In progress (started 2026-10-29)
- Roadmap: [§12 Phases and timeline](roadmap.md#12-phases-and-timeline) · Specs:
  [Accounts and profiles](../specs/accounts.md), [Online two-player matches](../specs/multiplayer.md),
  [Voting and ranking](../specs/voting.md), [UI and themes](../specs/ui-and-themes.md)
  · Owner steps: [Phase 5 setup](../setup/phase-5.md) · Decisions:
  [ADR 0013](../adr/0013-player-characters.md), [ADR 0014](../adr/0014-three-themes-minimal-default.md),
  [ADR 0015](../adr/0015-tables-for-four-with-bots.md), [ADR 0016](../adr/0016-achievements-and-xp.md),
  [ADR 0017](../adr/0017-server-best-and-fresh-start.md),
  [ADR 0018](../adr/0018-difficulty-easy-is-practice.md),
  [ADR 0019](../adr/0019-table-lobby-presence-invites.md),
  [ADR 0020](../adr/0020-quick-play-settings-host-handover.md),
  [ADR 0024](../adr/0024-game-card-art.md), [ADR 0025](../adr/0025-phone-menu-drawer.md)

**Done when:** a returning player finds their progress, rewards and choices (character, cosmetics)
on every device and in every game that supports them.

Phase 3 (monetization) waited while the owner asked for player characters first; it started on 2026-11-11 ([Phase 3 plan](phase-3.md)).

Legend: ✅ done · 🚧 in progress · ⏳ owner action · ⬜ not started

## Slices

| # | Slice | Status |
|---|---|---|
| 5.1 | Player characters: ten free characters picked on the profile page, sent to games in `GHA_START` (protocol 2.2), solo and online | ✅ code |
| 5.1b | Five characters: the five aliens retired, `adventurer` the default; old stored ids read as "no choice" | ✅ code |
| 5.2 | Achievements, XP and levels, badges: XP and 12 achievements awarded by `finishSession`, a level chip in the header, a Progress section on the profile, rewards shown after a run ([ADR 0016](../adr/0016-achievements-and-xp.md)) | ✅ code |
| 5.3 | Daily quests, login streaks | ⬜ |
| 5.4 | FCM web push (localized) | ⬜ |
| 5.5 | Cloud saves (`GHA.cloud`), coins and a cosmetic store | ⬜ |
| 5.6 | Equal card heights: game cards in every list and theme have the same height (owner request) | ✅ code |
| 5.7 | Turkish İ in the pixel font: "Ayvago Pixel TR" draws a full-height İ for Press Start 2P | ✅ code |
| 5.8 | Landscape games turn the phone sideways in fullscreen; portrait games unchanged (owner request) | ✅ code |
| 5.9 | Phones: the game toolbar (score, votes, favorite, share, sound, fullscreen) keeps to one line (owner request) | ✅ code |
| 5.10 | The game stage always fits on screen below the top bar (landscape phones cut off the bottom of the game) (owner request) | ✅ code |
| 5.11 | Three themes: Retro retired (Arcade covers it); new visitors get Minimal in the system's colours (owner request, [ADR 0014](../adr/0014-three-themes-minimal-default.md)) | ✅ code |
| 5.12 | Game tables for up to four players; the host fills empty seats with bots (protocol 2.3) — first game: Turkish Okey (owner request, [ADR 0015](../adr/0015-tables-for-four-with-bots.md)) | ✅ code |
| 5.13 | Fresh start: progress reset and server-synced bests. Games get the player's server best in `GHA_START` (protocol 2.4), the toolbar's personal best follows the server, and a "Reset progress" workflow clears all progress once (owner request, [ADR 0017](../adr/0017-server-best-and-fresh-start.md)) | ✅ code · ✅ reset run 2026-11-07 |
| 5.14 | One sound switch: muting in the game's own menu also mutes the toolbar's sound button and the other way round (protocol 2.5, owner request) | ✅ code |
| 5.15 | Difficulty: games report Easy or Normal in `GHA_END` (protocol 2.6); Easy runs are practice: play stats and reduced XP, never on a leaderboard (owner request, [ADR 0018](../adr/0018-difficulty-easy-is-practice.md)) | ✅ code |
| 5.16 | "Players and plays" report in the admin panel: registered and guest players, and which game each played how often, computed on demand by the admin-only `getPlayReport` function, with CSV downloads (owner request) | ✅ code |
| 5.17 | Home spotlight: a swipeable, self-advancing carousel of the three games trending today (`todayScore` from the hourly ranking job), filled up with this week's trend and the featured games (owner request) | ✅ code |
| 5.18 | A lobby for table games, Okey first: public tables to sit at, who is online, invites with a notification on every page (owner request, [ADR 0019](../adr/0019-table-lobby-presence-invites.md)) | ✅ code · ⏳ first trigger deploy |
| 5.19 | Quick play, table settings and host hand-over: one tap to a table that starts by itself, hands and turn time chosen when a table opens, another player takes over when the host leaves (protocol 2.7; owner request, [ADR 0020](../adr/0020-quick-play-settings-host-handover.md)) | ✅ code · ⏳ studio adapter 2.7 |
| 5.20 | "Leave table" button: a confirmed leave frees the seat at a waiting table, keeps it during a game (a bot plays it), closes a table its host leaves alone, and hands a host's table over at once (owner request) | ✅ code |
| 5.21 | Site-wide online status and "Recent players": presence on every page with a "Show me as online" switch, the people you played a table or room with on the lobby and the profile, invites to anyone online (owner request, [ADR 0021](../adr/0021-site-presence-recent-players.md)) | ✅ code · ⏳ deploy check |
| 5.22 | The "Players and plays" report counts started runs per player, online matches (tables and rooms, never ranked) and the play time of runs left without finishing (`abandonSession`, keepalive on tab close) (owner request, [ADR 0022](../adr/0022-started-abandoned-and-online-play.md)) | ✅ code |
| 5.23 | Site footer: a copyright line and the Privacy, Cookie preferences and Contact links at the end of every page; the side-menu and phone privacy links move into it (owner request) | ✅ code |
| 5.24 | Game card art: Minimal and Cartoon tiles show a dedicated 16:9 card image per game (optional `assets.card` / `card2x` in `ayvago.json`) instead of the store cover, with a play button on hover; Arcade unchanged (owner request, [ADR 0024](../adr/0024-game-card-art.md)) | ✅ code · ⏳ merge before the card sync |
| 5.25 | Sortable admin report tables: the "Players and plays" per-game and per-player tables and the admin Games table sort by a click on a column heading, remembered for the browser session; the CSV downloads follow the order shown (owner request) | ✅ code |
| 5.26 | Mobile menu drawer: phones get a ☰ button and a slide-in drawer with the full side menu (every category) instead of the bottom tab bar; tablets get a collapsible icon rail that remembers its state; desktop unchanged (owner request, [ADR 0025](../adr/0025-phone-menu-drawer.md)) | ✅ code |

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

## 5.2 Achievements, XP and levels ✅ code

Players earn XP and achievement badges for finished runs and climb levels. The rules and the
reasons are in [ADR 0016](../adr/0016-achievements-and-xp.md).

What shipped:
- **Rules** (`packages/shared`, pure and unit-tested):
  - `progress.ts`: `XP_RULES`, `xpForLevel`, `levelForXp`, `levelProgress`, the
    `ProgressSummary` shape, `readProgress`, `sessionXp`, `applyRun` (caps, counters, unlocks)
    and `mergeProgress` (guest merge).
  - `achievements.ts`: the 12 achievements (`first-run`, `runs-25/100/500`,
    `explorer-5/20/50`, `all-rounder`, `best-10`, `top-10`, `champion`, `marathon`), each with
    an icon key, a group, a target and a value; `meetsAchievement`, `achievementProgress`,
    `newlyUnlocked` and `catalogCategories` (the categories the catalog uses, for all-rounder).
- **Functions** (`firebase/functions/src`):
  - `progress.ts`: `awardProgress` runs inside the score transaction. `applyScore` in
    `leaderboards.ts` takes a hook, and its outcomes now carry the player's place in the cached
    top list before and after the score. The weekly top 10 and #1 are read from that list.
  - `finishSession` returns `progress: { xpGained, xp, level, levelUp, unlocked }` with a
    `recorded` result. The other fields are unchanged; flagged and rejected runs earn nothing.
  - `mergeGuestAccount` joins the guest's summary into the account's (`moveProgress`).
    `deleteMyData` and guest cleanup delete it.
  - `games.ts`: each live game knows its categories; `liveCategories()` lists the catalog's.
- **Data and rules:**
  - `users/{uid}/progress/summary` (functions-only; the owner and admins read it);
  - `xp` and `level` copied onto `users/{uid}` when the profile exists. They stay out of the
    profile's client-writable keys.
  - No new index.
- **Web:**
  - **Level chip** (`components/account/level-chip.tsx`): the level with a ring towards the next
    level, next to the avatar in the top bar. The trigger's label and tooltip give the XP to the
    next level, and the open menu shows "Level 5 · 320 XP to level 6". It is hidden below 360 px,
    where the top bar has no room; the open menu still shows the level.
  - **Progress section** on the profile page (`progress-section.tsx`): level, XP bar, six counters
    (games finished, different games, categories, records beaten, play time, achievements) and
    the 12 badges. Unlocked badges are in colour with their unlock date; locked ones are dimmed
    with their description and progress ("12/20"). The summary is read live
    (`lib/progress/summary.ts`).
  - **After a run** (`components/game/run-rewards.tsx`): "+35 XP", "Level 5!" and
    "Achievement unlocked: Explorer" appear one after another (1.8 s each) in one strip at the
    top edge of the stage. They take no clicks, so the game's result screen stays usable. The
    header chip updates from the response (`applyProgress` in the account store).
  - **Download my data** includes the progress summary.
  - Messages: `progress.*` and `achievements.<id>.name` / `.desc` in `en.json` and `tr.json`.
  - Badge icons are the app's SVG icons, not emoji, so they follow every theme. Motion is
    turned off under `prefers-reduced-motion`.

Deviations from the spec and the brief:
- **Personal best.** A best counts (+25 and `best-10`) only when the run beats an earlier
  all-time best of the game. A game's first score earns the first-play bonus instead, so
  `best-10` is not just "play 10 games".
- **Weekly top 10.** The +50 is for *entering*: not in the top 10 of the cached weekly list
  before the run, in it after. The `top-10` and `champion` achievements need only the place
  after the run, so a player already at #1 unlocks `champion` on their next run.
- **Run counters.** Every accepted session counts towards `runs`, `games`, `categories` and
  `playSeconds`, also those under 20 s; only the 10 run XP needs 20 s. Play time is the server's
  run length, capped at 3 hours like the play stats.
- **Response.** `progress` comes only with `recorded` results, because flagged and rejected
  runs earn nothing.
- **Merge.** A guest merge unlocks no new achievements by itself; the account's next accepted
  run does. Unlock times keep the earlier one; the daily caps keep the later day.
- The accounts spec's first XP sketch (§9: XP per minute, a `50 · n^1.5` curve) was replaced
  by ADR 0016.

Tests:
- shared `progress.test.ts` (21):
  - the level curve and the cap at 99;
  - session XP and each bonus;
  - the daily and per-game caps and the new-day reset;
  - level ups;
  - each achievement and its progress, never unlocked twice;
  - all-rounder from the catalog;
  - `readProgress` and `mergeProgress`;
- web `lib/progress/notes.test.ts` (5): the run notes, the response guard, and a name and
  description for every achievement in both languages;
- Firestore rules (4 new):
  - the owner and admins read the summary; other players and visitors cannot;
  - nobody writes it, its owner and admins included;
  - the owner cannot set, change or remove `xp` or `level` on the profile, while other settings
    still save;
- functions in the emulator (5 new):
  - progress is awarded with an accepted score and mirrored onto the profile;
  - the personal-best bonus, and no run XP under 20 s;
  - the weekly top 10 bonus, once;
  - nothing for flagged or rejected runs;
  - the guest merge sums the progress;
  - deleting the account deletes it.
  - The first `finishSession` test checks the whole response, with `progress`.
- Screenshots (Playwright against the emulators):
  - the Progress section, the header chip and the open menu, at 1280 px and 360 px, in minimal
    light and dark, cartoon and arcade, in English and Turkish;
  - the run notes on the fixture game.

Owner steps: none. The functions and rules deploy from GitHub Actions; see the setup doc.

Still open:
- game-defined achievements (`GHA.unlockAchievement`);
- levels or badges on leaderboard rows and public profiles;
- daily quests and login streaks (slice 5.3);
- cosmetics unlocked by levels;
- no backfill: progress starts at zero for runs played before this slice.

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

## 5.11 Three themes, Minimal by default ✅

The owner asked for two changes:
- remove the Retro theme, because the Arcade theme already gives the pixel look;
- start new visitors in the Minimal theme with the system's colours.

What shipped:
- **Themes** (`packages/themes`):
  - `THEME_IDS` is `minimal`, `cartoon`, `arcade`, and `DEFAULT_THEME` is `minimal`;
  - Minimal follows `prefers-color-scheme` until a mode is chosen (the "system" preference, as before);
  - the retro token set is removed.
- **Retired id:** `RETIRED_THEMES` maps `retro` to `arcade`, and `normalizeThemeId()` applies it in:
  - the head bootstrap script (cookies);
  - the account store (`users/{uid}.theme`);
  - the PWA manifest route.
- **Styles:**
  - `:is([data-theme='retro'], [data-theme='arcade'])` selectors became `[data-theme='arcade']`;
  - the Retro-only rules are removed: pixelated images, the green logo and slogan.
- **Messages:** `theme.retro` is removed from `en.json` and `tr.json`. The theme picker lists three
  themes. The **Retro category** of games is unchanged.
- **Firestore rules:** a new theme choice must be `minimal`, `cartoon` or `arcade`. The theme is
  checked only when a write changes it, so profiles that still hold `retro` keep saving their other
  fields.

Deviations: none.

Tests:
- themes: the contrast test (five combinations), `normalizeThemeId`, the default theme and mode,
  and the bootstrap mapping;
- web: the PWA bar colour for a retired and an unknown theme;
- Firestore emulator:
  - a stored `retro` still lets other fields update;
  - `retro` is refused as a new choice;
  - the three themes are accepted;
- the adapter and bridge tests use `arcade` as the sample theme.

Still open: nothing.

## 5.12 Game tables for up to four, with bots ✅ code

The owner asked for Turkish Okey with up to four players: one player and three bots, two and two,
three and one, or four players. The player who opens the table adds the bots.

What shipped ([ADR 0015](../adr/0015-tables-for-four-with-bots.md)):
- **Tables:**
  - `tables/{code}` in the Realtime Database, with 2–4 seats, each a player (`uid`, `name`,
    `character`) or a bot (`bot`, `name`), plus `status` and `online`;
  - pages `/{locale}/games/{slug}/table` (opens a table) and `/table/{code}` (the invite link);
  - on the game page, "Play at a table" replaces "Play with a friend" for games with
    `players.max > 2` (`isTableGame`).
- **Lobby** (`components/game/table-view.tsx`):
  - the invite link with copy and share;
  - one row per seat, showing the name, "you", the host, bot and away tags;
  - for the host, "Add a bot" on empty seats, "Remove the bot" or "Free the seat" on taken ones,
    and "Start the game" once every seat is taken; the others wait for the host.
- **Moves:**
  - `tableMoves/{code}` over the database (no WebRTC, no TURN);
  - a page listens only to moves written after it opened;
  - presence and leave or join reach the game per seat, with a 4-second grace period, as in rooms.
- **Protocol 2.3** (`packages/platform-adapter` 2.3.0, `lib/gha/bridge.ts`):
  - `GHA_START.config.seats`;
  - `GHA_MOVE_IN.from`;
  - `GHA_PEER_LEAVE.seat` and `GHA_PEER_JOIN.seat`;
  - the adapter's `multiplayer.seats`, and callbacks that receive the seat.
  Two-player rooms are unchanged.
- **Rules** (`firebase/database.rules.json`):
  - a player creates a table only in seat 0 under their own uid;
  - non-hosts take one free seat while the table is open, never a bot seat or a seat past `size`;
  - only the host writes bots, `status` and the rest of the table;
  - players mark only themselves online;
  - moves only from the sender's own seat, read only by seated players; only the host clears them.
- **Cleanup:** `cleanupRooms` deletes tables and their moves after two hours as well
  (`deleteOldTables`).
- **Messages:** a `table` namespace in `en.json` and `tr.json`.

Deviations from the multiplayer spec: tables are a second kind of room, not a matchmaker. Quick
match with strangers is still open.

Tests:
- adapter (19): table seats and the sender seat, and the two-player defaults;
- bridge: `GHA_START` seats for a table, with bots carrying no character;
- `table-data`: parsing, the seat helpers and bot numbers;
- RTDB emulator (7 new):
  - creating a table;
  - taking one free seat, and closed seats after the start;
  - the table size;
  - host-only bots, start and close;
  - presence and leaving a seat;
  - moves from one's own seat only, and who may read and clear them;
  - `deleteOldTables`;
- web build: the table routes are generated.

Owner steps: none. The rules and the functions deploy from GitHub Actions; see the setup doc.

Still open:
- the first table game (Turkish Okey) comes from the studio and reaches the catalog through the
  "Sync arcade catalog" PR;
- re-hosting when the host leaves for good.

## 5.13 Fresh start: progress reset and server-synced bests ✅ code

After the games moved to their new origin (`ayvago-games-nine.vercel.app`), every game showed
"YENİ REKOR!" (new best) even for scores below the player's real best. The games keep their best
in `localStorage` on their own origin, which starts empty on a new origin. The platform's toolbar
had the same weakness: its "Personal best!" compared with the browser library, not the server.

The owner decided:
- **(A)** reset every player's progress for a fresh start;
- **(B)** make the server the source of truth for bests, so this cannot recur.

Decision record: [ADR 0017](../adr/0017-server-best-and-fresh-start.md).

What shipped:
- **Protocol 2.4** (`packages/platform-adapter` 2.4.0):
  - `GHA_START.config.best?: number | null`. A number is the player's best for the game on the
    platform, as stored (the lowest for lower-is-better games). `null` means no recorded score
    yet. Absent means the platform does not know, so the game keeps its own value.
  - The adapter keeps `best` only as a finite number or `null` and drops anything else. Games read
    it from `config.best`, like the other start fields.
- **Bridge** (`lib/gha/bridge.ts`): `buildStartConfig` takes `best`. A number or `null` is
  passed on; `undefined` and non-finite numbers are left out.
- **Game player** (`components/game/game-player.tsx`, `lib/leaderboard/best.ts`,
  `lib/leaderboard/server-best.ts`):
  - Before `GHA_START`, solo runs read the player's all-time entry,
    `leaderboards/{gameId}/boards/all/entries/{uid}`, side by side with the character. The read
    waits at most 1.5 s.
  - The result: the entry's score; `null` when nobody is signed in once the auth state is known,
    or there is no entry; left out when Firebase is off, the read fails or it times out.
  - Online rounds leave `best` out, since they are not ranked.
  - The toolbar's best before a run is a live view of the same entry. The browser library is the
    fallback only while the account loads, when Firebase is off or when the read fails.
  - After a run, "Personal best!" comes from `finishSession`: `boards.all.improved` with a
    previous best. A first score, a rejected run and a flagged run are not personal bests. Runs
    not registered with the server (Firebase off, sign-in failed) keep the browser's answer.
- **`finishSession`** adds `previous` to each board of its `recorded` result: the player's best on
  that board before the run, `null` for a first score. The change is backward compatible; for
  servers without it the web app reads `previousRank !== null`, which means the same.
- **Browser reset** (`lib/library.ts`): `BEST_EPOCH = '2026-11-07'`. A browser with another stored
  epoch clears its best scores once (favorites and recently played stay), including the old
  per-game `ayvago:best:<slug>` keys, and stores the epoch.
- **Reset workflow** (`.github/workflows/reset-progress.yml`, "Reset progress", manual):
  - Inputs: `confirm` must be exactly `RESET ALL PROGRESS` (checked first, for dry runs too);
    `dry_run` defaults to true.
  - It authenticates like `deploy-functions.yml` (the secret goes to a temporary key file used by
    `GOOGLE_APPLICATION_CREDENTIALS`, removed on exit) and runs
    `firebase/functions/scripts/reset-progress.mjs` with `firebase-admin` from the functions
    package. The selection and delete logic is in `reset-progress-lib.mjs`.
  - The backup is written before anything is deleted (nothing is deleted when that fails) and is
    uploaded as an artifact kept for 90 days. It is one JSON file with Timestamps as ISO strings,
    holding:
    - every document under `leaderboards/**` (boards, entries, season archives);
    - `users/*/stats/*` and `users/*/progress/*`;
    - `xp` and `level` of `users/*`;
    - the `best` map of `users/*/library/state`;
    - `sessions/*`.
  - Then it deletes:
    - `leaderboards` with `recursiveDelete`;
    - the stats and progress documents, found with collection-group queries and limited to
      `users/{uid}/…`;
    - `xp` and `level` with `FieldValue.delete()`;
    - the library's `best` map, set to `{}`;
    - `sessions` with `recursiveDelete`.
  - It keeps the rest of each profile, favorites and recently played, votes, `games/*` counters,
    rankings, rooms and tables, usernames, roles and bans.
  - It logs the counts per category, also in the job summary, and exits non-zero on any error.

Deviations from the brief:
- **Source of the server best.** The brief preferred `users/{uid}/stats/{gameId}.bestScore`, but
  the stats document has no best (`plays`, `playSeconds`, `lastPlayedAt` only). The all-time
  leaderboard entry is the server's best already: only `finishSession` and the admin review write
  it, the guest merge moves it, and account deletion and bans remove it. It is public, so no new
  field, function write or rule was needed.
- **The account library's bests are reset too.** The library sync makes the account copy win on
  every page load, so without this the old bests would come back right after the browser epoch
  cleared them. Favorites and recently played stay.
- **The script lives in `firebase/functions/scripts/`**, next to `set-admin.mjs`, so it uses the
  functions package's `firebase-admin` and is never deployed. `@ayvago/firebase` gained
  `firebase-admin` (same version) as a dev dependency, so the emulator test can seed with it, and
  `allowJs` so the test can import the checked JavaScript module.

Tests:
- adapter (23, 4 new): `best` passed on as a number, `0` and `null`; left out when absent or
  malformed; standalone has no config;
- bridge (4 new): `best` as a number, `0`, `null`, left out when unknown or not finite, and in
  online matches;
- `best.test.ts` (9): the entry parser, `bestForStart` (stored best, `null` without a uid or an
  entry, unknown when Firebase is off, the read fails or it times out at 1.5 s) and
  `isPersonalBest`, with the fallback for older servers;
- `library.test.ts` (4): the epoch clears bests once, keeps favorites and recently played and the
  legacy keys go too; a later epoch resets again;
- Firestore emulator:
  - `finishSession` returns `previous` (`null` for a first score, the old best otherwise);
  - reset (4): a dry run changes nothing and its backup holds every category with ISO times; the
    real run removes exactly the listed data and keeps profiles, votes, favorites, counters,
    rankings, usernames and same-named collections outside `users/`; nothing is deleted when the
    backup fails; an empty database is fine;
- the reset command line against the emulator: usage and refusal without the exact phrase, a dry
  run and a real run with the job summary;
- in the browser (`next dev` on the emulators, the fixture game, Playwright):
  - the first `GHA_START` carries `best: null`;
  - a first score and a worse one show no personal best, and a better one shows "Personal best!"
    ("Kişisel rekor!");
  - after a reload the toolbar shows the server best and `GHA_START` carries it;
  - the toolbar was checked in minimal light and dark, cartoon and arcade, on desktop and on a
    phone.

Owner steps: grant the deploy account Firestore data access, merge, merge the studio's protocol
2.4 PR, then run the reset (dry run first). See the [setup doc](../setup/phase-5.md#513-fresh-start-progress-reset-and-server-synced-bests).

Still open:
- The studio adopts protocol 2.4: its `src/core/storage.ts` uses `config.best` when present (and
  `null` as "no best yet") instead of its own `localStorage` value.
- Pending score flags are not reset; reject or review them before the reset, or an approval
  afterwards puts a pre-reset score on the new boards.
- A tab left open during the reset can write its old library bests back to the account copy; they
  show only in the profile's list of bests.

## 5.14 One sound switch ✅

The owner reported that turning the sound off in a game's own menu left the toolbar's sound
button showing sound on, so the two buttons disagreed. Until now the game had two independent
switches (its own, kept in the browser, and the platform's), and the platform never learned
about the game's.

What shipped (protocol 2.5, adapter 2.5.0):
- **Adapter:** `reportMute(muted)` sends `GHA_MUTE_STATE { muted }` to the platform. Standalone
  it does nothing.
- **Bridge and player:** `GHA_MUTE_STATE` is parsed (booleans only) and sets the toolbar's sound
  button without sending anything back, so the two sides cannot loop.
- **Studio games** (selchook/ayvago-games): one switch. The toolbar's `GHA_MUTE` now sets the
  game's own switch (and its menu icon updates), and the game reports its switch after the
  handshake and on every change.

Tests: adapter (`reportMute` posts `GHA_MUTE_STATE` to the platform origin only) and bridge
(valid and malformed `GHA_MUTE_STATE`). Older games keep working: they never send the message.

Still open: the platform does not remember the sound choice between visits; the game's own
switch (kept in the game's browser storage) is what carries over.

## 5.15 Difficulty: easy runs are practice ✅ code

Studio games are getting an optional two-level difficulty, Easy and Normal, chosen on the game's
own menu. Normal is the default; online matches always play on Normal. Decided with the owner:
- leaderboards stay Normal-only;
- Easy runs are practice: recorded for play stats and XP, never on a leaderboard, and they earn
  reduced XP.

Decision record: [ADR 0018](../adr/0018-difficulty-easy-is-practice.md).

What shipped:
- **Protocol 2.6** (`packages/platform-adapter` 2.6.0, earlier commits of this branch):
  `GameResult.difficulty?: 'easy' | 'normal'`; `endGame` sends `difficulty` in `GHA_END` only
  when it is one of the two. Older games send nothing, which means Normal.
- **Bridge** (`lib/gha/bridge.ts`): the `end` message carries `difficulty`. `'easy'` gives
  `'easy'`; anything else, or nothing, gives `'normal'`. The `Difficulty` type is exported.
- **Game player** (`components/game/game-player.tsx`, `lib/leaderboard/session.ts`):
  - an Easy run calls `finishSession` with `practice: true` (`Run.finish(score, { continues,
    practice })`; normal runs send no `practice` field, so their request is unchanged);
  - the toolbar shows "Easy mode: not ranked" ("Kolay mod: sıralamaya girmez",
    `game.runPractice`) in the run-note area after an Easy run, in place of the rank note, from
    the moment the run ends and whatever the server answers;
  - an Easy run is never marked "Personal best!", and it is not written to the browser's local
    best (the fallback when the server cannot answer);
  - the XP, level and achievement notes and the header chip follow a practice run's `progress`
    like a ranked run's; leaderboard views are not refreshed, since no board changed.
- **`finishSession`** (`firebase/functions/src/sessions.ts`, `progress.ts`):
  - accepts an optional boolean `practice`. Missing or `null` means `false`; any other
    non-boolean is refused with `invalid-argument` (`practice`) before the session is touched.
  - A practice run goes through exactly the same checks as a ranked run. When accepted, it
    skips `applyScore` (no board, entry or archive) and awards progress with
    `awardPracticeProgress` in a transaction of its own. Play stats (`countFinish`) count it as
    before.
  - It returns `{ status: 'practice', progress }`. Rejected and flagged practice runs return
    the usual `rejected` and `flagged`.
  - The session document records `practice: true`.
- **XP rules** (`packages/shared/src/progress.ts`): `XP_RULES.practiceRun = 5`. `applyRun` takes
  `practice` in its run facts: 5 XP for a run of at least 20 s, no first-play, personal-best or
  weekly top 10 bonus; it counts towards runs, games, categories and play time but never
  towards bests, the weekly top 10 or #1 (board facts passed with a practice run are ignored);
  the same daily caps apply.
- **Server best** (`GHA_START.config.best`, protocol 2.4) is unchanged: it is the all-time board
  entry, so it is Normal-only, which matches what games should compare a Normal run with.
- **Fixture game** (`tools/fixture-game`): an "End on Easy" button sends `GHA_END` with
  `difficulty: 'easy'`, for local end-to-end checks.

Result shape: a new `practice` status rather than `recorded` with `boards: null`. A `recorded`
result keeps non-null boards, so nothing that reads `boards.all` can break, and only callers
that send `practice: true` ever receive the new status. The web app's `RunResult` mirrors it.

Deviations from the brief:
- **Flagged practice runs are not queued for review.** They return `flagged`, keep their flags
  on the session and earn nothing, like any flagged run, but write no `scoreFlags` document:
  approving one in `/admin` would put an Easy score on the boards.
- **The first play of a game on Easy uses up its first-play bonus.** The run counts towards
  games (as asked), so the game joins the played list and a later Normal run is not a first
  play.
- **The practice note replaces the rank, flag and too-short notes** for an Easy run, so the
  phone toolbar keeps one note.

Tests:
- `progress.test.ts` (4 new): 5 XP and no bonuses for practice (and 0 under 20 s); a first
  practice run counts runs, games, categories and play time and unlocks `first-run`; board facts
  passed with a practice run never count towards `best-10`, `top-10` or `champion`; the daily
  caps apply;
- bridge (1 new): `difficulty: 'easy'` is read, `'normal'`, missing and malformed values give
  `'normal'`; the existing `GHA_END` test expects `difficulty: 'normal'`;
- Firestore emulator (4 new): a practice run writes no board or entry, counts in the play stats
  and earns 5 XP (35 with `first-run`), then 5, then 0 under 20 s; it does not count as a
  personal best and leaves the ranked best and the next ranked comparison alone; a too-short one
  is rejected and a flagged one earns nothing and writes no `scoreFlags` document; malformed
  `practice` (`'yes'`, `1`, `0`, `{}`, `'true'`) is refused without closing the session, while
  `false` and `null` mean a normal run;
- in the browser (`next dev` on the emulators, the fixture game, Playwright): an Easy run shows
  "Easy mode: not ranked" / "Kolay mod: sıralamaya girmez", no personal best and +XP notes, and
  the leaderboard stays empty; a Normal run afterwards ranks as before. Checked in minimal light
  and dark, cartoon and arcade, on desktop and on a phone.

Owner steps: none beyond merging. See the [setup doc](../setup/phase-5.md#515-difficulty-easy-runs-are-practice).

Still open:
- The studio adopts adapter 2.6 and adds the Easy / Normal choice to its games' menus; until
  then every run is Normal.
- The profile shows no separate count of practice runs; sessions carry `practice: true` if one
  is wanted later.

## 5.16 Players and plays report ✅ code

The owner asked for a report they can open whenever they want: the players who have played so
far, registered and guest, and which game each of them played how many times. It lives in the
admin panel (`/{locale}/admin`, the `admin` claim), is computed when the admin presses a button,
and nothing runs on a schedule.

What shipped:
- **`getPlayReport`** (callable, admin claim; `firebase/functions/src/reports.ts`, 300 s timeout,
  512 MiB): read-only, no input. It reads with the Admin SDK and returns a `PlayReport`
  (`packages/shared/src/play-report.ts`):
  - `generatedAt`; `statsSince` = `STATS_SINCE` (`'2026-11-07'`, the day the slice 5.13 reset
    deleted every `users/*/stats/*`); `allTimeSince`, the earliest day in `games/*/daily`;
  - `summary` per player kind (google, registered, guest, unknown): profiles in total, players
    with at least one stats document, plays and play time;
  - `games`: per game, the all-time sums of `games/{gameId}/daily` (finished runs, starts, play
    time) and, since `statsSince`, plays, play time, plays and distinct players per kind;
  - `players`: at most 500 (most plays first; ties: the one who played last first), each with
    username, a five-character uid suffix (`tag`, to tell same-named guests apart), kind, plays,
    play time, last played and plays per game; `playerCount` and `truncated` count the rest.
    No uid, e-mail address or provider data leaves the function.
- **Player kinds** match the Progress report workflow (`firebase/functions/scripts/progress-report.mjs`):
  `isGuest` on the profile makes a guest; a non-guest profile whose Firebase Auth user lists
  `google.com` is "google", other non-guest profiles are "registered"; stats without a profile
  are "unknown".
- **Reads per run** (P players with stats, R non-guest profiles, S stats documents, D daily
  documents): one `count()` of guest profiles (1 read per 1000), R reads for the non-guest
  profiles (two fields), S for `collectionGroup('stats')`, up to P for the other players'
  profiles (`getAll`, 300 per call, two fields), D for `collectionGroup('daily')`, and R / 100
  Auth `getUsers` calls. A few hundred players cost a few thousand reads, well under a cent.
  Collection-group results outside `users/{uid}/stats` and `games/{gameId}/daily` are skipped.
- **Aggregation** is the pure `buildPlayReport` in `packages/shared`, so it is unit-tested
  without Firebase.
- **Admin panel** (`components/admin/play-report.tsx`): a **Players and plays** tab with
  **Run report** ("Running…" and a hint while it works, **Run again** afterwards with the time
  it was generated), a line that says per-player numbers start on the fresh start date while the
  all-time columns go back to the first recorded day, a note on the four kinds, then three
  tables: summary by kind (with a total row), per game (game titles from the catalog, also for
  games no longer live; "All time" and "Since …" column groups) and per player (a `<details>`
  list of "Game × plays" for players with more than one game). Per game and per player have
  **Download CSV** (`lib/admin/csv.ts`, built in the browser: UTF-8 with a byte order mark,
  RFC 4180 quoting, cells that start like a formula get a leading apostrophe; headers and kind
  names in the UI language; play time in seconds, last played in UTC ISO).
- Text in `en.json` and `tr.json` (`admin.tabs.report`, `admin.report.*`).

Deviations from the brief:
- **Profiles in total** come from a `count()` of guest profiles plus the list of non-guest
  profiles, instead of reading every profile: guests are the large group and only need a count.
  The `getAll` profile reads are kept for players with stats who are not among the non-guest
  profiles (guests and unknown players).
- **`statsSince` is a constant**, not the earliest `lastPlayedAt`: `lastPlayedAt` is the latest
  run per player and game, so the earliest of them is not where the stats begin. The reset wrote
  no marker document.
- **App Check** is not required, like the other admin callables (`requireAdmin`).

Tests:
- shared `play-report.test.ts` (6): range labels, the summary per kind, per-game all-time sums
  and recent plays and players per kind (a game with only old daily counters included), the
  player order, tags and no full uid in the output, the cap with `truncated`, malformed counts;
- web `lib/admin/play-report.test.ts` (4): CSV quoting and formula guard, hours and minutes,
  per-game and per-player CSV rows;
- Firestore and Auth emulator `firebase/tests/play-report.test.ts` (3): signed-out, guest and
  registered non-admin callers are refused (`signed-out`, `admin-only`); with a Google admin, a
  Google player and a guest who play real runs through `startSession` / `finishSession`, an
  e-mail/password player and a profile-less uid with seeded stats, an idle guest, daily
  counters and decoy `stats` / `daily` collections elsewhere, the summary, per-game and
  per-player numbers are exact and no uid or e-mail address is in the result; an empty project
  gives empty lists;
- in the browser (`next dev` on the emulators, 18 seeded profiles, Playwright): run, loading
  state, tables, expanded game list and both CSV downloads; checked in minimal light and dark,
  cartoon and arcade, English and Turkish, at 1366×900, Pixel 7 and 360×780. On phones the
  tables scroll sideways inside the card, like the panel's Games table.

Follow-up (the first production run failed with only the generic message):
- `getPlayReport` now logs the error and returns its reason in the `internal` error
  (`play-report: …`, with the original code in `details`); admins are the only callers, so the
  reason is safe to show. The panel shows the code and message under the failure text
  (`admin.report.failedDetail`), so the next failure can be fixed without opening the logs.

Owner steps: none beyond merging; the functions deploy publishes `getPlayReport`. See the
[setup doc](../setup/phase-5.md#516-players-and-plays-report).

Still open:
- Per-player numbers start at the fresh start (2026-11-07); runs before it survive only in the
  per-game all-time columns, without a split by player kind.
- The per-player table and its CSV stop at 500 players; past that the summary still counts
  everyone and the report says how many were left out.
- Guests inactive for 30 days are deleted with their stats by `cleanupGuests`, so they drop out
  of the per-player numbers (the per-game all-time columns keep their runs).

## 5.17 Spotlight carousel: trending today ✅ code

The owner asked for the home page's Spotlight ("Öne çıkanlar") to show the top three games
trending that day, as a carousel the player can swipe and that also moves on by itself. Until
now the spotlight was the editors' `featured` games: one large card and two side tiles.

What shipped:
- **`todayScore`** (`packages/shared/src/ranking.ts`, [voting spec §4.3](../specs/voting.md#43-combined-scores)):
  finished runs in roughly the last 24 hours, lightly weighted by votes.
  - The daily counters (`games/{gameId}/daily/{YYYY-MM-DD}`) are per UTC day, so the window is
    today's runs plus the share of yesterday's still inside it, assuming yesterday's runs were
    spread evenly: `plays = today.finished + yesterday.finished × (1 − hoursElapsedTodayUTC / 24)`.
  - Vote weight: `0.5 + 0.5 × (likes + 1) / (likes + dislikes + 2)` (the like ratio with one
    like and one dislike of prior): 0.75 without votes, between 0.5 and 1 otherwise. A disliked
    game needs clearly more plays to lead, but plays decide.
  - `todayScore = plays × voteWeight`; 0 without runs in the window. Missing or malformed
    counters count as 0.
- **`recomputeRankings`** (hourly, `firebase/functions/src/rankings.ts`) computes it from the
  daily documents it already reads and writes it to `rankings/catalog`
  (`games.{gameId}.todayScore`) and to `games/{gameId}`. Being hourly, the spotlight follows the
  day; the web reads the rankings document with ISR (revalidate 3600 s), so a change shows
  within about two hours at most.
- **Web:** `parseRankings` and `CatalogRankings` read `todayScore`; documents written before
  this slice parse with 0. `rankGames` accepts `todayScore` too.
- **Picking the three games** (`apps/web/lib/catalog/spotlight.ts`, `pickSpotlight`): live games
  by `todayScore` (> 0), best first; then live games by the weekly `trendScore` (> 0); then the
  featured games; then the catalog in order. Ties keep catalog order, a game never appears twice
  and only live games are picked. Without rankings (local builds, previews, a failed read) it
  starts at the featured games, which is what the spotlight showed before.
- **Carousel** (`components/catalog/spotlight-carousel.tsx` + CSS module; the home page stays a
  server component that passes plain data):
  - One full-width slide per game in the style of the old lead card: hero cover, title,
    description (three lines, four on wide screens), category tags and a badge: "#1 Trending
    today" / "#1 Bugün trend" for today's games, "Popular this week" / "Bu hafta popüler" for the
    weekly fill, "Featured" / "Öne çıkan" for the featured and catalog fill. The whole slide links
    to the game. When the carousel is 720 px or wider the cover and the text sit side by side
    with a "Play" button; on phones they are stacked.
  - A native horizontal scroll track with `scroll-snap-type: x mandatory` (and
    `scroll-snap-stop: always`), so touch swipes, trackpads and shift+wheel move it one slide at a
    time. Prev / next buttons over the edges (hidden below 640 px) and dot buttons that show and
    set the current slide; the current slide follows the scroll position.
  - **Auto-advance** every 5 s, looping back to the first, with smooth scrolling. It pauses
    while a mouse pointer is over it, while it has keyboard focus (`:focus-visible`, so a mouse
    click on a dot is only a hold), for 8 s after the last touch, swipe, wheel or click on it,
    and while the tab is hidden. With `prefers-reduced-motion: reduce` it never advances and
    jumps without smooth scrolling.
  - Accessibility: `role="region"` with `aria-roledescription` "carousel" / "atlıkarınca",
    labelled by the "Spotlight" heading; slides are `role="group"` with
    `aria-roledescription` "slide" / "slayt" and "1 / 3" labels; dots are buttons with
    "Show 1 of 3: Jetpack Rush" labels and `aria-current`; ←, →, Home and End on the focused
    carousel change slides (a focused slide hands focus to the new slide); the track is
    `aria-live="off"` while it advances by itself and `polite` otherwise; no focus traps.
  - Every slide has the height of the tallest, so nothing moves while it slides; measured CLS
    is 0 on a 360 px phone.
  - Themes: semantic tokens; the arcade theme keeps the portal-card look of the old spotlight
    (thick ink border, hard shadow, lift on hover; the track leaves room so the lift and shadow
    are not clipped).
- Text in `en.json` and `tr.json`: `home.spotlightToday`, `home.spotlightWeek`,
  `home.spotlightFeatured` and the `carousel.*` labels. A `PauseIcon` joined `components/icons.tsx`.

Deviations from the brief:
- **A stop / start button** sits at the end of the dot row (WCAG 2.2.2: content that moves by
  itself for more than 5 s needs a way to stop it, and hover pausing does not help on phones).
  It is hidden under reduced motion, where nothing moves.
- **Only live games are picked**, also from the featured list and the catalog fill: a
  coming-soon game cannot be played from the spotlight. Every catalog game is live today.
- **The weekly fill has its own badge** ("Popular this week", without a number) rather than the
  neutral one, so "#2" never sits on a game that is not second today.
- The two side tiles of the old spotlight are gone: the carousel's three slides replace them.

Tests:
- shared `ranking.test.ts` (4 new): the 24-hour window at 00:00, 06:00, 18:00 and just before
  midnight UTC; 0 without runs whatever the votes; the vote weight orders liked, unvoted and
  disliked games but twice the plays still win; malformed counters;
- web `lib/catalog/spotlight.test.ts` (7): today's order, ties in catalog order, the weekly,
  featured and catalog fills, no duplicates, zero scores, unknown ids and coming-soon games
  ignored, missing rankings, small catalogs; `catalog.test.ts` (1 new): `parseRankings` with and
  without `todayScore` (double and integer values, old documents, no document);
- Firestore emulator `votes.test.ts` (1 new, 1 extended): a real run gives a positive
  `todayScore`; seeded daily counters at 06:00 UTC give exactly
  `(10 + 40 × 0.75) × (0.5 + 0.5 × 3/4)` in `rankings/catalog` and on the game document, older
  days do not count, and a day later only yesterday's share is left;
- in the browser (`next dev` on the Firestore emulator with a seeded `rankings/catalog`, local
  covers, Playwright): minimal light and dark, cartoon and arcade, English and Turkish, at
  1366×900, 390×844 and 360×780; auto-advance moves to the next slide after 5 s and loops,
  hover, keyboard focus, the stop button and a hidden tab hold it, a click or a touch swipe
  holds it for 8 s, a swipe or a `scrollLeft` change updates the dots, arrows, dots and keys
  move it, and under reduced motion nothing moves and buttons jump; the weekly and featured
  badges and the no-rankings fallback checked too. No console errors, no horizontal overflow.

Owner steps: none beyond merging; the functions deploy publishes the new `recomputeRankings`.
See the [setup doc](../setup/phase-5.md#517-spotlight-carousel-trending-today).

Still open:
- Until the first hourly run after the deploy, `rankings/catalog` has no `todayScore`, so the
  spotlight shows this week's trend and the featured games.
- The daily counters are UTC days, so "today" is an estimate of the last 24 hours, not the
  player's calendar day.
- The spec's preview videos and the "Hot" badge are still not built.

## 5.18 A lobby for table games (Okey first) ✅ code

The owner asked for a lobby for Okey ("critical update"):
- in the lobby a player can invite the players who are online to the game;
- the invited player gets a notification;
- a player browsing the lobby can sit at any table.

Design and reasons: [ADR 0019](../adr/0019-table-lobby-presence-invites.md); behaviour:
[multiplayer spec §7b](../specs/multiplayer.md#7b-the-lobby-of-a-table-game).

What shipped:
- **Lobby page** `/{locale}/games/{slug}/lobby` for every live table game (`players.max > 2`,
  generated for Okey), `noindex`:
  - `components/lobby/lobby-page.tsx`, `lobby-view.tsx`, `online-players.tsx`,
    `player-face.tsx` and `lobby.module.css`;
  - the game page's table card now leads to the lobby ("Go to the lobby") and keeps
    "Open a private table";
  - the table page has a "Lobby" link.
- **Public tables:**
  - `tables/{code}/visibility` (`public` | `private`, missing = private);
  - tables opened from the lobby are public, "Open a private table" stays private;
  - the host switches it on the table page ("Show this table in the lobby").
- **Table list:**
  - a new Realtime Database trigger, **`syncLobbyTable`** (`firebase/functions/src/lobby.ts`),
    keeps `lobby/{gameId}/tables/{code}`: a uid-free summary of every public open or playing
    table, built from the table as it is now and written only when what the lobby shows changes;
  - the lobby lists open tables with free seats first (the fullest first), then full ones, then
    tables in play;
  - it hides tables older than two hours and tables nobody has open, except the player's own;
  - **Sit down** goes through the existing join path.
- **Presence:**
  - `presence/lobbies/{gameId}/{uid}`, written by the lobby page (`lobby`) and the table page
    (`table`, then `playing`), removed on disconnect (`lib/lobby/lobby.ts`, `use-presence.ts`);
  - the online list shows character or initial avatar, name, level and state, this player first
    marked "you".
- **Invites:**
  - `invites/{toUid}/{fromUid}` with the sender's quota tick in `inviteQuota/{uid}` (five a
    minute), sent in one multi-path write;
  - the sender follows the answer (`lib/lobby/outgoing.ts`): sending, invited, joining, declined,
    no answer after two minutes;
  - inviting without an open table opens a public one and goes there;
  - the table page lists the online players too while the table waits.
- **Notification** (`components/lobby/invite-center.tsx` in the top bar, on every page):
  - a bell with the number of open invites, and toasts with Join, Decline, close and the seconds
    left;
  - outside a game round the toast is an alert dialog with a soft Web Audio chime and focus on
    Join (Escape closes it into the bell and returns focus);
  - during a round or while typing it is a compact silent dialog, announced politely;
  - in a fullscreen game it shows inside the fullscreen element;
  - it listens only for 12 hours after the player was last in a lobby or at a table.
- **Do not disturb:**
  - profile settings → **Table invites** (`users/{uid}.invitesOff`, Firestore rules updated);
  - mirrored as `dnd` into presence, where the rules refuse invites.
- **Cleanup:** `cleanupRooms` also removes lobby entries of old tables, invites older than 20
  minutes and old quotas (`deleteStaleLobbyData`; `deleteOldTables` removes the table's lobby
  entry).
- **Messages:** new `lobby` and `invites` namespaces, plus keys in `table` and `profile`, in
  `en.json` and `tr.json`. `BellIcon` and `BotIcon` joined `components/icons.tsx`.
- **Shared code:** `packages/shared/src/lobby.ts`:
  - the summary builder used by the trigger;
  - readers for lobby entries, presence and invites;
  - the invite quota step and the constants.

Decisions and deviations from the brief:
- **Invite id.** The invite's key is the sender's uid (`invites/{toUid}/{fromUid}`), not a
  random id: it makes "one pending invite per pair" a rule, not a client promise.
- **Who can be invited.** Only players present in the game's lobby or at one of its tables; the
  rules check their presence. Site-wide presence is left for later.
- **During a game round** the invite shows as a compact, silent toast that does not take the focus
  (not hidden): the invite expires in two minutes.
- **Local development.** The Functions emulator fires database triggers only in `us-central1`.
  - `syncLobbyTable` moves there only inside the emulator, and only with
    `AYVAGO_EMULATOR_DB_TRIGGERS=1` in `firebase/functions/.env.local` (git-ignored, read only by
    the emulator). Without it the local lobby list stays empty.
  - Deploys always use europe-west1.
  - The default test run leaves the trigger off. Its burst of table writes made the emulator fail
    to start function workers ("Failed to load function"), which would make the deploy workflows
    flaky.

Tests:
- shared `lobby.test.ts` (10): the summary has no uids and leaves out private, closed, old-style
  and malformed tables; seats as an object or an array; presence and invite readers; invite
  expiry; the quota counts five a window and starts a new one after a minute;
- web `lib/lobby/lobby-data.test.ts` (7): seat counts and "can sit"; table order and the hidden
  old, abandoned and own tables; player order; minutes; the sender's invite status and when a
  new invite is allowed. `table-data.test.ts` (2 new): visibility (missing = private) and the
  seated uids;
- RTDB emulator `firebase/tests/lobby.test.ts` (20; 19 in the default run):
  - visibility for the host only;
  - the lobby list readable, never writable by clients;
  - presence own-entry only, field validation and reading;
  - invites: sending to a lobby player from one's own open table; refused without the quota
    tick, as someone else, to oneself, to players outside the lobby, with `dnd` or already
    seated, to started, missing or other games' tables, with bad fields or an answer;
  - one pending invite per pair until it is answered or expires;
  - reading, answering once and deleting;
  - the quota: five a minute, no early reset, no skipped counts, no deletion, a new window after
    a minute, owner-only;
  - `syncLobbyTable` called directly (set, follow, unchanged, removed, private, out-of-order
    events);
  - the real trigger in the Functions emulator: opt-in (the `.env.local` line and the same
    variable for the test run, `lobby.test.ts` alone). It passes, with 17 passed and the 3 direct
    tests skipped, because they would race the live trigger;
  - `deleteOldTables` with the lobby entry, and `deleteStaleLobbyData`;
- Firestore emulator (1 new): `invitesOff` is a boolean the owner sets;
- message test: `en` and `tr` have the same keys;
- full run: shared 93, web 117, themes 16, adapter 25, firebase 152 passed and 1 skipped (the
  opt-in trigger test);
- in the browser (`next start` built with `NEXT_PUBLIC_FIREBASE_EMULATORS=1` on the emulators,
  with the real trigger opted in, seeded tables and presence, Playwright):
  - player A (desktop) invites player B (phone): A's public table opens and A moves there;
  - B gets the alert-dialog toast with focus on Join, joins, and sits at A's table;
  - player C (desktop, Turkish, arcade) sits at A's free seat from the lobby list;
  - player D gets an invite, closes the toast with Escape, declines from the bell, and A sees
    "Declined";
  - with a game round on screen, the toast is a quiet dialog that keeps the focus where it was,
    the live region announces it, and Join still works;
  - screenshots: lobby in minimal light and dark, cartoon and arcade, English and Turkish, on a
    1366×900 desktop and a Pixel 7. No horizontal overflow, and no console errors besides blocked
    external cover images.

Owner steps: the first deploy of an event-triggered function may need three IAM bindings,
granted once. See the [setup doc](../setup/phase-5.md#518-a-lobby-for-table-games-okey-first).

Still open:
- The lobby is per game and the notifier listens only after a lobby visit; site-wide presence,
  friends and web push are in ADR 0019 "Next".
- A player with two tabs on the same game shares one presence entry.

## 5.19 Quick play, table settings and host hand-over ✅ code

Step 2 of the lobby, approved by the owner:
- **Quick play:** one tap to a table that starts by itself.
- **Table settings:** chosen when a table opens.
- **Host hand-over:** another player takes over when the host is gone.

Design and reasons: [ADR 0020](../adr/0020-quick-play-settings-host-handover.md); behaviour and
the studio contract: [multiplayer spec §7c](../specs/multiplayer.md#7c-quick-play-table-settings-and-host-hand-over-protocol-27).

What shipped:
- **Quick play** (`lib/lobby/quick-play.ts`, `components/lobby/quick-play-button.tsx`) on the lobby
  and on the game page (the table card: "Quick play" next to "Go to the lobby"):
  - it tries the open public tables with a free seat, the most players first, then the oldest
    (`quickPlayOrder` in `lib/lobby/lobby-data.ts`);
  - otherwise it opens a public table with the default settings that starts by itself;
  - simultaneous players meet through the new pointer `quickPlay/{gameId}` `{ code, at }`, moved
    only by transaction; the player who loses the race sits at the winner's table and deletes
    their own.
- **Auto start** (`tables/{code}/startAt`):
  - a 20-second countdown on the table page for everyone, by the database's clock;
  - every new player leaves at least 10 s;
  - when it ends, the host's page fills the empty seats with bots and starts, in one transaction
    (`startTable`, `planStart`);
  - the host's "Start by itself" switch on public tables; "Start now with bots" starts earlier.
- **Table settings** (`tables/{code}/settings`, `packages/shared/src/tables.ts`):
  - hands 5 or 11, turn 15, 30 or 60 s, bots yes or no, defaults 5 / 30 s / yes;
  - chosen in an "Open a table" form in the lobby (with visibility, public by default) and on the
    new-table page (private by default);
  - the host changes them while the table is open (`components/game/table-settings.tsx`);
  - shown as tags in the lobby row and on the table page, and during the game;
  - with bots off the table hides "Add a bot" and starts only when every seat has a player.
- **Host hand-over:**
  - after the host's table presence has been gone for 15 s, the present seated player in the
    lowest seat takes `hostUid` with a compare-and-set transaction (`claimHost`, `handoverDelay`);
    each next player waits 5 s more;
  - everyone sees "You are the host now" or "X is the host now";
  - the host tag, the host's controls and the lobby summary follow `hostUid` instead of seat 0.
- **Protocol 2.7** (adapter 2.7.0):
  - `GHA_START.config.table` `{ settings, hostSeat }` for table games;
  - `GHA_HOST_CHANGE { hostSeat }` during a game;
  - adapter `multiplayer.table`, `multiplayer.hostSeat`, `multiplayer.onHostChange()`, and
    `isHost` follows the hand-over;
  - the web bridge (`lib/gha/bridge.ts`) builds and types them.
- **Lobby summary:** `syncLobbyTable` now also writes `settings` and `autoStart`, and names the
  host by `hostUid`.
- **Cleanup:** `cleanupRooms` also deletes quick-play pointers older than two hours.
- **Messages:** new keys in `table` (settings, countdown, hand-over notices, setup form) and
  `lobby` (quick play, the open-table form) in `en.json` and `tr.json`.

Decisions and deviations from the brief:
- **No new Cloud Function.** Quick play runs on the client with a transaction on a pointer, so
  the slice needs no deploy step beyond the usual workflows.
- **"Start now"** fills the empty seats with bots in one step (when bots are allowed), instead of
  requiring the host to add every bot first. "Add a bot" is still there.
- **A just-opened table counts as attended.** Quick play also tries a table opened in the last 15
  seconds whose opener is the only one seated, even before the opener's page has marked them
  present.
  - Without this, a second quick player a few seconds later did not see the first one's table
    (found in the browser test).
  - Fifteen seconds rather than a minute, so a table its opener closed at once is not handed to
    the next quick player.
- **The 15-second wait is a client convention.** The rules only check that the host is not
  present right now (ADR 0020).
- **Auto start only on public tables**, as the owner described: turning a table private turns the
  auto start off.

Tests:
- shared (3 new):
  - `tables.test.ts`: allowed values, and settings read field by field with defaults;
  - `lobby.test.ts`: the summary carries settings and `autoStart` and follows a hand-over.
- web (13 new):
  - `table-data.test.ts`: settings and `startAt` read, countdown seconds, the 10-second extension,
    the start plan (bots, new player, bots off), hand-over delays in seat order;
  - `lobby-data.test.ts`: quick-play order and filters, the fresh-table rule, the pointer reader;
  - `bridge.test.ts`: `config.table` for tables, a host seat outside the table falls back to 0,
    and no `table` in rooms and solo.
- adapter (4 new): settings and host seat, hand-over to this player and to another (and ignored
  junk), ignored in rooms and malformed configs, offline.
- RTDB emulator `firebase/tests/table-play.test.ts` (15):
  - settings: valid values only, host only, only while open; no bots at a table without bots,
    and bots off only together with freeing the bot seats;
  - `startAt`: host only, at most two minutes ahead, only while open, and the start removes it in
    the same write; also as a client transaction;
  - hand-over: allowed for a seated, present player when the host is gone, with the host rights
    following; refused while the host is present, for players who are away, strangers, other
    uids, closed tables, and the old host claiming back. Two players racing by transaction: one
    wins;
  - quick-play pointer: own open public table of that game only, `at` = server time, no extra
    fields, signed-in read, no delete; two players by transaction meet at the first one's table;
  - `syncLobbyTable` lists settings and auto start and the host after a hand-over.
- `lobby.test.ts`: `deleteStaleLobbyData` also removes old quick-play pointers.
- Full run: shared 96, web 130, themes 16, adapter 29, firebase 167 passed and 1 skipped (the
  opt-in live-trigger test).
- In the browser (`next start` with `NEXT_PUBLIC_FIREBASE_EMULATORS=1`, the live trigger opted
  in, Okey pointed at the fixture game with `AYVAGO_DEV_ENTRY_OVERRIDES`, Playwright recording
  every message the game frame receives):
  - **1 player:** quick play from the game page opens a table. The countdown shows 20, and the
    game starts after 20 s with three bots. `GHA_START.config.table` =
    `{ settings: { hands: 5, turnSeconds: 30, bots: true }, hostSeat: 0 }`.
  - **2 players at the same moment:** both land at the same table (2 players, 2 bots).
  - **3 players:** two at once and a third later all land at one table. A late player with 6 s
    left resets the countdown to 10 s, and the game starts with one bot.
  - **Settings:** a table opened from the lobby form with 11 hands, 60 s and players only shows
    "11 hands · 60 s per turn · No bots" in another player's lobby and on a Turkish guest's
    table page ("11 el · Hamle başına 60 sn · Botsuz").
  - **Hand-over while open:** after the host's browser closed, the next player became host after
    15 s with the host controls, and the third saw "X is the host now".
  - **Hand-over during a game:** after the host's browser closed, both other games received
    `GHA_PEER_LEAVE { seat: 0 }` and, 15 s later, `GHA_HOST_CHANGE { hostSeat: 1 }`.
  - **Screenshots:** game page, lobby with the open-table form, and table with the countdown, in
    minimal light and dark, cartoon and arcade, English and Turkish, on a 1366×900 desktop and a
    Pixel 7. No horizontal overflow, and no console errors besides blocked external images.

Owner steps: nothing on the platform. Merging deploys the web app, and the usual workflows
publish the rules and the updated `cleanupRooms`. Then merge the studio PR that copies adapter
2.7.0 ([setup](../setup/phase-5.md#519-quick-play-table-settings-and-host-hand-over)).

Still open:
- **Studio:** Okey reads `config.table` (hands, turn timer), takes over the bots on
  `GHA_HOST_CHANGE`, and plays a leaver's seat as a bot until they return.
- Spectating, site-wide presence, quick-chat and web push stay in ADR 0019 "Next".

## 5.20 Leave table ✅ code

The owner asked for a "Leave table" button: until now a player could only leave by closing the
tab. Casual tables only: no penalty and no statistics (ranked play is postponed).

Behaviour: [multiplayer spec §7d](../specs/multiplayer.md#7d-leave-table); the host marker is an
addendum to [ADR 0020](../adr/0020-quick-play-settings-host-handover.md#addendum-slice-520-a-host-who-leaves-on-purpose).

What shipped:
- **Button** "Leave table" / "Masadan ayrıl" in the table header next to the Lobby link, in every
  state (waiting, counting down, playing). It sits above the game, never over it, and reads the
  `--danger` token as an outline, so it is visible but quieter than the accent buttons.
- **Dialog** (`components/game/leave-table-dialog.tsx`): a native modal `<dialog>` labelled by its
  title and described by its text. The page behind is inert, so the focus stays inside; the focus
  starts on Stay; Escape, Stay or a click on the backdrop cancel and return the focus to the
  button. Four texts: a player at a waiting table, a host with others ("another player becomes
  the host"), a host alone ("the table closes") and a game ("A bot will play your seat for the
  others").
- **What leaving does** (`planLeave` in `lib/netcode/table-data.ts`, `leaveTable` in
  `lib/netcode/tables.ts`):
  - waiting table: the seat and the presence go in one update; then the game's lobby;
  - the host of a waiting table where nobody else is seated (bots do not count): `status:
    closed` and no countdown, so the table leaves the lobby and its link says it is closed;
  - the host with other players seated: `hostLeft` = the host's uid, written with the presence
    removal. The host decides in a transaction, so a player who sits down at that moment turns a
    "close" into a hand-over;
  - during a game: only the presence goes, so the others' games get `GHA_PEER_LEAVE` and the
    host's game plays the seat. The seat stays the leaver's, and the lobby keeps "Back to your
    table".
  - The page stops its table presence first without removing it, so the leave write removes it
    together with the seat or the marker. Others never see "host gone" without the marker.
  - The player goes to the lobby with `replace`, so Back does not sit them down again.
- **Fast hand-over:** `handoverDelay` returns 0 for the first present player (then 5 s steps)
  when `hostLeft` equals `hostUid`. The games hear `GHA_PEER_LEAVE` for the host's seat at once
  (no 4-second grace), before `GHA_HOST_CHANGE`. A host back at the table clears the marker, so
  a later drop waits 15 s again.
- **Lobby presence and invites:** the table page drops its `table` / `playing` presence when the
  leave starts, and the lobby page writes `lobby`. Pending invites the leaver sent for the table
  are taken back (`withdrawInvites` in `lib/lobby/outgoing.ts`), so the invitee's toast goes away;
  during a game none can be pending. Leaving a seat or closing the table also forgets the lobby's
  "your table" pointer.
- **Closed tables:** `joinTable` now reports a closed table before looking for the player's own
  seat, and the table page shows "This table is closed" when a table it watches closes.
- **Rules:** `tables/{code}/hostLeft` (see the spec). No other rule changed.
- **Messages:** `table.leave.*` in `en.json` and `tr.json`. **Icon:** `ExitIcon`.

Decisions and deviations from the brief:
- **The host's seat is freed too** when the host leaves a waiting table with others. For the
  moment between the leave and the take-over (under a second in the browser test) the lobby
  summary has no host, so `syncLobbyTable` drops the entry and lists it again after the hand-over.
- **A host alone during a game keeps the table** (`playing`, with bots). As for every player, the
  seat stays theirs. The lobby already hides tables nobody has open, and `cleanupRooms` removes it
  after two hours.
- **A player leaving during a game** still waits the 4-second grace before `GHA_PEER_LEAVE`, as
  for a closed tab. Only the host has a marker, because only the host's leave needs to be fast.
- No ADR of its own: the one new rule extends ADR 0020's hand-over, so it is an addendum there.

Tests:
- web (7 new, `table-data.test.ts`): the host marker counts only for the current host; leave
  plans for a player, during a game, a host with others (waiting and playing) and a host alone
  (bots do not count, an old marker is cleared); the hand-over delay after a host left (0, then
  5 s steps, none when the host is back); updates applied to a raw table as the database would.
- RTDB emulator `firebase/tests/table-leave.test.ts` (10): a player frees only their own seat
  and presence; during a game only the presence, and they can come back; players cannot close the
  table or write or clear the marker; a host alone closes the table and nobody can sit down
  there; the marker only from the host, equal to `hostUid` and with the presence gone, then the
  next player takes over; the host's transaction during a game; a new host's whole-table start
  transaction with an old marker passes, but nobody may point the marker elsewhere; refused on
  closed tables, cleared by the returning host; the host can sit down again before a take-over;
  `syncLobbyTable` keeps a table whose seat was freed and drops a closed one.
- Full run: shared 96, web 137, themes 16, adapter 29, firebase 177 passed and 1 skipped (the
  opt-in live-trigger test).
- In the browser (`next start` with `NEXT_PUBLIC_FIREBASE_EMULATORS=1`, the live trigger opted
  in, Okey pointed at the fixture game, Playwright recording every message the game frames
  receive), 28 checks passed with no console errors:
  - **Dialog:** labelled "Leave this table?", the focus starts on Stay, Tab stays in the dialog,
    Escape closes it and returns the focus to the button, and the player is still seated.
  - **A player leaves a waiting table:** they land in the lobby, the host's page shows the seat
    empty, and the lobby lists the table with the free seat.
  - **The host leaves with another player seated:** the other player is host 0.16–0.26 s later
    ("You are the host now", Start button), and the old host's seat is free.
  - **The host leaves alone:** the table leaves another player's lobby within seconds, and its
    link says "This table is closed."
  - **During a game (three players):** the button is visible above the game, and the dialog says
    "Leave the game?". After the leave, the host's game gets `GHA_PEER_LEAVE { seat: 1 }`, the
    leaver's lobby offers "Back to your table", and the table link brings them back to the running
    game (`GHA_PEER_JOIN { seat: 1 }`). Then the host leaves: the third player's game gets
    `GHA_PEER_LEAVE { seat: 0 }` and then `GHA_HOST_CHANGE { hostSeat: 1 }`, 0.18 s after the
    click.
  - Taking back pending invites was not exercised in the browser.
  - **Screenshots:** the button and the dialog (the host-alone and the game texts; the other two
    were checked by their mode in the test) in minimal light
    and dark, arcade and cartoon, English and Turkish, on a 1366×900 desktop and a Pixel 7, waiting
    and during a game. No horizontal overflow.

Owner steps: nothing to set up ([setup](../setup/phase-5.md#520-leave-table)). Merging deploys
the web app, and the rules workflow publishes the `hostLeft` rule.

Still open:
- Penalties and statistics for leaving, together with ranked play.
- A marker for players other than the host, if games want `GHA_PEER_LEAVE` without the 4-second
  grace when someone leaves on purpose.

## 5.21 Site-wide online status and recent players ✅ code

The owner asked to continue the lobby: players are online on the whole site, and every player
sees the people they played with ("Son oynadıkların") and can invite them when they are online.
Until now only players in a game's lobby or at its tables could be seen and invited.

Design and reasons: [ADR 0021](../adr/0021-site-presence-recent-players.md); behaviour:
[multiplayer spec §7e](../specs/multiplayer.md#7e-site-wide-presence-and-recent-players).

What shipped:
- **Site presence** `presence/site/{uid}` `{ name, character?, level?, state, gameId?, since, dnd? }`
  (`lib/presence/site.ts`, `use-site-presence.ts`, `packages/shared/src/presence.ts`):
  - states `online` (any page; with `gameId` on a game page), `lobby`, `table` (also a room
    before the match) and `playing` (table or room match, or a solo round);
  - pages claim their state (`useSiteActivity`): the game player, the room page, and the lobby
    and table pages through `useLobbyPresence`. The tab writes the busiest claim;
  - one entry per player: the last tab to write wins, a tab writes again when it comes to the
    front, and an open tab restores the entry when another tab's disconnect removed it;
  - `InviteCenter` (top bar, every page) keeps it: after the first tap, click, key or wheel on
    the page (lobby, table and room pages at once), and away after 10 minutes hidden
    (`goOffline`, except on lobby, table and room pages).
- **"Show me as online"** (profile settings, `users/{uid}.hideOnline`, on by default): off means
  no site entry and no lobby entry, so nobody sees or invites the player. The lobby and the
  recent lists tell the player they appear offline.
- **Recent players** `users/{uid}/recentPlayers/{otherUid}` in Firestore, newest 30
  (`firebase/functions/src/recent.ts`):
  - `syncLobbyTable` records the humans of a table when it turns `playing` (bots left out, guests
    included);
  - new trigger **`recordRoomPlayers`** (`onValueCreated('rooms/{code}/guestUid')`) records both
    players of a two-player room;
  - each event is counted once (`lastMatch`), and the list is trimmed to 30;
  - `deleteMyData` and guest cleanup remove the player from every other list (collection-group
    query on `uid`, with a single-field index exemption in `firestore.indexes.json`);
    `mergeGuestAccount` moves a guest's list to the account; **Download my data** includes it.
- **UI** (`components/lobby/recent-players.tsx`):
  - a **Recent players** panel in the lobby under "Online now" (the newest 6);
  - a **Recent players** card on the profile (8, "Show all" up to 30, `components/account/recent-section.tsx`);
  - each row: character or initial avatar, name, "Okey · 4 times · 2 h ago", an online dot with
    the state ("Playing · Okey"), and Invite / "Not taking invites" / "At your table". Presence is
    read with one listener per row on screen.
- **Invites to anyone online:**
  - the rules accept a recipient with a lobby entry for the game **or** a site entry, and neither
    entry with `dnd`. Everything else from 5.18 stays (one pending invite per pair, a seated sender
    at an open table, five a minute, two minutes to answer);
  - Invite in the lobby works as for lobby players;
  - Invite on the profile uses the player's open table of the shared table game, or opens a
    public one, and goes there. Recent players from room games show their status only;
  - the notifier listens whenever the tab holds the player's presence, which replaces the
    12-hour lobby gate (`markLobbyVisit` and `recentLobbyVisit` are gone).
- **Messages:** new `presence` namespace; `profile.onlineTitle`, `onlineToggle`, `onlineHint`;
  `profile.invitesToggle` now reads "Let other players invite me to their table" (en and tr).

Decisions and deviations from the brief:
- **Hidden writes nothing** rather than a hidden flag: a flagged entry would still show the name
  and state to anyone with the uid. The switch also hides the player from game lobbies, so "off"
  means invisible everywhere except the seats they take.
- **Firestore for recent players**, not an RTDB index: private per player, ordered reads with a
  limit, deleted with the account, included in the export (ADR 0021).
- **Multiple tabs: the last write wins**, not the busiest across tabs. Per-tab keys would make
  `dnd` impossible to check in the rules.
- **No "N online" count:** it needs a list read of every visitor or a counter on every presence
  change.
- **Invites from the lobby while the player's remembered table is in play** stay off, as for the
  online list (5.18 behaviour). The profile can still invite, by opening a new table.

Tests:
- shared `presence.test.ts` (8): state order, presence reader and writer, table start and room
  matches (bots out, two people needed), pairs, the stored entry reader;
- web `lib/presence/recent-data.test.ts` (2): "x ago" units, and when Invite is offered;
- RTDB and Firestore emulator `firebase/tests/presence.test.ts` (16; 14 in the default run):
  - site presence: own entry only, every field validated, no extra field (a `hidden` flag is
    refused), one uid readable by signed-in players, the list and the parent not readable;
  - invites: allowed to a site-present player outside any lobby; refused to hidden (no entry),
    `dnd` (also when only the site entry has it) and seated players, from strangers, to started
    tables, and a second pending one;
  - `recentPlayers`: owner reads, nobody else; no client writes (owner included); `hideOnline` is
    a boolean the owner sets;
  - the handlers called directly: table start (bots left out, guests in, counted once per match,
    again for a new table), a single player with bots records nothing, room join, the cap at 30
    (the oldest goes), removal on account deletion and the guest merge;
  - the live triggers (`syncLobbyTable` on a table start, `recordRoomPlayers` on a room join) in
    the opt-in run: `presence.test.ts` and `lobby.test.ts` with `AYVAGO_EMULATOR_DB_TRIGGERS=1`,
    28 passed and 8 skipped (the direct tests, which would race the live trigger);
- full run: shared 104, web 132, themes 16, adapter 29, firebase 181 passed and 3 skipped (the
  opt-in live-trigger tests);
- in the browser (`next start` built with `NEXT_PUBLIC_FIREBASE_EMULATORS=1`, the live triggers
  opted in, Playwright, two guests):
  - A (desktop) invites B (phone) from the lobby; they start a table. Both then see each other
    under Recent players (written by the trigger);
  - B opens the home page only and presses a key. Their entry turns `online`, A's profile shows B
    online with Invite, and A invites. B gets the alert-dialog toast on the home page, joins and
    sits at A's new table;
  - B turns "Show me as online" off. B's entry is removed, A sees B offline with no Invite, B is
    not in the lobby list, and the lobby tells B they appear offline;
  - with the switch on again, B gets an invite on the Turkish home page (arcade, desktop) and
    declines it;
  - screenshots: lobby and profile in minimal light and dark and arcade light and dark, English
    and Turkish, on a 1366×900 desktop and a 412 px phone; the toast on the home page. No
    horizontal overflow and no console errors.

Owner steps: none beyond the usual workflows; an optional check after the deploy. See the
[setup doc](../setup/phase-5.md#521-site-wide-online-status-and-recent-players).

Still open:
- The table page lists only lobby players, so an invite sent from the profile to a site-only
  player shows no "Invited / Declined" status there (the player appearing in a seat is the
  answer). Adding recent players to the table page touches `table-view.tsx`, left for after the
  leave-table change.
- Friends, invites to two-player rooms, web push and an "N online" count (ADR 0021 "Next").

## 5.22 Play report counts starts, online matches and abandoned runs ✅ code

The owner noticed that the report's per-player section barely changed. Production (Progress
report workflow, last 4 days): 126 score sessions, 56 `finished` and 70 still `open`, from four
players. Per-player stats only grew when a solo run reached `GHA_END`; runs the player left were
only in `games/{gameId}/daily.started`, and online rounds were never counted. The owner approved
counting started runs per player, online matches (never ranked) and the play time of left runs.

Design and reasons: [ADR 0022](../adr/0022-started-abandoned-and-online-play.md).

What shipped:
- **Data model** (new fields; old documents read them as 0):
  - `users/{uid}/stats/{gameId}`: `starts`, `abandonedSeconds`, `onlinePlays`, `lastOnlineMatch`;
    `lastPlayedAt` also moves on a start, a left run and an online match;
  - `games/{gameId}/daily/{day}`: `abandonedSeconds`, `onlineStarted` (matches).
- **Started runs:** `startSession` writes the session, the day's `started` and the player's
  `starts` in one batch (`countStart` in `firebase/functions/src/stats.ts`).
- **Left runs:** new callable **`abandonSession({ sessionId, token, durationMs })`**
  (`sessions.ts`):
  - the same checks as `finishSession` (owner, token, open session, ban, App Check mode);
  - one transaction closes the session as `abandoned` and adds
    `min(durationMs, server elapsed, MAX_COUNTED_RUN_MS)` to `abandonedSeconds` (stats and day),
    so finish and abandon can never both count; no `plays`, no `finished`;
  - sessions over 6 hours old, or of a game no longer live, close as `expired` and count nothing.
- **Client** (`lib/leaderboard/session.ts`, `run-clock.ts`, `game-player.tsx`):
  - `Run.abandon()` on a new `GHA_SESSION_START` while a run is open, on `GHA_END` without a
    score, on reload of the game frame and when the game page unmounts (another route);
  - on `pagehide` the page sends the callable protocol itself with `fetch(..., { keepalive: true })`
    (`callableUrl` and `callableHeaders` in `lib/firebase/client.ts`: ID token and App Check
    token, read ahead when the session is registered and every 15 minutes);
  - `durationMs` is the time the page was visible since the run started (the game is paused while
    hidden), so a background tab adds nothing.
- **No signal:** `cleanupSessions` marks `open` sessions older than 6 hours `expired` and counts
  nothing (time unknown). New composite index `sessions (status, startedAt)`.
- **Online matches** (`online.ts`, `countOnlineMatch` in `stats.ts`), from the triggers that
  already see a match start:
  - `syncLobbyTable`: every human seat of a table that turns `playing`, bots never, guests always,
    also one person with bots (`tableStart` in `packages/shared/src/presence.ts`);
  - `recordRoomPlayers`: both players of a room when the guest seat is taken;
  - one transaction per match, skipped per player when `lastOnlineMatch` is the match key; the
    day's `onlineStarted` grows once per match; games outside the live catalog are skipped;
  - never on boards, XP, achievements or vote eligibility.
- **Report** (`packages/shared/src/play-report.ts`, `reports.ts`, `components/admin/play-report.tsx`,
  `lib/admin/play-report.ts`):
  - per player: starts, finished plays, online matches, play time (finished + left), last played
    (including online), and per game "Brick Breaker × 12 · online × 3" (or "· started × 3" for a
    game only started); ordered by finished + online plays, then starts;
  - per game: next to the all-time columns, the window since `statsSince` from the daily
    documents: starts, finished, online matches and play time (finished + left);
  - summary per kind: players, starts, plays, online, play time;
  - `extendedSince` = `EXTENDED_STATS_SINCE`, a note marks the columns counted only from that day
    (`*`) and says that online play time is not counted;
  - CSV: the new columns, with finished and left time in separate seconds columns.
- **Readers checked:**
  - `castVote` reads `playSeconds` only: a starts-only, left-time or online-only document is
    still not eligible;
  - the guest merge (`removeVotes`) now moves `starts`, `abandonedSeconds` and `onlinePlays`,
    writes `lastPlayedAt` only when the guest has one and it is newer than the account's (it
    wrote `undefined` for a document without one) and leaves `lastOnlineMatch` behind;
  - the profile and **Download my data** read `progress/summary`, the library and recent players,
    not `stats`; recently played is the library. Unchanged;
  - `recomputeRankings` and the spotlight `todayScore` read `started`, `finished` and
    `playSeconds` only. Unchanged;
  - `deleteMyData`, guest cleanup, bans and the Reset progress script delete whole documents;
  - the Progress report workflow lists the new `abandoned` and `expired` statuses.
- Text in `en.json` and `tr.json` (`admin.report.extendedNote`, `summary.starts`, `summary.online`,
  `games.starts`, `games.finished`, `games.online`, `players.starts`, `players.online`, new CSV
  headers; `players.empty` and `players.gameLine` reworded; `games.playsShort` removed).

Deviations from the brief:
- **Left-run time is `abandonedSeconds`, not added to `playSeconds`.** `playSeconds` drives vote
  eligibility and the ranking's average session length (`playSeconds / finished`); both would
  change. The report adds the two.
- **No online play time.** Tables stay `playing` until the host leaves alone or the 2-hour cleanup;
  rooms have no end marker. Both are client-driven, so the server cannot know when a match ended.
  Only matches are counted, and the report says so.
- **Per-game window columns come from the daily documents** (days from `statsSince` on), not from
  the per-player stats, so starts and finished runs per game are complete since the fresh start;
  per-player starts exist only from the deploy day.
- **`lastPlayedAt` moves on a start** too, so a player whose runs were all left still has a date.
- **`EXTENDED_STATS_SINCE` is `'2026-11-10'`**, a placeholder: set it to the deploy day when
  merging.

Tests:
- shared `play-report.test.ts` (7): the 5.16 cases with zeros for old documents, plus starts,
  online matches and left time per player, kind and game, the order with online plays, a
  starts-only player and the daily window; `presence.test.ts` (9): `tableStart` takes one person
  with bots, never a bots-only table;
- web `lib/admin/play-report.test.ts` (4): the new CSV columns and game lines;
  `lib/leaderboard/run-clock.test.ts` (3): visible time only, a run started hidden, the callable
  body;
- Firestore, Auth, RTDB and Functions emulator `firebase/tests/play-stats.test.ts` (20):
  - `starts` on `startSession`;
  - `abandonSession`: the happy path (no plays, no board, no progress), the server clock bound,
    the 3-hour cap, a session too old (`expired`), a wrong token, someone else's session, unknown
    and malformed ids and durations, double abandon, finish after abandon, abandon after finish,
    finish and abandon sent together (exactly one counts), App Check enforce and monitor, and the
    keepalive request a closing page sends (raw callable protocol, refused without a token);
  - `expireOpenSessions`: old open sessions only, nothing counted;
  - online counting called directly: bots left out, guests in, counted once, one person with bots,
    games outside the catalog skipped, both room players once;
  - readers: vote eligibility with a starts-only, left-time and online document, guest merge of
    every counter (newer `lastPlayedAt` kept, starts-only document), `deleteMyData`, the ranking
    and `todayScore` identical with the new daily fields, `getPlayReport` with all three;
- `firestore.test.ts`: clients cannot write the new stats fields, the day's `onlineStarted` or a
  session; `play-report.test.ts` updated for the new shape;
- full run: shared 106, web 142, themes 16, adapter 29, firebase 212 passed and 3 skipped (the
  opt-in live-trigger tests);
- in the browser (`next dev` on the emulators with the fixture game, Playwright Chromium): a run
  left by a client-side route change and one left by closing the tab were both `abandoned`, the
  stats showed `starts: 2`, the left time and no `plays`. The report with seeded data in minimal
  light (1366×900), arcade dark in Turkish (1366×900), minimal dark in Turkish (Pixel 7) and
  cartoon light (360×780): no page overflow, the tables scroll inside the card on phones.

Owner steps: none beyond merging (new callable, trigger updates and one index, all through the
usual workflows); set `EXTENDED_STATS_SINCE` to the deploy day. See the
[setup doc](../setup/phase-5.md#522-play-report-counts-starts-online-matches-and-abandoned-runs).

Still open:
- Online play time needs a server-observed end of a match (ADR 0022 "Next").
- Runs left in browsers without `fetch` keepalive, or whose session was not registered yet when
  the tab closed, end as `expired` without time.
- A page restored from the back/forward cache after `pagehide` keeps playing a run the server has
  closed; its finish is then refused (`closed`) and the toolbar falls back to the browser's best.

## 5.23 Site footer ✅

The owner asked for a copyright notice ("All Rights Reserved Ayvago Games ©2026") in the footer
of the site, with the Privacy link on its right.

What shipped (`components/shell/site-footer.tsx`, `copyright-notice.tsx`, `shell.module.css`,
`lib/copyright.ts`):
- A slim `<footer>` (contentinfo landmark) as the last thing in the content column of every page,
  inside the app shell. It is not fixed or sticky. On tablet and desktop it sits in the content
  column, never under the side menu. On phones it sits above the bottom bar, kept clear by the
  page's usual bottom padding. On game pages it follows the game, its panels and the related
  games.
- Left: "© 2026 Ayvago Games. All rights reserved." / "© 2026 Ayvago Games. Tüm hakları
  saklıdır." (`footer.copyright`).
- Right, in a `<nav aria-label>` ("Legal and contact" / "Yasal bilgiler ve iletişim"), separated
  by middots that screen readers skip:
  - **Privacy / Gizlilik** → `/privacy` (marked as the current page there);
  - **Cookie preferences / Çerez tercihleri** → `/privacy#ads`, where the ad choice sits;
  - **Contact / İletişim** → `mailto:` the privacy contact (`PRIVACY_CONTACT`,
    `ayvagogames@gmail.com` unless `NEXT_PUBLIC_PRIVACY_CONTACT` overrides it).
- **Year:** a range from the launch year: "© 2026" in 2026, "© 2026–2027" from 2027
  (`copyrightYears`, en dash). The server renders the current UTC year. Pages are prerendered,
  so after hydration the visitor's clock decides (`useSyncExternalStore`, no hydration mismatch,
  no effect). The year never goes before 2026, even with a wrong device clock.
- **Look:** small text in `--text-muted` on the page background, a `--border` divider and room
  around it. The links turn `--text` and underline on hover. Keyboard focus shows the
  `--focus-ring` outline. The links are 44 px tall touch targets. On phones (below 640 px) the two
  sides stack, centred: the copyright on one line, the links on the next. Arcade keeps its body
  pixel font (Pixelify Sans). Its © is a small raised mark, so the sign alone is drawn in the
  display pixel font.
- **Short pages:** the content column is a flex column and the page grows, so on a short page
  (an empty Favorites list, Not found) the footer ends the screen instead of floating mid-page.
- **Old links removed:** the Privacy link at the bottom of the side menu and the phones' privacy
  link at the end of the page are gone. "Install the app" stays at the bottom of the side menu and
  at the end of the page on phones, above the footer. `styles.legalLink`, `styles.navFooter` and
  the `nav.privacy` message key were removed; the text moved to `footer.privacy`.
- **Fix on the way:** the invite center's screen-reader announcer (a `visually-hidden` paragraph
  placed in `<body>`) kept its default margins and added a 17 px band below the shell, which
  showed under the side menu once the footer ended the page. `.visually-hidden` now has
  `margin: -1px`, the usual pattern.

Deviations: none.

Tests:
- web `lib/copyright.test.ts` (4): the launch year alone, the range in later years, a clock
  before the launch year, another launch year; the message test checks the five `footer` keys in
  both locales;
- contrast: the footer uses `textMuted` on `bg`, which the themes contrast test already checks
  at 4.5:1 in every theme and mode;
- full run: shared 114, web 192, themes 16, adapter 30, firebase 232 passed and 3 skipped (the
  opt-in live-trigger tests); `pnpm format:check`, `pnpm typecheck` and
  `pnpm --filter @ayvago/web build` pass;
- Playwright on `next start`: the home page bottom in minimal, cartoon and arcade, light and dark,
  English and Turkish, at 1366×900 and on a Pixel 7 (24 shots), at 360×780 in minimal light and
  arcade dark, a game page on desktop and phones, the side menu, an 800 px tablet page and the
  privacy page. Every shot: no horizontal overflow, one privacy link on the page (the footer's),
  the footer ends 44 px above the bottom bar on phones. Keyboard focus on a footer link shows the
  ring in minimal and arcade dark.

Owner steps: none. See the [setup doc](../setup/phase-5.md#523-site-footer).

Still open: nothing.

## 5.24 Game card art ✅ code

In the Minimal and Cartoon themes the tiles did not make the games stand out. They showed the
game's 1920×1080 store cover, a branded banner with the title, a paragraph of text and two small
phone mock-ups. At tile size the text was unreadable and the game tiny, and each cover is about
200 KB. The owner chose a dedicated card image per game: in-game frames, no text block, a small
game logo in a corner. The studio (`selchook/ayvago-games`) generates the images in a parallel
change. Contract and reasons: [ADR 0024](../adr/0024-game-card-art.md).

What shipped:
- **Manifest** (`packages/shared/src/manifest.ts`): two optional asset refs, validated like the
  others (a path or an https URL):
  - `assets.card`: card art, 640×360 WebP;
  - `assets.card2x`: the same art at 1280×720 WebP, only used together with `card`.
  - Studio paths: `/games/<slug>/ayvago/card-640x360.webp` and `card-1280x720.webp`. The
    change stays inside `manifest.ts`, so the studio can vendor the file verbatim. The `SeedGame`
    type reads the manifest input type, so the next catalog sync with `card` and `card2x` in
    `arcadeGame()` typechecks (tried with a local edit of `arcade-catalog.ts`, then reverted).
- **Catalog** (`apps/web/lib/catalog`):
  - `resolveGameArt(manifest, ownAssets)` resolves `coverUrl`, `screenshotUrl`, `cardUrl` and
    `card2xUrl` against the entry URL, with the same own-assets rule as the cover (coming-soon
    games and generated covers get none);
  - `card2xUrl` is null without a `cardUrl`;
  - `toTiles` passes them on as `TileData.card` / `card2x`.
- **Tiles** (`components/catalog/game-tile.tsx`, `cover-art.tsx`, `catalog.module.css`):
  - **Minimal and Cartoon.** The tile's 16:9 media area shows the card full-bleed:
    `<img src=card srcset="card 640w, card2x 1280w" sizes="(max-width: 639px) 72vw, 320px">`,
    with `width`/`height` 640×360, lazy and async, in the existing `aspect-ratio: 16 / 9` box, so
    nothing shifts. The browser picks the 640 card on desktops (also at 2×) and the 1280 card on
    3× phones.
  - **Fallbacks.** A game without `card` shows the cover as before; without a cover, the
    generated placeholder. The generated gradient stays underneath every image as the loading
    and failure background.
  - **Hover and keyboard focus.** The image zooms to 106 % under a light scrim, and a round
    52 px play button (`PlayIcon` on `--accent` / `--accent-contrast`; Cartoon adds its dark
    outline and hard shadow) fades in at the centre. The zoom and the scrim only follow the
    pointer on devices that can hover. `:focus-visible` shows the same state.
    `prefers-reduced-motion` turns off the zoom and the motion; the button still appears.
  - **The play button** is decorative: it sits in the `aria-hidden` media area, and the tile
    link's accessible name stays the game title. It has no visible label, so there are no new
    message keys. Coming-soon tiles get no play button.
  - **Badges.** The "Coming soon" badge background is now 72 % black (was 55 %), and both badges
    get a soft shadow so they stand out on any card art, light or dark. The "New" badge keeps
    `--accent` / `--accent-contrast`.
  - **Arcade is unchanged.** It shows the screenshot, or the cover for games without one; no
    zoom, scrim or play button, and its badges look as before.
  - **Covers elsewhere.** The home spotlight keeps the full cover. Tiles switch to card art:
    shelves, grids, related games, search, recent and favorites.
  - **Player overlay (owner request, follow-up).** The overlay with the Play button, before a
    game starts, also shows the card art in Minimal and Cartoon:
    - the game page, the online room page and the table page;
    - `srcset` with `sizes="(max-width: 960px) 100vw, 960px"`, so dense screens get the 1280 px
      card;
    - the art is kept sharp and only lightly dimmed (`brightness(0.85)`) under a radial scrim that
      darkens the middle, where the Play button sits.

    The cover was blurred and darkened because it carries a menu screenshot and text; the card
    art does not. Arcade keeps the dimmed cover there.
  - **Portrait games (owner follow-up).** A portrait game's stage is tall or square, so its 16:9
    card was cropped to the middle and its logo cut off. For portrait games `PlayerCover`
    (`components/game/player-cover.tsx`) composes the overlay art from the in-game screenshot
    instead, in Minimal and Cartoon:
    - a blurred backdrop, with the sharp frame in the middle at 94 % of the stage height;
    - the game's localized name as a logo bottom-left over a bottom scrim, in Fredoka (pixel
      font for retro games, with square framed corners);
    - on a phone the logo runs along the bottom.

    Only the screenshot loads (about 50 KB).
  - **Arcade too (owner follow-up).** The player overlay shows the same in-game art in the Arcade
    theme: the card for landscape games, the composed art for portrait games. Arcade tiles keep
    the screenshot or cover.
  - **The page heading.** Under the player, the game's name is no longer shown as a visible
    heading when the game has card art, because the art above already shows it as a logo. The
    `<h1>` stays for screen readers and search (`visually-hidden`). Games without art keep the
    visible heading.
- **Only shown images load.** Each image that a theme may hide sits in a wrapper the theme hides.
  The cover behind a card is only shown in Arcade, and the card is hidden there. Lazy images
  under a hidden parent are never fetched.

**Fix on the way: prefetching no longer downloads game covers.** While measuring, the catalog
pages still downloaded the full cover of nearly every visible tile, even where the tile showed
card art or a screenshot (Arcade). The cause:
- Next prefetches the game page of every tile link in the viewport.
- The game page shows its cover eagerly. As a server-component `<img>`, React put a preload hint
  for it into the page's RSC payload (`:HL[…cover-1920x1080.jpg,"image"]`).
- The prefetch applied that hint.

`CoverArt` is now a client component, so the hint is no longer in the RSC payload. A real visit to
a game page still preloads its cover from the HTML. Measured on `next start` at 1366×900 with the
placeholder cards below, cover downloads went from 15 to 1 on the Sports page (the one tile
without a card), from 13 to 5 on the home page (the spotlight and the tiles without a card) and
from 8 to 3 on the Arcade home page. This also cuts the image weight of today's catalog, before
any card art exists.

Deviations: none. The tile `sizes` assume the current tile widths; update them if the shelves or
grids change.

Tests:
- shared `manifest.test.ts` (+2): `card` and `card2x` are optional and kept; `card2x` alone is
  valid; relative names, http (non-localhost), `javascript:` and empty refs are rejected;
- web `lib/catalog/catalog.test.ts` (+6): card and 2x resolved like the cover (absolute https
  refs kept); no card → cover only; `card2x` without `card` ignored; `card` without `card2x`;
  nothing resolved without own assets; every catalog game's tile data matches its manifest;
- full run: shared 116, web 201, themes 16, adapter 30, firebase 232 passed and 3 skipped;
  `pnpm format:check`, `pnpm typecheck` and `pnpm --filter @ayvago/web build` pass;
- Playwright on `next start`:
  - setup: the catalog temporarily pointed every studio game except Neon Pong and Connect Four at
    placeholder cards, made from each game's screenshot (16:9 on a blurred copy, icon as the
    logo), and the studio origin was routed to local files;
  - pages: home (top, shelves), the Sports grid, Recently played, Favorites and a game page,
    in Minimal light and dark, Cartoon light and dark and Arcade, at 1366×900 and 390×844;
  - hover in Minimal light and dark, Cartoon and Arcade; keyboard focus in Minimal dark; hover
    with reduced motion;
  - every shot: no horizontal overflow; Arcade loads no card art; the srcset picks 640 at 1× and
    2× desktop and 1280 on a 3× phone.

Owner steps: merge order (this change before the catalog sync that adds the cards). See the
[setup doc](../setup/phase-5.md#524-game-card-art).

Still open:
- Real card art comes with the studio change; the screenshots used placeholders.
- The Phase 6 developer docs should list `assets.card` / `card2x` with their sizes.

## 5.25 Sortable admin report tables ✅ code

The owner asked to sort the admin panel's report tables by their column headings ("paneldeki
rapor başlıklarına göre sıralamayı etkinleştir").

What shipped:
- **Logic** (`apps/web/lib/admin/table-sort.ts`, pure):
  - `sortRows(rows, accessor, kind, direction, collator)` returns a sorted copy. Kinds are
    `number`, `duration` (seconds), `date` (a time or a `Date`) and `text`.
  - Text compares with an `Intl.Collator` for the UI locale (`numeric: true`), so Turkish
    ç ğ ı İ ö ş ü sort in Turkish order on `/tr` (Cuma before Çamur, ı before i, I before İ).
  - A missing value (null, undefined, NaN) always goes last, in both directions.
  - Ties keep the incoming order, which is the table's default order, so sorting is stable.
  - `nextSort` is the click rule; `parseSort` and `sortStorageKey` read and name the stored
    choice.
- **Hook and heading** (`components/admin/use-table-sort.ts`, `components/admin/sortable-th.tsx`):
  - `useTableSort(table, rows, columns)` keeps one table's sort and returns its sorted rows and
    the heading props.
  - **Click rule.** A first click sorts numbers, durations and dates descending (biggest or most
    recent first) and text ascending. A second click on the same heading flips the direction,
    and a third click restores the table's default order (owner follow-up).
  - **Repeated column names.** Where a column's own name repeats (the two "Starts" columns of
    the per-game table), the sort button's accessible name adds the column group, for example
    "Sort by Starts (Since 4 Nov 2026), descending". Every leaf column under a group heading gets
    its group the same way (`group` prop).
  - **Default order.** Until a heading is clicked, the rows keep the order they arrive in, exactly
    as before. No heading is marked then, because none matches that order exactly (see the
    tables below).
  - **Session memory.** The choice is kept in `sessionStorage` under
    `ayvago.admin.sort.<table>` (wrapped in try/catch). Re-running the report, switching tabs or
    reloading keeps it; a new browser session starts from the default order. A stored column that
    no longer exists is ignored.
  - **Heading markup.** `SortableTh` renders `<th scope="col">` with a `<button>` inside.
    `aria-sort="ascending" | "descending"` is set on the active heading only.
  - **Accessible name.** The button's name says what a click does: "Sort by Plays, descending" /
    "Oynanma sütununa göre azalan sırala" (`admin.sort.ascending` / `descending`). It contains
    the visible column name.
  - **Look.** The active column shows a single ▲ or ▼ triangle in `--accent`. Inactive headings
    show a faint ↕ (`--text-muted`) on hover and keyboard focus, with a `--bg` hover background.
    Keyboard focus shows the `--focus-ring` outline. In numeric columns the arrow sits before
    the label, so the labels stay aligned with the right-aligned numbers.
  - **Styles.** `admin.module.css` (`.sortButton`, `.sortArrow`), theme tokens only.
- **Tables made sortable:**

  | Table | Sortable columns | Default order (unchanged) |
  |---|---|---|
  | Players and plays → **Per game** | Game (text); all-time Finished runs and Starts; since-date Starts, Finished, Online matches, Play time (duration); players per kind (Google, Registered, Guest, Unknown) | Server order: all-time finished runs plus online matches, then plays, then id |
  | Players and plays → **Per player** | Player (text; "(no profile)" rows last), Kind (text, the localized kind name), Starts, Plays, Online, Play time (duration), Last played (date, never-played rows last) | Server order: plays plus online matches, then starts, then last played |
  | **Games** tab | Game (text), Plays (7 days), Votes (likes plus dislikes), Quality, Trend (games without a score last) | Catalog order |

  - The two-row group headings (`colgroup`, `colSpan`) stay as they were and are not sortable;
    only the leaf headings are. The per-game Game heading, which spans both rows, is sortable.
  - The per-player "#" column keeps numbering 1..n in the order shown. The Games column is not
    sortable.
  - The "Summary by player kind" table stays in its fixed kind order with its total row: it has
    four rows and is not sortable. The other admin tabs show lists, not tables.
- **CSV:** the per-game and per-player downloads export the rows in the order on screen, and the
  per-player rank in the file follows that order. `gameCsvRows` and `playerCsvRows` now take the
  rows to export instead of the whole report.
- **Admin Games tab:** the table moved into its own `GamesTable` component, so the sort hook runs
  only once the numbers have loaded.

Deviations: none. No dependency was added.

Tests:
- web `lib/admin/table-sort.test.ts` (15):
  - numbers both ways, and missing numbers last;
  - durations compared as seconds;
  - dates (times and `Date`s) with null and undefined last in both directions;
  - Turkish collation: "Cadı, Cuma, Çamur" in Turkish against "Cadı, Çamur, Cuma" in English;
    ı before i and I before İ, plus ğ, ö and ş;
  - numbers inside text ("Level 2" before "Level 10");
  - stable ties for numbers and text in both directions, and the input left unchanged;
  - the click rule: the first direction per kind, flipping on the same heading, starting afresh
    on another one;
  - the stored sort: a valid entry is read; nothing stored, an unknown column, a bad direction
    and a damaged entry are ignored; one key per table;
- web `lib/admin/play-report.test.ts`: updated for the new CSV helper signatures;
- the message test checks the two `admin.sort` keys in both locales;
- full run: shared 116, web 216, themes 16, adapter 30, firebase 232 passed and 3 skipped;
  `pnpm format:check`, `pnpm typecheck` and `pnpm --filter @ayvago/web build` pass;
- Playwright on `next dev`, with a temporary harness route that rendered the report and the Games
  table from made-up data (removed before the change; nothing ships):
  - Minimal light and dark, Cartoon and Arcade, at 1366×900 and 390×844, English and Turkish;
  - a sorted Games table, per-game table and per-player table; keyboard focus on a heading; the
    hover arrow;
  - the phone tables scroll horizontally inside their frame, with no page overflow;
  - `aria-sort` sits on the active headings only, and the button names are correct in both
    languages;
  - the sort survives a reload;
  - the CSV downloads follow the order on screen, in Turkish collation on `/tr`.

Owner steps: none. See the [setup doc](../setup/phase-5.md#525-sortable-admin-report-tables).

Still open: nothing.

## 5.26 Mobile menu drawer ✅

The owner asked for a hamburger menu on phones instead of the bottom tab bar, with every category
as on desktop. On phones the bar showed only Home, New, Recently played and Favorites; the
categories could not be reached from the navigation at all. The owner chose a drawer on phones,
a collapsible icon rail on tablets and no change on desktop. Contract and reasons:
[ADR 0025](../adr/0025-phone-menu-drawer.md).

**Breakpoints.** They stay where the side menu already changed, so the phone search icon, the
footer stacking and the other phone rules keep one boundary:

| Width | Navigation |
|---|---|
| below 640 px (phones) | ☰ in the top bar and a drawer |
| 640–1023 px (tablets, phones held sideways) | an icon rail with a toggle |
| 1024 px and wider (desktop) | the full side menu, unchanged |

What shipped (`components/shell`, `lib/shell/rail.ts`):
- **One menu, three shapes.** The menu content is one server component, `NavMenu`: Home, New,
  Recently played, Favorites, the CATEGORIES heading with every category that has games,
  Multiplayer while there are multiplayer games, and "Install the app" until the app is installed.
  The side menu and the drawer both render it, so they cannot drift apart. The active item is
  marked with `aria-current="page"` and the same highlight as on desktop.
- **Phones: the menu button.**
  - ☰ sits at the left of the top bar, before the logo: 44×44 px, "Open menu" / "Menüyü aç",
    `aria-expanded`, `aria-controls="menu-drawer"`, `aria-haspopup="dialog"`.
  - The top bar fits 320 px wide. The lockup is 106×26 px (was 122×30) and shrinks, down to
    64 px wide, when the actions need the room (the signed-in account trigger with its level
    chip, an invite bell). The bar gap is 6 px and the actions' gap 4 px.
- **Phones: the drawer** (`mobile-menu.tsx`).
  - A modal `<dialog>` (`showModal`, labelled "Menu" / "Menü") slides in from the left: 300 px
    wide, at most 85vw, full height with the safe areas, over a 50 % black backdrop.
  - At the top: the lockup (a link home) and a ✕ close button ("Close menu" / "Menüyü kapat").
    Then the menu in a `<nav>` ("Main navigation" / "Ana menü"), every item 44 px tall.
  - It closes on:
    - a tap on the backdrop;
    - the ✕ button;
    - Esc (the dialog's `cancel`, animated like the rest);
    - any link, the current page's included, and "Install the app", which opens its banner;
    - a left swipe on the drawer (at least 60 px, more sideways than vertical);
    - a route change, or the screen growing past phone width (a phone turned sideways gets the
      rail).
  - **Focus.** Opening focuses ✕. Tab and Shift+Tab wrap inside the drawer. Closing returns focus
    to ☰.
  - **Scroll lock.** `html[data-drawer-open]` sets `overflow: hidden` while it is open. The
    drawer itself scrolls with `overscroll-behavior: contain`.
  - **Motion.** A slide of the theme's `--motion-base` (160–220 ms) and a backdrop fade;
    closing uses `--motion-fast`. Under `prefers-reduced-motion` the slide becomes a fade, and
    the global reduced-motion rule makes it instant; closing then skips the animation.
  - **Themes.** Only semantic tokens (`--surface`, `--border`, `--accent`, `--text`). Arcade adds
    its 3 px black outline with a hard shadow, the red rule under the head, the pixelated lockup
    and the page's scanlines: the dialog sits in the top layer, above the page's own scanline
    overlay. Items use the body pixel font (Pixelify Sans) and the heading its uppercase style,
    as in the desktop side menu.
  - **Game pages.** ☰ is in the top bar, outside the game stage, so fullscreen (the stage) never
    shows it. While the drawer is open the page, the game's iframe included, is inert, and taps
    land on the backdrop. Nothing listens for keys or gestures while it is closed, and there is no
    edge-swipe zone over the game.
- **The bottom tab bar is gone** (`bottom-nav.tsx` deleted, with its CSS). The content's
  `88px + safe area` bottom padding is now `max(16px, safe area)`. The install banner, the ad
  consent notice and the invite toasts lost their 80 px phone offset: they sit 16 px above the
  bottom edge plus the safe area, as on larger screens. The phones' extra "Install the app" link
  at the end of every page is gone too: it lives in the drawer, as in the desktop menu.
- **Tablets: the rail** (`rail-toggle.tsx`, `lib/shell/rail.ts`).
  - Collapsed it is 72 px wide (was 76) with icons only. Every link has its label as
    `aria-label`. Hovering or focusing an icon shows the label in a tip beside the rail: a fixed
    element, because the rail clips overflow. It is decorative (`aria-hidden`), since the name is
    already the label. The rail now sits above the content column (`z-index: 15`) so the tip is
    not painted under the page.
  - A toggle at the top (☰ collapsed, a left chevron expanded; "Expand menu" / "Menüyü
    genişlet", "Collapse menu" / "Menüyü daralt", `aria-expanded`, `aria-controls="side-nav"`)
    expands the rail to the full 232 px menu with labels and the CATEGORIES heading. The grid
    column animates.
  - **Push, not overlay.** The expanded rail pushes the content over instead of covering it, so
    a player who prefers the labels can keep the menu open while browsing. That is why the choice
    is remembered.
  - Esc collapses it while focus is in the menu, and focus returns to the toggle.
  - **Remembered.** The choice is stored in `localStorage` (`ayvago-rail` = `expanded`;
    collapsed removes the key), with every access in try/catch. An inline head script
    (`RAIL_BOOTSTRAP_SCRIPT`) sets `html[data-rail="expanded"]` before the first paint, so the
    page never jumps. Other tabs follow through the `storage` event.
- **Desktop is unchanged.** The toggle and ☰ are hidden at 1024 px and wider, and a stored
  "expanded" has no effect there.
- **Logo ids.** `BrandLogo` takes an `idSuffix`, so the drawer's second lockup has its own mask
  and filter ids.
- **New message keys** (en and tr): `nav.menu`, `nav.openMenu`, `nav.closeMenu`,
  `nav.expandMenu`, `nav.collapseMenu`.

Deviations:
- **No "click outside" collapse on tablets.** The expanded rail pushes the content instead of
  covering it, so there is no backdrop. Collapsing it on every click in the page would undo the
  remembered choice whenever the player taps a game. It collapses with its toggle and with Esc.
- **The phones' "Install the app" link at the end of every page** is removed; the drawer has it,
  like the desktop menu.

Tests:
- web `lib/shell/rail.test.ts` (9):
  - the stored value parses only when it is exactly `expanded`;
  - storing and forgetting the choice;
  - blocked or missing storage never throws and reads as collapsed;
  - the head script marks `<html>` only for a stored `expanded`, also with blocked storage;
  - the left-swipe threshold;
- the message test checks the five new `nav` keys in both locales;
- full run: shared 116, web 210, themes 16, adapter 30, firebase 232 passed and 3 skipped;
  `pnpm format:check`, `pnpm typecheck` and `pnpm --filter @ayvago/web build` pass;
- Playwright on `next start` (122 checks, all passing):
  - **Phone, 390×844 touch:**
    - ☰ is 44×44 with its label and `aria-expanded`; no bottom bar;
    - the drawer is `:modal`, 300 px at the left edge, and focus lands on ✕;
    - the page scroll is locked;
    - the drawer has the same 14 links in the same order as the side menu, with the active item
      marked;
    - 80 Tab / Shift+Tab presses never leave the drawer;
    - Esc closes it and returns focus to ☰; the backdrop, ✕, a link (navigates to `/new` and
      marks it active), a link to the current page and a left swipe (CDP touch events) each close
      it;
    - reduced motion opens and closes without the slide;
    - on a game page ☰ is outside the stage, and a tap over the game hits the backdrop.
  - **No horizontal overflow**, and a top bar one line (60 px) tall that ends inside the screen,
    at 320, 360, 390 and 412 px. Checked in Minimal light (EN), Arcade (TR) and Cartoon light
    (TR) on the home, New, game, category and privacy pages, and with the drawer open.
  - **Signed-in top bar.** Firebase is off locally, so a mock of the signed-in account trigger
    (68 px) and of an invite bell was injected at 320, 360 and 412 px. The lockup shrinks to fit,
    except the bell case at 360 px (below).
  - **Tablet, 768×1024:**
    - no ☰; the rail is 72 px with labels hidden and `aria-label` on every icon;
    - hover and keyboard focus show the tip;
    - the toggle states and labels;
    - expanded is 232 px with labels, with no overflow;
    - the choice is stored and survives a reload and a navigation, with the active item marked;
    - Esc collapses it, returns focus to the toggle and forgets the choice.
  - **Desktop, 1366×900:** no ☰ or toggle (even with a stored "expanded"); the menu is 232 px.
    Against a build of `main`, the side menu, top bar and footer element screenshots and the
    layout boxes of the menu, main column, header and footer are identical in all five theme and
    mode combinations on the home, category, game and Turkish home pages. The only pixel
    differences, on the theme button of two game-page top bars, change from run to run.
  - Screenshots: the phone home with ☰, the drawer in Minimal light and dark, Cartoon light and
    dark and Arcade, in EN and TR, the end of the home page in Minimal and Arcade, a game page
    with and without the drawer, the tablet rail collapsed (with a tip) and expanded in all
    themes, and desktop.

Owner steps: none. See the [setup doc](../setup/phase-5.md#526-mobile-menu-drawer).

Still open:
- **An invite bell at 360 px.** With the signed-in account trigger *and* the invite bell (shown
  only while invites are pending) the phone top bar is about 12 px too wide below about 375 px,
  even with the smallest lockup. This was already the case before this slice (by about 44 px);
  the shrinking lockup made it smaller. A later fix could hide the level chip while the bell
  shows.
- **Real devices.** Checked in Chromium with touch emulation. iOS Safari's handling of
  `overflow: hidden` on `<html>` (scroll lock) and the dialog's top layer should be checked on a
  phone after the deploy.
