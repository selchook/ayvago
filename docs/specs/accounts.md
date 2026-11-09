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
- **Characters** ([ADR 0013](../adr/0013-player-characters.md)): separate from the avatar, the
  player picks one of five game characters (`characterId`; `adventurer` is the default). Games with
  a hero receive it as `GHA_START.config.character`. All five are free for now; unlocks may come
  with XP and achievements.

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

## 9. Levels and XP

Shipped in slice 5.2; the rules are in [ADR 0016](../adr/0016-achievements-and-xp.md), which
replaced the first sketch (XP per minute, a `50 · n^1.5` curve). XP is awarded only by
`finishSession`, for accepted score sessions:

| Source | XP | Cap |
|---|---|---|
| An accepted run of at least 20 s | 10 | 600 per UTC day in total, 150 per game |
| First run of a game | 20 | (same caps) |
| New personal best (beats an earlier best) | 25 | (same caps) |
| Entering a game's weekly top 10 | 50 | (same caps) |
| Each unlocked achievement (12 at launch) | 30 | none |
| Daily quest, season placement | — | later slices (5.3) |

Level curve: level n → n+1 costs `100 · n` XP (`xpForLevel(n) = 50 · n · (n − 1)`: L2 = 100,
L3 = 300, L4 = 600), capped at 99. Levels unlock cosmetics only (later slices).

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
| `users/{uid}` | `username`, `avatarId`, `characterId`, `frameId`, `level`, `xp`, `country`, `locale`, `theme`, `mode`, `isGuest`, `privacy`, `createdAt`, `usernameChangedAt` | Owner for `avatarId/characterId/theme/mode/locale/privacy`; Functions for the rest |
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

## 15. Implementation status

The first slices ran on the Spark plan without Cloud Functions; usernames, guest merge and guest cleanup were added with the Blaze plan:

- **Guest creation:** `signInAnonymously()` runs when a player first presses Play, not on page load, so crawlers and bounced visits create no accounts. The game never waits for it.
- **Profile:** the client creates `users/{uid}` in a transaction on first sign-in with a generated name (`generateGuestName`, word lists in `packages/shared/src/profile.ts`). Firestore rules allow only `username`, `isGuest`, `locale`, `createdAt`, `updatedAt`; require server timestamps; keep `isGuest` equal to the token's sign-in provider; and keep the username fixed. Reads are owner-only for now.
- **Upgrade:** `linkWithPopup(Google)` keeps the uid; the client refreshes the ID token and sets `isGuest: false`.
- **Existing Google account:** on `auth/credential-already-in-use` the client takes the guest's ID token, signs in to the existing account and calls `mergeGuestAccount({ guestIdToken })`. The function verifies the token belongs to a still-unlinked guest, merges the guest's `library/state` into the account's (same rules as the browser merge) and deletes the guest's documents and auth user. The browser copy is merged by the library sync as well, so a failed call loses nothing visible.
- **Library:** favorites, recently played games and personal best scores live in one document, `users/{uid}/library/state` (one read per page load; rules cap favorites at 200, recent at 20, best scores at 300). The browser keeps a copy for instant rendering. The first time a browser meets an account the two libraries are merged (union of favorites, latest play, better score), so a guest's or signed-out player's data joins the account; after that the account copy wins on every load, so removals on one device reach the others. Changes are batched into one write every 2 s. Signing out clears the browser copy. Best scores are player-reported; leaderboards will use server-validated sessions.
- **Profile and settings (`/{locale}/profile`):** avatar from 12 preset glyphs × 8 colors (`avatarId` = `"<glyph>-<color>"`, no uploads), theme, mode and language. These preferences are saved on `users/{uid}`; the first time a browser meets an account they are applied there (theme, and a switch to the saved language), after that the browser's choices are written back. The page also lists personal bests, offers **Download my data** (client-side JSON export of the profile and library) and **Delete account** (server-side deletion of the player's data through `deleteMyData`, then the Firebase Auth user; registered players re-confirm with Google when their sign-in is older than a few minutes). Rules allow owners to delete their own documents.
- **Usernames:** registered players choose a name on the profile page through `reserveUsername`. Uniqueness uses `usernameKey` (lowercase, Turkish letters folded to ASCII) in `usernames/{key}` = `{ uid, username }`; the profile stores `usernameKey` and `usernameChangedAt`. One change per 30 days, except changes that keep the same key. Reserved and offensive names are refused by `usernameProblem` (`packages/shared/src/profile.ts`), checked in the browser and again in the function. Guests keep their generated name (not reserved). Clients cannot write `usernames/*` or the username fields.
- **Guest cleanup:** `cleanupGuests` runs every night at 03:30 (Europe/Istanbul) and deletes anonymous accounts inactive for 30 days, with their leaderboard rows, votes and the whole `users/{uid}` document tree (the same `deletePlayerData` as `deleteMyData`).
- **Leaderboards (Phase 2):** board rows show the username, avatar and a guest badge. Username changes and avatar changes are copied into the rows by the server; a guest merge moves the guest's better scores to the account; **Delete account** calls `deleteMyData`, which removes the username reservation, leaderboard rows and entries and votes, then deletes `users/{uid}` recursively. That takes the profile with every subcollection under it: the library, the progress summary, the play stats of every game (including games that have left the catalog) and any subcollection added later. Only after that does the client delete the sign-in.
- **Bans (Phase 2):** admins (custom claim `admin`) ban and unban players from `/admin`. A ban sets the `banned` claim, which rules and functions check, and revokes the player's sessions. It also removes their leaderboard rows, votes and play stats. The profile records `banned`, `bannedAt` and `bannedBy` for the panel.
- **Characters (Phase 5, slice 5.1, [ADR 0013](../adr/0013-player-characters.md)):** the profile page has a **Character** section: the five characters of `packages/shared/src/characters.ts` as a radio group of previews (`apps/web/public/characters/<id>.png`), saved on select. The choice is `characterId` on `users/{uid}`. Firestore rules accept only the five ids, or no field at all; the owner may set or remove it, guests included, and banned players may not. The game player sends it as `GHA_START.config.character` (left out without a choice). In online rooms each seat stores its character, and the other player's game gets it as `peerCharacter` ([multiplayer spec §3, §5](multiplayer.md#5-game-protocol-adapter-22)). A guest merged into an existing account keeps that account's character. All five are free. **Slice 5.1b** retired the five alien characters ([ADR 0013 amendment](../adr/0013-player-characters.md#amendment-2026-11-04-five-characters-slice-51b)): a stored id that is not in the list reads as "not chosen", so the profile marks `adventurer` and games get no `character`; the rules check `characterId` only when a write changes it, so such a profile can still update its other fields and overwrite or remove the old value. No data migration.
- **Achievements, XP and levels (Phase 5, slice 5.2, [ADR 0016](../adr/0016-achievements-and-xp.md)):** `finishSession` awards XP and achievements in the transaction that accepts a score and keeps them in `users/{uid}/progress/summary` (functions-only; the owner and admins read it). It copies `xp` and `level` onto `users/{uid}`; those keys are not client-writable. The callable's `recorded` result carries `progress: { xpGained, xp, level, levelUp, unlocked }`; flagged and rejected runs earn nothing. The header shows a level chip with a ring towards the next level; the profile page has a **Progress** section (level, XP bar, the counters behind it and the 12 badges, locked ones with their progress); the game page shows short notes over the stage after a run. Guests earn XP; `mergeGuestAccount` joins a guest's progress into the account (`mergeProgress`), and `deleteMyData` and guest cleanup delete it. **Download my data** includes the summary.
- **Fresh start and server bests (Phase 5, slice 5.13, [ADR 0017](../adr/0017-server-best-and-fresh-start.md)):** the library's best scores are no longer the source of truth. The game toolbar and games (`GHA_START.config.best`, protocol 2.4) read the player's all-time leaderboard entry; the library's bests are the fallback when the server cannot answer. `BEST_EPOCH` (`apps/web/lib/library.ts`, `'2026-11-07'`) clears a browser's stored bests once, keeping favorites and recently played. The one-time **Reset progress** workflow (`.github/workflows/reset-progress.yml`) backs up, then clears the progress of every player: `users/*/stats/*`, `users/*/progress/*`, `xp` and `level` on the profile, the `best` map of `library/state` (set to `{}`), together with the leaderboards and score sessions. Profiles, favorites, recently played, votes, usernames, roles and bans stay.
- **Players and plays report (Phase 5, slice 5.16):** admins open **Players and plays** in `/admin` and run `getPlayReport`, which counts profiles and players by kind (guest from `isGuest`; Google or other registered from Firebase Auth; "unknown" for play stats without a profile) and lists plays per player and game from `users/{uid}/stats/{gameId}` (since the 2026-11-07 reset) next to the all-time `games/{gameId}/daily` totals. It returns usernames and a short uid suffix, never uids or e-mail addresses.
- **Not yet:** Apple and email-link sign-in, public profile pages, privacy and notification settings, game-defined achievements (`GHA.unlockAchievement`), level badges on leaderboards.
- **Testing:** rules tests in `firebase/tests` (emulator, run in CI). The web app can run against the emulators with `NEXT_PUBLIC_FIREBASE_EMULATORS=1`; emulator builds expose a test hook for the Google flow because the real popup needs Google's servers.
