'use client';

// Account state for the whole app: one Firebase auth listener, shared through a tiny external
// store so every component sees the same user. Guests are Firebase anonymous users created on
// the first game launch; signing in with Google or Facebook links to the same uid
// (docs/specs/accounts.md, docs/adr/0028-social-sign-in-providers.md).
import {
  generateGuestName,
  levelForXp,
  readCharacterId,
  isSupportedLocale,
  usernameKey,
  type CharacterId,
  type Locale,
  type UserProfile,
} from '@ayvago/shared';
import {
  isModePreference,
  normalizeThemeId,
  type ModePreference,
  type ThemeId,
} from '@ayvago/themes';
import type { AuthCredential, AuthProvider, User } from 'firebase/auth';
import { useSyncExternalStore } from 'react';
import { firebaseEnabled, loadAuth, loadFirestore, loadFunctions } from '@/lib/firebase/client';
import { USE_EMULATORS } from '@/lib/firebase/config';
import { applyTheme, readThemeState, THEME_CHANGE_EVENT } from '@/lib/theme-client';
import { attachLibrary, cancelLibrarySync, detachLibrary, flushLibrary } from './library-sync';
import {
  classifySignInError,
  connectMethod,
  continueLink,
  disconnectMethod,
  enabledProviders,
  errorCode,
  isCancelled,
  linkedProviders,
  reauthProvider,
  signInWith as signInWithProvider,
  type MethodError,
  type PendingLink,
  type SignInDeps,
  type SignInFailure,
  type SignInProvider,
} from './sign-in-flow';

export type { PendingLink, SignInProvider } from './sign-in-flow';

export type Profile = Pick<UserProfile, 'username' | 'isGuest' | 'locale'> & {
  avatarId: string | null;
  /** The chosen player character (docs/adr/0013); null: none chosen, games use their default. */
  characterId: CharacterId | null;
  theme: ThemeId | null;
  mode: ModePreference | null;
  // Milliseconds since epoch; null until the server timestamp of a new profile is known.
  createdAt: number | null;
  // When the player last chose a username (ms), for the cooldown hint; null if never.
  usernameChangedAt: number | null;
  /** Server-written copy of the progress summary's XP and level (docs/adr/0016). */
  xp: number;
  level: number;
  /** "Do not disturb": other players cannot invite this player to a table (docs/adr/0019). */
  invitesOff: boolean;
  /** "Show me as online" is off: no site presence, so nobody sees or invites the player (ADR 0021). */
  hideOnline: boolean;
};

/** Fields the player can change from the settings page. */
export type ProfileChanges = Partial<
  Pick<
    Profile,
    'avatarId' | 'characterId' | 'theme' | 'mode' | 'locale' | 'invitesOff' | 'hideOnline'
  >
>;

export type AccountState =
  | { status: 'disabled' }
  | { status: 'loading' }
  | { status: 'signedOut' }
  | {
      status: 'signedIn';
      uid: string;
      isGuest: boolean;
      /** Null for a guest and for a Facebook account that shares no email. */
      email: string | null;
      /** Connected sign-in methods (empty for a guest). */
      providers: SignInProvider[];
      profile: Profile | null;
      /** The `admin` custom claim (admin panel). */
      isAdmin: boolean;
    };

export type SignInError =
  | {
      kind: SignInFailure;
      // Firebase error code, shown to the player so support requests can name the cause.
      code: string | undefined;
    }
  | {
      /** The email belongs to an account of another provider: continue with that one. */
      kind: 'existingAccount';
      code: undefined;
      pending: PendingLink;
    };

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
          providers: linkedProviders(user.providerData),
          profile: null,
          isAdmin: false,
        });
        readClaims(user).catch(() => undefined);
        syncProfile(user).catch((error) => console.error('[account] profile sync failed', error));
        attachLibrary(user.uid).catch((error) => console.error('[library] sync failed', error));
      });
    })
    .catch((error) => {
      console.error('[account] Firebase failed to load', error);
      setState(DISABLED);
    });
}

async function readClaims(user: User, forceRefresh = false) {
  const { claims } = await user.getIdTokenResult(forceRefresh);
  if (state.status === 'signedIn' && state.uid === user.uid) {
    setState({ ...state, isAdmin: claims.admin === true });
  }
}

/** Re-reads the custom claims from a fresh token, e.g. right after the admin role was granted. */
export async function refreshClaims(): Promise<void> {
  if (!firebaseEnabled()) return;
  const auth = await loadAuth();
  await auth.authStateReady();
  if (auth.currentUser) await readClaims(auth.currentUser, true);
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

/** Facebook sign-in is offered only once the owner has set up the Meta app (setup doc 5.33). */
export const SIGN_IN_OPTIONS: SignInProvider[] = enabledProviders(
  process.env.NEXT_PUBLIC_FACEBOOK_SIGN_IN === '1',
);

async function authProvider(provider: SignInProvider): Promise<AuthProvider> {
  const { FacebookAuthProvider, GoogleAuthProvider } = await import('firebase/auth');
  if (provider === 'facebook') {
    const facebook = new FacebookAuthProvider();
    // Name and email only; nothing else is asked of Facebook (privacy page, "What we store").
    facebook.addScope('email');
    facebook.addScope('public_profile');
    return facebook;
  }
  const google = new GoogleAuthProvider();
  google.setCustomParameters({ prompt: 'select_account' });
  return google;
}

// Opens the provider's popup and links it to `user`; the fake identity in emulator tests.
async function linkProvider(user: User, provider: SignInProvider) {
  const firebaseAuth = await import('firebase/auth');
  const fake = USE_EMULATORS ? await emulatorCredential(provider) : null;
  if (fake) return firebaseAuth.linkWithCredential(user, fake);
  return firebaseAuth.linkWithPopup(user, await authProvider(provider));
}

// The browser's flow: popups for the provider, the guest merge in the background.
async function popupDeps(): Promise<SignInDeps> {
  const auth = await loadAuth();
  const firebaseAuth = await import('firebase/auth');
  const { FacebookAuthProvider, GoogleAuthProvider } = firebaseAuth;
  return {
    auth,
    link: linkProvider,
    signIn: async (provider) => {
      const fake = USE_EMULATORS ? await emulatorCredential(provider) : null;
      if (fake) return firebaseAuth.signInWithCredential(auth, fake);
      return firebaseAuth.signInWithPopup(auth, await authProvider(provider));
    },
    credentialFrom: (provider, error) =>
      // The emulator's errors carry no credential; the fake one is known anyway.
      (USE_EMULATORS ? emulatorCredentialNow(provider) : null) ??
      (provider === 'facebook'
        ? FacebookAuthProvider.credentialFromError(error as never)
        : GoogleAuthProvider.credentialFromError(error as never)),
    signInWithCredential: firebaseAuth.signInWithCredential,
    linkWithCredential: firebaseAuth.linkWithCredential,
    upgraded: syncProfile,
    mergeGuest: (guestIdToken) => {
      mergeGuest(guestIdToken)
        // The merge adds the guest's XP to the account's profile; show it.
        .then(() => (auth.currentUser ? syncProfile(auth.currentUser) : undefined))
        .catch((cause) => console.error('[account] guest merge failed', cause));
    },
  };
}

/**
 * Sign-in with Google or Facebook (docs/adr/0028-social-sign-in-providers.md). A guest is upgraded
 * in place (linking keeps the uid and everything tied to it). If the provider account already
 * belongs to another Ayvago account, the player switches to it and the guest's data is merged. If
 * the email belongs to an account of the other provider, the result asks the player to continue
 * with that one (`continueSignIn`). Null when signed in or when the player closed the popup.
 */
export async function signInWith(
  provider: SignInProvider,
  locale: Locale,
): Promise<SignInError | null> {
  preferredLocale = locale;
  return runSignIn(provider, async (deps) => {
    const result = await signInWithProvider(provider, deps);
    return result.status === 'linkNeeded' ? result.pending : null;
  });
}

/** Google sign-in, as before the provider flow (kept for callers that only know Google). */
export function signInWithGoogle(locale: Locale): Promise<SignInError | null> {
  return signInWith('google', locale);
}

/**
 * The same-email case, second step: signs in with the provider the account already has, then
 * connects the pending provider to it. A guest is merged into the account as in `signInWith`.
 */
export async function continueSignIn(
  pending: PendingLink,
  locale: Locale,
): Promise<SignInError | null> {
  preferredLocale = locale;
  return runSignIn(pending.existing, async (deps) => {
    await continueLink(pending, deps);
    await refreshUser();
    return null;
  });
}

async function runSignIn(
  provider: SignInProvider,
  flow: (deps: SignInDeps) => Promise<PendingLink | null>,
): Promise<SignInError | null> {
  try {
    const pending = await flow(await popupDeps());
    return pending ? { kind: 'existingAccount', code: undefined, pending } : null;
  } catch (error) {
    const code = errorCode(error);
    if (isCancelled(code)) return null;
    console.error(`[account] ${provider} sign-in failed`, error);
    return { kind: classifySignInError(code), code };
  }
}

// Moves the guest's server-side library into the account and deletes the guest account. The
// browser copy is merged by the library sync anyway, so a failure here loses nothing visible.
async function mergeGuest(guestIdToken: string) {
  const functions = await loadFunctions();
  const { httpsCallable } = await import('firebase/functions');
  await httpsCallable(functions, 'mergeGuestAccount')({ guestIdToken });
}

/** Re-reads the signed-in user's providers and email, e.g. after connecting a provider. */
async function refreshUser(): Promise<void> {
  const auth = await loadAuth();
  const user = auth.currentUser;
  if (!user || state.status !== 'signedIn' || state.uid !== user.uid) return;
  setState({
    ...state,
    isGuest: user.isAnonymous,
    email: user.email,
    providers: linkedProviders(user.providerData),
  });
}

export type LinkError = MethodError;

/** Profile page: connects another sign-in method to the signed-in account (`connectMethod`). */
export async function connectProvider(provider: SignInProvider): Promise<LinkError | null> {
  const auth = await loadAuth();
  const user = auth.currentUser;
  if (!user) return { kind: 'generic', code: undefined };
  const error = await connectMethod(user, provider, linkProvider);
  if (error) console.error(`[account] connecting ${provider} failed`, error.code);
  await refreshUser();
  return error;
}

/** Profile page: disconnects a sign-in method while another stays (`disconnectMethod`). */
export async function disconnectProvider(provider: SignInProvider): Promise<LinkError | null> {
  const auth = await loadAuth();
  const user = auth.currentUser;
  if (!user) return { kind: 'generic', code: undefined };
  const { unlink } = await import('firebase/auth');
  const error = await disconnectMethod(user, provider, unlink);
  if (error && error.kind !== 'lastMethod') {
    console.error(`[account] disconnecting ${provider} failed`, error.code);
  }
  await refreshUser();
  return error;
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

// Emulator builds only: the real popups need Google's and Meta's servers, so end-to-end tests
// set `window.__ayvagoEmulatorIdentity = { email, id? }` and every "popup" (sign-in, connect,
// re-confirm before deleting) returns that fake identity instead; the UI and the flow are the real
// ones. Inert in every build without emulators (USE_EMULATORS is false), and fake credentials
// only work against the emulator anyway.
type EmulatorIdentity = { email: string | null; id?: string };
type EmulatorWindow = Window & { __ayvagoEmulatorIdentity?: EmulatorIdentity | null };
let emulatorCredentials: Partial<Record<SignInProvider, AuthCredential>> = {};

async function emulatorCredential(provider: SignInProvider): Promise<AuthCredential | null> {
  if (!USE_EMULATORS || typeof window === 'undefined') return null;
  const identity = (window as EmulatorWindow).__ayvagoEmulatorIdentity;
  if (!identity) return null;
  // The same email (or id) is the same account at the same provider. Like the real ones,
  // Google's emails are verified and Facebook's are not; Facebook may send none.
  const { FacebookAuthProvider, GoogleAuthProvider } = await import('firebase/auth');
  const { email, id } = identity;
  const sub = `${provider}-${id ?? email}`;
  const credential =
    provider === 'facebook'
      ? FacebookAuthProvider.credential(JSON.stringify(email ? { sub, email } : { sub }))
      : GoogleAuthProvider.credential(JSON.stringify({ sub, email, email_verified: true }));
  emulatorCredentials = { ...emulatorCredentials, [provider]: credential };
  return credential;
}

// The fake credential last handed out for `provider` (what the real error would carry).
function emulatorCredentialNow(provider: SignInProvider): AuthCredential | null {
  if (!USE_EMULATORS || typeof window === 'undefined') return null;
  return (window as EmulatorWindow).__ayvagoEmulatorIdentity
    ? (emulatorCredentials[provider] ?? null)
    : null;
}

if (USE_EMULATORS && typeof window !== 'undefined') {
  let emulatorPending: PendingLink | null = null;
  const as = (email: string | null, id?: string) => {
    (window as EmulatorWindow).__ayvagoEmulatorIdentity = { email, id };
  };
  const outcome = (result: SignInError | LinkError | null) => {
    if (result && 'pending' in result) {
      emulatorPending = result.pending;
      return `linkNeeded:${result.pending.existing}`;
    }
    return result?.kind ?? 'done';
  };
  Object.assign(window, {
    /** Signs in as a fake identity: 'done', 'linkNeeded:<provider>' or an error kind. */
    __ayvagoEmulatorSignIn: async (provider: SignInProvider, email: string | null, id?: string) => {
      as(email, id);
      return outcome(await signInWith(provider, preferredLocale));
    },
    __ayvagoEmulatorGoogleSignIn: async (email: string) => {
      as(email);
      return outcome(await signInWith('google', preferredLocale));
    },
    /** The second step after 'linkNeeded', with the identity of the provider that has the email. */
    __ayvagoEmulatorContinueSignIn: async (email: string | null, id?: string) => {
      if (!emulatorPending) throw new Error('No pending sign-in');
      as(email, id);
      const result = await continueSignIn(emulatorPending, preferredLocale);
      if (!result) emulatorPending = null;
      return outcome(result);
    },
    /** Connects a fake identity on the profile page: 'done' or a LinkError kind. */
    __ayvagoEmulatorConnect: async (
      provider: SignInProvider,
      email: string | null,
      id?: string,
    ) => {
      as(email, id);
      return outcome(await connectProvider(provider));
    },
  });
}

export async function signOut(): Promise<void> {
  const auth = await loadAuth();
  const { signOut: firebaseSignOut } = await import('firebase/auth');
  await flushLibrary().catch((error) => console.error('[library] final sync failed', error));
  await firebaseSignOut(auth);
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
        characterId: null,
        theme: null,
        mode: null,
        createdAt: Date.now(),
        usernameChangedAt: null,
        xp: 0,
        level: 1,
        invitesOff: false,
        hideOnline: false,
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
      // Unlisted ids (such as the retired alien characters) read as "no choice".
      characterId: readCharacterId(data.characterId),
      // A retired theme (retro) reads as its replacement (arcade).
      theme: normalizeThemeId(data.theme),
      mode: isModePreference(data.mode) ? data.mode : null,
      createdAt: typeof data.createdAt?.toMillis === 'function' ? data.createdAt.toMillis() : null,
      usernameChangedAt:
        typeof data.usernameChangedAt?.toMillis === 'function'
          ? data.usernameChangedAt.toMillis()
          : null,
      xp: typeof data.xp === 'number' && data.xp > 0 ? data.xp : 0,
      level: levelForXp(typeof data.xp === 'number' ? data.xp : 0),
      invitesOff: data.invitesOff === true,
      hideOnline: data.hideOnline === true,
    };
  });
  if (state.status === 'signedIn' && state.uid === user.uid) {
    setState({
      ...state,
      isGuest: user.isAnonymous,
      email: user.email,
      providers: linkedProviders(user.providerData),
      profile,
    });
  }
}

/**
 * Takes the XP and level a finished run reported (finishSession), so the header's level chip
 * updates without reading the profile again.
 */
export function applyProgress(progress: { xp: number; level: number }): void {
  if (state.status !== 'signedIn' || !state.profile) return;
  if (progress.xp < state.profile.xp) return;
  setState({ ...state, profile: { ...state.profile, xp: progress.xp, level: progress.level } });
}

/** Saves settings-page changes to users/{uid}; the UI updates immediately. */
export async function updateProfile(changes: ProfileChanges): Promise<void> {
  if (state.status !== 'signedIn' || !state.profile) return;
  const { uid } = state;
  setState({ ...state, profile: { ...state.profile, ...changes } });
  const db = await loadFirestore();
  const { deleteField, doc, serverTimestamp, updateDoc } = await import('firebase/firestore');
  const { characterId, ...rest } = changes;
  await updateDoc(doc(db, 'users', uid), {
    ...rest,
    // No character means the field is absent (the rules accept only the listed ids).
    ...(characterId === undefined ? {} : { characterId: characterId ?? deleteField() }),
    updatedAt: serverTimestamp(),
  });
  // Leaderboard rows show the avatar; the server copies the new one into them.
  if (changes.avatarId !== undefined) {
    callFunction('syncLeaderboardProfile').catch((error) =>
      console.warn('[account] leaderboard rows not updated', error),
    );
  }
}

/**
 * The signed-in player's chosen character for GHA_START, once their profile is known. Resolves
 * to null when nobody is signed in, the player has not chosen, or the profile does not arrive
 * within `timeoutMs` (the game never waits longer than that).
 */
export function chosenCharacter(timeoutMs = 2500): Promise<CharacterId | null> {
  const settled = (current: AccountState): CharacterId | null | undefined => {
    if (current.status === 'disabled' || current.status === 'signedOut') return null;
    if (current.status === 'signedIn' && current.profile) return current.profile.characterId;
    return undefined;
  };
  const now = settled(state);
  if (now !== undefined) return Promise.resolve(now);
  return new Promise((resolve) => {
    const finish = (value: CharacterId | null) => {
      window.clearTimeout(timer);
      unsubscribe();
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(null), timeoutMs);
    const unsubscribe = subscribe(() => {
      const value = settled(state);
      if (value !== undefined) finish(value);
    });
  });
}

async function callFunction(name: string, data: unknown = {}): Promise<void> {
  const functions = await loadFunctions();
  const { httpsCallable } = await import('firebase/functions');
  await httpsCallable(functions, name)(data);
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
  const { collection, doc, getDoc, getDocs } = await import('firebase/firestore');
  const [profile, library, progress, recentPlayers] = await Promise.all([
    getDoc(doc(db, 'users', user.uid)),
    getDoc(doc(db, 'users', user.uid, 'library', 'state')),
    getDoc(doc(db, 'users', user.uid, 'progress', 'summary')),
    getDocs(collection(db, 'users', user.uid, 'recentPlayers')),
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
    progress: progress.exists() ? toJson(progress.data()) : null,
    recentPlayers: recentPlayers.docs.map((entry) => ({
      uid: entry.id,
      ...(toJson(entry.data()) as Record<string, unknown>),
    })),
  };
  return JSON.stringify(data, null, 2);
}

// Firebase only deletes accounts that signed in recently (about five minutes).
const RECENT_SIGN_IN_MS = 4 * 60 * 1000;

/**
 * Deletes the player's data and their sign-in account. Registered players confirm with one of
 * their own sign-in methods (the one they signed in with last, else the first connected) when
 * their sign-in is not recent, so nothing is deleted if they cancel that popup.
 */
export async function deleteAccount(): Promise<'deleted' | 'cancelled'> {
  const auth = await loadAuth();
  const user = auth.currentUser;
  if (!user) return 'cancelled';
  const {
    deleteUser,
    reauthenticateWithCredential,
    reauthenticateWithPopup,
    signOut: firebaseSignOut,
  } = await import('firebase/auth');
  const lastSignIn = Date.parse(user.metadata.lastSignInTime ?? '') || 0;
  if (!user.isAnonymous && Date.now() - lastSignIn > RECENT_SIGN_IN_MS) {
    const { signInProvider } = await user.getIdTokenResult();
    const provider = reauthProvider(user.providerData, signInProvider);
    // Without a known provider deleteUser below fails with auth/requires-recent-login.
    if (provider) {
      try {
        const fake = USE_EMULATORS ? await emulatorCredential(provider) : null;
        if (fake) await reauthenticateWithCredential(user, fake);
        else await reauthenticateWithPopup(user, await authProvider(provider));
      } catch (error) {
        if (isCancelled(errorCode(error))) return 'cancelled';
        throw error;
      }
    }
  }

  // The server deletes everything it holds about the player (profile, library, username,
  // leaderboard rows, votes, play stats) while they are still signed in.
  cancelLibrarySync();
  await callFunction('deleteMyData');
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
