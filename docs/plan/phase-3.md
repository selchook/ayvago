# Phase 3 — Monetization

- Status: In progress (started 2026-11-11)
- Roadmap: [§9 Monetization](roadmap.md#9-monetization),
  [§12 Phases and timeline](roadmap.md#12-phases-and-timeline) · Specs:
  [UI and themes](../specs/ui-and-themes.md), [Accounts and profiles](../specs/accounts.md)
  · Owner steps: [Phase 3 setup](../setup/phase-3.md) · Decisions:
  [ADR 0023](../adr/0023-ads-behind-an-admin-switch.md)

**Done when:** a `remove_ads` buyer never sees an interstitial; rewarded rewards arrive only after
server confirmation.

The owner asked for the whole ad infrastructure to be built now, behind an on/off switch in the
admin panel that stays **off** until they turn it on.

Legend: ✅ done · 🚧 in progress · ⏳ owner action · ⬜ not started

## Slices

| # | Slice | Status |
|---|---|---|
| 3.1 | Ad infrastructure behind an admin switch: `config/ads` (switch, formats, caps, test mode) with an admin-panel section, the ad manager on the platform page (Google H5 Games Ads: rewarded, interstitial, desktop banner), `grantAdReward`, the `remove_ads` entitlement read, Consent Mode v2 with Google's CMP and a KVKK notice, and a privacy page (owner request, [ADR 0023](../adr/0023-ads-behind-an-admin-switch.md)) | ✅ code · switch **off** · ⏳ AdSense setup |
| 3.2 | `remove_ads` checkout: Paddle or Lemon Squeezy, webhook → `purchases` + `entitlements/{uid}` | ⬜ |
| 3.3 | Google Analytics revenue funnel (ad events are already dispatched as `ayvago:ad`), BigQuery export later | ⬜ |
| 3.4 | Rewarded placements in games ("continue", "2× reward"), built in the studio (`selchook/ayvago-games`) | ⬜ studio |

## 3.1 Ad infrastructure behind an admin switch ✅ code

The owner asked to "start the ads phase, prepare all the infrastructure, add it to the admin panel
as an on/off switch, and leave it off so it can be turned on at any time". Everything below ships
**off**:
- `config/ads` does not exist in any project, and a missing document means off;
- `NEXT_PUBLIC_ADSENSE_CLIENT` is not set, so the ad host does not even read the switch.

Players see no change except the new privacy page and its link at the bottom of the menu.

### Data model and rules
- **`config/ads`**: public read, admin write. One document holding:
  - `enabled` (the master switch);
  - `rewarded`, `interstitial` and `banner` (the per-format switches);
  - the caps: `interstitialGapSeconds` (180–3600, default 180, the roadmap's three minutes),
    `interstitialsPerSession` (default 6), `interstitialsPerDay` (default 20) and `rewardedPerDay`
    (default 20, per player);
  - `rewardAmount` (default 0; recorded for the coins planned in Phase 5);
  - `testMode` (default on);
  - `cmpConfirmed` (the owner confirmed the consent message is published; default off);
  - `updatedAt`.

  The rules check every key, type and range, so even an admin cannot write a malformed document.
  Defaults and the normalizer live in `packages/shared/src/ads.ts` (`readAdSettings`: only an
  explicit `enabled: true` turns ads on).
- **`config/ads/history/{id}`**: the audit trail. One entry per save: `by` (must be the writer),
  `name`, `at`, `enabled` and `settings`. Admins create and read entries; nobody changes or
  deletes them.
- **`entitlements/{uid}`**: the owner and admins read it; no client writes it, admins included.
  The purchase webhooks of slice 3.2 will write it.
- **`users/{uid}/adRewards/{ticket}`**: rewarded-ad tickets and grants. The owner and admins
  read them; only `grantAdReward` writes them.
- **`users/{uid}/adQuota/{day}`**: the daily counters. Functions only; nobody reads them from a
  client.

  Both live under the player, so `deleteMyData` and guest cleanup remove them with the account.
- Other `config/` documents (`config/appCheck`) stay closed.

### `grantAdReward` (callable, europe-west1)
- `{ step: 'begin', gameId?, placement }` → `{ ticket, remaining }`:
  - refused with `ads-off` when the switch or the rewarded format is off;
  - refused with `capped` at the daily cap, and `rate-limited` after the cap plus 20 open tickets
    a day;
  - `unknown-game` for an id outside the catalog. A missing `gameId` is a platform placement.
  - Placement names are cut to plain characters (`adPlacement`).
- `{ step: 'claim', ticket }` → `{ rewarded: true, amount, remaining }`, in one transaction:
  - the ticket must be pending and this player's (`no-ticket`, `claimed`);
  - at least 5 s old (`too-fast`) and at most 10 min old (`expired`, and the ticket is closed);
  - within the cap of the day the ad started (`capped`);
  - refused with `ads-off` if the switch went off in between.
- It uses `requirePlayer`: signed in, not banned, App Check per the admin switch.
- It logs the game and the placement, never the player.

### Admin panel: Ads / Reklamlar (`components/admin/ads-panel.tsx`, `lib/admin/ads.ts`)
- A new **Ads** tab, visible only with the `admin` claim like the rest of the panel.
- **The master switch:**
  - a large switch (`role="switch"`) with "Ads are OFF / ON";
  - turning it **on** opens a confirmation dialog, which also says how many setup steps are
    still missing;
  - turning it off saves at once.
- **A status line** shows what stands between the switch and an ad on screen:
  - blockers: the AdSense client ID is not set, the consent message is not confirmed, every
    format is off;
  - warnings: Firebase is off (no rewarded ads), there is no banner ad unit, test mode is on,
    there is no privacy contact.
- **The settings:** the three formats, the five numbers with their ranges, test mode and the
  consent confirmation, under "Save settings" (disabled until something changed and every number
  is valid) and "Discard changes".
- **Changes:** "Last changed by {name} on {time}" and the last five changes. Before the first
  save the section says ads are off by default and the first save creates the settings.

### The ad manager (`apps/web/lib/ads`)
- `policy.ts`, pure decisions:
  - `adPlan`: what may load and which formats may show;
  - `interstitialVerdict`: the gap, the caps, during a run, online;
  - `rewardedAvailable`: `GHA_START.adsEnabled`;
  - `adStatus`: the admin status line.
- `manager.ts`, the flows, with every browser dependency injected (`createAdManager`):
  - one ad at a time;
  - the script loads with the page only after the switch and the player's `remove_ads` are
    known;
  - `startAdsEnabled` answers false at once without a client ID, and otherwise waits at most 3 s
    for the switch and the script.
- `provider.ts`: the `AdProvider` interface and Google H5 Games Ads:
  - the `adsbygoogle` tag with `data-ad-frequency-hint` set to the gap, and
    `data-adbreak-test="on"` in test mode;
  - `adConfig({ preloadAdBreaks: 'on' })`, then `adBreak` with `reward`, `next` or `browse`;
  - every break resolves within 80 s, before the adapter's own 90 s timeout.
- `consent.ts`: Consent Mode v2 defaults, the stored choice, and a check whether Google's TCF CMP
  covers the visitor.
- `client.ts`: the page's manager:
  - Firestore listeners on `config/ads` and `entitlements/{uid}`; a failed entitlement read
    counts as owned, so no page ads are shown;
  - `grantAdReward` calls;
  - the interstitial log in local and session storage;
  - an `ayvago:ad` window event for every ad event.
- `config.ts`: `NEXT_PUBLIC_ADSENSE_CLIENT` (must look like `ca-pub-…`),
  `NEXT_PUBLIC_ADSENSE_BANNER_SLOT` and `NEXT_PUBLIC_PRIVACY_CONTACT`.

### What players get once it is on
- **Rewarded:**
  1. The game sends `GHA_AD_REQUEST(rewarded)`.
  2. The page shows "Loading an ad…", loads the script if needed (the on-request path for
     `remove_ads` owners) and asks `grantAdReward` for a ticket.
  3. The ad plays while the game is muted (the player's own sound setting is restored after).
  4. When the provider reports the ad watched, the page claims the ticket.
  5. Only a successful claim answers `rewarded: true` and shows "Reward granted".

  A closed ad, a refused claim, no ad, a capped player or ads off answer
  `{shown: false|true, rewarded: false}`, and the game carries on.
- **Interstitial:**
  - a game's `requestInterstitial` (its "game over → play again" moment), and leaving a game
    page after a finished run;
  - never during a run, in rooms or tables, for `remove_ads`, within the gap or past the caps.
- **Banner:**
  - a labelled ("Advertisement / Reklam") 300×250 slot in the game page's side column;
  - rendered only on screens at least 1100 px wide (where the column exists), never on phones and
    never over the game;
  - it goes away as soon as the switch goes off.
- **`GHA_START.adsEnabled`:**
  - true only when rewarded ads can be served now: the script is ready, or it is the on-request
    path for `remove_ads`;
  - always false in online matches.
- **Consent:**
  - Consent Mode v2 defaults (all denied) and `requestNonPersonalizedAds = 1` come before the tag;
  - Google's CMP asks in the EEA, the UK and Switzerland;
  - everyone else gets the platform's notice ("Allow personalised ads" / "Non-personalised
    only") until they answer;
  - the choice can be changed on `/privacy`.

### Privacy page (`/[locale]/privacy`)
- What is stored, cookies and local storage, ads and consent (with the ad choice), a KVKK notice
  (data controller, purposes, legal grounds per Art. 5, transfers abroad per Art. 9, rights per
  Art. 11) and contact. All of it in en and tr.
- It is linked at the bottom of the side menu and on phones at the end of the page, and listed in
  the sitemap.

### Deviations from the plan
- **Remote Config → Firestore `config/ads`** for the switch and caps
  ([ADR 0023](../adr/0023-ads-behind-an-admin-switch.md)).
- **Reward records** live at `users/{uid}/adRewards/{id}` instead of a top-level `adRewards/{id}`
  (roadmap §2.2), so deleting an account removes them without a query.
- **"Game over → play again"** is reported by the game (`requestInterstitial`). The platform has
  no play-again control of its own; its own transition is leaving a game page.
- **No ads in online matches** at all, rewarded ones included (an ad would stall the other
  players); `adsEnabled` is false there.
- **`remove_ads` owners and rewarded ads:** rewarded ads stay optional (roadmap open decision 5
  is still open). For them the script loads only when they ask for one, so their first request
  may find no ad ready.
- **The consent message is confirmed in the admin panel** (`cmpConfirmed`), because Google's CMP
  is configured in AdSense and the code cannot see it. No ad code loads before that box is ticked.
- **A privacy page was added:** the task assumed privacy and cookie pages existed, but they did
  not. This is the one visible change while ads are off.

### Tests
- **Unit (web):**
  - `lib/ads/policy.test.ts` (18):
    - off, no client ID or no consent confirmation → nothing loads;
    - every format when everything is set;
    - `remove_ads` → no interstitial or banner, rewarded on request;
    - the per-format switches, the banner slot and Firebase;
    - `adsEnabled` while off, online, loading or failed;
    - interstitials: off, `remove_ads`, online, during a run, the 3-minute gap, the session and
      day caps (UTC), a zero cap;
    - a malformed stored log;
    - the admin status line.
  - `lib/ads/manager.test.ts` (19):
    - off → no script, no consent calls, no ticket, every request "not shown", `adsEnabled` false
      at once;
    - on → the script loads after the consent defaults;
    - the entitlement is awaited, and `remove_ads` never loads with the page;
    - the on-request path, a blocked script, online matches;
    - turning off stops further requests;
    - rewarded only after the claim; a dismissed ad, a refused claim, a capped ticket, no fill;
    - one ad at a time;
    - interstitials: the gap, during a run, only shown ones counted, the session cap.
  - `lib/gha/bridge.test.ts` (5 new, the regression of today's behaviour):
    - `adsEnabled: false` in `GHA_START` without a client ID and with the switch off;
    - rewarded and interstitial requests answered "not shown" at once;
    - no reward without a shown ad.
- **Unit (shared):** `ads.test.ts` (8):
  - off when missing, only an explicit `true` turns ads on;
  - the 3-minute floor, clamping;
  - the format switches, UTC days, placement names, the entitlement guard.
- **Emulator:**
  - `firebase/tests/ads-rules.test.ts` (12):
    - `config/ads`: public read; other config documents closed; admin create and on/off;
      players, guests, registered non-admins and visitors refused;
    - malformed settings refused even from an admin;
    - the history: admin-only, as themselves, server time, immutable;
    - `entitlements/{uid}`: owner and admin read, others refused, no client writes;
    - reward records: owner and admin read, others refused, no client writes; quota closed.
  - `firebase/tests/ads.test.ts` (8), `grantAdReward`:
    - refused while off (no document, switch off, rewarded off);
    - grants once after the server confirmed (`too-fast`, then granted, then `claimed`);
    - the daily cap at the ticket and at the claim, per player;
    - refused when switched off before the claim;
    - another player's ticket, an expired ticket, bad input;
    - placement cleaning and platform placements;
    - signed-out and banned callers;
    - App Check enforce mode.
- **Playwright on `next dev` against the emulators:**
  - an admin opens **Ads**, sees OFF and the status line, turns it on through the confirmation
    and off again; the audit line names them;
  - a non-admin sees no tab;
  - screenshots on a desktop and a phone (Pixel 7) in minimal light, minimal dark, cartoon and
    arcade;
  - the privacy page in both languages;
  - with the switch off, a game page loads no ad script, renders no banner or notice and does not
    even read `config/ads` (no client ID).
- **The live path, Playwright on `next dev` against the emulators**, with a fake client ID, a
  banner slot and a stand-in for the AdSense tag that implements the Ad Placement API callbacks
  (no real ads). The fixture game (`tools/fixture-game`) got "Rewarded ad" and "Interstitial"
  buttons that send `GHA_AD_REQUEST` and show the answer and `adsEnabled`. Checked:
  - the tag loads once with the client ID, `data-adbreak-test="on"` and a `180s` frequency hint,
    after the Consent Mode defaults (denied) and `requestNonPersonalizedAds = 1`;
  - the consent notice shows, and goes away after a choice;
  - `adsEnabled: true`;
  - an interstitial during a run is refused; one after the run shows (`next`); a second one within
    the gap is refused;
  - a rewarded ad mutes the game, then answers `rewarded: true` only after the claim, with one
    `granted` record;
  - switching off removes the banner at once and the next request answers "not shown";
  - a phone gets no banner.

### Protocol 2.8: one rewarded-ad continue (adapter 2.8.0)
The studio's rewarded "continue" (one extra life after an ad, offered once per run) needs the
platform to know that the run continued. The run stays one score session.
- **Adapter:** `GameResult.continues?: 0 | 1`. `endGame` sends `continues: 1` in `GHA_END` only when
  the run continued, and nothing otherwise.
- **Bridge:** `parseGameMessage` reads `continues` from `GHA_END`; only the number `1` counts, every
  other value reads as `0`.
- **Player page:** passes it to `finishSession({ ..., continues })`, which already accepted
  `continues: 0 | 1` and checks it again.
- **Studio:** copies the adapter verbatim; its CI fails until the copy matches.

### Still open
- ⏳ The owner's AdSense steps ([Phase 3 setup](../setup/phase-3.md)). Until then the switch can be
  turned on, but the panel says why nothing shows.
- The `remove_ads` checkout and webhook (slice 3.2). Only the entitlement read and its rules
  shipped here.
- Rewarded placements in the games (slice 3.4, the studio). Games already hide their ad buttons
  while `adsEnabled` is false.
- **Analytics:** Google Analytics is not wired yet. Every ad event (`request`, `shown`,
  `rewarded`, `skipped`, `capped`, `unavailable`, with the format and placement and no personal
  data) is dispatched as an `ayvago:ad` window event. TODO (slice 3.3): forward them to GA with
  Consent Mode once GA is added.
- The age gate (under 13 → non-personalised ads only, accounts spec §2) waits for the birth-year
  field; until then personalised ads need the visitor's own consent in every region.
- A legal review of the privacy and KVKK text, and the data controller's legal name once the
  business entity is decided (roadmap open decision 3).
