# ADR 0010 — Online two-player matches: rooms, invite links and TURN from the web app

- Status: Accepted (2026-10-28)
- Related: [ADR 0003](0003-cloudflare-turn.md) (Cloudflare TURN), [Phase 4 plan](../plan/phase-4.md),
  [Multiplayer spec](../specs/multiplayer.md)

## Context
The owner asked for the games that work with two players to be playable online: one player
creates a room, sends the link, and both play against each other. Firebase (Auth, Realtime
Database) is already in place, and ADR 0003 chose Cloudflare Realtime TURN for players behind
strict NATs. Eight Ayvago Arcade games were picked: Connect Four, Reversi, Memory Match (turn
based), Neon Pong, Air Hockey (real time) and Penalty Kick, Bowling Strike, Mini Golf (turn-based
sports).

## Decision
- **Rooms with invite links.** `rooms/{code}` in the Realtime Database, a 6-character code without
  look-alike characters. The page `/{locale}/games/{slug}/room` creates a room and moves to
  `/{locale}/games/{slug}/room/{code}`, which is the invite link. The first other player to open
  it takes the guest seat (the rules allow exactly one claim). Rooms expire after two hours and
  `cleanupRooms` deletes them hourly.
- **Connection owned by the platform page** (as in ADR 0003). A reliable, ordered WebRTC
  DataChannel carries the moves. Signaling goes through per-player inboxes
  (`signals/{code}/{uid}`); the host makes the offers, the guest asks for one with a `hello`
  after a reload. Until the channel is open, or when it drops, moves go through
  `relay/{code}`, so a match never waits on WebRTC.
- **TURN credentials come from a Next.js route, not a Cloud Function.** `GET /api/ice-servers`
  verifies the player's Firebase ID token, rate-limits per player and asks Cloudflare for
  short-lived credentials (4 hours, port 53 URLs removed). The key ID and API token are
  server-only Vercel env vars (`CF_TURN_KEY_ID`, `CF_TURN_API_TOKEN`). Without them the route
  returns the public Cloudflare STUN server, and the relay covers players who cannot connect
  directly. This deviates from ADR 0003's `getIceServers` callable:
  - the owner sets two env vars in Vercel instead of Secret Manager secrets, and a missing secret
    can never block a Functions deploy;
  - the ICE request is made from the page that opens the connection, with no extra round trip
    through europe-west1.
- **Protocol 2.1.** The adapter gains `multiplayer` (`send`, `onMove`, `onPeerLeave`,
  `onPeerJoin`), `GHA_PEER_LEAVE`, `GHA_PEER_JOIN` and `peerName` in `GHA_START`. Games stay
  unaware of rooms, Firebase and WebRTC.
- **Game side.** The shared Ayvago Arcade runtime runs the round flow: the host starts every round
  and picks the shared random seed; real-time games are host-authoritative; turn-based games apply
  each move on both sides. Online rounds are not ranked on the leaderboards.

## Consequences
- Turn-based games work on any network: at worst through the relay. Real-time games need the
  DataChannel for a good feel; TURN makes that work on mobile carriers.
- Quick match, spectators and more than two players are not covered; they need a matchmaker
  (roadmap §2.4 `matchmake`) and are left for later.
- The ICE route's rate limit is per server instance; it stops casual abuse, not a distributed
  attack. Cloudflare's own usage alerts are the backstop.
