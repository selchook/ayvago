'use client';

// Account state for the whole app: one Firebase auth listener, shared through a tiny external
// store so every component sees the same user. Guests are Firebase anonymous users created on
// the first game launch; signing in with Google links to the same uid (docs/specs/accounts.md).
import { generateGuestName, type Locale, type UserProfile } from '@ayvago/shared';
import type { AuthCredential, User } from 'firebase/auth';
import { useSyncExternalStore } from 'react';
import { firebaseEnabled, loadAuth, loadFirestore } from '@/lib/firebase/client';
import { USE_EMULATORS } from '@/lib/firebase/config';

export type Profile = Pick<UserProfile, 'username' | 'isGuest' | 'locale'>;

export type AccountState =
  | { status: 'disabled' }
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; uid: string; isGuest: boolean; profile: Profile | null };

export type SignInError = 'popupBlocked' | 'generic';

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
          setState({ status: 'signedOut' });
          return;
        }
        setState({ status: 'signedIn', uid: user.uid, isGuest: user.isAnonymous, profile: null });
        syncProfile(user).catch((error) => console.error('[account] profile sync failed', error));
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
    return code === 'auth/popup-blocked' ? 'popupBlocked' : 'generic';
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
    await signInWithCredential(auth, credential);
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
  const profile = await runTransaction(db, async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists()) {
      const created: Profile = {
        username: generateGuestName(preferredLocale),
        isGuest: user.isAnonymous,
        locale: preferredLocale,
      };
      tx.set(ref, { ...created, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      return created;
    }
    const existing = snapshot.data() as Profile;
    if (existing.isGuest !== user.isAnonymous) {
      tx.update(ref, { isGuest: user.isAnonymous, updatedAt: serverTimestamp() });
    }
    return { username: existing.username, locale: existing.locale, isGuest: user.isAnonymous };
  });
  if (state.status === 'signedIn' && state.uid === user.uid) {
    setState({ status: 'signedIn', uid: user.uid, isGuest: user.isAnonymous, profile });
  }
}
