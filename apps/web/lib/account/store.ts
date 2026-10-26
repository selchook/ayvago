'use client';

// Account state for the whole app: one Firebase auth listener, shared through a tiny external
// store so every component sees the same user. Guests are Firebase anonymous users created on
// the first game launch; signing in with Google links to the same uid (docs/specs/accounts.md).
import {
  generateGuestName,
  isSupportedLocale,
  usernameKey,
  type Locale,
  type UserProfile,
} from '@ayvago/shared';
import { isModePreference, isThemeId, type ModePreference, type ThemeId } from '@ayvago/themes';
import type { AuthCredential, User } from 'firebase/auth';
import { useSyncExternalStore } from 'react';
import { firebaseEnabled, loadAuth, loadFirestore, loadFunctions } from '@/lib/firebase/client';
import { USE_EMULATORS } from '@/lib/firebase/config';
import { applyTheme, readThemeState, THEME_CHANGE_EVENT } from '@/lib/theme-client';
import { attachLibrary, cancelLibrarySync, detachLibrary, flushLibrary } from './library-sync';

export type Profile = Pick<UserProfile, 'username' | 'isGuest' | 'locale'> & {
  avatarId: string | null;
  theme: ThemeId | null;
  mode: ModePreference | null;
  // Milliseconds since epoch; null until the server timestamp of a new profile is known.
  createdAt: number | null;
  // When the player last chose a username (ms), for the cooldown hint; null if never.
  usernameChangedAt: number | null;
};

/** Fields the player can change from the settings page. */
export type ProfileChanges = Partial<Pick<Profile, 'avatarId' | 'theme' | 'mode' | 'locale'>>;

export type AccountState =
  | { status: 'disabled' }
  | { status: 'loading' }
  | { status: 'signedOut' }
  | {
      status: 'signedIn';
      uid: string;
      isGuest: boolean;
      email: string | null;
      profile: Profile | null;
    };

export type SignInError = {
  kind: 'popupBlocked' | 'notAvailable' | 'network' | 'generic';
  // Firebase error code, shown to the player so support requests can name the cause.
  code: string | undefined;
};

// Errors that mean the Firebase project is not set up for this site (provider disabled,
// domain not authorized, API key restricted), not something the player can fix.
const SETUP_ERRORS = new Set([
  'auth/operation-not-allowed',
  'auth/unauthorized-domain',
  'auth/admin-restricted-operation',
  'auth/invalid-api-key',
  'auth/api-key-not-valid',
  'auth/configuration-not-found',
]);

const DISABLED: AccountState = { status: 'disabled' };
const LOADING: AccountState = { status: 'loading' };

let state: AccountState = firebaseEnabled() ? LOADING : DISABLED;
let started = false;
// Locale of the page that first needed a profile; used for the generated guest name.
let preferredLocale: Locale = 'en';
const listeners = new Set<() => void>();

function setState(next: AccountState) {
  state = next;
  listeners.forEach((listener) => listener());
}

function start() {
  if (started || state.status === 'disabled') return;
  started = true;
  loadAuth()
    .then(async (auth) => {
      const { onAuthStateChanged } = await import('firebase/auth');
      onAuthStateChanged(auth, (user) => {
        if (!user) {
          detachLibrary();
          setState({ status: 'signedOut' });
          return;
        }
        setState({
          status: 'signedIn',
          uid: user.uid,
          isGuest: user.isAnonymous,
          email: user.email,
          profile: null,
        });
        syncProfile(user).catch((error) => console.error('[account] profile sync failed', error));
        attachLibrary(user.uid).catch((error) => console.error('[library] sync failed', error));
      });
    })
    .catch((error) => {
      console.error('[account] Firebase failed to load', error);
      setState(DISABLED);
    });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  start();
  return () => listeners.delete(listener);
}

const getSnapshot = () => state;
const getServerSnapshot = () => (firebaseEnabled() ? LOADING : DISABLED);

export function useAccount(): AccountState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Makes sure the player has an identity before they play: signs in anonymously when nobody is
 * signed in. Never blocks the game; failures are logged and the game runs anyway.
 */
export async function ensureGuest(locale: Locale): Promise<void> {
  if (!firebaseEnabled()) return;
  preferredLocale = locale;
  start();
  const auth = await loadAuth();
  await auth.authStateReady();
  if (auth.currentUser) return;
  const { signInAnonymously } = await import('firebase/auth');
  await signInAnonymously(auth);
}

/**
 * Google sign-in. A guest is upgraded in place (linking keeps the uid and everything tied to
 * it). If that Google account already belongs to another Ayvago account, the player switches to
 * it; merging the guest's data needs a Cloud Function and comes with the Blaze plan.
 */
export async function signInWithGoogle(locale: Locale): Promise<SignInError | null> {
  preferredLocale = locale;
  const auth = await loadAuth();
  const { GoogleAuthProvider, linkWithPopup, signInWithPopup } = await import('firebase/auth');
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await googleSignIn({
      link: (user) => linkWithPopup(user, provider),
      signIn: () => signInWithPopup(auth, provider),
      credentialFrom: (error) => GoogleAuthProvider.credentialFromError(error as never),
    });
    return null;
  } catch (error) {
    const code = errorCode(error);
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      return null;
    }
    console.error('[account] Google sign-in failed', error);
    if (code === 'auth/popup-blocked') return { kind: 'popupBlocked', code };
    if (code === 'auth/network-request-failed') return { kind: 'network', code };
    if (code && (SETUP_ERRORS.has(code) || code.startsWith('auth/requests-from-referer'))) {
      return { kind: 'notAvailable', code };
    }
    return { kind: 'generic', code };
  }
}

type GoogleFlow = {
  link: (user: User) => Promise<{ user: User }>;
  signIn: () => Promise<unknown>;
  // The Google credential behind a failed link, to sign in to the account that already has it.
  credentialFrom: (error: unknown) => AuthCredential | null;
};

async function googleSignIn({ link, signIn, credentialFrom }: GoogleFlow): Promise<void> {
  const auth = await loadAuth();
  const { signInWithCredential } = await import('firebase/auth');
  await auth.authStateReady();
  const current = auth.currentUser;
  if (!current?.isAnonymous) {
    await signIn();
    return;
  }
  try {
    const { user } = await link(current);
    // The ID token must carry the new provider before the profile can be marked registered.
    await user.getIdToken(true);
    await syncProfile(user);
  } catch (error) {
    const credential = credentialFrom(error);
    if (errorCode(error) !== 'auth/credential-already-in-use' || !credential) throw error;
    // Proof that this browser owned the guest, taken before switching accounts.
    const guestIdToken = await current.getIdToken();
    await signInWithCredential(auth, credential);
    mergeGuest(guestIdToken).catch((cause) => console.error('[account] guest merge failed', cause));
  }
}

// Moves the guest's server-side library into the account and deletes the guest account. The
// browser copy is merged by the library sync anyway, so a failure here loses nothing visible.
async function mergeGuest(guestIdToken: string) {
  const functions = await loadFunctions();
  const { httpsCallable } = await import('firebase/functions');
  await httpsCallable(functions, 'mergeGuestAccount')({ guestIdToken });
}

export type UsernameResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        'invalid' | 'reserved' | 'offensive' | 'taken' | 'cooldown' | 'registered-only' | 'generic';
      // For "cooldown": when the next change is allowed (ms).
      availableAt?: number;
    };

const USERNAME_REASONS = new Set([
  'invalid',
  'reserved',
  'offensive',
  'taken',
  'cooldown',
  'registered-only',
]);

/** Registered players choose a unique username (Cloud Function reserveUsername). */
export async function changeUsername(username: string): Promise<UsernameResult> {
  const functions = await loadFunctions();
  const { httpsCallable } = await import('firebase/functions');
  try {
    const result = await httpsCallable<{ username: string }, { username: string }>(
      functions,
      'reserveUsername',
    )({ username });
    if (state.status === 'signedIn' && state.profile) {
      const sameName = usernameKey(state.profile.username) === usernameKey(result.data.username);
      setState({
        ...state,
        profile: {
          ...state.profile,
          username: result.data.username,
          usernameChangedAt: sameName ? state.profile.usernameChangedAt : Date.now(),
        },
      });
    }
    return { ok: true };
  } catch (error) {
    const details = (error as { details?: { reason?: string; availableAt?: number } }).details;
    const reason = details?.reason;
    if (reason && USERNAME_REASONS.has(reason)) {
      return {
        ok: false,
        reason: reason as Exclude<UsernameResult, { ok: true }>['reason'],
        availableAt: details?.availableAt,
      };
    }
    console.error('[account] username change failed', error);
    return { ok: false, reason: 'generic' };
  }
}

// Emulator builds only: drives the same flow with a fake Google identity, because the real
// popup needs Google's servers. Dead code (and removed) in every build without emulators.
if (USE_EMULATORS && typeof window !== 'undefined') {
  Object.assign(window, {
    __ayvagoEmulatorGoogleSignIn: async (email: string) => {
      const auth = await loadAuth();
      const { GoogleAuthProvider, linkWithCredential, signInWithCredential } =
        await import('firebase/auth');
      const credential = GoogleAuthProvider.credential(
        JSON.stringify({ sub: `google-${email}`, email, email_verified: true }),
      );
      await googleSignIn({
        link: (user) => linkWithCredential(user, credential),
        signIn: () => signInWithCredential(auth, credential),
        credentialFrom: () => credential,
      });
    },
  });
}

export async function signOut(): Promise<void> {
  const auth = await loadAuth();
  const { signOut: firebaseSignOut } = await import('firebase/auth');
  await flushLibrary().catch((error) => console.error('[library] final sync failed', error));
  await firebaseSignOut(auth);
}

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error && 'code' in error ? String(error.code) : undefined;
}

// Reads users/{uid}, creating it on first sign-in and marking it registered after an upgrade.
async function syncProfile(user: User): Promise<void> {
  const db = await loadFirestore();
  const { doc, runTransaction, serverTimestamp } = await import('firebase/firestore');
  const ref = doc(db, 'users', user.uid);
  const profile = await runTransaction(db, async (tx): Promise<Profile> => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists()) {
      const created = {
        username: generateGuestName(preferredLocale),
        isGuest: user.isAnonymous,
        locale: preferredLocale,
      };
      tx.set(ref, { ...created, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      return {
        ...created,
        avatarId: null,
        theme: null,
        mode: null,
        createdAt: Date.now(),
        usernameChangedAt: null,
      };
    }
    const data = snapshot.data();
    if (data.isGuest !== user.isAnonymous) {
      tx.update(ref, { isGuest: user.isAnonymous, updatedAt: serverTimestamp() });
    }
    return {
      username: String(data.username),
      isGuest: user.isAnonymous,
      locale: isSupportedLocale(data.locale) ? data.locale : preferredLocale,
      avatarId: typeof data.avatarId === 'string' ? data.avatarId : null,
      theme: isThemeId(data.theme) ? data.theme : null,
      mode: isModePreference(data.mode) ? data.mode : null,
      createdAt: typeof data.createdAt?.toMillis === 'function' ? data.createdAt.toMillis() : null,
      usernameChangedAt:
        typeof data.usernameChangedAt?.toMillis === 'function'
          ? data.usernameChangedAt.toMillis()
          : null,
    };
  });
  if (state.status === 'signedIn' && state.uid === user.uid) {
    setState({ ...state, isGuest: user.isAnonymous, email: user.email, profile });
  }
}

/** Saves settings-page changes to users/{uid}; the UI updates immediately. */
export async function updateProfile(changes: ProfileChanges): Promise<void> {
  if (state.status !== 'signedIn' || !state.profile) return;
  const { uid } = state;
  setState({ ...state, profile: { ...state.profile, ...changes } });
  const db = await loadFirestore();
  const { doc, serverTimestamp, updateDoc } = await import('firebase/firestore');
  await updateDoc(doc(db, 'users', uid), { ...changes, updatedAt: serverTimestamp() });
  // Leaderboard rows show the avatar; the server copies the new one into them.
  if (changes.avatarId !== undefined) {
    syncLeaderboardProfile(false).catch((error) =>
      console.warn('[account] leaderboard rows not updated', error),
    );
  }
}

/** Refreshes the player's leaderboard rows from their profile, or removes them. */
async function syncLeaderboardProfile(remove: boolean): Promise<void> {
  const functions = await loadFunctions();
  const { httpsCallable } = await import('firebase/functions');
  await httpsCallable(functions, 'syncLeaderboardProfile')({ remove });
}

// Preferences (theme, mode, language) follow the account. The first time a browser meets an
// account, the account's saved preferences are applied there; after that the browser's choices
// (top bar switchers, settings page) are saved to the account.
const PREFS_OWNER_KEY = 'ayvago:prefs-owner';

function prefsOwner(): string | null {
  try {
    return window.localStorage.getItem(PREFS_OWNER_KEY);
  } catch {
    return null;
  }
}

function setPrefsOwner(uid: string | null) {
  try {
    if (uid) window.localStorage.setItem(PREFS_OWNER_KEY, uid);
    else window.localStorage.removeItem(PREFS_OWNER_KEY);
  } catch {
    // Without storage, saved preferences are re-applied on every load, which is harmless.
  }
}

/**
 * Called on every page with the page's locale once the profile is loaded. `navigate` switches
 * the page to another locale (needs the router, so the caller provides it).
 */
export function reconcilePreferences(locale: Locale, navigate: (locale: Locale) => void): void {
  if (state.status !== 'signedIn' || !state.profile) return;
  const { uid, profile } = state;
  if (prefsOwner() !== uid) {
    setPrefsOwner(uid);
    const current = readThemeState();
    if (profile.theme) {
      const mode = profile.mode ?? 'system';
      if (profile.theme !== current.theme || mode !== current.preference) {
        applyTheme(profile.theme, mode);
      }
    } else {
      saveInBackground({ theme: current.theme, mode: current.preference });
    }
    if (profile.locale !== locale) navigate(profile.locale);
    return;
  }
  if (profile.locale !== locale) saveInBackground({ locale });
}

function saveInBackground(changes: ProfileChanges) {
  updateProfile(changes).catch((error) => console.error('[account] saving settings failed', error));
}

if (typeof window !== 'undefined') {
  window.addEventListener(THEME_CHANGE_EVENT, () => {
    if (state.status !== 'signedIn' || !state.profile || prefsOwner() !== state.uid) return;
    const { theme, preference } = readThemeState();
    if (theme !== state.profile.theme || preference !== state.profile.mode) {
      saveInBackground({ theme, mode: preference });
    }
  });
}

function toJson(value: unknown): unknown {
  if (value && typeof value === 'object') {
    if ('toDate' in value && typeof value.toDate === 'function') {
      return (value.toDate() as Date).toISOString();
    }
    if (Array.isArray(value)) return value.map(toJson);
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toJson(v)]));
  }
  return value;
}

/** Everything Ayvago stores about the signed-in player, as JSON ("Download my data"). */
export async function exportAccountData(): Promise<string> {
  const auth = await loadAuth();
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  const db = await loadFirestore();
  const { doc, getDoc } = await import('firebase/firestore');
  const [profile, library] = await Promise.all([
    getDoc(doc(db, 'users', user.uid)),
    getDoc(doc(db, 'users', user.uid, 'library', 'state')),
  ]);
  const data = {
    exportedAt: new Date().toISOString(),
    account: {
      uid: user.uid,
      signInMethods: user.isAnonymous ? ['anonymous'] : user.providerData.map((p) => p.providerId),
      email: user.email,
      createdAt: user.metadata.creationTime ?? null,
      lastSignInAt: user.metadata.lastSignInTime ?? null,
    },
    profile: profile.exists() ? toJson(profile.data()) : null,
    library: library.exists() ? toJson(library.data()) : null,
  };
  return JSON.stringify(data, null, 2);
}

// Firebase only deletes accounts that signed in recently (about five minutes).
const RECENT_SIGN_IN_MS = 4 * 60 * 1000;

/**
 * Deletes the player's data and their sign-in account. Registered players confirm with Google
 * first when their sign-in is not recent, so nothing is deleted if they cancel that popup.
 */
export async function deleteAccount(): Promise<'deleted' | 'cancelled'> {
  const auth = await loadAuth();
  const user = auth.currentUser;
  if (!user) return 'cancelled';
  const {
    GoogleAuthProvider,
    deleteUser,
    reauthenticateWithPopup,
    signOut: firebaseSignOut,
  } = await import('firebase/auth');
  const lastSignIn = Date.parse(user.metadata.lastSignInTime ?? '') || 0;
  if (!user.isAnonymous && Date.now() - lastSignIn > RECENT_SIGN_IN_MS) {
    try {
      await reauthenticateWithPopup(user, new GoogleAuthProvider());
    } catch (error) {
      const code = errorCode(error);
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return 'cancelled';
      }
      throw error;
    }
  }

  // Leaderboard rows are written by the server, so the server removes them, while still signed in.
  await syncLeaderboardProfile(true);
  cancelLibrarySync();
  const db = await loadFirestore();
  const { deleteDoc, doc } = await import('firebase/firestore');
  await deleteDoc(doc(db, 'users', user.uid, 'library', 'state'));
  await deleteDoc(doc(db, 'users', user.uid));
  setPrefsOwner(null);
  try {
    await deleteUser(user);
  } catch (error) {
    // A guest cannot re-authenticate; their data is already gone, so drop the empty login.
    if (errorCode(error) === 'auth/requires-recent-login' && user.isAnonymous) {
      await firebaseSignOut(auth);
      return 'deleted';
    }
    throw error;
  }
  return 'deleted';
}
