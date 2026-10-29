// ICE servers for online matches (docs/adr/0010-online-matches.md, 0012). Every match goes
// through Cloudflare Realtime TURN with short-lived credentials made per request; without TURN
// credentials players connect directly (STUN) instead.

/** Public STUN server: enough for most home networks, no credentials. */
export const STUN_ONLY: RTCIceServer[] = [{ urls: 'stun:stun.cloudflare.com:3478' }];

/** True when the list has a TURN server, so the connection can be TURN-only. */
export function hasTurn(servers: RTCIceServer[]): boolean {
  return servers.some((server) =>
    (Array.isArray(server.urls) ? server.urls : [server.urls]).some((url) => /^turns?:/.test(url)),
  );
}

/** How long the TURN credentials stay valid: longer than any match. */
export const TURN_TTL_SECONDS = 4 * 60 * 60;

export const CLOUDFLARE_TURN_URL = (keyId: string) =>
  `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`;

/**
 * Drops port 53 URLs: browsers can stall on them, and Cloudflare recommends filtering them out.
 * Keeps servers that still have URLs left.
 */
export function withoutPort53(servers: RTCIceServer[]): RTCIceServer[] {
  return servers
    .map((server) => {
      const urls = (Array.isArray(server.urls) ? server.urls : [server.urls]).filter(
        (url) => !/:53(\?|$)/.test(url),
      );
      return { ...server, urls };
    })
    .filter((server) => server.urls.length > 0);
}

/** Reads Cloudflare's generate-ice-servers response; null when it is not usable. */
export function parseCloudflareIce(body: unknown): RTCIceServer[] | null {
  const servers = (body as { iceServers?: unknown } | null)?.iceServers;
  const list = Array.isArray(servers) ? servers : servers ? [servers] : [];
  const valid = list.filter(
    (s): s is RTCIceServer =>
      typeof s === 'object' &&
      s !== null &&
      (typeof (s as RTCIceServer).urls === 'string' || Array.isArray((s as RTCIceServer).urls)),
  );
  const filtered = withoutPort53(valid);
  return filtered.length > 0 ? filtered : null;
}

/** A small per-instance limiter: at most `limit` requests per key per window. */
export function createRateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (key: string, now = Date.now()): boolean => {
    const recent = (hits.get(key) ?? []).filter((at) => now - at < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 10_000) hits.clear();
    return true;
  };
}
