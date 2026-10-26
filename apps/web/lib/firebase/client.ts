// Lazily loaded Firebase services. The SDK is only downloaded in the browser when account
// features are first needed, so catalog pages stay light.
import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import type { Functions } from 'firebase/functions';
import { APP_CHECK_SITE_KEY, readFirebaseConfig, USE_EMULATORS } from './config';

let appPromise: Promise<FirebaseApp> | null = null;
let authPromise: Promise<Auth> | null = null;
let firestorePromise: Promise<Firestore> | null = null;
let functionsPromise: Promise<Functions> | null = null;

export function firebaseEnabled(): boolean {
  return readFirebaseConfig() !== null;
}

function loadApp(): Promise<FirebaseApp> {
  appPromise ??= import('firebase/app').then(async ({ initializeApp }) => {
    const config = readFirebaseConfig();
    if (!config) throw new Error('Firebase is not configured');
    const app = initializeApp(config);
    await startAppCheck(app);
    return app;
  });
  return appPromise;
}

/**
 * App Check proves to Cloud Functions that calls come from this site (reCAPTCHA Enterprise,
 * invisible to players). Enabled once the site key is configured (docs/setup/phase-2.md);
 * a failure never blocks the app, the functions decide whether to accept unverified calls.
 */
async function startAppCheck(app: FirebaseApp) {
  if (!APP_CHECK_SITE_KEY || USE_EMULATORS) return;
  try {
    const { initializeAppCheck, ReCaptchaEnterpriseProvider } = await import('firebase/app-check');
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(APP_CHECK_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (error) {
    console.warn('[firebase] App Check failed to start', error);
  }
}

export function loadAuth(): Promise<Auth> {
  authPromise ??= Promise.all([loadApp(), import('firebase/auth')]).then(
    ([app, { getAuth, connectAuthEmulator }]) => {
      const auth = getAuth(app);
      if (USE_EMULATORS)
        connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      return auth;
    },
  );
  return authPromise;
}

export function loadFirestore(): Promise<Firestore> {
  firestorePromise ??= Promise.all([loadApp(), import('firebase/firestore')]).then(
    ([app, { getFirestore, connectFirestoreEmulator }]) => {
      const db = getFirestore(app);
      if (USE_EMULATORS) connectFirestoreEmulator(db, '127.0.0.1', 8080);
      return db;
    },
  );
  return firestorePromise;
}

// Cloud Functions live in europe-west1 (firebase/functions).
export function loadFunctions(): Promise<Functions> {
  functionsPromise ??= Promise.all([loadApp(), import('firebase/functions')]).then(
    ([app, { getFunctions, connectFunctionsEmulator }]) => {
      const functions = getFunctions(app, 'europe-west1');
      if (USE_EMULATORS) connectFunctionsEmulator(functions, '127.0.0.1', 5001);
      return functions;
    },
  );
  return functionsPromise;
}
