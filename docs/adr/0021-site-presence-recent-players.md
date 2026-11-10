# ADR 0021 — Site-wide presence, recent players and invites from anywhere

- Status: Accepted (2026-11-10)
- Related: [ADR 0019](0019-table-lobby-presence-invites.md) (lobby presence and invites, "Next"
  item "site-wide presence, friends and recent players"), [ADR 0020](0020-quick-play-settings-host-handover.md),
  [ADR 0010](0010-online-matches.md) (rooms), [ADR 0015](0015-tables-for-four-with-bots.md) (tables),
  [Multiplayer spec §7d](../specs/multiplayer.md#7d-site-wide-presence-and-recent-players),
  [Phase 5 plan §5.21](../plan/phase-5.md#521-site-wide-online-status-and-recent-players--code)

## Context
Until now a player could be seen and invited only while they were in a game's lobby or at one
of its tables (ADR 0019). The owner asked for the next step:
- players are **online on the whole site**, not only in a lobby;
- every player has **"Recent players"**: the people they shared a table or a two-player room with,
  with their online status;
- an online recent player can be **invited from anywhere**, and gets the notification on any page.

Three constraints shaped the design:
- **Privacy.** Today the lobby list exposes uids of players who chose to be there. A site-wide
  list would expose every visitor. Players must also be able to opt out.
- **Cost.** The Realtime Database bills simultaneous connections and downloaded bytes. ADR 0019
  kept ordinary pages off the database: a browser connected only for 12 hours after a lobby visit.
- **Writes the clients cannot fake.** "Who played with whom" must not be forgeable.

## Decision

### Site presence: `presence/site/{uid}`
- `{ name, character?, level?, state, gameId?, since, dnd? }`, written by the player's own page,
  removed by `onDisconnect().remove()`.
- **States**, from the least to the most busy:
  - `online`: any page;
  - `lobby`: a game's lobby;
  - `table`: at a table, or in a two-player room waiting for the match;
  - `playing`: a table or room match in progress, or a solo round on the game page.
  `gameId` names the game of the lobby, table, room or game page.
- **Pages claim states; the tab writes the busiest.** Each page registers what it is
  (`useSiteActivity`). The tab writes the busiest claim, and of equal ones the newest. The
  lobby and table pages do it through `useLobbyPresence`, so `components/game/table-view.tsx` did
  not change.
- **One entry per player; the last write wins.** Several tabs share the entry:
  - a tab writes it when its state changes and when it comes back to the front, so the entry
    follows the tab the player is using;
  - a tab listens to its own entry only. When another tab closes, its disconnect removes the
    shared entry; the tab still open sees that and writes it again;
  - so a background table tab and a front home-page tab show "Online", not "At a table".
    Invites reach the player either way, and we keep the data model simple (no per-tab keys,
    which the rules could not check for `dnd`).
- **Rules:**
  - the player writes only their own entry. Every field is validated and nothing else is
    allowed (no e-mail, no hidden flag);
  - **a signed-in player reads one uid's entry, never the list.** `presence/site` has no read
    rule, so nobody can list who is online. Reading needs the uid, which a player only learns by
    sharing a table, a room or a lobby with someone (or from their own recent players).

### "Show me as online" (`users/{uid}.hideOnline`)
- A profile switch, on by default ("Show me as online" / "Çevrimiçi görün"). The Firestore rules
  allow only a boolean.
- **Off means the page writes nothing.** No site entry, and no lobby entry either. We considered
  writing the entry with a `hidden` flag that readers would treat as offline, but it would still
  publish the player's name and state to anyone who has the uid. Writing nothing is the safest
  choice, and it still makes invites respect the switch: the invite rule requires an entry.
- The lobby and the recent-player lists tell the hidden player that they appear offline, with a
  link to the setting.
- Seats at tables and rooms still show the name, as before: that is the game itself.

### Recent players: `users/{uid}/recentPlayers/{otherUid}` in Firestore
- `{ uid, name, character?, gameId, slug, lastPlayedAt, count, lastMatch }`, newest 30 kept.
- **Written by the server only**, read only by the owner.
  - `syncLobbyTable` (`tables/{code}`, already deployed) also records the table's humans when the
    table turns `playing`. Bots never count; guests do.
  - A new trigger, **`recordRoomPlayers`** (`onValueCreated('rooms/{code}/guestUid')`), records
    both players once the guest seat of a two-player room is taken. It fires once per room, so
    moves, signals and presence in the room never start it.
  - `lastMatch` (`table:{code}:{createdAt}` or `room:{code}:{createdAt}`) makes a repeated event
    count once (triggers are delivered at least once).
  - After writing, the trigger deletes the player's entries beyond the newest 30.
- **Why Firestore rather than an RTDB index:**
  - the list is per player, private and long-lived: Firestore's owner-only rules, ordering by
    `lastPlayedAt` and `limit()` fit it, and it costs one read per row shown;
  - it lives under `users/{uid}`, so `deleteMyData` and the guest cleanup delete it with the rest
    of the player's data, and the data export includes it;
  - in the Realtime Database it would be downloaded whole on every read and need its own
    deletion code.
- **Other players' lists.** Deleting an account also removes the player from everyone else's
  list (a collection-group query on `uid`, which needs one single-field index exemption in
  `firestore.indexes.json`). A guest who merges into a registered account takes their list along,
  and other players' entries for the guest move to the account.
- **What a reader sees.** The list shows character, name, the game, "x times · 2 h ago", and an
  online dot with the state ("Playing · Okey"), read with one listener per row on screen:
  - the lobby shows the newest 6 in a "Recent players" panel next to "Online now";
  - the profile shows 8, and "Show all" shows up to 30.

### Invites to anyone online
- **The recipient check is widened.** An invite needs the recipient to have a lobby entry for the
  game **or** a site entry, and neither entry may carry `dnd`. Everything else from ADR 0019
  stays:
  - one pending invite per pair;
  - the sender sits at the open table it names;
  - five invites a minute;
  - two minutes to answer;
  - `createdAt` is the server's `now`;
  - not to a player already seated there.
- **Inviting from a list.**
  - In the lobby, Invite works for recent players as for lobby players: it uses the player's
    open table, or opens a public one and goes there.
  - On the profile, Invite asks the player to the table game they played together, in the same
    way. Invites are table invites, so recent players from a two-player room game get no Invite
    button there (room invites are left for later).
- **The notifier.** `InviteCenter` keeps the player's site presence and listens to the inbox
  whenever this tab holds the presence, on every page. This replaces the 12-hour lobby gate:
  invites can reach a player only while they are present, so listening at other times was
  pointless anyway. With invites off (`dnd`), it does not listen.

### Cost and connections
Site presence means signed-in visitors open a Realtime Database connection on ordinary pages.
To keep that lean:
- **Signed-in only.** Visitors without an account (and crawlers) never connect. A guest account
  is created only when someone plays.
- **After the first interaction.** A tab connects for presence only after a tap, click or key
  press. A tab opened in the background, or never touched, costs nothing. Lobby, table and room
  pages connect at once, as before.
- **Away after 10 minutes hidden.** A tab hidden for 10 minutes takes itself off the database
  (`goOffline`). The server removes the entry, and the tab reconnects when it comes back to the
  front. Lobby, table and room pages are exempt, because their game needs the connection.
- **No lists.**
  - The only listeners are the player's own entry, their invite inbox, and the presence of the
    recent players on screen (at most 8 at first, 30 with "Show all").
  - There is no global "N online" count. It would need a list read of every visitor, or a
    counter trigger on every presence change, so we skipped it.
- **Rough size.** The Blaze plan allows 200,000 simultaneous connections per database, and
  presence entries are about 150 bytes. Connections grow with the number of players active at
  once, not with page views. That is acceptable at the current scale; if it ever is not, the
  first lever is a shorter away time.

## Consequences
- **One more event-triggered function** (`recordRoomPlayers`). The Eventarc IAM bindings from
  ADR 0019 cover it, so the usual "Deploy Cloud Functions" run deploys it. The "Deploy Firestore
  and Realtime Database rules" run publishes the rules and the index exemption.
- **Until the functions deploy**, recent players stay empty. Presence and invites to online
  players work as soon as the rules and the web app are out.
- **Old clients** still write only lobby presence, and the lobby half of the invite rule keeps
  them working.
- **Local development.** Both triggers move to us-central1 only in the emulator, with
  `AYVAGO_EMULATOR_DB_TRIGGERS=1` (as in ADR 0019).
- **A hidden player cannot be invited at all**, not even by people in the same lobby. That is the
  point of the switch, and the profile hint says so.
- **Multi-tab state is approximate.** The entry shows the state of the tab used last.

## Next
- Friends (mutual, with requests) on top of recent players.
- Invites to two-player rooms, so recent players from room games can be invited too.
- Web push (slice 5.4) for invites while the site is closed.
- A cheap "N online" count (for example a scheduled count written to one public node), if the
  owner wants it.
- Per-tab presence, if the multi-tab approximation ever matters.
