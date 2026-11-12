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

## 5.18 A lobby for table games (Okey first)
Merging deploys the web app (lobby page, invite notifications, the profile's "Table invites"
switch). Two GitHub Actions runs publish the rest:
- **"Deploy Firestore and Realtime Database rules":** the new Realtime Database paths (`lobby`,
  `presence/lobbies`, `invites`, `inviteQuota`, `tables/*/visibility`) and the profile's
  `invitesOff` field. The change touches `firebase/database.rules.json` and
  `firebase/firestore.rules`.
- **"Deploy Cloud Functions":** the new **`syncLobbyTable`** trigger and the updated
  `cleanupRooms`. The change touches `firebase/functions/**` and `packages/shared/src/**`.

No secrets, env vars or indexes are needed.

- ⏳ **Once, before or right after merging: let event-triggered functions run.**
  `syncLobbyTable` is the project's first function triggered by a database event (Eventarc).
  Such functions need three roles that the scheduled and callable functions never needed. The
  Firebase CLI tries to grant them during the deploy, but the deploy account is not allowed to
  change IAM, so the "Deploy Cloud Functions" run fails with "We failed to modify the IAM
  policy" until they exist. Grant them as the project owner in Google Cloud console → **Activate
  Cloud Shell** (idempotent, safe to run twice):
  ```bash
  PROJECT=ayvago-prod
  NUMBER=566724065070
  gcloud projects add-iam-policy-binding $PROJECT \
    --member=serviceAccount:service-$NUMBER@gcp-sa-pubsub.iam.gserviceaccount.com \
    --role=roles/iam.serviceAccountTokenCreator --condition=None --quiet > /dev/null
  for role in run.invoker eventarc.eventReceiver; do
    gcloud projects add-iam-policy-binding $PROJECT \
      --member=serviceAccount:$NUMBER-compute@developer.gserviceaccount.com \
      --role=roles/$role --condition=None --quiet > /dev/null
  done
  ```
  Then re-run **Actions → Deploy Cloud Functions → Run workflow** if the run after the merge
  failed. If the log still names a missing permission, send the error line (not the key) to
  Claude.
- **Until `syncLobbyTable` runs**, the lobby's table list stays empty. Presence, invites,
  notifications and sitting down through a link work anyway.
- Optional check after the deploy:
  1. Open `https://ayvago.com/tr/games/okey` and choose **Lobiye git**.
  2. Open the same page in a second browser (or a private window).
  3. Each sees the other under **Şu an çevrimiçi**.
  4. Press **Davet et** in one browser. It opens a table, and the other browser gets the invite
     toast with a soft sound.
  5. **Katıl** seats the second player at the table.
  6. A third browser sees the table under **Masalar** and can sit down with **Otur**.

## 5.19 Quick play, table settings and host hand-over
Nothing to set up on the platform. Merging deploys the web app, and the usual workflows publish the rest:
- **"Deploy Firestore and Realtime Database rules":** `tables/*/settings`, `startAt`, the
  hand-over rule on `hostUid`, and the new `quickPlay/{gameId}` pointer.
- **"Deploy Cloud Functions":** `syncLobbyTable` now lists the settings, and `cleanupRooms` also
  removes old quick-play pointers.

No new function, secret, env var or index is needed. (The one-time IAM step of 5.18 must be done
for `syncLobbyTable` to run.)
- ⏳ Then merge the studio PR in `selchook/ayvago-games` that copies adapter 2.7.0. The studio's
  adapter check fails until its copy matches. The same PR (or a later one) makes Okey use the
  settings, take over the bots after `GHA_HOST_CHANGE` and play a leaver's seat as a bot. Until
  then Okey keeps its own 5 hands and no turn timer, and a hand-over during a game leaves the bots
  unplayed (multiplayer spec §7c).

Optional check after the deploy:
1. Open `https://ayvago.com/tr/games/okey` in two browsers and press **Hızlı oyna** in both at about
   the same time. Both land at the same table, which counts down from 20 and starts with two bots.
2. Open a table from the lobby with **Masa aç**, pick 11 el / Rahat · 60 sn. The other browser sees
   "11 el · Hamle başına 60 sn" on the table in the lobby.
3. With two players at a table, close the host's browser. After about 15 seconds the other one
   sees "Masa sahibi ayrıldı, artık masanın sahibi sensin".

## 5.20 Leave table
**Nothing to set up.** Merging deploys the web app, and the usual **"Deploy Firestore and Realtime
Database rules"** workflow publishes the one rule change (the `tables/*/hostLeft` marker). No
function, secret, env var or index is new, and the studio needs no change.

Optional check after the deploy:
1. Open a table on `https://ayvago.com/tr/games/okey` in two browsers. In the second, press
   **Masadan ayrıl** → **Ayrıl**: it lands in the lobby, and the first browser shows the seat as
   empty.
2. Sit down again, then press **Masadan ayrıl** in the host's browser. The other browser shows
   "Masa sahibi ayrıldı, artık masanın sahibi sensin" within a second (no 15-second wait).
3. Press **Masadan ayrıl** at a table where you sit alone: the table disappears from the lobby.

## 5.21 Site-wide online status and recent players
Nothing to set up by hand. Merging deploys the web app, and the usual workflows publish the rest:
- **"Deploy Firestore and Realtime Database rules":**
  - the new `presence/site/{uid}` path and the wider invite rule (`firebase/database.rules.json`);
  - `users/{uid}/recentPlayers` (owner read) and the profile's `hideOnline` field
    (`firebase/firestore.rules`);
  - a single-field index exemption for `recentPlayers.uid` at collection-group scope
    (`firebase/firestore.indexes.json`). Firestore builds it in the background, within minutes.
    Until then, deleting an account cannot clear the player from other players' lists.
- **"Deploy Cloud Functions":**
  - the new **`recordRoomPlayers`** trigger;
  - the updated `syncLobbyTable`, `deleteMyData`, `cleanupGuests` and `mergeGuestAccount`.

  `recordRoomPlayers` is the second event-triggered (Eventarc) function. The one-time IAM
  bindings of 5.18 cover it, so no new grant is needed. If the run still fails with "We failed to
  modify the IAM policy", re-run the 5.18 Cloud Shell commands above (they are idempotent), then
  re-run the workflow.

No secrets or env vars are needed.

- ⏳ **Optional check after the deploy:**
  1. In two browsers (or one private window), play an Okey table together: one opens a table from
     the lobby, the other sits down, the host presses **Botlarla hemen başlat**.
  2. Each sees the other under **Son oynadıkların** in the lobby and on the profile page.
  3. The second browser opens only the home page and taps anywhere. In the first browser's
     profile it shows as **Çevrimiçi** with **Davet et**.
  4. **Davet et** opens a table, and the second browser gets the invite toast on the home page.
  5. In the second browser, turn off **Profil → Çevrimiçi durumu → Çevrimiçi görün**. After a
     reload the first browser shows it as **Çevrimdışı**, without the invite button.

## 5.22 Play report counts starts, online matches and abandoned runs
Nothing to set up by hand. Merging deploys the web app, and the usual workflows publish the rest:
- **"Deploy Cloud Functions":**
  - the new callable **`abandonSession`** (the game page reports runs the player left; on tab
    close it is sent as a `keepalive` request to the same URL the SDK uses, so no CORS, CSP or
    hosting change is needed);
  - the updated `startSession`, `cleanupSessions`, `syncLobbyTable`, `recordRoomPlayers`,
    `mergeGuestAccount` and `getPlayReport`. The two triggers keep their event types, so no new
    IAM grant is needed.
- **"Deploy Firestore and Realtime Database rules":** one new composite index,
  `sessions (status ASC, startedAt ASC)` in `firebase/firestore.indexes.json`, for the nightly
  expiry of unfinished sessions. Firestore builds it in the background within minutes; until
  then that step of `cleanupSessions` logs an error and the old-session cleanup still runs.
  No rule changes.

No secrets, env vars or studio changes.

- ⏳ **Before merging:** set `EXTENDED_STATS_SINCE` in `packages/shared/src/play-report.ts` to the
  day the slice is deployed (UTC). The report uses it to say from when starts per player, online
  matches and the time of left runs are counted.
- ⏳ **Optional check after the deploy:**
  1. Play a few seconds of a game on ayvago.com, then close the tab without finishing.
  2. Play an Okey table (with bots is enough).
  3. In **Yönetim paneli → Oyuncular ve oynanma**, run the report: your row shows the starts, an
     online match and some play time. The Progress report workflow lists the left run as
     `abandoned`.

## 5.23 Site footer
**Nothing to set up.** Merging deploys the web app. There are no new secrets, env vars, functions,
rules or studio changes. The footer's Contact link uses the same privacy address as the privacy
page (`NEXT_PUBLIC_PRIVACY_CONTACT`, default `ayvagogames@gmail.com`).

Optional check after the deploy: scroll to the end of any page on ayvago.com. The footer shows
"© 2026 Ayvago Games. Tüm hakları saklıdır." with **Gizlilik · Çerez tercihleri · İletişim** on
the right (stacked under it on a phone), and the side menu no longer lists Gizlilik.

## 5.24 Game card art
Nothing to configure: no secrets, env vars, functions or rules. Merging deploys the web app. Until
the studio's card art arrives, every tile looks as it does today. The one owner step is the merge
order:

- ⏳ **Merge this platform PR before the catalog sync that adds the cards.** The studio's change
  adds `card` and `card2x` to every game in `arcade-catalog.ts`. The manifest schema is strict, so
  a platform without this change rejects those manifests: that "Sync arcade catalog" PR would
  fail CI. Order:
  1. Merge this PR.
  2. Merge the studio PR. Its CI checks the manifests against its vendored copy of
     `packages/shared/src/manifest.ts`, so the studio copies the new file into
     `scripts/vendor/manifest.ts` (verbatim) in the same PR.
  3. Run **Actions → Sync arcade catalog → Run workflow** (or wait for the hourly run), then
     merge the PR it opens.
- ⏳ **Optional check after the sync is deployed:** open ayvago.com in the Minimal or Cartoon
  theme. The tiles show in-game art with a small logo instead of the cover banner. Hovering a tile
  on a computer zooms the image and shows a round play button. In the Arcade theme the tiles look
  as before.

## 5.25 Sortable admin report tables
**Nothing to set up:** no secrets, env vars, functions, rules or roles. Merging deploys the web
app.

Optional check after the deploy: open `/admin` → **Players and plays** ("Oyuncular ve oynanma"),
run the report and click a column heading (for example **Oynanma**). The rows sort by it and an
arrow marks the column; a second click reverses the order. **Download CSV** ("CSV indir") then saves the rows
in the order shown. The choice stays until the browser is closed.

## 5.26 Mobile menu drawer
**Nothing to set up.** Merging deploys the web app. There are no new secrets, env vars, functions,
rules or studio changes.

Optional check after the deploy, on a phone: open ayvago.com. The bottom tab bar is gone; tap ☰
at the left of the top bar. The menu slides in from the left with every category; tap a category,
the backdrop or ✕ to close it. On a tablet (or a computer window about 800 px wide) the left rail
shows icons; the ☰ at its top expands it, and the choice stays after a reload.

## Checking that runs are recorded (read-only)
Actions → **Progress report** → Run workflow (optional: days, default 7). It reads Firestore with
the deploy service account and writes a table to the run summary: score sessions by status,
leaderboard entries and XP, split into guest, Google and registered players. Numbers only, no
names or ids; nothing is changed.

