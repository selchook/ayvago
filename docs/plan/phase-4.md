# Phase 4 — Multiplayer

- Status: In progress (started 2026-10-28)
- Roadmap: [§10 Multiplayer](roadmap.md#10-multiplayer--cloudflare-turn--firebase-signaling) ·
  [§12 Phases and timeline](roadmap.md#12-phases-and-timeline) · Spec:
  [Online two-player matches](../specs/multiplayer.md) · Owner steps:
  [Phase 4 setup](../setup/phase-4.md) · Decisions: [ADR 0003](../adr/0003-cloudflare-turn.md),
  [ADR 0010](../adr/0010-online-matches.md)

**Done when:** players on two different mobile carriers (every match through TURN) can finish a
match.

Phase 3 (monetization) has not started; the owner asked for online play first.

Legend: ✅ done · 🚧 in progress · ⏳ owner action · ⬜ not started

## Slices

| # | Slice | Status |
|---|---|---|
| 4.1 | Online rooms with invite links, WebRTC + Cloudflare TURN + relay fallback, 8 Ayvago Arcade games playable online | ✅ live, ⏳ TURN key |
| 4.2 | Quick match (matchmaker), presence across the site | ⬜ |
| 4.3 | Import wave 3 (backgammon, battleships, guess-number, tito) off Ably; planned in the studio when importing outside games starts | ⬜ |
| 4.4 | Turn order rule: the host starts the first round, then the winner (after a draw, the other player); "Multiplayer" tag on cards and in the catalog tags | ✅ code |
| 4.5 | Every online match goes through TURN | ✅ code, ⏳ TURN key |

## 4.1 Online rooms ✅

The owner asked for the games that can be played by two to be playable against each other:
create a room, share the link, play. They picked three groups:

| Group | Games | Model |
|---|---|---|
| Turn-based board games | Connect Four, Reversi, Memory Match | Both sides apply each move |
| Real-time duels | Neon Pong, Air Hockey | Host simulates, guest sends input |
| Turn-based sports | Penalty Kick, Bowling Strike, Mini Golf | Players take turns; scores compared |

What shipped:
- **Protocol 2.1** (`packages/platform-adapter`, `apps/web/lib/gha/bridge.ts`):
  - the adapter's `multiplayer` object;
  - `GHA_MOVE_OUT` / `GHA_MOVE_IN`, `GHA_PEER_LEAVE`, `GHA_PEER_JOIN`;
  - `peerName` and the seat in `GHA_START`;
  - moves of at most 16,000 characters.
- **Rooms** (`lib/netcode/rooms.ts`, `room-code.ts`): 6-character codes without look-alikes,
  create with collision retry, join (host, guest, rejoin, full, missing, closed, expired), live
  room state, presence with `onDisconnect`.
- **Connection** (`lib/netcode/link.ts`):
  - a reliable WebRTC DataChannel, with signaling through RTDB inboxes;
  - renegotiation after a reload (`hello`) or a drop;
  - the RTDB relay until the channel is open and whenever it is down;
  - route detection (direct / TURN / server) from the selected candidate pair.
- **TURN** (`app/api/ice-servers/route.ts`, `lib/netcode/ice.ts`):
  - Cloudflare Realtime TURN credentials for signed-in players (Firebase ID token verified with
    `jose`), 4-hour TTL, no port 53 URLs, 20 requests per 10 minutes per player;
  - STUN only until the owner sets the Vercel env vars.
  - **Deviation:** this is a Vercel route rather than the `getIceServers` Cloud Function of ADR
    0003; reasons in [ADR 0010](../adr/0010-online-matches.md).
- **Pages:**
  - `/{locale}/games/{slug}/room` creates a room; `/{locale}/games/{slug}/room/{code}` is the
    invite link. Both are `noindex`.
  - Lobby: invite link with Copy and Share, waiting state, error states.
  - The game runs in the regular `GamePlayer` with a match binding: the seat goes into
    `GHA_START`, moves are relayed, presence changes reach the game after a 4-second grace
    period, no score sessions, no pause on a hidden tab.
  - Multiplayer game pages get a **Play with a friend** card.
  - All text in `en.json` and `tr.json` (`online.*`).
- **Firebase:**
  - Realtime Database rules for `rooms`, `signals` and `relay`, with an index on `createdAt`.
  - `cleanupRooms` (hourly) deletes rooms older than two hours with their signals and relay.
  - The rules workflow now also deploys `database.rules.json`.
- **Games** (`selchook/ayvago-games`):
  - shared online runtime: `net` messaging, online menu, host-started rounds with a shared seed,
    rematch, leave and rejoin notices;
  - online modes for the eight games;
  - `npm run test:mp`, a two-player bench that embeds each game twice and plays the platform's
    part.

Tests:
- Unit tests:
  - adapter (17);
  - bridge: seats, move size;
  - room codes;
  - ICE parsing, port 53 filter and rate limiter.
- Emulator tests (`firebase/tests/database.test.ts`, 13): room creation, seat claim and its race,
  seat changes, presence, deletion, signal inboxes, `hello`, relay writes and consumption,
  `cleanupRooms`.
- End to end against the emulators: two browser contexts, host creates a room, guest opens the
  link, both play Connect Four to the end, guest reload and rejoin (see "Verification" below).
- `npm run test:mp` in `ayvago-games` for the eight games.

### Verification
End to end on `next dev` with the Firebase emulators and the games' production build, two
separate browser contexts (host and guest) and a third one:

| Check | Connect Four, direct | Connect Four, `?turn=1` (no TURN key: relay only) | Neon Pong, direct |
|---|---|---|---|
| Host creates a room, gets the invite link | ✅ | ✅ | ✅ |
| Guest opens the link, both games open with the seats | ✅ | ✅ | ✅ |
| Host starts, guest follows, moves both ways | ✅ | ✅ | ✅ |
| Route badge | direct | server (relay) | direct |
| Guest reloads: host's round ends, guest back in its seat | ✅ | ✅ | ✅ |
| Host rematch starts the guest's round | ✅ | ✅ | ✅ |
| A third player gets "room full" | ✅ | ✅ | ✅ |

Found and fixed along the way:
- **Quick reload.** A guest who reloaded within the 4-second grace period was never reported as
  gone, so the host's round went on while the guest's game was back at its menu. Presence now
  stores a per-page session id; a new id is reported as a leave and a rejoin at once.
- **First move lost.** The host could move before the guest's game screen listened, so the
  first move was dropped and the turns never lined up. The games' runtime now keeps early
  messages for the first listener and clears them when a round starts.

`npm run test:mp` (both games embedded side by side, 60 and 150 ms latency): 8/8. Solo smoke tests
of the eight games: 8/8.

### Still open
- ⏳ Cloudflare TURN key and the two Vercel env vars ([setup](../setup/phase-4.md#1-cloudflare-turn)).
  Until then players connect directly or through the relay.
- ⏳ "Firebase Realtime Database Admin" role for the rules deploy account
  ([setup](../setup/phase-4.md#2-realtime-database-rules)).
- The done-when check on two mobile carriers needs the TURN key and two phones.

## 4.4 Turn order rule and the multiplayer tag ✅

The owner set a rule for every online game: the player who created the room takes the first turn;
after that the winner of the previous round starts.
- **Runtime** (selchook/ayvago-games `src/core/net.ts`):
  - The host computes the starter: seat 0 for the first round, then the previous round's winner.
    After a draw it is the player who did not start the last round.
  - The starter travels with `__start { seed, starter }`.
  - Games read `net.starter` / `net.myTurnFirst` and pass `draw: true` to `endGame` on a level
    result.
  - The result screen shows "Next round starts with: {name}".
- **Games:**
  - Connect Four and Reversi: the starter moves first (Reversi: the starter plays black).
  - Memory Match: the starter flips first.
  - Penalty Kick: the starter shoots first.
  - Bowling: the starter rolls first in every frame.
  - Mini Golf: the starter tees off on every hole.
  - Neon Pong and Air Hockey: the starter gets the first serve.
- **Tag:**
  - Multiplayer games show a "Multiplayer" tag first in the tag row of every card (green in the
    pixel themes), replacing the badge on the cover.
  - Their catalog tags gain `multiplayer`, so search finds them by it.
- **Tests:** the two-player bench (`npm run test:mp`) and the solo smoke tests of the eight games
  in ayvago-games, plus web unit tests and screenshots of the cards here.

## 4.5 Every match goes through TURN ✅

The owner asked for every connection to work like `?turn=1`
([ADR 0012](../adr/0012-online-matches-always-use-turn.md)).
- `hasTurn()` in `lib/netcode/ice.ts` tells whether the ICE servers include TURN. The room page
  opens the connection TURN-only (`iceTransportPolicy: 'relay'`) whenever they do.
- Without TURN credentials it connects directly with STUN, as before, instead of dropping to the
  slow database relay.
- `?turn=1` is removed; it is the default.
- Why: players never see each other's IP address, and every match takes the same path.
- **Tests:**
  - unit test for `hasTurn`;
  - the web app's typecheck, lint and unit tests.
  - Not tried end to end with real TURN yet: the key is not set (owner step in
    [setup §1](../setup/phase-4.md#1-cloudflare-turn)). With the key set, the badge reads
    "Connected through TURN" in every room.

