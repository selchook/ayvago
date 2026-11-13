# ADR 0026 — Two-seat tables: Tavla in the lobby

- Status: Accepted (2026-11-13)
- Related: [ADR 0015](0015-tables-for-four-with-bots.md) (tables), [ADR 0019](0019-table-lobby-presence-invites.md)
  (lobby), [ADR 0020](0020-quick-play-settings-host-handover.md) (quick play, settings, hand-over),
  [ADR 0021](0021-site-presence-recent-players.md) (recent players), [ADR 0010](0010-online-matches.md)
  (rooms), [Multiplayer spec §7a](../specs/multiplayer.md#7a-tables-for-up-to-four-protocol-23),
  [Phase 5 plan §5.29](../plan/phase-5.md#529-tavla-in-the-lobby-two-seat-tables--code)

## Context
The owner asked for the same lobby system as Okey for Tavla (Backgammon): open public tables,
players online, invites with the invite centre, recent players, quick play, private tables and the
same entry points on the game page. Tavla is a two-player game. Until now the rule was
`players.max > 2` → table game with a lobby, everything else → two-player room (ADR 0015), so
Tavla had only "Play with a friend".

Two ways were open:
- **(a) Two-seat tables.** Tavla is seated at a table of two and plays through the table system
  (`tables/{code}`, moves through `tableMoves/{code}`).
- **(b) Rooms in the lobby.** Tavla stays in two-player rooms, and the lobby learns to list and
  join rooms.

## Decision

### Tavla plays at two-seat tables (option a)
- The table system was built for 2–4 seats from the start: the rules, `syncLobbyTable`, the lobby
  summary, quick play, invites, hand-over and "Leave table" all accept `size: 2` unchanged. The
  emulator tests in `firebase/tests/table-duel.test.ts` pin that down. **No rule, function or
  index changes.**
- Option (b) would have needed a second lobby summary for rooms (a new trigger or client-written
  index), room invites in the rules, quick play over rooms and room presence. It would duplicate
  most of ADR 0019 and ADR 0020 for one game.
- A turn-based board game does not need WebRTC: one database round trip per move is enough, as
  for Okey, and needs no TURN credentials.

### Which games get a lobby: a catalog flag from the studio
- `SeedGame.tables` (`packages/shared/src/seed-catalog.ts`) marks a game played at tables.
  `isTableGame(game)` is `multiplayer && (tables || players.max > 2)`; the table size is
  `players.max` (two to four).
- The studio generates the flag. In a game's `game.json`, `"multiplayer"` is `true` for rooms or
  a number of seats for a table. Until now the generator wrote `true` for two players. Now any
  number makes `arcadeGame()` set `tables: true`, so `"multiplayer": 2` gives Tavla a two-seat table.
  Okey (`4`) gets the flag too and keeps its table through the `players.max > 2` rule anyway.
- **Why a flag and not a rule.** No manifest field says "turn-based", and the real-time
  two-player games (Neon Pong, Air Hockey) must stay in WebRTC rooms. The game opts in, because it
  also has to handle table semantics (below). Every other two-player game is unchanged.
- **Why not a manifest field.** `ayvago.json` is the strict, public contract for third-party
  developers. The flag only matters for the platform's own catalog, so it lives on `SeedGame`
  (the catalog entry), next to `featured` and `addedAt`. A manifest field can follow when outside
  developers want tables.

### A two-seat table is a duel
- **No bots.** A bot opponent is the game's own solo mode. `tableSettingsFor(size)` stores
  `bots: false` for every two-seat table (opened from the game page, the lobby, quick play, an
  invite or the profile's recent players). `toTable` reads a two-seat table without bots,
  whatever is stored. The rules already refuse bot seats when `bots` is false.
- **No hands or turn time.** Those settings are Okey's. Tavla keeps its own match to 5 points and
  has no turn clock, so a two-seat table shows only the visibility ("Who can sit down") and "Start
  by itself". The stored settings keep the defaults, and `GHA_START.config.table.settings` still
  carries them (`bots: false`).
- **Auto start and quick play** work as for Okey. Without bots, the countdown ends with "The game
  starts once an opponent sits down", and the host's page starts the table when the second
  player has sat down (still at least 10 s after they did). Quick play opens a public table that
  starts as soon as an opponent arrives: matchmaking for Tavla.
- **Texts.** Duel variants of the texts that talk about bots or several seats
  (`lobby.duel.*`, `table.duel.*`, `table.leave.body.gameDuel`).

### Protocol: no new message, the peer is filled in
- At a two-seat table `GHA_START.config` carries the seats, the table settings and the host seat
  (protocol 2.3 and 2.7), and since this ADR also `peerName` and `peerCharacter`: the other seat.
  So a game written for rooms finds its opponent where it always did. Bigger tables keep
  `peerName: ''`. The adapter is unchanged (no new adapter version).
- **Leaving during a game.** Nobody can play an empty seat at a table of two. The game ends the
  round as a win for the player who stayed, as in a room (`onSeatLeave` in the studio). The
  leaver's seat stays theirs: they come back with the table link, and the host starts a rematch.
  The leave dialog says so ("Your opponent wins this game"). The host hand-over (ADR 0020) still
  gives the role, and with it the rematch button, to the player who stayed.

### Old room links keep working
- `/games/{slug}/room` and `/room/{code}` stay generated for every multiplayer game, Tavla
  included, and the game still plays in rooms. Room links shared before the change, and rooms
  open at deploy time, keep working until they expire. The game page shows the table entry
  points instead of "Play with a friend".

## Consequences
- Tavla gets the whole lobby (public tables, online players, invites, recent players, quick play,
  private tables) with no backend change. Deploying is the web app, then the studio's catalog
  sync.
- **Order.** Either order compiles: an older platform ignores `tables` (spread properties are
  not checked against `SeedGame`). Merge the platform first anyway: until it is live, the sync
  would bring Tavla v1.4.0 without the lobby.
- A two-seat table is unranked, like every online match (ADR 0015).
- A short network drop during a Tavla game still counts as leaving after the table's 4-second
  grace, as a dropped WebRTC link does in a room.

## Next
- Resuming a Tavla game after a reload (the host's game resends the position) instead of ending
  the match.
- Per-game table settings (match length 3/5/7 for Tavla) through a manifest field, if more
  two-seat games want settings.
- Other turn-based two-player games (Mangala, Reversi, Turkish Draughts …) can join the lobby the
  same way: `"multiplayer": 2` and an `onSeatLeave` in the studio, no platform change.
