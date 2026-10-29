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
| 5.2 | Achievements, XP and levels, badges | ⬜ |
| 5.3 | Daily quests, login streaks | ⬜ |
| 5.4 | FCM web push (localized) | ⬜ |
| 5.5 | Cloud saves (`GHA.cloud`), coins and a cosmetic store | ⬜ |

## 5.1 Player characters ✅

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
