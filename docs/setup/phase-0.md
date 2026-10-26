# Phase 0 — Preparation Checklist

Legend: ✅ done · ⏳ owner action · 🤖 Claude

## 1. Repository and codebase
- ✅ Platform name **Ayvago**, domain **ayvago.com** purchased
- ✅ Monorepo scaffold (pnpm + Turborepo), `apps/web` (Next.js 16), `packages/shared` (`ayvago.json` manifest schema + tests)
- ✅ i18n foundation: next-intl, `/en` and `/tr` routes, message catalogs, language switcher, catalog completeness test
- ✅ CI: format, typecheck, test, build (`.github/workflows/ci.yml`)
- ✅ Firebase config and **deny-all** baseline rules (`firebase/`)
- ✅ ADRs 0001–0005
- ✅ GitHub repository `selchook/ayvago` (private) and initial push

## 2. Urgent security (do not wait)
- ✅ **Anthropic API key revoked** (console.anthropic.com) — the value has been cleared from `.env` in `game-factory` and `game-factory-new`, but the old key remains in git history; in `game-factory` the `VITE_` prefix also bundled it into browser code
- ⏳ **Revoke the Ably key** — plain text in `src/App.jsx` of the public `battleships` repository
- ⏳ Restrict/rotate the other Ably keys (`backgammon`, `guess-number`, `tito-multiplayer`)
- ✅ 🤖 PRs that stop tracking `.env` are open and waiting for merge: selchook/game-factory#1, selchook/game-factory-new#1
- ⏳ Move the Anthropic key server-side in `game-factory` (suggested as a separate task)

## 3. Firebase
- ✅ Create two projects: `ayvago-dev` and `ayvago-prod` (project id `ayvago-prod` confirmed)
- ✅ `ayvago-prod` on the **Blaze** plan · ⏳ **budget alerts** (Google Cloud → Billing → Budgets & alerts; suggested $10 / $25 / $50)
- ✅ Firestore in **`europe-west1`** (`ayvago-prod`)
- ✅ Realtime Database in `europe-west1` (`ayvago-prod`)
- ✅ Authentication: Anonymous and Google enabled (`ayvago-prod`); Apple and email link later
- ✅ Authorized domains: `ayvago.com`, `www.ayvago.com`
- ✅ `ayvago-prod` Web app registered and its config entered in Vercel (Production); guest and Google sign-in verified on the live site
- ⏳ `ayvago-dev` Web app → config into Vercel (Preview + Development)
- ✅ Firestore rules published to `ayvago-prod`
- 🤖 Firestore rules and indexes deploy automatically: `.github/workflows/deploy-firebase-rules.yml` tests them against the emulator and publishes them to `ayvago-prod` whenever `firebase/firestore.rules` or `firebase/firestore.indexes.json` changes on `main` (or when run manually from the Actions tab).
- ✅ One-time setup for the automatic deploy (done; first automatic deploy succeeded as `github-rules-deployer`):
  1. Google Cloud Console, project `ayvago-prod` → **IAM & Admin → Service Accounts → Create service account**, name `github-rules-deployer`. Roles: **Firebase Rules Admin**, **Cloud Datastore Index Admin** (the CLI reads the database metadata before deploying; no data access) and **Service Usage Consumer**. Roles can be added later under **IAM & Admin → IAM** (pencil icon next to the account).
  2. Open the account → **Keys → Add key → Create new key → JSON** (downloads a file).
  3. GitHub `selchook/ayvago` → **Settings → Secrets and variables → Actions → New repository secret**: name `FIREBASE_SERVICE_ACCOUNT_AYVAGO_PROD`, value: the whole JSON file. Then delete the downloaded file. Never paste the key into chat or commit it.
- ✅ First functions deploy succeeded (`reserveUsername`, `mergeGuestAccount`, `cleanupGuests`).
- 🤖 Cloud Functions deploy automatically: `.github/workflows/deploy-functions.yml` runs the rules and functions emulator tests and deploys `firebase/functions` to `ayvago-prod` when the functions or `packages/shared/src` change on `main` (or manually).
- ✅ Roles for the deploy account and the build account, granted from Cloud Shell (idempotent; the last command lists the deploy account's roles). Note: an account that can deploy functions can effectively reach all project data through the code it deploys, so treat this key like an owner credential and rotate it if it might have leaked:
  ```bash
  SA=serviceAccount:github-rules-deployer@ayvago-prod.iam.gserviceaccount.com
  for role in firebaserules.admin datastore.indexAdmin serviceusage.serviceUsageAdmin firebase.viewer \
      cloudfunctions.admin run.admin iam.serviceAccountUser cloudscheduler.admin artifactregistry.admin; do
    gcloud projects add-iam-policy-binding ayvago-prod --member="$SA" --role="roles/$role" --condition=None --quiet > /dev/null
  done
  # 2nd-gen functions build as the default compute service account.
  gcloud projects add-iam-policy-binding ayvago-prod \
    --member=serviceAccount:566724065070-compute@developer.gserviceaccount.com \
    --role=roles/cloudbuild.builds.builder --condition=None --quiet > /dev/null
  gcloud projects get-iam-policy ayvago-prod --flatten="bindings[].members" \
    --filter="bindings.members:github-rules-deployer" --format="value(bindings.role)"
  ```
- ✅ Enable the APIs once as the project owner (the deploy account could not enable them). Google Cloud console → **Activate Cloud Shell** (top right), then:
  ```bash
  gcloud services enable cloudfunctions.googleapis.com cloudbuild.googleapis.com \
    artifactregistry.googleapis.com run.googleapis.com eventarc.googleapis.com \
    pubsub.googleapis.com cloudscheduler.googleapis.com compute.googleapis.com \
    --project ayvago-prod
  ```
  (`compute.googleapis.com` creates the default compute service account that 2nd-gen functions run and build as.)
- Fallback without CI: paste `firebase/firestore.rules` into Firebase console → Firestore → Rules → Publish, or run `npx firebase deploy --only firestore:rules --project prod` from `firebase/` after `npx firebase login`.
- 🤖 Rules and emulator tests (`pnpm --filter @ayvago/firebase test`), client auth

## 4. Vercel and domain
- ✅ Vercel project `ayvago-web` from `selchook/ayvago`, **Root Directory = `apps/web`** (previews: `ayvago-web-*.vercel.app`; add a preview domain to Firebase Authorized domains to test sign-in there)
- ⏳ Point `ayvago.com` DNS to Vercel (apex + `www` → apex redirect)
- ⏳ Email DNS records: SPF, DKIM, DMARC (Firebase Auth emails and the support address)
- ⏳ List the games' production URLs (for the import plan)

## 5. Cloudflare
- ⏳ Cloudflare account → **Realtime → TURN** → create a TURN key
- ⏳ **Do not paste** the Key ID and API token into chat; in Phase 4 enter them yourself with `firebase functions:secrets:set CF_TURN_KEY_ID` and `CF_TURN_TOKEN`

## 6. Revenue applications (long approval times — start early)
- ⏳ Google AdSense account + `ayvago.com` site verification
- ⏳ **H5 Games Ads** (Ad Placement API) application
- ⏳ Paddle or Lemon Squeezy seller application (confirm they accept sellers based in Turkey)
- ⏳ Business entity decision (sole proprietor vs company) for payouts

## 7. Open decisions
- ⏳ Rewarded ads for `remove_ads` owners: optional ads or direct rewards?
- ✅ Default locale: `en` (decided)
- ⏳ Push gamehub-arena to GitHub to reuse UI components — optional
