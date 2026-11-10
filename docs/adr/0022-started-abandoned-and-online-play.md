# ADR 0022 — Counting started runs, abandoned runs and online matches

- Status: Accepted (2026-11-10)
- Related: [ADR 0006](0006-score-sessions.md) (score sessions), [ADR 0010](0010-online-matches.md)
  (rooms), [ADR 0015](0015-tables-for-four-with-bots.md) (tables),
  [ADR 0021](0021-site-presence-recent-players.md) (the triggers that see a match start),
  [Phase 5 plan §5.22](../plan/phase-5.md#522-play-report-counts-starts-online-matches-and-abandoned-runs--code)

## Context
The admin "Players and plays" report (slice 5.16) reads `users/{uid}/stats/{gameId}`, which only
grew when a solo run reached `GHA_END`. Production showed that most runs never do: in four days
70 of 126 score sessions were still `open`. Runs the player leaves were counted only as
`games/{gameId}/daily.started`, and online rounds (rooms and tables) were never counted, because
they are not ranked and the game player skips score sessions for them. The per-player numbers
barely moved.

The owner approved three additions, with one constraint: none of them may change leaderboards,
XP, achievements, vote eligibility or the catalog ranking, and no client may inflate them.

## Decision

### Data model (new fields only)
`users/{uid}/stats/{gameId}`:
- `starts`: solo runs started, counted by `startSession` in the batch that creates the session;
- `abandonedSeconds`: time of solo runs left without `GHA_END`;
- `onlinePlays`: online matches the player sat in; `lastOnlineMatch` holds the last match key;
- `lastPlayedAt` now also moves on a start, an abandoned run and an online match.

`games/{gameId}/daily/{day}`: `abandonedSeconds` and `onlineStarted` (matches, not seats).

`plays`, `playSeconds`, `started`, `finished` keep their meaning. Missing fields read as 0.

### Abandoned runs keep their own time field
The brief suggested adding the time of an abandoned run to `playSeconds`. It goes to
`abandonedSeconds` instead, because `playSeconds` has two other readers:
- `castVote` requires `VOTE_MIN_PLAY_SECONDS` of `playSeconds` per game;
- `recomputeRankings` computes `avgSessionSeconds = playSeconds / finished` over seven days.

Adding time without a finished run would let players reach vote eligibility by leaving runs and
would raise every game's average session length. The report adds the two fields up.

### `abandonSession({ sessionId, token, durationMs })`
- Same checks as `finishSession`: signed in and not banned, App Check by the mode in
  `config/appCheck`, the caller owns the session, the token matches, the session is `open`.
- One transaction closes the session as `abandoned` and adds the time, so a run is either
  finished or abandoned, once. A finish that already claimed the session (`finishing`) wins.
- Counted time: `min(durationMs, server elapsed, MAX_COUNTED_RUN_MS)`. The client sends the time
  the page was **visible** (the game is paused while hidden), so a forgotten background tab adds
  nothing; the server's clock bounds it from above.
- Sessions older than `SESSION_MAX_AGE_MS` (6 hours) and games no longer live are closed as
  `expired` and count nothing, as `finishSession` rejects them.

### Client signals
The game player abandons the open run when:
- the game reports a new `GHA_SESSION_START`, or `GHA_END` without a score;
- the player leaves the game page (unmount: another route) or reloads the game frame;
- `pagehide` (tab closed, navigation away). A callable cannot finish once the page is gone, so the
  page sends the callable protocol itself with `fetch(url, { keepalive: true })`: the function's
  URL, `Authorization: Bearer <ID token>` and `X-Firebase-AppCheck` when App Check runs. The
  tokens are read when the session is registered and every 15 minutes while it is open, because a
  closing page cannot wait for them. Tested in Chromium against the emulators.

`navigator.sendBeacon` was not used: it cannot set the `Authorization` header, so it would need a
separate HTTP function that verifies a token in the body.

### No signal: count nothing
`cleanupSessions` (daily) marks `open` sessions older than 6 hours as `expired`. Their time is
unknown (a crash, a lost connection, a browser without keepalive), so nothing is counted: any
bound would be a guess, and the 3-hour cap would add hours for runs that may have lasted seconds.
The Progress report workflow then tells `expired` (no signal) from `open` (may still end).

### Online matches: counted by the server, matches only
- **Tables:** `syncLobbyTable` counts every human seat when a table turns `playing` (bots never,
  guests always), also one person with bots. **Rooms:** `recordRoomPlayers` counts both players
  when the guest seat is taken.
- One transaction per match: each player's `onlinePlays` (skipped when `lastOnlineMatch` equals
  the match key, the key ADR 0021 uses), and `onlineStarted` on the game's day only when anybody
  was new. A repeated trigger event counts nothing.
- Only games of the live catalog count, so a made-up table cannot add games to the stats.
- **No online play time.** A table stays `playing` until its host leaves alone or the hourly
  cleanup deletes it after two hours; a room has no end marker at all. Both are client-driven, so
  the server cannot know when a match ended. Only matches are counted.

### What stays unchanged
Leaderboards, XP, achievements, vote eligibility (`playSeconds`), the catalog ranking and the
spotlight `todayScore` (`started`, `finished`, `playSeconds` of the daily documents). Tests prove
the ranking output is identical with and without the new daily fields.

## Consequences
- The report shows starts, finished runs, online matches and play time (finished + abandoned) per
  player, kind and game. The new numbers exist only from the slice's deploy day
  (`EXTENDED_STATS_SINCE` in `packages/shared/src/play-report.ts`); the report says so.
- Every start writes one more document (the player's stats, in the same batch as the session).
- The `cleanupSessions` query needs a composite index on `sessions (status, startedAt)`.
- Guest merge (`removeVotes`) moves every counter and keeps the newer `lastPlayedAt`.

## Next
- Counting online play time needs a server-observed end: for example a table status `finished`
  written by the host and bounded by the server, or a room `endedAt`.
- Counting abandoned time towards vote eligibility is possible later, if the owner wants it.
