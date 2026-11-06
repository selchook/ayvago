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
