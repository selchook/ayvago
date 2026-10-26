# Spec — Leaderboards

- Status: Implemented in part (2026-10-26) — see §12
- Related: [Roadmap §5.3 and §7](../plan/roadmap.md), [Phase 2 plan](../plan/phase-2.md), [ADR 0006](../adr/0006-score-sessions.md), [Accounts](accounts.md), [Game manifest schema](../../packages/shared/src/manifest.ts)

## 1. Goals

- Give every game a reason to play "one more run".
- Keep competition fresh for newcomers while still honoring all-time greats.
- Stop casual cheating without hurting legitimate players.
- Stay cheap: one Firestore read per leaderboard view.

### Lessons taken from CrazyGames
CrazyGames runs **weekly seasons (Monday to Monday, reset at 09:00 UTC)**, ranks players **globally, by country and among friends**, supports score types such as **points and time**, allows **one leaderboard per game**, and warns that client-submitted scores can be manipulated, recommending server-side submission. Ayvago keeps the weekly season and the three scopes, adds an all-time board, and routes every score through server validation.

## 2. Boards per game

| Board | Period | Reset |
|---|---|---|
| **Weekly season** (default tab) | Monday 09:00 UTC → next Monday 09:00 UTC (12:00 in Turkey) | Automatic; the final standings are archived |
| **All-time** | Since launch | Never (an admin can reset after a game update that changes scoring) |

- One primary board per game, defined by `scoring` in `ayvago.json`. Multiple boards (modes, difficulties) are a later extension (`boards[]` in the manifest).
- A daily board is not shipped at launch; it can be enabled per game later behind a flag.
- Season key format: `s-2026-W42` (ISO week of the season start).

## 3. Scopes

| Scope | Source | Available |
|---|---|---|
| Global | All entries | Launch |
| Country | `users/{uid}.country` | Launch |
| Friends | Friend list | Phase 5 |

## 4. Ranking rules

- **Best score per player per period** (`order: desc` higher is better, `asc` lower is better, e.g. time trials).
- `accumulate: true` games (e.g. wins in multiplayer) **sum** results within the period instead.
- Ties: the earlier `achievedAt` ranks higher.
- Guests appear with a guest badge and their auto-generated name (prompted to register to "claim" the record).
- Banned and flagged entries are hidden.
- Runs that used a rewarded "continue" show a small marker; games can opt out of allowing such runs on the board (`scoring.allowContinues`, default `true`).

## 5. Formatting

Based on `scoring.format` and the viewer's locale (next-intl formatter):

| Format | Example (en) | Example (tr) |
|---|---|---|
| `number` | 12,450 | 12.450 |
| `time` | 1:02.345 | 1:02,345 |

The label (`scoring.label`) comes from the manifest in the viewer's locale, falling back to English.

## 6. Where leaderboards appear

| Place | Content |
|---|---|
| Game page side panel | Weekly/All-time tabs, scope switch, **top 10**, the player's own row with **±2 neighbors**, season countdown |
| End-of-run panel | New personal best, rank change ("↑ 14 → #37"), "**312 points to beat @PixelFox4821**", register prompt for guests |
| `/{locale}/games/{slug}/leaderboard` | Top 100 for each board/scope, archived seasons |
| In-game (`GHA.openLeaderboard()`) | Platform overlay on top of the iframe |
| Profile | Current season placements and best all-time ranks |

## 7. Score submission and validation

```
GHA_READY  → startSession(gameId)            → { sessionId, token }   (App Check enforced)
GHA_END    → finishSession(sessionId, token, score, durationMs, continues)
             ├─ session exists, belongs to uid, still open, token valid
             ├─ durationMs ≥ scoring.minDurationMs and ≈ server-measured duration (±10%)
             ├─ score ≤ scoring.maxScore and score/second ≤ scoring.maxPerSecond
             ├─ per-uid rate limit (e.g. 30 finished sessions per hour per game)
             ├─ outlier check: score > 3 × current p99.9 of the game → flagged
             └─ passes → transaction: stats, entries (season + all-time), top cache, rank
```

- Only improved scores write entries (no write for a worse run) — keeps cost proportional to personal bests.
- Flagged entries are stored with `flagged: true`, hidden from boards and listed in `/admin` for review (approve / reject / ban).
- In the first two weeks after a game launches, limits only flag and never reject (calibration, see the [import plan §6.1](../plan/game-import-plan.md)).

## 8. Season end

A scheduled function runs every Monday at 09:00 UTC:
1. Copies the final top 100 per game and scope into `leaderboards/{gameId}/seasons/{seasonKey}` (archive).
2. Grants season rewards: badges and XP for **#1**, **top 10**, **top 100** and **top 10%** (cosmetic only).
3. Sends opt-in notifications ("You finished #8 in Orb Surge this week").
4. Starts the new season (new key; the old entries stay readable through the archive and are deleted after 8 weeks).

## 9. Data model

| Path | Content |
|---|---|
| `leaderboards/{gameId}/boards/{boardKey}` | `boardKey` = `season` or `all`; `periodKey`, `top: [{ uid, username, avatarId, country, score, achievedAt, continued }]` (100), `updatedAt` |
| `leaderboards/{gameId}/boards/{boardKey}/entries/{uid}` | `score`, `achievedAt`, `country`, `sessionId`, `continued`, `flagged`, `periodKey` |
| `leaderboards/{gameId}/seasons/{seasonKey}` | Archived top 100 per scope + reward list |

- **Rank:** `entries.where('periodKey','==',k).where('score','>',mine).count()` (`<` for `asc`) + 1; country rank adds `where('country','==',c)`. Composite indexes declared in `firestore.indexes.json`.
- **Neighbors:** two small range queries around the player's score.
- Usernames/avatars in `top` are denormalized; a username change updates the player's rows through a function.

## 10. Multiplayer games

- `accumulate: true` boards count wins per week.
- A result counts only when both players report the same outcome (see [import plan §9](../plan/game-import-plan.md)).
- Elo ratings for 1v1 games (Tavla) are a later extension with their own board type (`metric: 'elo'`).

## 11. Acceptance criteria

- A score sent from the browser console without a valid session never appears on a board.
- A personal best updates the season board, the all-time board and the player's rank in one transaction.
- Viewing a board costs one document read (plus one count query for the player's rank).
- Turkish visitors see `12.450` and a Turkish score label; English visitors see `12,450`.
- At Monday 09:00 UTC the weekly board empties and last week's top 100 is visible in the archive.

## 12. Implementation status

Shipped in Phase 2 slice 2.1 ([plan](../plan/phase-2.md)):

- **Sessions (§7):** `startSession` runs on `GHA_SESSION_START`, sent at the start of every run, rather than on `GHA_READY`, which comes once per page load. `finishSession` runs on `GHA_END`. The token is random and only its hash is stored. Run length comes from the server clock.
- **Validation:**
  - Too short → rejected.
  - Over `maxScore` or `maxPerSecond` → rejected, or flagged while the game calibrates (14 days from the later of its launch and 2026-10-26).
  - Client/server duration mismatch or an outlier → flagged.
  - 60 session starts per player per game per hour.
  - Flagged runs are stored in `scoreFlags/{sessionId}` and never touch the boards.
- **Boards (§2, §4, §9):**
  - Weekly season and all-time boards, each with a cached top 100.
  - Entries hold accepted scores only (no `flagged` field on entries); entries no longer carry `country`.
  - Ranks come from `count()` queries with ties broken by the earlier `achievedAt`.
  - Season archives are written lazily on the first score of a new week and by `closeLeaderboardSeason`. Finished-season entries are then deleted, since the archive keeps the top 100.
- **Rows:** usernames, avatars and the guest flag are copied into the top list. They are refreshed by `reserveUsername` and `syncLeaderboardProfile`. Guest merge moves the guest's better scores, and account deletion and guest cleanup remove the rows.
- **UI (§5, §6):**
  - Game page panel: tabs, top 10, the player's own row with rank, countdown, guest note.
  - Full page: top 100 plus last week's top 10.
  - End-of-run rank in the player toolbar.
  - Locale-aware formatting.
- **Not yet:**
  - Country and friends scopes.
  - Neighbors ±2.
  - In-game overlay.
  - Season rewards and notifications (Phase 5).
  - `accumulate` boards (Phase 4).
  - `scoring.allowContinues`.
  - p99.9 outlier statistics (currently 3 × the all-time #1 once the board has 10 players).
  - Profile placements.
- **Review (slice 2.3):** flagged scores are approved, rejected or the player banned from `/admin`. An approved score keeps its original time. It joins the weekly board only when it was reached in the current season.
