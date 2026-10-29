# ADR 0012 — Online matches always go through TURN

- Status: Accepted (2026-10-29)
- Related: [ADR 0003](0003-cloudflare-turn.md) (Cloudflare TURN), [ADR 0010](0010-online-matches.md)
  (online matches), [Multiplayer spec](../specs/multiplayer.md)

## Context
ADR 0010 let players connect directly when they could (STUN) and used Cloudflare TURN only
when a direct connection failed. `?turn=1` on a room link forced TURN for testing. The owner
asked for every connection to work like `?turn=1`.

## Decision
- **TURN only.** When `GET /api/ice-servers` returns TURN credentials, the room page opens the
  peer connection with `iceTransportPolicy: 'relay'`. Every match goes through
  `turn.cloudflare.com`, and the route badge reads "Connected through TURN".
- **No TURN, no forcing.** Without TURN credentials (the owner's key is not set, the route failed
  or the player hit its rate limit), the page connects directly with STUN, as before, rather than
  falling back to the Realtime Database relay that would be slow for Neon Pong and Air Hockey.
- **The RTDB relay stays** the fallback while the channel is opening or when it drops.
- `?turn=1` is gone; it is the default now.

## Consequences
- **Privacy:** players never see each other's IP address. A direct WebRTC connection exposes it
  to the other player, and invite links can be shared beyond the friend they were meant for.
- **One route:** every match takes the same network path, so a match that works in testing works
  for players, including on mobile carriers and office networks.
- **Latency:** a match on one home network goes through Cloudflare's nearest location instead
  of the LAN. That adds a few milliseconds, which does not matter at 20–30 updates per second.
- **Cost:** all match traffic counts toward Cloudflare TURN usage. Two-player moves are a few KB
  per match, far inside the 1,000 GB monthly free tier.
