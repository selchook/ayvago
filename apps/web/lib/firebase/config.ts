// Firebase web config from NEXT_PUBLIC_* variables (inlined at build time; public by design,
// access is enforced by Security Rules). Without a config the account features stay hidden,
// so local builds and previews without Firebase keep working.

export type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  appId: string;
  databaseURL?: string;
};

/** reCAPTCHA Enterprise site key for App Check; optional until App Check is set up. */
export const APP_CHECK_SITE_KEY = process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY ?? '';

/** Local development and end-to-end tests: talk to the Firebase Emulator Suite. Never set on Vercel. */
export const USE_EMULATORS = process.env.NEXT_PUBLIC_FIREBASE_EMULATORS === '1';

// Emulators accept any config; a demo-* project id guarantees nothing reaches a real project.
const EMULATOR_CONFIG: FirebaseWebConfig = {
  apiKey: 'demo-key',
  authDomain: 'demo-ayvago.firebaseapp.com',
  projectId: 'demo-ayvago',
  appId: 'demo-app',
};

export function readFirebaseConfig(): FirebaseWebConfig | null {
  if (USE_EMULATORS) return EMULATOR_CONFIG;
  // Each variable is referenced literally so Next.js can inline it.
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '',
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || undefined,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '',
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || undefined,
  };
  return config.apiKey && config.authDomain && config.projectId && config.appId ? config : null;
}
