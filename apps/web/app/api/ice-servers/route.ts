import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { NextRequest } from 'next/server';
import {
  CLOUDFLARE_TURN_URL,
  STUN_ONLY,
  TURN_TTL_SECONDS,
  createRateLimiter,
  parseCloudflareIce,
} from '@/lib/netcode/ice';

// GET /api/ice-servers → { iceServers } for an online match (docs/adr/0010-online-matches.md).
// With CF_TURN_KEY_ID and CF_TURN_API_TOKEN set (server-only Vercel env vars), a signed-in
// player gets short-lived Cloudflare TURN credentials. Without them, or when Cloudflare fails,
// the public STUN server is returned and players connect directly or through the database relay.

export const dynamic = 'force-dynamic';

const FIREBASE_KEYS = createRemoteJWKSet(
  new URL(
    'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
  ),
);
// Matches cover a few rooms an hour; this stops a token from being used to farm credentials.
const allow = createRateLimiter(20, 10 * 60 * 1000);

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function verifiedUid(request: NextRequest): Promise<string | null> {
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!token || !projectId) return null;
  try {
    const { payload } = await jwtVerify(token, FIREBASE_KEYS, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    });
    return typeof payload.sub === 'string' && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const keyId = process.env.CF_TURN_KEY_ID;
  const apiToken = process.env.CF_TURN_API_TOKEN;
  if (!keyId || !apiToken) return json({ iceServers: STUN_ONLY, turn: false });

  const uid = await verifiedUid(request);
  if (!uid) return json({ error: 'unauthenticated' }, 401);
  if (!allow(uid)) return json({ error: 'rate-limited' }, 429);

  try {
    const response = await fetch(CLOUDFLARE_TURN_URL(keyId), {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: TURN_TTL_SECONDS }),
      cache: 'no-store',
    });
    const servers = response.ok ? parseCloudflareIce(await response.json()) : null;
    if (servers) return json({ iceServers: servers, turn: true });
    console.error('[ice] Cloudflare TURN answered', response.status);
  } catch (error) {
    console.error('[ice] Cloudflare TURN request failed', error);
  }
  return json({ iceServers: STUN_ONLY, turn: false });
}
