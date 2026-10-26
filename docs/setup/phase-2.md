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
