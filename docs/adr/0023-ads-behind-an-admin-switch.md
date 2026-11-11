# ADR 0023 — Ads behind an admin switch

- Status: Accepted (2026-11-11)
- Related: [ADR 0002](0002-iframe-game-sdk.md) (games only talk through the SDK),
  [ADR 0006](0006-score-sessions.md) (App Check on player callables),
  [roadmap §9 Monetization](../plan/roadmap.md#9-monetization),
  [Phase 3 plan §3.1](../plan/phase-3.md#31-ad-infrastructure-behind-an-admin-switch--code)

## Context
Phase 3 brings ads (roadmap §9.1): rewarded ads are the main format, interstitials between games,
a banner in the desktop side column, a `remove_ads` purchase, and a certified consent platform for
EEA and UK traffic. The owner asked for all of it to be built now, behind an on/off switch in the
admin panel that stays **off** until they turn it on. Turning it on must need no deploy, and
turning it off must stop ads at once.

Several things are outside the code: the AdSense account and its H5 Games Ads approval, the
consent message in AdSense, and the owner's choice of when to go live. While they are missing the
platform must behave exactly as before: no ad script, no consent calls, `adsEnabled: false`.

## Decision

### One public Firestore document instead of Remote Config
The switch, the per-format switches, the caps, the reward amount, test mode and a "consent message
published" confirmation live in **`config/ads`**:
- Anyone may read it (it holds nothing private); only the `admin` claim may write it. The rules
  check every field and range and require `updatedAt == request.time`.
- A missing or damaged document means **off** (`readAdSettings` in `packages/shared/src/ads.ts`
  turns ads on only for an explicit `enabled: true`). No seed is needed; the admin panel creates
  the document on its first save.
- Each save adds `config/ads/history/{id}` in the same batch: who (`by` must be the writer's uid),
  their name, when, and the settings. Admins only; never changed afterwards. The admin panel shows
  the newest entries, so "who turned it on" never depends on memory.
- Browsers follow the document live with `onSnapshot`; `grantAdReward` re-reads it at most every
  30 seconds.

The roadmap planned Remote Config for caps and reward amounts. Firestore wins here because:
- the admin panel already writes Firestore under rules with emulator tests, while Remote Config
  would need a server route or function with a service account to change values;
- a snapshot listener applies "off" within a second, while the Remote Config web SDK caches values
  (12 hours by default) and only fetches on load;
- one source serves the web app, the admin panel and the function;
- A/B testing of caps is not needed yet. It can move to Remote Config later behind the same
  `readAdSettings` shape.

### Only the platform page shows ads
Games keep using `GHA_AD_REQUEST {id, format, placement}` and get `GHA_AD_RESULT {id, shown,
rewarded}`; they never load ad code. The game page answers through one ad manager
(`apps/web/lib/ads`):
- **Decisions are pure functions** (`policy.ts`): `adPlan` (what may load and which formats may
  show), `interstitialVerdict` (gap, caps, never during a run or in an online match),
  `rewardedAvailable` (`GHA_START.adsEnabled`) and `adStatus` (what the admin panel lists as
  missing).
- **The manager** (`manager.ts`) gets every browser dependency injected, so the flows are unit
  tested with fakes.
- **The provider** sits behind `AdProvider` (`provider.ts`). The first one is Google H5 Games Ads:
  the AdSense `adsbygoogle` tag with the Ad Placement API (`adBreak` / `adConfig`). AppLixir or
  another provider only has to implement the interface.

The script loads only when all of these hold:
- the switch is on;
- `NEXT_PUBLIC_ADSENSE_CLIENT` is set;
- the owner confirmed the consent message (`cmpConfirmed`);
- the player has no `remove_ads`, which is waited for before loading.

Without the client ID the ad host renders nothing and reads nothing.

### Rewards need a server ticket and a server claim
`grantAdReward` is one callable with two steps:
- `begin`, before the ad: checks the switch and the daily cap and opens a pending ticket in
  `users/{uid}/adRewards/{ticket}`;
- `claim`, after the provider reported the ad watched: in one transaction it grants a pending
  ticket of this player that is at least 5 s and at most 10 min old, within the daily cap
  (`users/{uid}/adQuota/{day}`, UTC days).

The game hears `rewarded: true` only after the claim succeeded. A capped player gets no ad at
all: the ticket is refused before the ad. The callable uses `requirePlayer`, so it follows the
App Check switch like the other player callables.

H5 Games Ads has no server-side verification, so a determined player could fake the provider's
callback. The ticket's minimum age, the one-claim-per-ticket transaction, the daily cap and the
bound on open tickets keep that to at most the daily cap of rewards, which only ever buy in-game
continues (and a platform amount that is 0 until wallets exist).

### Interstitial moments
Interstitials show only at the platform's own transitions and on a game's
`requestInterstitial`, and never during a run (`GHA_SESSION_START` without `GHA_END`), in an
online room or table, for `remove_ads` owners, within the minimum gap (180 s by default; the rules
refuse less), or past the per-visit and per-day caps. The caps are kept per browser.
- **Leaving a game page** after a finished run is the platform's own moment (`browse`).
- **"Game over → play again" is the game's own moment:** the platform cannot see the game's
  play-again button. The game reports it with `requestInterstitial` (`next`).

### remove_ads and online matches
- `remove_ads` owners get no interstitials and no banner; rewarded ads stay optional (open
  decision 5 of the roadmap). For them the script loads only when they ask for a rewarded ad.
- Online rooms and tables get `adsEnabled: false` and no ads at all: an ad would stall the other
  players.

### Consent
- Consent Mode v2 defaults (everything denied, `wait_for_update`) and AdSense's
  `requestNonPersonalizedAds = 1` are written before the tag loads.
- Google's own certified CMP (AdSense "Privacy & messaging", IAB TCF v2.2) covers the EEA, the UK
  and Switzerland and updates the signals.
- For everyone else (Turkey under KVKK) the platform shows its own notice once ads are live;
  personalised ads need an explicit "Allow".
- The choice can be changed on the new privacy page (`/privacy`), which carries the ad, cookie
  and KVKK text.
- No extra CMP vendor is needed.

## Consequences
- With the switch off, or without the client ID, the platform behaves exactly as before. A
  regression test covers it: `GHA_START.adsEnabled` is false and every ad request is answered
  "not shown" at once.
- Going live is a sequence of owner steps (AdSense approval, the consent message, env vars, then
  the switch). The admin panel lists what is still missing, so "on" never fails silently.
- Rewards are server-recorded per player and deleted with the account.
- Game-side rewarded placements ("continue", "2× reward") and the `remove_ads` checkout are
  separate work: the studio and a later Phase 3 slice.
