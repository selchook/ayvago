# ADR 0020 — Quick play, table settings and host hand-over

- Status: Accepted (2026-11-09)
- Related: [ADR 0015](0015-tables-for-four-with-bots.md) (tables), [ADR 0019](0019-table-lobby-presence-invites.md)
  (lobby, "Next" items 1, 2 and 6), [Multiplayer spec §7c](../specs/multiplayer.md#7c-quick-play-table-settings-and-host-hand-over-protocol-27),
  [Phase 5 plan §5.19](../plan/phase-5.md#519-quick-play-table-settings-and-host-hand-over--code)

## Context
The lobby (ADR 0019) lists public tables, but every table still needs a host who adds bots and
presses Start, and a table whose host leaves is stuck: nobody plays the bots and nobody can start
it (ADR 0015, Consequences). The owner approved step 2 of the lobby:
- **Quick play:** one tap seats the player at a table, or opens one that starts by itself.
- **Table settings:** the number of hands and the turn time, chosen when the table opens.
- **Host hand-over:** another player takes over when the host is gone.

Clients cannot list `tables/` (it holds uids). There is no matchmaking server, and we want no new
Cloud Function: database triggers needed a one-time IAM step (ADR 0019) and callables add a cold
start to a one-tap action.

## Decision

### Table settings: `tables/{code}/settings`
- `{ hands: 5 | 11, turnSeconds: 15 | 30 | 60, bots: boolean }`.
  - Defaults: 5 hands, 30 s, bots on. Tables without the field read as the defaults.
  - The opener chooses them in a form: "Open a table" in the lobby (public by default) and on the
    game page (private by default), together with the visibility.
  - The host changes them while the table is `open`.
- **Rules:**
  - only the listed values, no other fields;
  - a changed value only while `status` is `open`;
  - only the host writes them (the host's write on the table, as before).
- **Bots off** means no bot seats. The rules refuse a bot seat at such a table, and refuse turning
  bots off while a bot is seated. The client frees the bot seats in the same write.
- The lobby summary (`syncLobbyTable`) carries `settings` and `autoStart`. The lobby shows them on
  every row, the table page in its settings card.
- **They reach the game in `GHA_START.config.table`** (protocol 2.7, below).

### Auto start: `tables/{code}/startAt`
- A table with `startAt` (server time, ms) starts by itself when the countdown ends:
  - tables opened by quick play start 20 s after opening;
  - the host of a public table can turn it on or off ("Start by itself"), which sets a fresh
    20-second countdown or removes it. Turning a table private removes it too.
- Every page at the table shows the countdown, by the database's clock
  (`.info/serverTimeOffset`).
- **Every new player who sits down leaves at least 10 s.** The host's page moves `startAt` when it
  sees a new player and less than 10 s are left.
- **The host's page starts the table** in one transaction on `tables/{code}`:
  - it fills the empty seats with bots (when the table allows them), sets `status: playing` and
    removes `startAt`;
  - a transaction means a player who sits down at the same moment is never overwritten by a bot;
  - if the transaction sees a player the host's page has not seen yet, it gives up and moves the
    countdown first, so the late player gets the 10 seconds;
  - with bots off, the table starts once every seat has a player.
- The host can start earlier: "Start now with bots" fills the empty seats the same way.
- **Rules:** `startAt` is a number at most two minutes ahead, written by the host only, and only
  while the table is `open`. So the start has to remove it in the same write.
- **Why the host's page, not a server timer:** a scheduled function cannot fire on a 20-second
  deadline without polling, and the host's page already owns the table. If the host is gone, the
  hand-over below gives the countdown a new owner.

### Quick play: `quickPlay/{gameId}`
"Quick play" sits on the lobby and on the game page. One tap:
1. **Candidates.** Read the lobby list and the quick-play pointer `quickPlay/{gameId}` =
   `{ code, at }`, the table quick play opened last. The pointer's table is read directly when the
   list does not have it yet (the trigger follows a moment later).
2. **Sit down.** Try the candidates in order with the normal join (atomic per seat):
   - only open tables with a free seat, someone present and at least 15 minutes left of their two
     hours. A table opened in the last 15 seconds with only its opener seated counts as attended,
     because the opener's page may still be loading;
   - the most players seated first (it starts soonest and with the fewest bots), then the oldest.
3. **Otherwise open a table** (public, default settings, auto start) and point quick play at it
   with a **transaction** on the pointer:
   - the pointer moves only if it still holds what step 1 read;
   - if another player's quick play moved it in the meantime, this player sits at that table and
     deletes the table they just opened, unless someone already sat down there.
   - So two or three players who tap at the same moment end up at one table.
- **Pointer rules:** signed-in players read it. A player may write it only for a table they host
  that is `open`, `public` and of that game, with `at` = the server's `now`. Nobody deletes it;
  `cleanupRooms` removes pointers older than two hours.
- The pointer holds a table code, no uid. Public table codes are in the lobby list anyway.
- **Why a pointer, not only the list:** the list is written by a trigger. After a cold start it
  can lag by seconds, so two players a few seconds apart would open two tables. The pointer
  changes synchronously, and the transaction settles real races.

### Host hand-over
- **When.** The host's table page has been gone (no `online/{hostUid}`) for 15 s:
  - the seated player in the lowest seat whose page is open takes over, by setting `hostUid` to
    themself;
  - each next player in seat order waits 5 s longer, in case the first one is stuck.
- **How.** The write is a transaction on `hostUid` (compare-and-set from the old host), so two
  players who decide at once cannot both win.
- **Rules.** A player may write `tables/{code}/hostUid` only if all of these hold:
  - the new value is their own uid;
  - they sit at the table and have it open (`online/{uid}`);
  - the current host is not present;
  - the table is `open` or `playing`.

  Every other host-only write follows `hostUid`. The new host gets them, and the old host loses
  them. A host still cannot hand the table to someone else directly.
- **Rules cannot measure absence.** The 15 seconds are the clients' convention: a seated player
  could take over during a host's short network drop. Tables are unranked and the host role only
  starts the game and plays the bots, so we accept this.
- **The old host who returns** keeps their seat and rejoins as a normal player.
- The host sits wherever they sat; seat 0 is only the opener's seat. The table page and the lobby
  summary name the host by `hostUid`.
- **Everyone at the table sees a notice:** "You are the host now" or "X is the host now".
- During a game the platform sends **`GHA_HOST_CHANGE { hostSeat }`** to every game at the table
  (protocol 2.7).
- A player who leaves during a game changes nothing else: their seat stays theirs, and the games
  get `GHA_PEER_LEAVE { seat }` as before. Replacing them with a bot is the game's work.

### Protocol 2.7 (adapter 2.7.0, backwards compatible)
- `GHA_START.config.table?: { settings: { hands, turnSeconds, bots }, hostSeat }`, table games only.
  Rooms and solo runs leave it out.
- `GHA_HOST_CHANGE { hostSeat }`, platform → game, only during a table game.
- Adapter: `multiplayer.table` (`TableConfig | null`), `multiplayer.hostSeat` (0 outside tables),
  `multiplayer.onHostChange(cb)`.
  - `multiplayer.isHost` follows the hand-over;
  - malformed `table` configs and out-of-range seats are ignored.
- Details for the studio: multiplayer spec §7c.

## Consequences
- **No new Cloud Function and no new owner step:** the rules and the updated `cleanupRooms`
  deploy through the existing workflows.
- **Quick play depends on the lobby list for existing tables.** Without the trigger it still finds
  the pointer's table, so quick players meet each other.
- **A host's page drives the countdown.** A host in a background tab can be throttled by the
  browser, which delays the start by up to about a second. A closed host page delays it by the
  15 s of the hand-over.
- **The games must handle `table` and `GHA_HOST_CHANGE`** to use the settings and to take over
  the bots. Until the studio ships that, games ignore them: settings fall back to the game's own,
  and a hand-over leaves the bots unplayed, as before.

## Next
Still open from ADR 0019: spectating, friends, quick-chat, web push, ranked Okey with server-side
dealing, and presence per tab. Site-wide presence and recent players came with
[ADR 0021](0021-site-presence-recent-players.md).
