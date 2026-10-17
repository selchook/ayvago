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
- ⏳ **Revoke and rotate the Anthropic API key** (console.anthropic.com) — `.env` is committed in `game-factory` and `game-factory-new`; in `game-factory` the `VITE_` prefix bundles it into browser code
- ⏳ **Revoke the Ably key** — plain text in `src/App.jsx` of the public `battleships` repository
- ⏳ Restrict/rotate the other Ably keys (`backgammon`, `guess-number`, `tito-multiplayer`)
- 🤖 With approval: PRs removing `.env` from both game-factory repositories (`git rm --cached` + `.gitignore`)

## 3. Firebase
- ⏳ Create two projects: `ayvago-dev` and `ayvago-prod` (if those IDs are taken, share the actual IDs so `.firebaserc` can be updated)
- ⏳ Move both projects to the **Blaze** plan and set **budget alerts** (suggested: $10 / $25 / $50)
- ⏳ Create Firestore in **`europe-west1`** (Native mode) — cannot be changed later
- ⏳ Create the Realtime Database in `europe-west1`
- ⏳ Authentication: Anonymous, Google (Apple and email link in Phase 1)
- ⏳ Authentication → Settings → Authorized domains: `ayvago.com`, `www.ayvago.com`
- ⏳ Register a Web app → put the config values into Vercel environment variables (list in `apps/web/.env.example`)
- 🤖 Phase 1: rules, emulator tests, Functions

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
