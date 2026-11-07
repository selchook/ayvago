# ADR 0017 — Server-synced bests and a fresh start

- Status: Accepted (2026-11-07)
- Related: [ADR 0002](0002-iframe-game-sdk.md) (game protocol), [ADR 0006](0006-score-sessions.md)
  (score sessions), [ADR 0007](0007-ayvago-arcade.md) (games origin),
  [ADR 0016](0016-achievements-and-xp.md) (XP and achievements),
  [Leaderboards spec](../specs/leaderboards.md), [Accounts spec](../specs/accounts.md),
  [Phase 5 plan, slice 5.13](../plan/phase-5.md#513-fresh-start-progress-reset-and-server-synced-bests--code)

## Context
The studio games moved to a new Vercel origin (`ayvago-games-nine.vercel.app`, previously
`ayvago-games.vercel.app`). After the move every game showed "NEW BEST!" ("YENİ REKOR!") even
for scores below the player's real best.

- The games keep their best score in `localStorage` on their own origin (studio
  `src/core/storage.ts`, `getBest` / `setBest`). A new origin starts empty, so every first run
  there is a "new best".
- The platform had the same weakness. The toolbar's "Personal best!" came from `recordBestScore`
  in `apps/web/lib/library.ts`, which compares with the browser library, not with the server. The
  library is mirrored to `users/{uid}/library/state`, but its bests are player-reported.

The server already holds a trustworthy best per player and game: the all-time leaderboard entry,
written only by `finishSession` and the admin review, moved by the guest merge and removed with
the account.

## Decision
The owner decided two things:

1. **(A) A fresh start.** Every player's progress is reset once, so the stale bests on both
   sides disappear together.
2. **(B) The server is the source of truth for bests**, so an origin move or a new device cannot
   bring the problem back.

### Server best for games: protocol 2.4
- `GHA_START.config.best?: number | null` (adapter 2.4.0):
  - a number is the player's best score for the game on the platform, as stored (for games where
    lower is better, the lowest);
  - `null` means the player has no recorded score yet, so any finished run is their first;
  - absent means the platform does not know; the game keeps its own stored value.
- The source is `leaderboards/{gameId}/boards/all/entries/{uid}.score`. The brief preferred a
  `bestScore` field on `users/{uid}/stats/{gameId}`, but the stats document has no such field. The
  all-time entry is already the server's best, kept right by every path that changes scores, and
  public to read, so no new field, function write or rule is needed.
- The game player reads it before answering `GHA_READY`, side by side with the character read:
  - Firebase off → absent;
  - nobody signed in once the auth state is known (a new guest is being made) → `null`;
  - no entry → `null`;
  - a failed read, or no answer within **1.5 s** → absent.
- Solo runs only. Online rounds are not ranked, so they leave `best` out.
- The adapter keeps `best` only as a finite number or `null`; anything else is dropped (unknown).

### Server best on the platform
- `finishSession` adds `previous` (the player's best on that board before the run, `null` for a
  first score) to each board in its `recorded` result. The other fields are unchanged.
- The toolbar marks "Personal best!" only when the server says so: `boards.all.improved` and a
  previous best existed. Servers without `previous` fall back to `previousRank !== null`, which
  is set exactly in that case. Rejected and flagged runs are not personal bests.
- Before a run the toolbar shows the server best (a live view of the all-time entry). The browser
  library is the fallback only when Firebase is off, the account is still loading or the read
  fails, and for runs that were not registered with the server.
- **Epoch.** `BEST_EPOCH = '2026-11-07'` in `apps/web/lib/library.ts`. A browser whose stored epoch
  differs clears its best scores once (favorites and recently played stay) and stores the epoch,
  so bests from before the reset do not come back.

### The reset (A)
A manual workflow, **Reset progress** (`.github/workflows/reset-progress.yml`), runs
`firebase/functions/scripts/reset-progress.mjs` with the deploy service account. The selection
and delete logic is in `reset-progress-lib.mjs`, which the emulator tests run.
- **Guards:**
  - the `confirm` input must be exactly `RESET ALL PROGRESS`;
  - `dry_run` defaults to true: a dry run backs up and counts only.
- **Backup first:** one JSON file, with Timestamps as ISO strings, uploaded as an artifact kept
  for 90 days. When the backup cannot be written, nothing is deleted.
- **Reset:**
  - `leaderboards/**` (boards, entries and season archives), with `recursiveDelete`;
  - `users/*/stats/*` and `users/*/progress/*`;
  - `xp` and `level` on `users/*`;
  - the `best` map of `users/*/library/state`, set to `{}`;
  - `sessions/*`.
- **Kept:** the rest of each profile, favorites and recently played, votes, `games/*` counters,
  rankings, rooms and tables, usernames, roles and bans.
- The script logs counts per category (and writes them to the job summary) and exits non-zero on
  any error.

The library's `best` map was not in the brief's list. It is reset because the library sync makes
the account copy win on every page load: without it, the old bests would come back into every
browser right after the epoch cleared them.

## Consequences
- An origin move or a new device no longer starts the bests from zero once the studio adopts
  protocol 2.4: the game's "new best" follows the server.
- One more Firestore read before `GHA_START` (at most 1.5 s, in parallel with the character read)
  and one live listener on the game page while it is open.
- Play statistics are reset too, so vote eligibility (a finished run of the game) starts again.
- Pending score flags are not reset. Approving one after the reset puts a pre-reset score on the
  new boards, so they should be rejected or reviewed before the reset.
- A browser tab left open during the reset can write its old library bests back to the account
  copy on its next change. The toolbar and games read the server best, so this shows only in the
  profile's list of bests.
- Games that keep their own best (protocol 2.3 or older, or `best` absent) behave as before.
