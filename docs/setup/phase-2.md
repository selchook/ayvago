# Phase 2 — Owner Setup Checklist

Legend: ✅ done · ⏳ owner action · 🤖 Claude

Plan and status: [Phase 2 plan](../plan/phase-2.md).

## 1. Deploys (automatic)
- 🤖 Merging the Phase 2 branch into `main` deploys the new Cloud Functions (`startSession`,
  `finishSession`, `syncLeaderboardProfile`, `closeLeaderboardSeason`, `cleanupSessions`) and the
  Firestore rules **and indexes** from GitHub Actions. The existing deploy account roles cover
  this (`datastore.indexAdmin` deploys indexes; `cloudscheduler.admin` the new schedules).
- ⏳ After the first deploy, open Firebase console → Firestore → **Indexes** and wait until the
  four composite indexes show **Enabled** (a few minutes). Until then rank counts fail and the
  panel shows the board without the player's own rank.
- ⏳ Check on ayvago.com: play a run of at least 5 seconds; the toolbar shows "#1 this week" and
  the game page's leaderboard panel lists your name.

## 2. App Check (reCAPTCHA Enterprise)
App Check lets the functions tell real Ayvago pages from scripts. It is rolled out in two steps
so nobody is locked out by a misconfiguration.

1. ⏳ Google Cloud console, project `ayvago-prod` → **Security → reCAPTCHA** (enable the API if
   asked) → **Create key**: type **Website**, domains `ayvago.com`, `www.ayvago.com` and
   `ayvago-web.vercel.app` (add `localhost` only in `ayvago-dev`). Do not enable the
   "checkbox" challenge. Copy the **key ID**. It is public (it ships in the page), but still
   enter it only in the console and Vercel, not in chat.
2. ⏳ Firebase console → **App Check → Apps** → the Ayvago web app → **reCAPTCHA Enterprise** →
   paste the key ID → Save. Do **not** press "Enforce" for Cloud Functions or Firestore yet.
3. ⏳ Vercel → `ayvago-web` → Settings → Environment Variables (Production):
   `NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY` = the key ID. Redeploy. The build log shows
   `[ayvago] App Check enabled (reCAPTCHA Enterprise)`.
4. ⏳ After a few days, open `https://ayvago.com/en/admin` → **App Check**. It shows how many of
   the last 24 hours' game sessions carried a verified token. A share near 0% means steps 1–3
   are not complete yet.
5. ⏳ When the panel says **Ready** (at least 20 sessions, 95% or more verified), press **Turn on
   enforcement**. Unverified calls to every player-facing function (sessions, votes) are refused
   within a minute. **Back to monitoring** undoes it the same way, with no deploy.

Do **not** press "Enforce" in the Firebase console:
- For **Cloud Functions**, the console switch bypasses the panel's readiness check and its quick
  rollback.
- For **Firestore**, it would break the server-side read of `rankings/catalog` (the home shelves
  and like percentages). That read uses the REST API without an App Check token. The Firestore
  rules already decide who may read and write.

## 3. Voting (slice 2.2, automatic)
- 🤖 Merging deploys `castVote`, `deleteMyData` and the hourly `recomputeRankings`. Nothing to set
  up. "Popular this week" and like percentages appear once the first hourly run has seen plays
  (like percentages need 20 votes per game).

## 4. Admin role (slice 2.3)
1. ⏳ Give the deploy account the right to set roles. Google Cloud console → Cloud Shell:
   ```bash
   gcloud projects add-iam-policy-binding ayvago-prod \
     --member=serviceAccount:github-rules-deployer@ayvago-prod.iam.gserviceaccount.com \
     --role=roles/firebaseauth.admin --condition=None --quiet > /dev/null
   ```
2. ⏳ Sign in to ayvago.com with Google once (the account must exist).
3. ⏳ GitHub → `selchook/ayvago` → **Actions → Grant admin role → Run workflow**: your Google
   email, action `grant`. The email is only typed into that form; it is not stored in the
   repository.
4. ⏳ Open `https://ayvago.com/en/admin` and press **Refresh access** (or sign out and in). The
   account menu now shows **Admin panel**.
5. To remove the role, run the same workflow with `revoke`.

## 5. Space Defender touch controls (slice 2.5)
- ✅ selchook/space-defender#2 merged; the live game was redeployed.
- ⏳ Try it on your phone: open Space Defender on ayvago.com, press Play, and use the buttons
  in the bottom corners.

## 6. Game fixes
- ⏳ Review and merge selchook/chromashift#3 (ChromaShift fits phone screens; Vercel preview built).

## 7. Ayvago Arcade (slice 2.6)
The 26 in-house games live in `selchook/ayvago-games`, built with Claude. They are in the catalog
as "coming soon" until their origin is deployed.

1. ✅ GitHub: the repository `selchook/ayvago-games` is created and the games project is pushed.
2. ✅ Vercel → **Add New → Project** → import `selchook/ayvago-games`. Framework preset
   **Other**. Build settings come from `vercel.json` (`npm run build`, output `dist`). Project
   name `ayvago-games`, so the URL is `https://ayvago-games.vercel.app`. If you choose another
   domain, tell Claude: the catalog entries are regenerated with that origin.
3. ✅ Check one game directly, e.g. `https://ayvago-games.vercel.app/games/space-blaster/`. The
   Ayvago intro plays, then the menu appears.
4. ✅ 🤖 Claude regenerated `arcade-catalog.ts` with `--live` (`ARCADE_STATUS = 'live'`).
   Merging deploys the web app and the score functions with the new games.
5. ⏳ Check on ayvago.com: open an arcade game, play a run of at least 5 seconds; the score
   reaches the leaderboard panel.

To play them locally before the deploy: in `ayvago-games`, run
`npm run build && npx vite preview --port 4173`. In this repository, run
`AYVAGO_DEV_ARCADE_ORIGIN=http://localhost:4173 pnpm dev`.

## 8. Imported games parked (slice 2.7)
- 🤖 Nothing to set up. Merging redeploys the web app and the functions without the ten imported
  games. Their own Vercel deployments keep running, and their Firestore data stays.

## 9. Ayvago Arcade look (slice 2.8)
- 🤖 Nothing to set up. Merging deploys:
  - the web app, with the new categories, the Ayvago Arcade theme and the logo;
  - the Firestore rules, which accept the new theme;
  - the functions, because `packages/shared` changed.

## 10. Tiles, Arcade cards and PWA (slice 2.9)
- 🤖 Nothing to set up. Merging deploys the web app. Players can install Ayvago from the banner,
  or from the browser menu: "Install app" on Android and desktop, Share → "Add to Home Screen"
  on iOS.

## 11. Search, slogans, pixel logo and fixes (slice 2.10)
- 🤖 Nothing to set up. Merging deploys the web app.
- **Already installed with Edge on Android?** If the install button opened the App info screen:
  1. Allow "Home screen shortcuts" (on Xiaomi: Other permissions).
  2. Tap Install again.
  Or install from Chrome, which adds Ayvago as a full app.

## 12. Install link and equal-height cards (slice 2.11)
- 🤖 Nothing to set up. Merging deploys the web app.

## 13. Ayvago Arcade wave 2 (slice 2.12)
- 🤖 Nothing to set up. The 28 new games are already deployed on `ayvago-games.vercel.app`.
  Merging deploys:
  - the web app;
  - the Cloud Functions, because `packages/shared` changed. Score sessions accept the new games
    from then on.

## 14. Phone layout fix (slice 2.13)
- 🤖 Nothing to set up. Merging deploys the web app.

## 15. Edge-to-edge bars (slice 2.14)
- 🤖 Nothing to set up. Merging deploys the web app. An installed app may need to be closed and
  reopened once to pick up the new bar color.

## 16. Theme-aware manifest (slice 2.15)
- ⏳ **Reinstall the app once.** On the phone, remove Ayvago from the home screen, open ayvago.com
  in the theme you use and install it again. The navigation bar then takes that theme's color.
  Chrome would also refresh an installed app by itself within about a day. An app installed
  through Edge must be reinstalled.

## 17. System bar colors survive page changes (slice 2.16)
- 🤖 Nothing to set up. Merging deploys the web app. If the installed app was reinstalled while the
  colors were still being reset, reinstall it once more.

## 18. Automatic arcade catalog (slice 2.17)
1. ⏳ GitHub → `selchook/ayvago` → **Settings → Actions → General** → *Workflow permissions*: tick
   **Allow GitHub Actions to create and approve pull requests** → Save. Without it the "Sync arcade
   catalog" workflow fails at "Open or update the PR".
2. ⏳ After merging, run **Actions → Sync arcade catalog → Run workflow** once. With both repos in
   step it ends with "The catalog matches selchook/ayvago-games@…" and opens no PR.
3. From then on, merging new games in ayvago-games is enough: within an hour a PR "Sync the arcade
   catalog from ayvago-games" appears here. Merge it when its checks are green.
- 🤖 `ayvago-games.vercel.app` now redirects to ayvago.com; the developer portal is at
  `ayvago-games.vercel.app/portal/`.

## 19. Arcade default theme and platform agents (slices 2.18, 2.19)
- 🤖 Nothing to set up. New visitors see the Arcade theme; your own saved theme stays as it is.

## 20. Phone search icon (slice 2.20)
- 🤖 Nothing to set up. Merging deploys the web app.
