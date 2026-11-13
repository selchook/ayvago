# ADR 0019 — A lobby for table games: public tables, presence and invites

- Status: Accepted (2026-11-09). Who can be invited and when the notifier listens were widened by
  [ADR 0021](0021-site-presence-recent-players.md) (site-wide presence). Which games get a lobby
  was widened by [ADR 0026](0026-two-seat-tables.md): two-player games the studio flags (Tavla)
  play at two-seat tables.
- Related: [ADR 0015](0015-tables-for-four-with-bots.md) (tables), [ADR 0010](0010-online-matches.md)
  (rooms), [Multiplayer spec §7b](../specs/multiplayer.md#7b-the-lobby-of-a-table-game),
  [Phase 5 plan §5.18](../plan/phase-5.md#518-a-lobby-for-table-games-okey-first--code)

## Context
The owner asked for a lobby for Okey: a player sees who is online and invites them to the game,
the invited player gets a notification, and anyone browsing the lobby can sit at any table.
Until now a table (ADR 0015) was reached only through its invite link. The data that would make a
lobby easy, `tables/`, holds every seated player's uid, and only a single table can be read by its
code; nobody can list tables.

## Decision

### One lobby per table game
- `/{locale}/games/{slug}/lobby` for every live game with `players.max > 2` (Okey only today).
  Since [ADR 0026](0026-two-seat-tables.md) also for flagged two-player games (Tavla).
  The game page links to it first ("Go to the lobby") and keeps "Open a private table" (the old
  invite-link flow). The table page links back to it.
- **Public and private tables.** `tables/{code}/visibility` is `public` or `private`.
  - Tables opened from the lobby, or by inviting someone from it, are public.
  - "Open a private table" opens a private one.
  - The host can switch it on the table page ("Show this table in the lobby").
  - Tables from before this ADR have no field and count as private.

### The table list is written by the server: `lobby/{gameId}/tables/{code}`
- A Realtime Database trigger, `syncLobbyTable` (`onValueWritten('tables/{code}')`, europe-west1
  like the database), keeps a **summary** of every public table:
  - game, slug, size, status (`open` / `playing`), `createdAt`;
  - the host's name and character;
  - per seat `player` (name, character), `bot` (name) or `empty`;
  - `online`: how many seated players have the table page open.
- The summary holds **no uids**. Signed-in players may read it; no client may write it.
- A table that turns private or closed, or is deleted, leaves the list. `cleanupRooms` also
  removes lobby entries of tables older than two hours, as a backstop.
- **Why a trigger rather than client writes:** the host's page would have to keep the summary in
  step with every seat change, made by other players' pages too. A client-written index could
  also be forged (fake tables, other people's names). The trigger is the single writer and
  builds the summary from the table as it is now, so late or out-of-order events cannot leave a
  stale entry behind for long.
- It runs on every write to a table, including presence changes. It writes only when something
  the lobby shows has changed.
- The lobby hides tables older than two hours and tables nobody has open (`online` 0, the host
  left), except the player's own.

### Presence: `presence/lobbies/{gameId}/{uid}`
- `{ name, character?, level?, state: lobby | table | playing, since, dnd? }`, written by the
  player's own page:
  - the lobby page writes `lobby`;
  - the table page writes `table`, and `playing` once the game has started.
- `onDisconnect().remove()` takes the entry away when the page closes or loses its connection.
- Rules: a player writes only their own entry; every field is validated and nothing else is
  allowed (no e-mail or other personal data). Signed-in players read one game's list.
- **The uid is the key.** The online list must name whom an invite goes to, so the uids of
  players in a lobby are readable by signed-in players. This is the same exposure as table
  seats (ADR 0015), limited to players who chose to be in the lobby. A uid gives no access to
  anything else: profiles and every other path stay owner-only.
- Name and level are self-reported, like a seat's name. They are cosmetic, and the level comes
  from the server-written profile copy.
- One entry per player and game. A second tab overwrites it, and closing either tab removes it
  until the other reconnects. Multiple-tab presence is left for later.

### Invites: `invites/{toUid}/{fromUid}`
- `{ fromUid, fromName, fromCharacter?, gameId, slug, tableCode, createdAt, answer? }`. The
  sender's uid is the key, so there is at most **one pending invite per pair** of players.
- **Sending.** The sender writes their own key, and the rules check:
  - the sender sits at that table, the table is `open`, and its game and slug match;
  - the recipient is in this game's lobby list, does not have `dnd`, and is not already seated;
  - `createdAt` is the server's `now`;
  - the previous invite from this sender to this recipient is answered or older than two minutes.
- **Answering.** The recipient reads their inbox and sets `answer` (`accepted` or `declined`)
  once; nothing else may change.
- **Reading.** The sender reads only their own invite; that is how the inviter learns the answer.
- **Deleting.** Either side may delete. The sender deletes after an answer or after two minutes
  without one; the recipient deletes expired invites it sees. `cleanupRooms` deletes invites
  older than 20 minutes.
- **Rate limit: five invites per minute per sender**, enforced by the rules:
  - `inviteQuota/{uid}` = `{ start, count }`;
  - an invite is accepted only in the same atomic multi-path write that counts it;
  - the count may only go up by one inside the current 60-second window, up to five;
  - a new window may start only after the old one has ended, and with the server's `now`;
  - the player cannot delete their quota.
- **Do not disturb.** `users/{uid}.invitesOff` (profile settings, "Table invites") is mirrored
  into the presence entry as `dnd`. The rules refuse invites to `dnd` players, the list shows
  "Not taking invites", and the notifier ignores invites while it is set.
- If the inviter has no open table, inviting opens a public one and takes the inviter there. The
  table page lists the online players too, so they can invite more while waiting.

### The notification works on every page
- `InviteCenter` sits in the top bar on every page. It listens to the player's inbox (guests
  too) and shows:
  - a bell with the number of open invites, which opens a list with Join and Decline;
  - a toast for each new invite with Join, Decline, a close button and a countdown. Join answers
    `accepted` and opens `/games/{slug}/table/{code}`; the table page then takes a free seat as
    it does for an invite link.
- **Outside a game round:**
  - the toast is a non-modal `alertdialog`;
  - it plays a soft two-note chime (Web Audio, only after the player has interacted with the
    page);
  - it moves focus to Join. Escape closes it and returns focus where it was; the invite stays
    in the bell.
- **During a game round** (a game is open on the page) **or while the player types:**
  - the toast is a compact, non-modal `dialog`;
  - there is no sound and no change of focus;
  - a polite live region announces it.
  We chose this unobtrusive toast over hiding the invite: Okey players often wait between hands,
  and the invite expires in two minutes.
- While a game is fullscreen, toasts render inside the fullscreen element, so they stay visible.
- **Cost guard:** invites go only to players present in a lobby. A browser therefore loads the
  Realtime Database and listens only for 12 hours after its player was last in a lobby or at a
  table. Other visitors' pages stay as light as before. (Replaced in slice 5.21: the notifier now
  listens while the tab holds the player's site presence; see ADR 0021.)

## Consequences
- **First event-triggered function.** Deploying `syncLobbyTable` is the project's first
  event-triggered (Eventarc) function. The functions deploy has to grant service agents roles it
  never needed before; the owner may have to grant them once (Phase 5 setup).
- **Without the trigger.** Until `syncLobbyTable` runs, the table list stays empty. Presence,
  invites and sitting down through links still work.
- **Local development.** The Functions emulator fires database triggers only in `us-central1`.
  - The trigger moves there only inside the emulator, and only with
    `AYVAGO_EMULATOR_DB_TRIGGERS=1` in `firebase/functions/.env.local`. Deploys keep
    europe-west1.
  - The default test run leaves the trigger off, because bursts of writes overwhelmed the
    emulator's function workers. The handler is tested directly, and the live trigger in an
    opt-in run.
- **Quick join from a list.** A player who sits down from the list joins through the existing
  join path. If the seat was taken in the meantime, the table page says the table is full.

## Next (not built in this slice)
- ~~Quick play: join the fullest open table, or open one and fill it with bots after N seconds.~~
  Built in slice 5.19 ([ADR 0020](0020-quick-play-settings-host-handover.md)).
- ~~Table settings (number of hands, turn timer) shown in the list.~~ Built in slice 5.19.
- Spectating tables in play.
- ~~Site-wide presence and recent players, so invites reach players outside a lobby.~~ Built in
  slice 5.21 ([ADR 0021](0021-site-presence-recent-players.md)); friends are still open.
- Lobby quick-chat (preset phrases).
- ~~Host hand-over~~ (slice 5.19, ADR 0020), and replacing a player who left with a bot (studio:
  the host's game plays the seat after `GHA_PEER_LEAVE`).
- Web push (FCM, slice 5.4) for invites while the site is closed.
- Ranked online Okey with server-side dealing.
- Presence per tab instead of per player (ADR 0021 keeps one site entry per player too).
