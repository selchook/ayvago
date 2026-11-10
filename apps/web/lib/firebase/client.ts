// Lazily loaded Firebase services. The SDK is only downloaded in the browser when account
// features are first needed, so catalog pages stay light.
import type { FirebaseApp } from 'firebase/app';
import type { AppCheck } from 'firebase/app-check';
import type { Auth } from 'firebase/auth';
import type { Database } from 'firebase/database';
import type { Firestore } from 'firebase/firestore';
import type { Functions } from 'firebase/functions';
import { APP_CHECK_SITE_KEY, readFirebaseConfig, USE_EMULATORS } from './config';

let appPromise: Promise<FirebaseApp> | null = null;
let authPromise: Promise<Auth> | null = null;
let firestorePromise: Promise<Firestore> | null = null;
let functionsPromise: Promise<Functions> | null = null;
let databasePromise: Promise<Database> | null = null;
let appCheck: AppCheck | null = null;

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
    appCheck = initializeAppCheck(app, {
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
const FUNCTIONS_REGION = 'europe-west1';

export function loadFunctions(): Promise<Functions> {
  functionsPromise ??= Promise.all([loadApp(), import('firebase/functions')]).then(
    ([app, { getFunctions, connectFunctionsEmulator }]) => {
      const functions = getFunctions(app, FUNCTIONS_REGION);
      if (USE_EMULATORS) connectFunctionsEmulator(functions, '127.0.0.1', 5001);
      return functions;
    },
  );
  return functionsPromise;
}

/**
 * The URL of a callable function, for a request the SDK cannot make: one that must outlive the
 * page (`fetch(..., { keepalive: true })` on pagehide, slice 5.22). The SDK uses the same URL.
 */
export function callableUrl(name: string): string | null {
  const config = readFirebaseConfig();
  if (!config) return null;
  return USE_EMULATORS
    ? `http://127.0.0.1:5001/${config.projectId}/${FUNCTIONS_REGION}/${name}`
    : `https://${FUNCTIONS_REGION}-${config.projectId}.cloudfunctions.net/${name}`;
}

/**
 * The headers the callable SDK would send for the signed-in player: the ID token and, when App
 * Check runs, its token. Read ahead of time, because a page that is going away cannot wait for
 * them. Null when nobody is signed in.
 */
export async function callableHeaders(): Promise<Record<string, string> | null> {
  const auth = await loadAuth();
  const user = auth.currentUser;
  if (!user) return null;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${await user.getIdToken()}`,
  };
  if (appCheck) {
    try {
      const { getToken } = await import('firebase/app-check');
      headers['X-Firebase-AppCheck'] = (await getToken(appCheck)).token;
    } catch (error) {
      // Like the SDK: the call goes without it and the function's App Check mode decides.
      console.warn('[firebase] App Check token not available', error);
    }
  }
  return headers;
}

// Realtime Database: online match rooms, WebRTC signaling and the fallback relay
// (lib/netcode). Loaded only when a player opens a room.
export function loadDatabase(): Promise<Database> {
  databasePromise ??= Promise.all([loadApp(), import('firebase/database')]).then(
    ([app, { getDatabase, connectDatabaseEmulator }]) => {
      const db = getDatabase(app);
      if (USE_EMULATORS) connectDatabaseEmulator(db, '127.0.0.1', 9000);
      return db;
    },
  );
  return databasePromise;
}
