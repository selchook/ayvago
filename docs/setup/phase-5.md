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

## 5.13 Fresh start: progress reset and server-synced bests
Decision record: [ADR 0017](../adr/0017-server-best-and-fresh-start.md). There are no new secrets,
env vars, Firebase services, rules or indexes.

- 🤖 Merging deploys the web app (server best in `GHA_START`, protocol 2.4, and in the toolbar)
  and the Cloud Functions (`finishSession` returns `previous`) through GitHub Actions as usual.
- ⏳ **1. Give the deploy account Firestore data access.** Its roles only cover deploys, so the
  reset would stop with `PERMISSION_DENIED`. Google Cloud console → **Activate Cloud Shell**,
  then:
  ```bash
  gcloud projects add-iam-policy-binding ayvago-prod \
    --member=serviceAccount:github-rules-deployer@ayvago-prod.iam.gserviceaccount.com \
    --role=roles/datastore.user --condition=None --quiet > /dev/null
  ```
- ⏳ **2. Merge this PR** (slice 5.13).
- ⏳ **3. Merge the studio PR that adopts protocol 2.4** in `selchook/ayvago-games` (the games use
  `config.best` instead of their own `localStorage` best), and wait for its Vercel deploy.
- ⏳ **4. Review pending score flags** in `/admin` → **Flagged scores** and decide them. Flags
  are not reset; approving one after the reset would put a pre-reset score on the new boards.
- ⏳ **5. Run "Reset progress"**: GitHub → **Actions → Reset progress → Run workflow**.
  1. First a dry run: `confirm` = `RESET ALL PROGRESS`, **dry_run** ticked (the default). It
     deletes nothing; the run's summary lists how many documents each category holds. Read the
     counts.
  2. Then the reset: `confirm` = `RESET ALL PROGRESS`, **dry_run** unticked. It backs up first,
     then deletes leaderboards, play stats, XP, levels and achievements, the account copies of
     best scores and score sessions. Profiles, favorites, votes, game counters, rankings,
     usernames, roles and bans stay.
  - The job refuses to start unless `confirm` is exactly that phrase, for dry runs too.
- ⏳ **6. The backup** is the artifact `progress-backup-<run id>-reset` on the run's page, kept for
  **90 days**. It is one JSON file (Timestamps as ISO strings) and holds player names and scores,
  so download it only when needed. There is no restore script; ask Claude to write one if a
  restore is ever needed.
- Optional check after the reset: open a game you had a best score in. The toolbar shows no best,
  the leaderboard is empty, and the header shows level 1. Finish a run, then a better one: only
  the second shows "Personal best!".

## Games origin moved to ayvago-games-nine.vercel.app
The studio now deploys from a new Vercel project under the ayvagogames account
(`https://ayvago-games-nine.vercel.app`, [ADR 0007](../adr/0007-ayvago-arcade.md)).
- 🤖 The studio regenerated its manifests and catalog with the new origin; the "Sync arcade
  catalog" PR brings `ARCADE_ORIGIN` here. The catalog test reads `ARCADE_ORIGIN`, so it follows.
- ⏳ After the sync PR is merged, open one game on ayvago.com and check that it loads.
- ⏳ Once the new projects work, disconnect or delete the old Vercel projects (`ayvago-games`,
  `ayvago-web` under the previous account) so each push deploys only once.

## 5.14 One sound switch
**Nothing to set up.** Merge this PR, then the studio PR that adopts adapter 2.5.0.

## 5.15 Difficulty: easy runs are practice
**Nothing to set up** beyond merging this PR: merging deploys the web app and the Cloud
Functions (`finishSession` accepts `practice`) through GitHub Actions as usual. No rules,
indexes or secrets change.
- ⏳ Then merge the studio PR in `selchook/ayvago-games` that adopts adapter 2.6.0 and adds the
  Easy / Normal choice to the games' menus. Until it is merged, every run is Normal and ranked,
  as before.

## 5.16 Players and plays report
**Nothing to set up** beyond merging this PR: merging deploys the web app, and the "Deploy Cloud
Functions" workflow publishes the new `getPlayReport` function (the change touches
`firebase/functions/**` and `packages/shared/src/**`). No rules, indexes, secrets or roles change.

To open the report:
1. Sign in on ayvago.com with an account that has the `admin` role (granted with
   `firebase/functions/scripts/set-admin.mjs`, see the Phase 2 setup checklist).
2. Go to `/admin` (for example `https://ayvago.com/tr/admin`) and open the **Players and plays**
   tab ("Oyuncular ve oynanma").
3. Press **Run report**. It reads the live data each time (a few seconds); **Download CSV** saves
   the per-game and per-player tables.

Per-player numbers start on 2026-11-07, the day of the progress reset; the per-game all-time
columns count every run since launch.

## 5.17 Spotlight carousel: trending today
**Nothing to set up** beyond merging this PR: merging deploys the web app, and the "Deploy Cloud
Functions" workflow publishes the updated `recomputeRankings` (the change touches
`firebase/functions/**` and `packages/shared/src/**`). No rules, indexes, secrets or roles change.

- The ranking job runs every hour. Until its first run after the deploy the spotlight shows this
  week's popular games and the featured games; after it, the games played most in the last
  24 hours. The home page refreshes its copy of the rankings within the hour after that.
- Optional check after the deploy: open ayvago.com. The Spotlight is a carousel of three games
  with a "#1 Trending today" badge on the first; it moves to the next game every 5 seconds,
  stops while the mouse is over it, and on a phone it can be swiped.

## Checking that runs are recorded (read-only)
Actions → **Progress report** → Run workflow (optional: days, default 7). It reads Firestore with
the deploy service account and writes a table to the run summary: score sessions by status,
leaderboard entries and XP, split into guest, Google and registered players. Numbers only, no
names or ids; nothing is changed.

