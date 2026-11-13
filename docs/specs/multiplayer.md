# Spec — Online two-player matches

- Status: Implemented (2026-10-28); tables for up to four added 2026-11-06, their lobby
  2026-11-09, two-seat tables for Tavla 2026-11-13 — see §7a, §7b and §8
- Related: [Roadmap §10](../plan/roadmap.md#10-multiplayer--cloudflare-turn--firebase-signaling),
  [ADR 0003](../adr/0003-cloudflare-turn.md), [ADR 0010](../adr/0010-online-matches.md),
  [ADR 0015](../adr/0015-tables-for-four-with-bots.md) (tables),
  [ADR 0019](../adr/0019-table-lobby-presence-invites.md) (lobby, presence, invites),
  [ADR 0026](../adr/0026-two-seat-tables.md) (two-seat tables),
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
- Each seat's character (`hostCharacter`, `guestCharacter`) is one of the five ids of
  `packages/shared/src/characters.ts`. Only that seat's player may set, change or remove it; the
  guest character needs a claimed guest seat. A value left from before slice 5.1b (a retired
  alien id) may stay as it is; the app reads it as "no choice", and the seat's player can replace
  it with a listed id.
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
- Protocol 2.4 ([ADR 0017](../adr/0017-server-best-and-fresh-start.md)) adds `best`, the
  player's server best, to `GHA_START.config`. Online rounds are not ranked, so rooms and tables
  leave it out and games keep their own value.
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

## 7a. Tables for up to four (protocol 2.3)
- Games with `players.max > 2`, and two-player games flagged for tables (Tavla, below), are
  played at a table, not in a room ([ADR 0015](../adr/0015-tables-for-four-with-bots.md)):
  - `tables/{code}` holds 2–4 seats (players or bots), `status` and presence;
  - `/games/{slug}/table` opens one, and `/table/{code}` is the invite link.
- The host sits in seat 0, adds or removes bots on empty seats and starts the game once every seat
  is taken. Others take the first free seat from the link while the table is open.
- Moves go through `tableMoves/{code}` in the database (no WebRTC); a page reads only the moves
  written after it opened.
- Game protocol:
  - `GHA_START.config.seats` (`{ name, character?, bot }` per seat), with this player at
    `playerIndex`;
  - `GHA_MOVE_IN.from` (the sender's seat);
  - `GHA_PEER_LEAVE.seat` and `GHA_PEER_JOIN.seat`;
  - the adapter's `multiplayer.seats` and seat-aware callbacks.
- The host's game plays the bot seats and sends their moves.

**Two-seat tables (Tavla).** Decision and reasons: [ADR 0026](../adr/0026-two-seat-tables.md).
- A two-player game the studio flags (`SeedGame.tables`, from `"multiplayer": 2` in the game's
  `game.json`) is a table game too: lobby, quick play, invites, recent players and private
  tables, with tables of two seats. Other two-player games keep rooms.
- **No bots and no hands or turn settings** at a table of two: every two-seat table is stored with
  `bots: false`, and the forms show only "Who can sit down". The host starts once the opponent sits
  down; an auto-start table starts by itself then.
- **`GHA_START`** carries the seats and `table` as at any table, plus `peerName` and
  `peerCharacter` set to the other seat, so code written for rooms finds the opponent.
- **Leaving during a game:** nobody can play the empty seat, so the game ends the round as a win
  for the player who stayed, as in a room. The leaver's seat stays theirs; they come back with the
  link and the host starts a rematch.
- Old room links (`/room/{code}`) keep working; the game page shows the table entry points.

## 7b. The lobby of a table game
Decision and reasons: [ADR 0019](../adr/0019-table-lobby-presence-invites.md).

**Pages.**
- `/{locale}/games/{slug}/lobby` for every live table game (`noindex`): Okey, and Tavla with
  two-seat tables (§7a). The game page leads there
  ("Go to the lobby") and keeps "Open a private table" for the invite-link flow.
- **Tables.** The public tables of the game, live:
  - each with the host's name and character, the table code, how long ago it opened, one marker
    per seat (player, bot, free) and its status: free seats, full, or playing;
  - open tables with free seats come first, the fullest first;
  - **Sit down** opens `/games/{slug}/table/{code}`, which takes a free seat (guest account on the
    spot);
  - **Open a table** opens a public table with the existing host flow (bots, start).
- **Online now.** Everyone in the lobby or at a table of the game, this player first marked
  "you":
  - with character or initial avatar, name, level, and state: in the lobby, at a table, playing;
  - **Invite** next to everyone who is not at this player's table and takes invites. Without an
    open table, inviting opens a public one and goes there;
  - the button follows the invite: sending, invited, joining. "Declined" or "No answer" stays
    next to it once the invite has ended;
  - the table page shows the same list (without this player) while the table waits.
- **Visibility.** The host's table page has "Show this table in the lobby" (`visibility`).

**Notification.** On every page, for signed-in players and guests who were in a lobby during the
last 12 hours:
- a toast "X invites you to play Okey" with **Join**, **Decline**, a close button and the seconds
  left (two minutes);
- a bell with the number of open invites in the top bar, which lists them too.

How it behaves:
- Outside a game round the toast is an alert dialog with a soft chime that takes the focus;
  Escape closes it into the bell.
- During a round, or while the player types, the toast is compact and silent, does not take the
  focus, and is announced politely.
- Join answers `accepted` and opens the table. Decline answers `declined`, and the inviter sees
  "Declined"; without an answer the inviter sees "No answer" after two minutes.
- Profile settings → **Table invites** turns invites off (`users/{uid}.invitesOff`).

**Data (Realtime Database).**
```
tables/{code}/visibility             'public' | 'private'   (missing: private)
lobby/{gameId}/tables/{code}         { gameId, slug, size, status, createdAt, hostName, hostCharacter?, seats: [{ kind, name?, character? }], online }   ← syncLobbyTable trigger only, no uids
presence/lobbies/{gameId}/{uid}      { name, character?, level?, state: lobby|table|playing, since, dnd? }   ← own entry, onDisconnect().remove()
invites/{toUid}/{fromUid}            { fromUid, fromName, fromCharacter?, gameId, slug, tableCode, createdAt, answer? }
inviteQuota/{uid}                    { start, count }        ← at most 5 invites per 60 s
```

**Rules** (emulator tests in `firebase/tests/lobby.test.ts`):
- **Lobby list:** signed-in players read one game's list; no client writes it.
- **Presence:** a player writes or removes only their own entry, with validated fields and nothing
  else; signed-in players read one game's list.
- **Sending an invite** needs all of these:
  - the sender writes it under their own uid;
  - the sender sits at the open table it names, with the matching game;
  - the recipient is in that game's lobby, without `dnd`, and not seated there (since slice 5.21
    also anyone online on the site, §7e);
  - `createdAt` is the server's `now`;
  - the earlier invite to the same player is answered or expired;
  - the quota counts it in the same write.
- **Answering:** the recipient reads their inbox and answers once.
- **Reading back:** the sender reads only their own invite.
- **Deleting:** either side may delete.
- **Quota:** it only counts up within the window, a new window starts with the server's `now`
  after the old one ended, and it cannot be deleted.

**Cleanup.** `cleanupRooms` (hourly) also removes:
- lobby entries older than two hours;
- invites older than 20 minutes;
- quotas whose window ended an hour ago.

## 7c. Quick play, table settings and host hand-over (protocol 2.7)
Decision and reasons: [ADR 0020](../adr/0020-quick-play-settings-host-handover.md).

**Quick play.** A button on the lobby and on the game page.
- One tap seats the player at the best open public table of the game that has a free seat:
  - the tables tried are open, have someone present (or were opened in the last 15 seconds by a
    player who is the only one seated), and have at least 15 minutes left;
  - the most players seated first, then the oldest.
- If no table takes the player, it opens a public table with the default settings that **starts
  by itself**.
- Players who tap at the same moment meet through `quickPlay/{gameId}`, which only moves by
  transaction.

**Auto start.**
- Quick-play tables, and public tables whose host ticks "Start by itself", count down 20 s.
- Everyone at the table sees the countdown, by the database's clock.
- Every player who sits down leaves at least 10 s.
- When the countdown ends, the host's page fills the empty seats with bots (if the table allows
  them) and starts, in one transaction. With bots off it starts once every seat has a player.
- The host can start earlier with "Start now with bots".

**Settings.**
- Chosen in the "Open a table" form (lobby: public by default; game page: private by default).
- The host changes them while the table is open. Others see them as tags on the table page and in
  the lobby row:
  - hands per match: 5 or 11;
  - time per turn: 15 s fast, 30 s normal, 60 s relaxed;
  - bots: allowed or players only.
- Defaults: 5 hands, 30 s, bots allowed. Tables from before 5.19 read as the defaults.

**Host hand-over.**
- When the host's table page has been gone for 15 s, the present seated player in the lowest seat
  becomes host. Each next one waits 5 s more, in case the first is stuck.
- The page shows "You are the host now" or "X is the host now".
- The returning old host is a normal player in their old seat.

**Data.**
```
tables/{code}/settings     { hands: 5|11, turnSeconds: 15|30|60, bots }   ← host, changes only while open
tables/{code}/startAt      number (server ms)                             ← host, only while open, ≤ now + 2 min
tables/{code}/hostUid      a seated, present player may set it to themself when the host is not present
quickPlay/{gameId}         { code, at }                                   ← host of that open public table, at = now
lobby/{gameId}/tables/{code}   + settings, autoStart?                     ← syncLobbyTable
```
Rules (emulator tests in `firebase/tests/table-play.test.ts`):
- settings: valid values only, host only, a change only while the table is open;
- no bot seats at a table without bots, and bots cannot be turned off while one is seated;
- `startAt`: host only, while open, at most two minutes ahead;
- hand-over: only to oneself, only when seated and present, only when the host is not present,
  only while the table is open or playing;
- quick-play pointer: only for one's own open public table of that game; nobody deletes it.
  `cleanupRooms` removes pointers older than two hours.

**Game protocol 2.7** (adapter 2.7.0; the contract for the studio):
- `GHA_START.config.table`, for table games only (absent in rooms, solo runs and from platforms
  before 2.7):
  ```ts
  table?: {
    settings: { hands: 5 | 11; turnSeconds: 15 | 30 | 60; bots: boolean };
    hostSeat: number; // the host's seat when the game starts (0 unless a hand-over happened before)
  }
  ```
  - `isHost` equals `hostSeat === playerIndex`.
  - `bots: false` means every seat is a player (`seats[i].bot` is false for all).
  - A game should play `hands` hands and give each turn `turnSeconds` seconds. When the time runs
    out, the game plays an automatic move for that seat, decided by the host's game for bot seats
    and by the player's own game for theirs.
- `GHA_HOST_CHANGE { hostSeat: number }`, platform → game, during a table game only:
  - The host left (their page was gone for 15 s) and the player in `hostSeat` took over. Every
    game at the table receives it, including the new host's.
  - From then on the new host's game plays the bot seats and resyncs players who come back.
    Before it, the games get `GHA_PEER_LEAVE { seat }` for the old host as usual.
  - The new host's game should take over from the last state it knows (every move went to every
    player, so all games have the same state).
- The old host's seat stays theirs. They can come back (`GHA_PEER_JOIN { seat }`), now as a normal
  player. Their game restarts on reload, with `isHost: false` and the current `hostSeat` in
  `GHA_START`.
- A non-host player who leaves during a game changes nothing on the platform except
  `GHA_PEER_LEAVE { seat }`. The host's game may play that seat as a bot until
  `GHA_PEER_JOIN { seat }`.
- Adapter API:
  - `multiplayer.table: TableConfig | null` (settings and host seat; null in rooms, solo and
    offline);
  - `multiplayer.hostSeat: number` (0 outside tables);
  - `multiplayer.isHost` follows hand-overs;
  - `multiplayer.onHostChange((hostSeat) => …)` runs after `isHost` and `hostSeat` have changed.
- The adapter ignores a malformed `table` (as if absent) and a `GHA_HOST_CHANGE` with a seat
  outside the table, with the current host seat, or outside a table game.

## 7d. Leave table
"Leave table" sits in the table header next to the Lobby link, in every state (waiting, counting
down, playing). A dialog confirms it (Leave / Stay; Escape, Stay or the backdrop cancels):
- **Waiting table:** "Leave this table?". The leaver's seat becomes free (one write with their
  presence), pending invites they sent to it are taken back, and they go to the game's lobby.
- **Host of a waiting table, alone** (bots do not count): the table closes (`status: closed`), so it
  leaves the lobby list and its link says "This table is closed".
- **Host with other players seated** (waiting or playing): the host writes `hostLeft` = their uid
  in the same write that removes their presence (a transaction on the table). The next present
  player in seat order takes over **at once** instead of after 15 s (each next one still 5 s
  later), and the games hear `GHA_PEER_LEAVE` for the host's seat at once, before
  `GHA_HOST_CHANGE`.
- **During a game:** "Leave the game? A bot will play your seat for the others." Only the
  leaver's presence goes; the others' games get `GHA_PEER_LEAVE { seat }` after the usual 4 s and
  the host's game plays the seat as a bot. **The seat stays theirs:** the table link (or "Back to
  your table" in the lobby) brings them back, and the games get `GHA_PEER_JOIN { seat }`.
- No penalty and no statistics: tables are unranked.

**Data.**
```
tables/{code}/hostLeft     uid of the host who left on purpose   ← host only; must equal hostUid,
                                                                     with the host's presence gone
                                                                     in the same write; open or playing
```
A marker left by an earlier host means nothing (clients compare it with `hostUid`) and may stay as
it is in later whole-table writes. A host who comes back to the table clears it. Emulator tests:
`firebase/tests/table-leave.test.ts`.

## 7e. Site-wide presence and recent players
Decision and reasons: [ADR 0021](../adr/0021-site-presence-recent-players.md).

**Online status on every page.**
- A signed-in player (guests too) is online on the whole site while they use a tab:
  - the tab connects after the first tap, click or key press; lobby, table and room pages connect
    at once;
  - a tab hidden for 10 minutes goes away and comes back when it is in front again (not on lobby,
    table and room pages).
- The state, from the least to the most busy:

  | State | Where |
  |---|---|
  | `online` | any page (with `gameId` on a game's page) |
  | `lobby` | a game's lobby |
  | `table` | at a table, or in a two-player room before the match |
  | `playing` | a table or room match, or a solo round |

  A tab shows its busiest state. With several tabs, the tab used last wins.
- **"Show me as online"** (profile settings, on by default; `users/{uid}.hideOnline`): when off,
  the player has no presence at all, in the lobbies too. Nobody sees them online and nobody can
  invite them. They can still sit at tables and play rooms.

**Recent players.**
- Everyone the player shared a **table** with (when it started) or a **two-player room** with
  (when both had joined). Bots never count; guests do. The newest 30 are kept.
- Each row shows the character or initial avatar, the name, the game, "x times · 2 h ago", and an
  online dot with the state ("Playing · Okey").
- **Invite** appears while the player is online and takes invites:
  - in a game's lobby (the 6 newest, next to "Online now"): it invites to this game's table, as
    for players in the lobby;
  - on the profile (8, "Show all" up to 30): it invites to the table game played together.
    Players from two-player room games show their status but no Invite.
- The invite notification (§7b) now works on every page for every present player, not only after
  a lobby visit.

**Data.**
```
presence/site/{uid}                       { name, character?, level?, state: online|lobby|table|playing, gameId?, since, dnd? }   ← own entry, onDisconnect().remove()
users/{uid}/recentPlayers/{otherUid}      { uid, name, character?, gameId, slug, lastPlayedAt, count, lastMatch }   ← Firestore, triggers only
users/{uid}.hideOnline                    boolean ("Show me as online" off)
```

**Rules** (emulator tests in `firebase/tests/presence.test.ts`):
- **Site presence:** a player writes or removes only their own entry, with validated fields and
  nothing else (no hidden flag). Signed-in players read **one uid's entry**; `presence/site`
  cannot be listed.
- **Invites:** the recipient has a lobby entry for the game **or** a site entry, and neither has
  `dnd`. All other §7b checks stay.
- **Recent players:** the owner reads them; no client writes them.
- **Profile:** `hideOnline` is a boolean the owner sets.

**Server.**
- `syncLobbyTable` records the table's players when a table turns `playing`.
- `recordRoomPlayers` (`rooms/{code}/guestUid` created) records both players of a room.
- Both trim each list to 30, and count a repeated event once.
- `deleteMyData` and the guest cleanup also remove the player from other players' lists;
  `mergeGuestAccount` moves a guest's recent players to the account.

## 7. Not covered yet
- Quick match with strangers in two-player rooms, spectators, chat (tables: see ADR 0019 and
  ADR 0020 "Next").
- Friends, invites to two-player rooms, and a site-wide "N online" count (ADR 0021 "Next").
- An unordered channel for real-time games (the ordered channel is enough for two-player pong at
  20–30 updates per second).

## 8. Implementation status
Shipped in Phase 4 ([plan](../plan/phase-4.md)): everything in §2–§6. Slice 4.1 built rooms and
the connection, 4.4 the turn order rule, and 4.5 made every match go through TURN. Seat
characters and `peerCharacter` (§3, §5) shipped with Phase 5 slice 5.1
([plan](../plan/phase-5.md#51-player-characters-)): the platform sends them, and the studio adds
support to the games. Slice 5.1b ([plan](../plan/phase-5.md#51b-five-characters-)) cut the list to
the five human figures. Tables for up to four with bots (§7a) shipped with slice 5.12
([plan](../plan/phase-5.md#512-game-tables-for-up-to-four-with-bots--code)). The lobby with
public tables, presence and invites (§7b) shipped with slice 5.18
([plan](../plan/phase-5.md#518-a-lobby-for-table-games-okey-first--code)). Quick play, table
settings, auto start, host hand-over and protocol 2.7 (§7c) shipped with slice 5.19
([plan](../plan/phase-5.md#519-quick-play-table-settings-and-host-hand-over--code)) on the
platform; the studio adds `table` and `GHA_HOST_CHANGE` to Okey. The "Leave table" button (§7d)
shipped with slice 5.20 ([plan](../plan/phase-5.md#520-leave-table--code)). Site-wide presence,
recent players and invites from anywhere (§7e) shipped with slice 5.21
([plan](../plan/phase-5.md#521-site-wide-online-status-and-recent-players--code)). Two-seat
tables and the lobby for Tavla (§7a) shipped with slice 5.29
([plan](../plan/phase-5.md#529-tavla-in-the-lobby-two-seat-tables--code)) on the platform; the
studio flags Tavla with `"multiplayer": 2` and ends its round when the opponent leaves.
