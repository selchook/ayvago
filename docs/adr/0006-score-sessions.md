# ADR 0006 — Server-validated score sessions and cached leaderboards

- Status: Accepted (2026-10-26)
- Related: [Leaderboards spec](../specs/leaderboards.md), [Phase 2 plan](../plan/phase-2.md)

## Context
Games run in cross-origin iframes and report scores over postMessage, so any score a browser
reports can be forged. Leaderboards must still be cheap to read (Firestore bills per document) and
must never show a score that was sent without a real run.

## Decision
- **One session per run.** The platform calls `startSession(gameId)` when the game sends
  `GHA_SESSION_START` (sent at the start of every run, unlike `GHA_READY`, which is sent once per
  load) and `finishSession(sessionId, token, score, durationMs, continues)` on `GHA_END`.
  Games never talk to Firebase; the platform page does.
- **Session token:** 24 random bytes returned once; only its SHA-256 hash is stored in
  `sessions/{id}`. No signing secret to manage. A session is claimed in a transaction, so it can be
  finished only once, and only by the uid that started it.
- **Server clock decides.** Run length is measured by the server (`startedAt` → finish); the
  client's `durationMs` is only compared against it.
- **Checks:** shorter than `minDurationMs` → rejected quietly; over `maxScore` or `maxPerSecond`
  → rejected, or flagged during the game's 14-day calibration window; client/server duration
  mismatch and outliers (> 3 × the all-time #1 once 10 players are on the board) → flagged.
  Flagged runs go to `scoreFlags/{sessionId}` for review and never touch the boards.
- **Entries hold accepted scores only**, so the boards and rank counts need no "flagged" filter.
- **Cached top 100** in `leaderboards/{gameId}/boards/{season|all}`: a board view is one read; a
  player's own rank is two `count()` queries. Usernames and avatars are copied into the rows and
  refreshed by functions (`reserveUsername`, `syncLeaderboardProfile`), not by Firestore triggers,
  to avoid Eventarc setup for now.
- **Season rollover is lazy and scheduled:** the first accepted score of a new week archives and
  resets the season board inside the same transaction; `closeLeaderboardSeason` (Monday 09:00
  UTC) does the same for idle boards and deletes finished-season entries.
- **App Check rolls out in two steps:** the web app sends tokens once a reCAPTCHA Enterprise key
  is configured; `APP_CHECK_ENFORCED` in `firebase/functions/src/caller.ts` (shared by every player-facing callable) turns enforcement on
  in a commit after the share of verified sessions (`sessions.appCheck`) is close to 100%.

## Consequences
- A score from the browser console without a valid session never reaches a board
  (emulator-tested). A determined cheater can still play a real session and lie about the score
  within the limits; the limits, outlier flags and admin review handle that.
- Every run costs a few writes (session, plus entries and the board only on a personal best).
- Profile changes made directly in Firestore (not through these functions) do not reach the board
  rows until the player's next personal best.
