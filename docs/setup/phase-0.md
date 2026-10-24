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
- ⏳ **Revoke and rotate the Anthropic API key** (console.anthropic.com) — the value has been cleared from `.env` in `game-factory` and `game-factory-new`, but the old key remains in git history; in `game-factory` the `VITE_` prefix also bundled it into browser code
- ⏳ **Revoke the Ably key** — plain text in `src/App.jsx` of the public `battleships` repository
- ⏳ Restrict/rotate the other Ably keys (`backgammon`, `guess-number`, `tito-multiplayer`)
- ✅ 🤖 PRs that stop tracking `.env` are open and waiting for merge: selchook/game-factory#1, selchook/game-factory-new#1
- ⏳ Move the Anthropic key server-side in `game-factory` (suggested as a separate task)

## 3. Firebase
- ✅ Create two projects: `ayvago-dev` and `ayvago-prod` (project id `ayvago-prod` confirmed)
- ⏳ Move both projects to the **Blaze** plan and set **budget alerts** (suggested: $10 / $25 / $50). Not needed yet: the current account features run on Spark; Blaze is required once Cloud Functions ship (username changes, guest merge, score validation, purchases, TURN)
- ✅ Firestore in **`europe-west1`** (`ayvago-prod`)
- ✅ Realtime Database in `europe-west1` (`ayvago-prod`)
- ✅ Authentication: Anonymous and Google enabled (`ayvago-prod`); Apple and email link later
- ✅ Authorized domains: `ayvago.com`, `www.ayvago.com`
- ✅ `ayvago-prod` Web app registered and its config entered in Vercel (Production); guest and Google sign-in verified on the live site
- ⏳ `ayvago-dev` Web app → config into Vercel (Preview + Development)
- ✅ Firestore rules published to `ayvago-prod` (pasted in the console)
- ⏳ **Deploy the Firestore rules** whenever `firebase/firestore.rules` changes (until CI deploys them). From the repository root:
  ```bash
  pnpm install
  cd firebase
  npx firebase login
  npx firebase deploy --only firestore:rules --project prod
  npx firebase deploy --only firestore:rules --project dev
  ```
  Without this step the console's default rules deny every write and guest profiles cannot be created.
- 🤖 Rules and emulator tests (`pnpm --filter @ayvago/firebase test`), client auth

## 4. Vercel and domain
- ⏳ New Vercel project from `selchook/ayvago`, **Root Directory = `apps/web`**
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
