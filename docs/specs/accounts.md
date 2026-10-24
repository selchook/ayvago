# Spec — Accounts and Profiles

- Status: Draft (2026-10-18)
- Related: [Roadmap §6](../plan/roadmap.md), [ADR 0001](../adr/0001-firebase-backend.md), [Leaderboards](leaderboards.md), [Voting](voting.md)

## 1. Goals

- Anyone can start playing in one click, without signing up.
- Signing up is worth it: progress follows the player across devices, records are kept, purchases can be restored.
- Games get just enough identity (name, avatar) and never personal data.
- Safe by default for children.

### Lessons taken from CrazyGames
CrazyGames requires every game to let visitors **start as a guest**, uses the account mainly to **save progress across devices**, lets players **customize a username and avatar**, syncs guest progress into the account after login, and exposes only username and avatar to games through the SDK. Its social layer adds friend discovery and "playing right now" presence. Ayvago adopts the same principles, with one improvement: guest progress is stored server-side from the first second (Firebase anonymous auth), not only in the browser.

## 2. Identity states

| State | How it starts | Can | Cannot |
|---|---|---|---|
| **Guest** | Automatic `signInAnonymously()` on the first visit | Play, appear on leaderboards (guest badge), vote, favorite, cloud saves | Buy, add friends, change username, sign in on another device |
| **Registered** | Upgrade with Google, Apple or email link (`linkWithPopup` / `linkWithCredential`) | Everything | — |
| **Restricted (under 13)** | Birth year at registration | Play, leaderboards, favorites | Purchases, friends, chat; ads are non-personalized |
| **Banned** | Admin action (custom claim `banned: true`) | Browse | Any write (rules check the claim) |

Anonymous accounts unused for 30 days are deleted automatically (Firebase setting) together with their data (`onUserDeleted`).

## 3. Usernames

- Guests get an auto-generated name: `<Adjective><Noun><4 digits>` from curated word lists per locale (e.g. `PixelFox4821`, `HızlıTilki4821`). Word lists are reviewed for offensive combinations.
- Registered users may change their name; **30-day cooldown** between changes (`usernameChangedAt`).
- Rules: 3–20 characters, letters (including Turkish letters), digits, `_`; must start with a letter; case-insensitive uniqueness through `usernames/{lowercase}` reserved in a transaction by `reserveUsername`.
- Profanity and impersonation filter for English and Turkish, plus a reserved list (`admin`, `ayvago`, `support`, `moderator`, …).
- Display names are always rendered as text (never HTML) and are reportable.

## 4. Avatars and cosmetics

- No uploads at launch (avoids image moderation). A preset set of **48 avatars** drawn in the three theme styles (retro pixel, cartoon, minimal flat); the profile stores `avatarId`, each theme renders its own variant.
- Unlockable avatars and **avatar frames** come from levels, achievements and season rewards (Phase 5); `frameId` on the profile.
- Avatar files live in Cloud Storage behind a CDN; games receive a resolved `avatarUrl`.

## 5. When to ask guests to register

Never interrupt gameplay. Prompts are dismissible, rate-limited (at most one per day) and copy is localized.

| Moment | Prompt |
|---|---|
| First leaderboard entry or personal best | "Save your record — create an account" (inline in the end-of-run panel) |
| Third session on the platform | Soft banner: "Keep your progress on every device" |
| Before any purchase | **Required**: purchases need a registered account so they can be restored |
| Opening Friends or changing the username | Required (feature is registered-only) |
| Storage risk detected (private window, storage cleared before) | Banner explaining guest progress can be lost |

## 6. Upgrading and merging

1. Guest clicks "Sign in with Google" → `linkWithPopup()` on the anonymous user: the **same uid** is kept and nothing needs to move.
2. If the provider account already exists (`auth/credential-already-in-use`): sign in to the existing account, then call `mergeGuestAccount({ guestUid })`:
   - `stats`: keep the max best score and sum plays/playtime per game
   - leaderboard entries: keep the better entry per period
   - favorites: union; votes: keep the existing account's vote
   - cloud saves: keep the newer save; if both changed, ask the player which one to keep
   - the guest account is then deleted
3. A merge token issued to the guest session before sign-in proves ownership of `guestUid`.

## 7. Progress and cloud saves

- Per-game cloud saves via the SDK (`GHA.cloud.save/load`), stored at `users/{uid}/saves/{gameId}`; **1 MB per game** limit (same order as CrazyGames' data module).
- Saves are written for guests too, because guests have a real uid.
- Writes are throttled (max one write per 5 s per game) and batched by the platform.

## 8. Profile

- Public page `/{locale}/u/{username}`: avatar + frame, level, badges, favorite games, recent personal bests, current season placements.
- Privacy setting: public (default for adults) / friends only / private (default for under-13 accounts).
- Settings page: language, theme and mode, sound default, notifications, privacy, connected sign-in providers, **download my data**, **delete account**.

## 9. Levels and XP (model now, ship in Phase 5)

| Source | XP | Cap |
|---|---|---|
| Playing (per full minute) | 1 | 60 per day |
| First play of a game | 10 | — |
| Personal best | 5 | 10 per day |
| Daily quest | 20–50 | per quest |
| Season placement | 50–500 | per season |

Level curve: `xpForLevel(n) = 50 · n^1.5` (rounded). Levels unlock cosmetics only.

## 10. Friends and presence (Phase 5+)

- Friend requests by username or invite link; mutual acceptance; block and report.
- Presence in RTDB (`presence/{uid}`) shows "Playing *Orb Surge* now" to friends only.
- Adds a **Friends** scope to leaderboards.
- Disabled for under-13 accounts.

## 11. What games can see

`GHA.getPlayer()` returns `{ displayName, avatarUrl, isGuest, locale }` — never the uid, email or age. Games that need a stable id (multiplayer, own backend) receive `playerKey = HMAC(uid, gameId)`, unique per game so players cannot be tracked across games.

## 12. Data model

| Path | Fields | Writer |
|---|---|---|
| `users/{uid}` | `username`, `avatarId`, `frameId`, `level`, `xp`, `country`, `locale`, `theme`, `mode`, `isGuest`, `privacy`, `createdAt`, `usernameChangedAt` | Owner for `avatarId/theme/mode/locale/privacy`; Functions for the rest |
| `users/{uid}/private/account` | `birthYear`, `ageBand`, consent records, notification settings | Owner (birth year write-once) |
| `users/{uid}/saves/{gameId}` | `data`, `updatedAt`, `version` | Owner (size checked by rules) |
| `usernames/{lowercase}` | `uid` | Functions |

`country` is set once from the request's geo header (`x-vercel-ip-country`) at account creation and can be changed in settings.

## 13. Functions

`reserveUsername`, `mergeGuestAccount`, `onUserCreated` (guest name, country, defaults), `onUserDeleted`, `exportUserData`.

## 14. Acceptance criteria

- A first-time visitor plays a game with zero clicks on auth UI.
- A guest who signs in with Google keeps scores, favorites and saves (same uid).
- Signing in on a second device restores progress and purchases.
- An under-13 registration cannot open the store or friends.
- Rules tests prove a user cannot write another user's profile, stats or saves.

## 15. Implementation status (Spark plan)

The first slice runs without Cloud Functions, because the Firebase projects are on the Spark plan:

- **Guest creation:** `signInAnonymously()` runs when a player first presses Play, not on page load, so crawlers and bounced visits create no accounts. The game never waits for it.
- **Profile:** the client creates `users/{uid}` in a transaction on first sign-in with a generated name (`generateGuestName`, word lists in `packages/shared/src/profile.ts`). Firestore rules allow only `username`, `isGuest`, `locale`, `createdAt`, `updatedAt`; require server timestamps; keep `isGuest` equal to the token's sign-in provider; and keep the username fixed. Reads are owner-only for now.
- **Upgrade:** `linkWithPopup(Google)` keeps the uid; the client refreshes the ID token and sets `isGuest: false`.
- **Existing Google account:** on `auth/credential-already-in-use` the player switches to that account. The guest's data is not merged yet (`mergeGuestAccount` needs Functions); at this stage a guest holds only a profile, and local favorites/recent games stay on the device.
- **Library:** favorites, recently played games and personal best scores live in one document, `users/{uid}/library/state` (one read per page load; rules cap favorites at 200, recent at 20, best scores at 300). The browser keeps a copy for instant rendering. The first time a browser meets an account the two libraries are merged (union of favorites, latest play, better score), so a guest's or signed-out player's data joins the account; after that the account copy wins on every load, so removals on one device reach the others. Changes are batched into one write every 2 s. Signing out clears the browser copy. Best scores are player-reported; leaderboards will use server-validated sessions.
- **Usernames:** not unique and not changeable yet; `usernames/{lowercase}` reservation ships with `reserveUsername`.
- **Not yet:** Apple and email-link sign-in, avatars, settings page, public profile pages, cleanup of unused guest accounts.
- **Testing:** rules tests in `firebase/tests` (emulator, run in CI). The web app can run against the emulators with `NEXT_PUBLIC_FIREBASE_EMULATORS=1`; emulator builds expose a test hook for the Google flow because the real popup needs Google's servers.
