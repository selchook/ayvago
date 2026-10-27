import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

// Build-log hint: the account features need these variables at build time (NEXT_PUBLIC_* values
// are inlined). Logs variable names only, never values.
const REQUIRED_FIREBASE_VARS = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
];
if (process.env.NEXT_PUBLIC_FIREBASE_EMULATORS !== '1') {
  const missing = REQUIRED_FIREBASE_VARS.filter((name) => !process.env[name]);
  console.log(
    missing.length
      ? `[ayvago] Account features disabled; missing: ${missing.join(', ')}`
      : `[ayvago] Account features enabled (Firebase project ${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID})`,
  );
  if (!missing.length) {
    console.log(
      process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY
        ? '[ayvago] App Check enabled (reCAPTCHA Enterprise)'
        : '[ayvago] App Check not configured; set NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY (docs/setup/phase-2.md)',
    );
  }
  // Values copied from the firebaseConfig snippet often keep quotes, commas or spaces.
  const malformed = Object.keys(process.env).filter(
    (name) => name.startsWith('NEXT_PUBLIC_FIREBASE_') && /["',\s]/.test(process.env[name] ?? ''),
  );
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (
    apiKey &&
    !/^AIza[0-9A-Za-z_-]{35}$/.test(apiKey) &&
    !malformed.includes('NEXT_PUBLIC_FIREBASE_API_KEY')
  ) {
    malformed.push('NEXT_PUBLIC_FIREBASE_API_KEY');
  }
  if (malformed.length) {
    console.warn(
      `[ayvago] Check these values (no quotes, commas or spaces; the API key is 39 characters starting with AIza): ${malformed.join(', ')}`,
    );
  }
}

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript sources; let Next compile them.
  transpilePackages: ['@ayvago/shared', '@ayvago/themes'],
  poweredByHeader: false,
  // The service worker must never be cached, so a fix reaches players on their next visit.
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        ],
      },
    ];
  },
  // Category URLs from before the categories matched the Ayvago Arcade genres (ADR 0009).
  async redirects() {
    return [
      {
        source: '/:locale(en|tr)/c/retro-action',
        destination: '/:locale/c/arcade',
        permanent: true,
      },
      { source: '/:locale(en|tr)/c/board', destination: '/:locale/c/strategy', permanent: true },
    ];
  },
};

export default withNextIntl(nextConfig);
