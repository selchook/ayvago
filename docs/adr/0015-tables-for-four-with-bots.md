# ADR 0015 — Game tables for up to four players, with bots

- Status: Accepted (2026-11-06)
- Related: [ADR 0010](0010-online-matches.md) (two-player rooms),
  [ADR 0012](0012-online-matches-always-use-turn.md) (TURN), [Multiplayer spec](../specs/multiplayer.md),
  [Phase 5 plan](../plan/phase-5.md)

## Context
The owner asked for Turkish Okey with up to four players. The table can be one player and three
bots, two players and two bots, three and one, or four players. The player who opens the table
adds the bots. Rooms (ADR 0010) have exactly two seats and a WebRTC link between the two pages.
Four players would need a mesh of six links, or a relay through the host, all for a turn-based
game.

## Decision
- **Tables are a new kind of room**, for games with more than two players (`players.max > 2` in
  the manifest).
  - **Where they live:** `tables/{code}` in the Realtime Database, with the same code alphabet and
    two-hour lifetime as rooms.
  - **Seats:** `size` seats (2–4), each `{ uid, name, character? }` for a player or
    `{ bot: true, name }` for a bot, plus `status` (`open`, `playing`, `closed`) and presence
    (`online/{uid}`).
  - **Pages:** `/{locale}/games/{slug}/table` opens a table, and `/table/{code}` is the invite
    link.
  - **Game page:** a table game shows "Play at a table" instead of "Play with a friend".
- **Seats and the host.**
  - The host sits in seat 0.
  - Anyone signed in (a guest account is made on the spot) takes the first free seat while the
    table is `open`. The rules allow one seat per player and no bot seats from non-hosts.
  - The host adds and removes bots, can free a seat, and starts the game once every seat is
    taken. Starting sets `status: playing`, which closes the free seats.
- **Moves go through the database, not WebRTC.**
  - Tables are for turn-based games, so the database's latency is enough.
  - Every move is a child of `tableMoves/{code}`: `{ from: uid, seat, data }`, up to 16,000
    characters, readable and writable only by seated players and only from the sender's own seat.
  - A page listens only to moves written after it opened, so a reload starts fresh. Games resync
    from the host when a player joins again.
  - No TURN credentials or ICE requests are involved.
- **Protocol 2.3** (adapter 2.3.0, backwards compatible):
  - `GHA_START.config.seats` lists every seat (`{ name, character?, bot }`); this player sits at
    `playerIndex`, and `playerCount` is the number of seats;
  - `GHA_MOVE_IN` carries `from` (the sender's seat);
  - `GHA_PEER_LEAVE` and `GHA_PEER_JOIN` carry `seat`;
  - the adapter exposes `multiplayer.seats`, and its callbacks receive the seat. In two-player
    rooms the fields are absent and default to the other player.
- **Bots run in the host's game.** The platform only names the bot seats. The host's game plays
  them and sends their moves as its own (the game's messages say which seat moved). When a
  player leaves for good, the game may let the host play that seat too.
- **Cleanup:** `cleanupRooms` also deletes tables and their moves after two hours.

## Consequences
- Tables work on any network with no TURN cost. A move takes one database round trip, which is
  fine for card and board games and too slow for real-time games. Those stay two-player rooms.
- If the host leaves, nobody plays the bots, so the game waits for them. The host can come back
  through the same link; quick re-hosting is left for later.
- Online table rounds are not ranked on the leaderboards, like rooms.
