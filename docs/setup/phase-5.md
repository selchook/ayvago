# Phase 5 — Owner Setup Checklist

Legend: ✅ done · ⏳ owner action · 🤖 Claude

Plan and status: [Phase 5 plan](../plan/phase-5.md).

## 5.1 Player characters
**Nothing to set up.** There are no new secrets, env vars, roles or Firebase services.

- 🤖 Merging deploys everything automatically:
  - the web app (the profile's Character section, `character` and `peerCharacter` in `GHA_START`);
  - the Firestore rules (`characterId` on the profile);
  - the Realtime Database rules (`hostCharacter` and `guestCharacter` in rooms). This uses the
    deploy role from [Phase 4 setup §2](phase-4.md#2-realtime-database-rules); if that step is
    still open, the rules run fails until the role is granted (then re-run it from Actions).
- Optional check after the deploy: open **Profile and settings** on ayvago.com, pick a character
  and reload. The choice stays marked. Games show it once the studio has added support for them,
  starting with Jetpack Rush.

## 5.1b Five characters
**Nothing to set up.** There is no data migration: profiles and rooms that still hold an alien
character read as "not chosen", and the player can pick again.

- 🤖 Merging deploys the web app and both rules files (Firestore and Realtime Database) through the
  same GitHub Actions runs as 5.1.
- Optional check after the deploy: **Profile and settings** shows five characters. A player who
  had picked an alien sees Adventurer marked.

## 5.2 Achievements, XP and levels
**Nothing to set up.** There are no new secrets, env vars, Firebase services or Firestore indexes.

- 🤖 Merging deploys everything automatically:
  - the web app (level chip, the profile's Progress section, the notes after a run);
  - the Cloud Functions (`finishSession`, `mergeGuestAccount`, `deleteMyData`, `cleanupGuests`);
  - the Firestore rules (`users/{uid}/progress/summary`, read-only for its owner and admins).
- Progress starts at zero for everyone: runs played before the deploy are not counted.
- Optional check after the deploy:
  1. Play any game for at least 20 seconds and finish it. "+… XP" and the unlocked
     achievements appear one after another at the top of the game.
  2. The level chip next to your avatar in the top bar shows your level.
  3. **Profile and settings** has a **Progress** section with your level, XP bar and badges.

## 5.6 Equal card heights
**Nothing to set up.** CSS only; merging deploys the web app.

- Optional check after the deploy: switch to the minimal or cartoon theme (theme button in the top
  bar) and look at the home shelves and a category page. Every card in a row has the same height.

## 5.7 Turkish İ in the pixel font
**Nothing to set up.** The font ships with the web app; its license (SIL OFL 1.1) is in
`apps/web/fonts/ayvago-pixel-tr/OFL.txt` and in [docs/assets/LICENSES.md](../assets/LICENSES.md).

- Optional check after the deploy: open ayvago.com in Turkish with the arcade theme. The heading
  "AYVAGO'DA YENİ" shows a full-height İ with a dot, not a short "i".

## 5.8 Landscape games go fullscreen in landscape
**Nothing to set up.** Merging deploys the web app.

- Optional check after the deploy, on an Android phone in Chrome (or the installed app), held
  upright:
  - open a landscape game (Tito's Tank, Archery, Head Soccer), press Play, then the fullscreen
    button: the screen turns to landscape at once;
  - leave fullscreen: the phone follows its own orientation again;
  - a portrait game (Sudoku) stays upright in fullscreen.

## 5.9 One-line game toolbar on phones
**Nothing to set up.** CSS and markup only; merging deploys the web app.

- Optional check after the deploy: open a game you have a best score in on a phone. The trophy, the
  score and all the buttons sit on one line under the game.

## 5.10 The game stage fits on screen
**Nothing to set up.** CSS only; merging deploys the web app.

- Optional check after the deploy: hold a phone sideways and open Tito's Tank without fullscreen.
  The whole game shows, including the FIRE button at the bottom right.

## 5.11 Three themes, Minimal by default
**Nothing to set up.** Merging deploys the web app, and the Firestore rules deploy from GitHub
Actions as usual.

- Optional check after the deploy: open ayvago.com in a private window. It shows the Minimal
  theme, light or dark like your system. A browser that had Retro selected now shows Arcade.

## 5.12 Game tables for up to four, with bots
**Nothing to set up.**
- Merging deploys the web app.
- The Realtime Database rules (`tables`, `tableMoves`) and the updated `cleanupRooms` function
  deploy from GitHub Actions as usual.
- Tables use no TURN credentials.

- Optional check once Turkish Okey is in the catalog (after its "Sync arcade catalog" PR):
  1. Open Okey and choose "Play at a table".
  2. Copy the link to a second browser; the friend takes seat 2.
  3. Add two bots and start the game; both screens show the same table.

## Games origin moved to ayvago-games-nine.vercel.app
The studio now deploys from a new Vercel project under the ayvagogames account
(`https://ayvago-games-nine.vercel.app`, [ADR 0007](../adr/0007-ayvago-arcade.md)).
- 🤖 The studio regenerated its manifests and catalog with the new origin; the "Sync arcade
  catalog" PR brings `ARCADE_ORIGIN` here. The catalog test reads `ARCADE_ORIGIN`, so it follows.
- ⏳ After the sync PR is merged, open one game on ayvago.com and check that it loads.
- ⏳ Once the new projects work, disconnect or delete the old Vercel projects (`ayvago-games`,
  `ayvago-web` under the previous account) so each push deploys only once.
