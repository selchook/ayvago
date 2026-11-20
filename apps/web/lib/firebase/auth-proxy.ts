// Auth domain proxy (slice 5.33, docs/adr/0028-social-sign-in-providers.md). Browsers that
// partition third-party storage (Safari, iOS, Firefox's strict mode) break sign-in popups served
// from <project>.firebaseapp.com. Firebase's documented fix ("Option 3: proxy auth requests to
// firebaseapp.com") serves the auth handler from the site's own domain: ayvago.com/__/auth/* is
// proxied to the project's firebaseapp.com, and the owner then sets
// NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN to ayvago.com (docs/setup/phase-5.md, 5.33).
//
// Read by next.config.ts at build time; without FIREBASE_AUTH_PROXY_ORIGIN nothing is proxied.
// Plain TypeScript without path aliases, so the Next.js config can import it.

/** Paths the Firebase auth handler loads from its own origin. */
export const AUTH_PROXY_PATHS = ['/__/auth/:path*', '/__/firebase/init.json'] as const;

// Only a Firebase Hosting origin may be proxied, never an arbitrary site.
const FIREBASE_HOSTING = /^https:\/\/[a-z0-9-]+\.(firebaseapp\.com|web\.app)$/;

/**
 * The proxy target from FIREBASE_AUTH_PROXY_ORIGIN (e.g. `https://ayvago-prod.firebaseapp.com`),
 * or null when it is unset or not a Firebase Hosting origin.
 */
export function authProxyOrigin(value: string | undefined): string | null {
  const origin = value?.trim().replace(/\/+$/, '').toLowerCase();
  return origin && FIREBASE_HOSTING.test(origin) ? origin : null;
}

/** The Next.js rewrites that proxy the auth handler; none without an origin. */
export function authProxyRewrites(origin: string | null) {
  if (!origin) return [];
  return AUTH_PROXY_PATHS.map((source) => ({ source, destination: `${origin}${source}` }));
}
