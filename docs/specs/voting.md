# Spec — Voting, Favorites and Game Ranking

- Status: Implemented in part (2026-10-26) — see §7
- Related: [Roadmap §8](../plan/roadmap.md), [Accounts](accounts.md), [Phase 2 plan](../plan/phase-2.md)

## 1. Goals

- Let players say quickly whether they liked a game.
- Turn votes plus real engagement into a fair ranking for the catalog shelves.
- Give developers (internally, later externally) actionable feedback.
- Resist vote manipulation.

### Lessons taken from CrazyGames
CrazyGames uses a simple **like / dislike** rating, **asks players why** when they leave a negative rating, and ranks games mainly on **engagement metrics** (plays, average playtime, retention, conversion) together with player feedback. New games get an **initial boost** so they can find an audience. Ayvago follows the same model.

## 2. Player-facing behavior

| Element | Where | Behavior |
|---|---|---|
| 👍 / 👎 buttons | Player toolbar under the game; end-of-run panel | One vote per player per game; tapping again removes it; switching is allowed |
| Like percentage | Toolbar, game tiles, game page | `92%` + vote count (`12.4K votes`), shown once a game has **≥ 20 votes**; before that a "New" badge |
| Negative feedback sheet | Opens after 👎 | Optional reasons (multi-select): *bugs or crashes*, *controls*, *too hard*, *boring*, *performance*, *too many ads*, *other* + optional 280-character comment |
| ❤ Favorite | Toolbar, tiles (long-press on mobile) | Separate from voting; feeds the "Favorites" shelf |
| Vote prompt | Toast after the 3rd session of a game or after a session longer than 5 minutes | Never during gameplay; at most once per game; dismissible |

All labels and reasons are message keys (en, tr). Comments are never shown publicly; they are visible to admins (and, in the developer program, to the game's developer, anonymized).

## 3. Eligibility and abuse protection

- The player must have **≥ 60 seconds of total play** in that game (`users/{uid}/stats/{gameId}.playSeconds`, written only by Functions). Enforced in Security Rules.
- Guests can vote (they have a real uid), but App Check is required and a guest's votes are dropped if the guest account is deleted.
- Rate limit: at most 30 vote changes per user per hour across all games.
- Burst detection: a nightly job flags games whose vote rate is far above their play rate (e.g. votes/plays > 5× the catalog median within 24 h); flagged votes are excluded from ranking until reviewed.
- Comments pass a profanity filter and are length-limited.

## 4. Ranking model

Shelves are ordered by scores computed nightly (and on demand for new games) by `recomputeGameScores`.

### 4.1 Rating score (votes)
The **Wilson score lower bound** (95% confidence) of the like ratio. Unlike a raw percentage it does not let a game with 3 likes / 0 dislikes outrank one with 950 / 50:

```
p = likes / n,  n = likes + dislikes,  z = 1.96
wilson = (p + z²/2n − z·√(p(1−p)/n + z²/4n²)) / (1 + z²/n)
```

### 4.2 Engagement score
Normalized (percentile within the catalog) and weighted:

| Metric | Weight |
|---|---|
| Median session length | 0.35 |
| Day-1 return rate (players who come back to the game the next day) | 0.25 |
| Plays in the last 7 days | 0.25 |
| Completion rate (sessions that reach `GHA_END`) | 0.15 |

### 4.3 Combined scores

| Score | Formula | Used by |
|---|---|---|
| `qualityScore` | `0.4 · wilson + 0.6 · engagement` | "Top rated", category pages, related games |
| `trendScore` | `qualityScore × growth`, where `growth` = plays in the last 3 days vs the previous 7-day average (capped at 3×) | "Popular this week", home hero candidates |
| New-game boost | Games younger than **14 days** get a guaranteed slot in "New" and `× 1.25` on `trendScore` | "New", "Popular" |

Weights live in Remote Config so they can be tuned without a deploy. Editor's picks are manual and bypass scores.

## 5. Data model

| Path | Content | Writer |
|---|---|---|
| `games/{gameId}/votes/{uid}` | `value: 1 \| -1`, `reasons: string[]`, `comment?`, `updatedAt` | Owner (rules: eligibility, allowed reasons, comment length) |
| `games/{gameId}` | `likes`, `dislikes`, `likePercent`, `wilson`, `engagement`, `qualityScore`, `trendScore`, `scoresUpdatedAt` | Functions |
| `games/{gameId}/feedback/{yyyy-mm-dd}` | Daily aggregate of negative reasons | Functions |
| `users/{uid}/favorites/{gameId}` | `addedAt` | Owner |

Functions: `onVoteWritten` (increments counters with a transaction; distributed counters if a game exceeds ~1 write/s), `recomputeGameScores` (nightly), `aggregateFeedback` (nightly).

Engagement inputs come from `sessions` (written by `startSession`/`finishSession`), not from client analytics.

## 6. Acceptance criteria

- A player with less than 60 s in a game cannot vote (rules test).
- Voting, changing and removing a vote keeps `likes`/`dislikes` consistent.
- A game with 3 likes and no dislikes ranks below a game with 950 likes and 50 dislikes.
- Negative reasons appear in the admin feedback view, aggregated per day.
- A new game appears in the "New" shelf on launch day regardless of score.

## 7. Implementation status

Shipped in Phase 2 slice 2.2 ([plan](../plan/phase-2.md#22-voting-and-ranking-)):

- **Votes:** written only through the `castVote` callable (no client writes, no `onVoteWritten` trigger). The callable checks eligibility (60 s of play from `users/{uid}/stats/{gameId}`, which only the session functions write) and the rate limit (30 changes per hour). It also validates the reasons and comment, and updates the counters in the same transaction. `games/{gameId}/votes/{uid}` is readable by its owner only.
- **Feedback:** daily aggregates in `games/{gameId}/feedback/{day}` (`count`, `comments`, `reasons.<id>`), written by `castVote`. No nightly `aggregateFeedback` job.
- **Ranking:** `recomputeRankings` runs hourly. It computes Wilson, engagement, `qualityScore` and `trendScore` from `games/{gameId}/daily/{day}` (started/finished runs and play time from score sessions), and publishes `rankings/catalog` for the web app.
- **UI:**
  - Toolbar 👍 / 👎 and the negative feedback form.
  - The vote nudge.
  - Like percentages from 20 votes on the toolbar and tiles.
  - "Popular this week" and "Continue playing" shelves; quality-ordered category shelves, category pages and related games.
- **Favorites** stay in the library document (`users/{uid}/library/state`) from Phase 1, not in `users/{uid}/favorites/{gameId}`.
- **Not yet:**
  - Day-1 return rate and median session length.
  - Remote Config weights.
  - Burst detection.
  - Admin feedback view (Phase 2 slice 2.3).
  - "Top rated" shelf.
  - Long-press favorite.
