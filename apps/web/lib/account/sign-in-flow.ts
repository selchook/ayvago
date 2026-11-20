// Social sign-in, one flow for every provider (docs/adr/0028-social-sign-in-providers.md).
//
// Pure orchestration: every Firebase call comes in through `SignInDeps`, so the same code runs
// with popups in the browser (lib/account/store.ts), with fake credentials against the Auth
// emulator (firebase/tests/social-sign-in.test.ts) and with stubs in unit tests. Only types are
// imported from the SDK; keep it that way so the emulator tests can import this file.
import type { Auth, AuthCredential, User, UserCredential } from 'firebase/auth';

/** Sign-in providers the platform knows, in the order they are offered. */
export const SIGN_IN_PROVIDERS = ['google', 'facebook'] as const;
export type SignInProvider = (typeof SIGN_IN_PROVIDERS)[number];

/** Firebase Auth's provider ids (`providerData[].providerId`, the token's `sign_in_provider`). */
export const FIREBASE_PROVIDER_IDS: Record<SignInProvider, string> = {
  google: 'google.com',
  facebook: 'facebook.com',
};

/** The platform provider behind a Firebase provider id, or null for any other (password, phone…). */
export function providerFromFirebaseId(id: string | null | undefined): SignInProvider | null {
  return SIGN_IN_PROVIDERS.find((provider) => FIREBASE_PROVIDER_IDS[provider] === id) ?? null;
}

/** The providers linked to a user, in the platform's order. */
export function linkedProviders(providerData: readonly { providerId: string }[]): SignInProvider[] {
  const ids = new Set(providerData.map((entry) => entry.providerId));
  return SIGN_IN_PROVIDERS.filter((provider) => ids.has(FIREBASE_PROVIDER_IDS[provider]));
}

/** Facebook sign-in is behind a switch until the owner has set up the Meta app (setup doc 5.33). */
export function enabledProviders(facebook: boolean): SignInProvider[] {
  return SIGN_IN_PROVIDERS.filter((provider) => provider !== 'facebook' || facebook);
}

/**
 * A sign-in that stopped because the provider's email already belongs to an Ayvago account that
 * signs in another way ("one account per email address"). The player continues with `existing`;
 * the `attempted` provider's credential is then linked to that account.
 */
export type PendingLink = {
  attempted: SignInProvider;
  existing: SignInProvider;
  credential: AuthCredential;
};

export type SignInDeps = {
  auth: Auth;
  /** Links the provider to `user` (popup; a fake credential against the emulator). */
  link: (user: User, provider: SignInProvider) => Promise<UserCredential>;
  /** Signs in with the provider (popup; a fake credential against the emulator). */
  signIn: (provider: SignInProvider) => Promise<UserCredential>;
  /** The provider credential carried by a failed link or sign-in, if any. */
  credentialFrom: (provider: SignInProvider, error: unknown) => AuthCredential | null;
  signInWithCredential: (auth: Auth, credential: AuthCredential) => Promise<UserCredential>;
  linkWithCredential: (user: User, credential: AuthCredential) => Promise<UserCredential>;
  /** A guest was upgraded in place (same uid): mark the profile registered. */
  upgraded: (user: User) => Promise<void>;
  /**
   * The guest switched to an existing account: move the guest's data there. Must not throw and
   * must not block the sign-in (the browser starts the merge in the background).
   */
  mergeGuest: (guestIdToken: string) => void;
};

export type SignInResult = { status: 'done' } | { status: 'linkNeeded'; pending: PendingLink };

export function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error && 'code' in error ? String(error.code) : undefined;
}

// Auth's signal that the provider's email is taken by an account of another provider.
const OTHER_PROVIDER_ACCOUNT = 'auth/account-exists-with-different-credential';

/**
 * The provider of the account that owns the email. The Auth server names it in `verifiedProvider`
 * when it may (the emulator does; with email enumeration protection production may not), else it
 * is the other provider: with two providers there is no other choice.
 */
export function existingProvider(error: unknown, attempted: SignInProvider): SignInProvider {
  const named = (
    error as { customData?: { _tokenResponse?: { verifiedProvider?: unknown } } } | null
  )?.customData?._tokenResponse?.verifiedProvider;
  if (Array.isArray(named)) {
    for (const id of named) {
      const provider = providerFromFirebaseId(String(id));
      if (provider && provider !== attempted) return provider;
    }
  }
  return SIGN_IN_PROVIDERS.find((provider) => provider !== attempted) ?? attempted;
}

function linkNeeded(
  error: unknown,
  attempted: SignInProvider,
  credential: AuthCredential | null,
): SignInResult {
  // Without the credential nothing could be linked later: report the error as it is.
  if (!credential) throw error;
  return {
    status: 'linkNeeded',
    pending: { attempted, existing: existingProvider(error, attempted), credential },
  };
}

/**
 * Signs in with `provider`.
 * - Signed out (or already registered): a plain sign-in.
 * - A guest is upgraded in place by linking, so the uid and everything tied to it stay.
 * - If the provider account already belongs to another Ayvago account
 *   (`auth/credential-already-in-use`), or its email does (`auth/email-already-in-use`), the
 *   player switches to that account and the guest's data is merged into it.
 * - If that account signs in with another provider
 *   (`auth/account-exists-with-different-credential`), nothing changes yet: the result asks the
 *   player to continue with that provider (`continueLink`).
 * Every other error (cancelled popup included) is thrown for the caller to classify.
 */
export async function signInWith(
  provider: SignInProvider,
  deps: SignInDeps,
): Promise<SignInResult> {
  const { auth } = deps;
  await auth.authStateReady();
  const current = auth.currentUser;
  if (!current?.isAnonymous) {
    try {
      await deps.signIn(provider);
    } catch (error) {
      if (errorCode(error) !== OTHER_PROVIDER_ACCOUNT) throw error;
      return linkNeeded(error, provider, deps.credentialFrom(provider, error));
    }
    return { status: 'done' };
  }
  try {
    const { user } = await deps.link(current, provider);
    // The ID token must carry the new provider before the profile can be marked registered.
    await user.getIdToken(true);
    await deps.upgraded(user);
    return { status: 'done' };
  } catch (error) {
    const code = errorCode(error);
    const credential = deps.credentialFrom(provider, error);
    if (
      (code !== 'auth/credential-already-in-use' && code !== 'auth/email-already-in-use') ||
      !credential
    ) {
      throw error;
    }
    // Proof that this browser owned the guest, taken before switching accounts.
    const guestIdToken = await current.getIdToken();
    try {
      await deps.signInWithCredential(auth, credential);
    } catch (signInError) {
      if (errorCode(signInError) !== OTHER_PROVIDER_ACCOUNT) throw signInError;
      // Still the guest: the merge happens once the player continues with the other provider.
      return linkNeeded(
        signInError,
        provider,
        deps.credentialFrom(provider, signInError) ?? credential,
      );
    }
    deps.mergeGuest(guestIdToken);
    return { status: 'done' };
  }
}

/**
 * Second half of the same-email case: signs in with the provider the account already has (a guest
 * switches to it and is merged, as in `signInWith`), then links the pending credential to it.
 * Throws `auth/email-already-in-use` or `auth/credential-already-in-use` if the player picked
 * another account in the popup, so the pending provider cannot join it.
 */
export async function continueLink(pending: PendingLink, deps: SignInDeps): Promise<void> {
  const result = await signInWith(pending.existing, deps);
  if (result.status !== 'done') {
    throw Object.assign(new Error('The existing provider needs another provider'), {
      code: 'auth/account-exists-with-different-credential',
    });
  }
  const user = deps.auth.currentUser;
  if (!user) throw Object.assign(new Error('Not signed in'), { code: 'auth/user-signed-out' });
  try {
    await deps.linkWithCredential(user, pending.credential);
  } catch (error) {
    // Linked already (a retry after a slow network): nothing left to do.
    if (errorCode(error) !== 'auth/provider-already-linked') throw error;
  }
}

/**
 * The provider to re-confirm with before deleting an account: the one the current session signed
 * in with when the user still has it, else the first linked one; null when none is known.
 */
export function reauthProvider(
  providerData: readonly { providerId: string }[],
  sessionProviderId: string | null | undefined,
): SignInProvider | null {
  const linked = linkedProviders(providerData);
  const session = providerFromFirebaseId(sessionProviderId);
  if (session && linked.includes(session)) return session;
  return linked[0] ?? null;
}

/** What went wrong in a sign-in, in the words the UI has messages for. */
export type SignInFailure = 'popupBlocked' | 'notAvailable' | 'network' | 'generic';

/** Why connecting or disconnecting a sign-in method (profile page) did not happen. */
export type MethodError = {
  /**
   * inUse: that provider account belongs to another Ayvago account; emailInUse: its email does;
   * lastMethod: the only sign-in method cannot be disconnected.
   */
  kind: 'inUse' | 'emailInUse' | 'lastMethod' | SignInFailure;
  code: string | undefined;
};

function methodError(error: unknown): MethodError | null {
  const code = errorCode(error);
  if (isCancelled(code)) return null;
  if (code === 'auth/credential-already-in-use') return { kind: 'inUse', code };
  if (code === 'auth/email-already-in-use') return { kind: 'emailInUse', code };
  return { kind: classifySignInError(code), code };
}

/**
 * Connects another sign-in method to a registered user. Never switches accounts: a provider
 * account (or its email) that belongs to another Ayvago account is reported, not signed in to.
 * Null when connected (or already connected) and when the player closed the popup.
 */
export async function connectMethod(
  user: User,
  provider: SignInProvider,
  link: (user: User, provider: SignInProvider) => Promise<unknown>,
): Promise<MethodError | null> {
  if (user.isAnonymous) return { kind: 'generic', code: undefined };
  try {
    await link(user, provider);
  } catch (error) {
    if (errorCode(error) !== 'auth/provider-already-linked') return methodError(error);
  }
  return null;
}

/**
 * Disconnects a sign-in method while another stays. Firebase itself would unlink the last one and
 * leave an account nobody can sign in to, so the check is here. Counted over every provider
 * Firebase lists, not only the ones the platform offers.
 */
export async function disconnectMethod(
  user: User,
  provider: SignInProvider,
  unlink: (user: User, providerId: string) => Promise<unknown>,
): Promise<MethodError | null> {
  if (user.isAnonymous) return { kind: 'generic', code: undefined };
  const providerId = FIREBASE_PROVIDER_IDS[provider];
  if (!user.providerData.some((entry) => entry.providerId === providerId)) return null;
  if (user.providerData.length <= 1) return { kind: 'lastMethod', code: undefined };
  try {
    await unlink(user, providerId);
  } catch (error) {
    if (errorCode(error) !== 'auth/no-such-provider') return methodError(error);
  }
  return null;
}

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

/** True when the player closed the popup: not an error, nothing to show. */
export function isCancelled(code: string | undefined): boolean {
  return (
    code === 'auth/popup-closed-by-user' ||
    code === 'auth/cancelled-popup-request' ||
    code === 'auth/user-cancelled'
  );
}

/** Maps a Firebase error code to the message shown to the player. */
export function classifySignInError(code: string | undefined): SignInFailure {
  if (code === 'auth/popup-blocked') return 'popupBlocked';
  if (code === 'auth/network-request-failed') return 'network';
  if (code && (SETUP_ERRORS.has(code) || code.startsWith('auth/requests-from-referer'))) {
    return 'notAvailable';
  }
  return 'generic';
}
