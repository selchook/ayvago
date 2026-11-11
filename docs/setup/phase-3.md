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
3. ⏳ Put the `ads.txt` line AdSense shows (`google.com, pub-…, DIRECT, f08c47fec0942fa0`) in
   `apps/web/public/ads.txt`. Ask Claude to add it: it is public and not a secret. It must be
   served at `https://ayvago.com/ads.txt`. This is the open Phase 0 item.
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
| `NEXT_PUBLIC_ADSENSE_CLIENT` | Your publisher ID, `ca-pub-` followed by 16 digits (AdSense → Account → Settings → Account information) | Everything. Without it the ad code stays inert |
| `NEXT_PUBLIC_ADSENSE_BANNER_SLOT` | The ID of a **display ad unit** (AdSense → Ads → By ad unit → Display ads, fixed size 300×250) | The desktop banner. Optional |
| `NEXT_PUBLIC_PRIVACY_CONTACT` | The e-mail address for privacy and KVKK requests | The privacy page's contact line. Strongly recommended before going live |

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
