# Phase 3 — Owner Setup Checklist

Legend: ✅ done · ⏳ owner action · 🤖 Claude

Plan and status: [Phase 3 plan](../plan/phase-3.md) · Decision:
[ADR 0023](../adr/0023-ads-behind-an-admin-switch.md).

## 3.1 Ad infrastructure behind an admin switch

**Merging changes nothing for players.** Ads stay **off**:
- `config/ads` does not exist (a missing document means off);
- without `NEXT_PUBLIC_ADSENSE_CLIENT` the site does not even read the switch.

Merging deploys these through the usual workflows:
- 🤖 **The web app:** the admin panel's new **Ads / Reklamlar** tab, the privacy page and the
  inert ad code.
- 🤖 **"Deploy Cloud Functions":** the new callable **`grantAdReward`** (europe-west1, App Check
  like the others). No new secrets or IAM grants.
- 🤖 **"Deploy Firestore and Realtime Database rules":** the rules for `config/ads` and its
  history, `entitlements/{uid}` and `users/{uid}/adRewards`. No new index.

The steps below are needed only **before turning ads on**, in this order. The admin panel's status
line lists whatever is still missing, so turning the switch on early does no harm: nothing shows
until the list is empty.

### 1. AdSense account and site ⏳
1. ⏳ Sign in at <https://adsense.google.com> with the Google account that will receive payments.
   Payment details need the legal name of the business (roadmap open decision 3).
2. ⏳ **Sites → Add site:** `ayvago.com`. AdSense shows a verification snippet; choose the
   **ads.txt** option instead.
3. ✅ `apps/web/public/ads.txt` holds `google.com, pub-1982569451422503, DIRECT, f08c47fec0942fa0`
   (publisher ID `pub-1982569451422503`; public, not a secret) and is served at
   `https://ayvago.com/ads.txt` once merged. This closes the open Phase 0 item.
   ⏳ Check that the URL shows the line, then press **Verify** in AdSense.
4. ⏳ Wait for the site review (days to weeks). The site needs the privacy page, which ships
   with this slice (`/en/privacy`, `/tr/privacy`).
5. ⏳ **Ads → By site → ayvago.com → Auto ads: off.** The platform places every ad itself;
   Auto ads would put ads on phones and next to the game.

### 2. H5 Games Ads ⏳
1. ⏳ Apply for **H5 Games Ads** (the Ad Placement API, <https://developers.google.com/ad-placement>)
   for `ayvago.com` through the H5 Games Ads interest form linked there. It is a separate approval
   on top of AdSense.
2. ⏳ After approval, nothing else is configured in AdSense for interstitial and rewarded ads; the
   platform calls `adBreak` itself.

### 3. Consent message (CMP) ⏳
Google's own certified CMP; no extra vendor.
1. ⏳ AdSense → **Privacy & messaging → European regulations** (GDPR, IAB TCF v2.2) → **Create
   message**:
   - site `ayvago.com`;
   - languages English and Turkish;
   - the privacy policy URL `https://ayvago.com/en/privacy`;
   - "Consent" and "Manage options" buttons (Google's default).
2. ⏳ **Publish** the message. It covers the EEA, the UK and Switzerland. Everyone else, Turkey
   included, gets the platform's own notice; nothing to set up for that.
3. ⏳ Optional: AdSense → Privacy & messaging → **US state regulations**, if US traffic matters.
4. ⏳ In **Yönetim paneli → Reklamlar → Kurulum**, tick **Consent message published / Onay mesajı
   yayımlandı** and save. No ad code loads before this box is ticked.

### 4. Environment variables (Vercel) ⏳
Vercel → `ayvago-web` → Settings → Environment Variables → **Production**. These values are
public by design (they appear in every page's ad tag), but they belong in Vercel, not in the
repository:

| Variable | Value | Needed for |
|---|---|---|
| `NEXT_PUBLIC_ADSENSE_CLIENT` | Your publisher ID with the `ca-` prefix: **`ca-pub-1982569451422503`** | Everything. Without it the ad code stays inert |
| `NEXT_PUBLIC_ADSENSE_BANNER_SLOT` | The ID of a **display ad unit** (AdSense → Ads → By ad unit → Display ads, fixed size 300×250) | The desktop banner. Optional |
| `NEXT_PUBLIC_PRIVACY_CONTACT` | Optional. The privacy contact defaults to `ayvagogames@gmail.com`; set this only to use another address | The privacy page's contact line |

⏳ Redeploy after setting them (Deployments → the latest production deployment → Redeploy). The
admin panel's status line confirms the client ID once the new build is live.

### 5. Turn it on ⏳
1. ⏳ **Yönetim paneli → Reklamlar.** The status line must say nothing is missing. Test mode is
   on by default: only Google's test ads show and they earn nothing.
2. ⏳ Turn the switch **on** and confirm. Within seconds every open ayvago.com page follows it.
3. ⏳ Check with test ads:
   - on a desktop, a game page shows the "Advertisement" banner in the side column;
   - leaving a game after a finished run may show an interstitial (at most one every
     3 minutes);
   - a game with a rewarded button shows a test ad and then "Reward granted".
4. ⏳ When everything looks right: **Kurulum → Test mode** off, then **Ayarları kaydet**.
5. ⏳ To stop all ads at any time, turn the switch **off**: new ad requests stop at once, and the
   banner disappears.

### 6. Before scaling up (optional) ⏳
- Have the privacy and KVKK text (`/tr/privacy`) checked legally, and send the data controller's
  legal name once the business entity is decided. Claude updates the text.
- The caps (default: 3 minutes between interstitials, 6 per visit, 20 per day, 20 rewarded ads per
  player per day) can be changed in the panel at any time, without a deploy.

There are no secrets in this slice: the AdSense IDs are public, and `grantAdReward` needs no
keys.

## 3.5 Site content for the AdSense review

Merging deploys the web app only: game pages that show the studio's guides once they arrive, the
About, Terms of use and Contact pages, the category intros, the home page's About block, and the
leaderboard and coming-soon pages out of the index. No rules, functions, secrets or environment
variables.

### 1. Review the Terms of use ⏳
1. ⏳ Read `/en/terms` and `/tr/terms` (a plain draft written from how the site works) and have
   them checked legally, together with the privacy text (§6 above).
2. ⏳ Send the corrections and the business's legal name once it is decided (roadmap open
   decision 3); a governing-law clause can be added then. Claude updates the text and the date at
   the top.

### 2. The studio's guides 🤖
- 🤖 The studio (`selchook/ayvago-games`) writes a guide per game and publishes
  `platform/arcade-guides.json` on its `main`. The hourly **Sync arcade catalog** run copies it
  into the same PR as the catalog; merging that PR puts the guides on the game pages. Nothing to
  configure: until the studio publishes the file, the run keeps the platform's (empty) copy.
- ⏳ Merge the sync PRs as usual. If one fails CI because of the guides, the studio's file broke
  the contract (`packages/shared/src/guide.ts`); the studio fixes it on its side.

### 3. Search Console, after the deploy ⏳
1. ⏳ <https://search.google.com/search-console> → the `ayvago.com` property → **Sitemaps** →
   submit `https://ayvago.com/sitemap.xml` again. It now lists the About, Terms and Contact pages
   and no leaderboard or coming-soon pages.
2. ⏳ Optional: **URL inspection** → a game page with a guide → **Request indexing**.
3. The leaderboard pages drop out of the index over the next weeks as Google recrawls them
   (`noindex`); nothing to remove by hand.

### 4. Ask AdSense for a new review ⏳
1. ⏳ **Wait** until the guides of **all** games are live and Google has recrawled the site
   (Search Console → Pages shows the game pages indexed again), about **2–4 weeks** after the last
   guides are merged. A review requested earlier sees the same thin pages and fails again.
2. ⏳ Before asking, check in AdSense → **Ads → By site → ayvago.com** that **Auto ads stays off**
   (§1.5 above). Auto ads would put ads on every page that loads the tag, including the lobby,
   room, table, profile, search and 404 pages, which have no content of their own. The platform's
   own placements are only on game pages.
3. ⏳ AdSense → **Sites → ayvago.com → Request review**.
