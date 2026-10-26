# Phase 1 — Owner Setup Checklist

Legend: ✅ done · ⏳ owner action · 🤖 Claude

Plan and status: [Phase 1 plan](../plan/phase-1.md). The detailed commands for the Firebase deploy
account are in the [Phase 0 setup checklist §3](phase-0.md#3-firebase); this page lists what Phase 1
needed from the owner, in order.

## 1. Games
- ✅ Production URLs of the games confirmed, recorded in `packages/shared/src/seed-catalog.ts`.
- ✅ Integration PRs merged in every wave 1 and wave 2 game repository; Vercel redeployed them.
  The changes in each repository:
  - the platform adapter in `src/ayvago/`;
  - the CrazyGames SDK removed;
  - `frame-ancestors` allowing Ayvago;
  - `public/ayvago.json`, plus the cover and the icon.
- ✅ Gameplay covers merged (one PR per game).

## 2. Firebase (`ayvago-prod`)
- ✅ Authentication: **Anonymous** and **Google** providers enabled.
- ✅ Authorized domains: `ayvago.com`, `www.ayvago.com` (add a preview domain to test sign-in on
  a Vercel preview).
- ✅ Web app registered. Its config is in Vercel → `ayvago-web` → Environment Variables
  (Production), under exactly these names:
  - `NEXT_PUBLIC_FIREBASE_API_KEY`
  - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
  - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
  - `NEXT_PUBLIC_FIREBASE_APP_ID`
  - `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
  - `NEXT_PUBLIC_FIREBASE_DATABASE_URL`

  Values go without quotes or commas. The build log prints
  `[ayvago] Account features enabled (Firebase project ayvago-prod)` and warns about malformed
  values.
- ✅ **Blaze** plan (needed for Cloud Functions). ⏳ Budget alerts: Google Cloud → Billing → Budgets
  & alerts ($10 / $25 / $50).
- ⏳ `ayvago-dev`: same providers and a web app; its config in Vercel **Preview** and
  **Development** environments, so previews never touch production data.

## 3. Automatic deploys (GitHub Actions)
- ✅ Service account `github-rules-deployer` with a JSON key stored only in the GitHub secret
  `FIREBASE_SERVICE_ACCOUNT_AYVAGO_PROD`. Never paste it into chat or commit it.
- ✅ Cloud Functions APIs enabled once by the owner, and the deploy and build roles granted. The
  Cloud Shell commands are in [Phase 0 setup §3](phase-0.md#3-firebase).
- 🤖 Rules, indexes and functions deploy on every push to `main` after the emulator tests pass.

## 4. Check on the live site
- ✅ Guest name appears after pressing Play; Google sign-in keeps the guest's library.
- ⏳ Change your username once on `/profile` (30-day cooldown afterwards) and try the guest merge:
  play as a guest in a private window, then sign in with your existing Google account.
