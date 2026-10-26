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
4. ⏳ After a few days, Firebase console → App Check → **APIs → Cloud Functions** shows the share
   of verified requests (each session also records `appCheck: true/false`).
5. 🤖 When it is close to 100%, Claude flips `APP_CHECK_ENFORCED` in
   `firebase/functions/src/caller.ts` (slice 2.4). Unverified calls to every player-facing
   function (sessions, votes) are refused from then on.

## 3. Voting (slice 2.2, automatic)
- 🤖 Merging deploys `castVote`, `deleteMyData` and the hourly `recomputeRankings`. Nothing to set
  up. "Popular this week" and like percentages appear once the first hourly run has seen plays
  (like percentages need 20 votes per game).

## 4. Later in Phase 2
- ⏳ Grant yourself the `admin` custom claim (slice 2.3; a one-line script will be provided).
