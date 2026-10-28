# Phase 4 — Multiplayer

- Status: In progress (started 2026-10-28)
- Roadmap: [§10 Multiplayer](roadmap.md#10-multiplayer--cloudflare-turn--firebase-signaling) ·
  [§12 Phases and timeline](roadmap.md#12-phases-and-timeline) · Spec:
  [Online two-player matches](../specs/multiplayer.md) · Owner steps:
  [Phase 4 setup](../setup/phase-4.md) · Decisions: [ADR 0003](../adr/0003-cloudflare-turn.md),
  [ADR 0010](../adr/0010-online-matches.md)

**Done when:** players on two different mobile carriers (with TURN forced in tests) can finish a
match.

Phase 3 (monetization) has not started; the owner asked for online play first.

Legend: ✅ done · 🚧 in progress · ⏳ owner action · ⬜ not started

## Slices

| # | Slice | Status |
|---|---|---|
| 4.1 | Online rooms with invite links, WebRTC + Cloudflare TURN + relay fallback, 8 Ayvago Arcade games playable online | ✅ code, ⏳ TURN key and database role |
| 4.2 | Quick match (matchmaker), presence across the site | ⬜ |
| 4.3 | Import wave 3 (backgammon, battleships, guess-number, tito) off Ably | ⬜ |

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
Filled in with the end-to-end results before the PR is merged.

### Still open
- ⏳ Cloudflare TURN key and the two Vercel env vars ([setup](../setup/phase-4.md#1-cloudflare-turn)).
  Until then players connect directly or through the relay.
- ⏳ "Firebase Realtime Database Admin" role for the rules deploy account
  ([setup](../setup/phase-4.md#2-realtime-database-rules)).
- The done-when check on two mobile carriers needs the TURN key and two phones.
