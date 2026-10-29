# Spec — Online two-player matches

- Status: Implemented (2026-10-28) — see §8
- Related: [Roadmap §10](../plan/roadmap.md#10-multiplayer--cloudflare-turn--firebase-signaling),
  [ADR 0003](../adr/0003-cloudflare-turn.md), [ADR 0010](../adr/0010-online-matches.md),
  [Phase 4 plan](../plan/phase-4.md)

## 1. Goals
- Two friends play a game against each other, each on their own device, from one shared link.
- No sign-up: a guest account is created on the spot.
- Works on home Wi-Fi, mobile carriers and office networks.
- Games never see Firebase, Cloudflare or WebRTC.

## 2. Player flow
1. On a multiplayer game's page, **Play with a friend → Create a room**.
2. The room page shows the invite link with **Copy link** and **Share** (the system share sheet on
   phones) and waits for the friend.
3. The friend opens the link. They get the guest seat and both see the game, with
   "Opponent: {name}" and the connection type above it.
4. The host starts each round; the guest's game follows. After a round the host chooses
   **Rematch** or **Menu**.
5. The host takes the first turn of the first round; after that the winner of the previous round
   starts (after a draw, the other player). The result screen says who starts next.
6. If a player leaves (closes the tab, loses the network for more than 4 seconds, or reloads the
   page), the other sees a notice and the round ends. When the player comes back through the same link, they take
   their seat again and the host can start a new round.

Error states: the room is full, does not exist, is closed or has expired (two hours). Each offers
**Create a new room** and a link back to the game.

## 3. Data (Realtime Database)

```
rooms/{code}            { gameId, slug, hostUid, hostName, hostCharacter?, guestUid?, guestName?, guestCharacter?, createdAt, status, online/{uid}: sessionId }
signals/{code}/{toUid}  { from, kind: hello|offer|answer|ice, data }   ← WebRTC handshake inbox, consumed by the recipient
relay/{code}/{pushId}   { from, data }                                 ← fallback channel, consumed by the recipient
```

Rules (`firebase/database.rules.json`, emulator tests in `firebase/tests/database.test.ts`):
- Signed-in players read a room by its code; nobody can list rooms.
- The host creates the room with an empty guest seat; the first other player claims it. Seats
  never change afterwards. Members update the status and their own `online` entry: a 12-hex
  page session id, removed by `onDisconnect`. A new id means the player reloaded.
- Each seat's character (`hostCharacter`, `guestCharacter`) is one of the ten ids of
  `packages/shared/src/characters.ts`. Only that seat's player may set, change or remove it; the
  guest character needs a claimed guest seat.
- Signals go only to the other member's inbox, written as yourself; only the recipient reads and
  deletes them.
- Relay messages are written by members as themselves (at most 16,000 characters) and deleted
  only by the recipient.
- `cleanupRooms` (hourly) deletes rooms older than two hours with their signals and relay.

## 4. Connection
- `GET /api/ice-servers` → STUN, plus Cloudflare TURN credentials when configured (ID token
  required, 20 requests per 10 minutes per player, 4-hour credentials, no port 53 URLs).
- **Always through TURN** ([ADR 0012](../adr/0012-online-matches-always-use-turn.md)): with TURN
  credentials the connection is TURN-only (`iceTransportPolicy: 'relay'`), so players never see
  each other's IP address. Without them it connects directly with STUN.
- One reliable, ordered DataChannel (`moves`). The host offers; the guest sends `hello` to ask for
  a fresh offer after a reload. A dropped channel is renegotiated up to 4 times.
- Until the channel opens (12 s at most before the page says "through the server") and whenever
  it is down, moves go through the relay. The page keeps listening to both.
- The page shows the route: TURN, direct (only without TURN credentials) or server.

## 5. Game protocol (adapter 2.2)
- `GHA_START.config`: `mode: 'multiplayer'`, `isHost`, `playerIndex` (host 0, guest 1),
  `playerCount: 2`, `peerName`.
- Protocol 2.2 ([ADR 0013](../adr/0013-player-characters.md)):
  - `character`: this player's chosen character, taken from their seat. It is left out when they
    have none.
  - `peerCharacter`: the other player's character, from the other seat. It is left out when they
    have none.
  - The adapter exposes it as `multiplayer.peerCharacter` (`''` when unknown).
  - Games without a matching hero ignore both fields.
- Game → platform: `GHA_MOVE_OUT { data }` (any JSON up to 16,000 characters).
- Platform → game: `GHA_MOVE_IN { data }`, `GHA_PEER_LEAVE`, `GHA_PEER_JOIN { name }`.
- The platform holds moves and presence changes until the game has received `GHA_START`.
- Online rounds send no score sessions; leaderboards stay solo only.

## 6. Ayvago Arcade runtime
- Messages are `{ t, d }`; types starting with `__` belong to the runtime
  (`__start { seed, starter }`, `__menu`).
- **Turn order rule** (every online game):
  - The room's host takes the first turn (or serve) of the first round.
  - After that, the previous round's winner starts.
  - After a draw, the player who did not start the last round starts.
  - The host computes the starter and sends it with `__start`; games read `net.starter` /
    `net.myTurnFirst`.
  - The result screen shows who starts the next round.
- The host starts each round with a shared seed. A round start that arrives before the guest's
  menu is listening (the guest still in the boot intro) is kept and applied when the menu opens.
- Real-time games (Neon Pong, Air Hockey): the host simulates; the guest sends its input and
  draws the host's state.
- Turn-based games: both sides apply each move; the seat decides whose turn it is.
- `npm run test:mp` in `ayvago-games` runs every online game twice side by side and plays the
  platform's part.

## 7. Not covered yet
- Quick match with strangers, spectators, more than two players, chat.
- An unordered channel for real-time games (the ordered channel is enough for two-player pong at
  20–30 updates per second).

## 8. Implementation status
Shipped in Phase 4 ([plan](../plan/phase-4.md)): everything in §2–§6. Slice 4.1 built rooms and
the connection, 4.4 the turn order rule, and 4.5 made every match go through TURN. Seat
characters and `peerCharacter` (§3, §5) shipped with Phase 5 slice 5.1
([plan](../plan/phase-5.md#51-player-characters-)): the platform sends them, and the studio adds
support to the games.
