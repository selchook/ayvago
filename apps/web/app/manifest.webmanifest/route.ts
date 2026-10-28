import type { NextRequest } from 'next/server';
import { buildManifest } from '@/lib/pwa/manifest';

// The web app manifest, in the colors of the requested theme (lib/pwa/manifest.ts).
export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  return Response.json(buildManifest(params.get('theme'), params.get('mode')), {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
