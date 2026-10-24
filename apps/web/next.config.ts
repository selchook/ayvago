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
}

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript sources; let Next compile them.
  transpilePackages: ['@ayvago/shared', '@ayvago/themes'],
  poweredByHeader: false,
};

export default withNextIntl(nextConfig);
