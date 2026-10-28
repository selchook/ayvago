# Phase 4 — Owner Setup Checklist

Legend: ✅ done · ⏳ owner action · 🤖 Claude

Plan and status: [Phase 4 plan](../plan/phase-4.md).

## 1. Cloudflare TURN
Without TURN, players on the same kind of home network still connect directly, and everyone else
plays through the database relay, which is fine for turn-based games but laggy for Neon Pong and
Air Hockey. TURN fixes that for mobile carriers and office networks.

1. ⏳ Cloudflare dashboard → **Realtime** → **TURN Server** → **Create** (any name, e.g.
   `ayvago`). Copy the **Turn Token ID** and the **API Token**. Do not paste them into chat.
2. ⏳ Vercel → `ayvago-web` → Settings → Environment Variables, environment **Production** (and
   Preview if you want TURN on preview links):
   - `CF_TURN_KEY_ID` = the Turn Token ID
   - `CF_TURN_API_TOKEN` = the API Token

   Both are server-only (no `NEXT_PUBLIC_` prefix); they never reach the browser.
3. ⏳ Redeploy (Deployments → the latest production deployment → Redeploy).
4. ⏳ Check: open a room, then `https://ayvago.com/api/ice-servers` in the same browser shows
   `"unauthenticated"` (the route wants a signed-in player; that is expected). In a room, the
   badge above the game reads "Direct connection" or "Connected through TURN". Adding `?turn=1`
   to a room link forces TURN; the badge then reads "Connected through TURN".

Cost: the first 1,000 GB per month are free, then $0.05/GB. Two-player moves are a few KB per
match.

The older note in [Phase 0 setup](phase-0.md#5-cloudflare) about Firebase secrets no longer
applies: the credentials are made by the web app ([ADR 0010](../adr/0010-online-matches.md)).

## 2. Realtime Database rules
The rules workflow now deploys the Realtime Database rules too. Its deploy account needs one more
role. Google Cloud console → Cloud Shell:

```bash
gcloud projects add-iam-policy-binding ayvago-prod \
  --member=serviceAccount:github-rules-deployer@ayvago-prod.iam.gserviceaccount.com \
  --role=roles/firebasedatabase.admin --condition=None --quiet > /dev/null
```

1. ⏳ Run the command above **before merging** the Phase 4 branch. Otherwise the "Deploy
   Firestore and Realtime Database rules" run fails with a permission error. If that happens,
   grant the role and re-run the workflow from the Actions tab.
2. ⏳ Check in Firebase console → Realtime Database → Rules that `rooms`, `signals` and `relay`
   appear.

## 3. Web config
- ⏳ Vercel → `ayvago-web` → Environment Variables: check that
  `NEXT_PUBLIC_FIREBASE_DATABASE_URL` is set (Firebase console → Realtime Database → the URL at the
  top, `https://ayvago-prod-default-rtdb.europe-west1.firebasedatabase.app`). Without it the SDK
  looks for the database in the US region and rooms fail to open. Redeploy after adding it.

## 4. Deploys (automatic)
- 🤖 Merging deploys:
  - the web app (room pages, ICE route);
  - the Cloud Functions with the new hourly `cleanupRooms`;
  - the Realtime Database rules (after step 2).
- 🤖 The eight online games are deployed from `selchook/ayvago-games` main.

## 5. Try it
- ⏳ On ayvago.com, open Connect Four → **Play with a friend** → **Create a room** → **Share** the
  link to a second phone (ideally on mobile data, the other on Wi-Fi). Play a round on both.
