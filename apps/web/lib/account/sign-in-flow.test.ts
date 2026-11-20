import type { Auth, AuthCredential, User, UserCredential } from 'firebase/auth';
import { describe, expect, it, vi } from 'vitest';
import {
  classifySignInError,
  connectMethod,
  continueLink,
  disconnectMethod,
  enabledProviders,
  existingProvider,
  isCancelled,
  linkedProviders,
  providerFromFirebaseId,
  reauthProvider,
  signInWith,
  type SignInDeps,
  type SignInProvider,
} from './sign-in-flow';

// Stand-ins for the Firebase SDK: just enough of User, Auth and the errors for the flow.
const authError = (code: string, customData?: unknown) =>
  Object.assign(new Error(code), { code, customData });

function fakeUser(uid: string, providers: string[] = []): User {
  return {
    uid,
    isAnonymous: providers.length === 0,
    providerData: providers.map((providerId) => ({ providerId })),
    getIdToken: vi.fn(async () => `token-of-${uid}`),
  } as unknown as User;
}

const credential = (provider: SignInProvider) => ({ providerId: provider }) as AuthCredential;

function setup(current: User | null, overrides: Partial<SignInDeps> = {}) {
  const auth = { currentUser: current, authStateReady: async () => undefined } as unknown as Auth;
  const signedInAs = (user: User) => {
    (auth as { currentUser: User | null }).currentUser = user;
    return { user } as UserCredential;
  };
  const deps: SignInDeps = {
    auth,
    link: vi.fn(async (user) => ({ user }) as UserCredential),
    signIn: vi.fn(async () => signedInAs(fakeUser('account', ['google.com']))),
    credentialFrom: vi.fn((provider) => credential(provider)),
    signInWithCredential: vi.fn(async () => signedInAs(fakeUser('account', ['google.com']))),
    linkWithCredential: vi.fn(async (user) => ({ user }) as UserCredential),
    upgraded: vi.fn(async () => undefined),
    mergeGuest: vi.fn(),
    ...overrides,
  };
  return { auth, deps };
}

describe('signInWith', () => {
  it('upgrades a guest in place by linking, for Google and Facebook alike', async () => {
    for (const provider of ['google', 'facebook'] as const) {
      const guest = fakeUser('guest');
      const { auth, deps } = setup(guest);
      await expect(signInWith(provider, deps)).resolves.toEqual({ status: 'done' });
      expect(deps.link).toHaveBeenCalledWith(guest, provider);
      // fresh token first, so the profile can be marked registered
      expect(guest.getIdToken).toHaveBeenCalledWith(true);
      expect(deps.upgraded).toHaveBeenCalledWith(guest);
      expect(deps.signIn).not.toHaveBeenCalled();
      expect(deps.mergeGuest).not.toHaveBeenCalled();
      expect(auth.currentUser).toBe(guest);
    }
  });

  it('signs in when nobody is signed in', async () => {
    const { deps } = setup(null);
    await expect(signInWith('facebook', deps)).resolves.toEqual({ status: 'done' });
    expect(deps.signIn).toHaveBeenCalledWith('facebook');
    expect(deps.link).not.toHaveBeenCalled();
  });

  it.each(['auth/credential-already-in-use', 'auth/email-already-in-use'])(
    'switches a guest to the account that has the provider (%s) and merges the guest',
    async (code) => {
      const guest = fakeUser('guest');
      const { auth, deps } = setup(guest, {
        link: vi.fn(async () => Promise.reject(authError(code))),
      });
      await expect(signInWith('facebook', deps)).resolves.toEqual({ status: 'done' });
      expect(deps.signInWithCredential).toHaveBeenCalledWith(auth, credential('facebook'));
      // the guest's token, taken before the switch
      expect(deps.mergeGuest).toHaveBeenCalledWith('token-of-guest');
      expect(auth.currentUser?.uid).toBe('account');
      expect(deps.upgraded).not.toHaveBeenCalled();
    },
  );

  it('rethrows link errors it cannot resolve', async () => {
    const guest = fakeUser('guest');
    const noCredential = setup(guest, {
      link: vi.fn(async () => Promise.reject(authError('auth/credential-already-in-use'))),
      credentialFrom: () => null,
    });
    await expect(signInWith('google', noCredential.deps)).rejects.toMatchObject({
      code: 'auth/credential-already-in-use',
    });
    const closed = setup(guest, {
      link: vi.fn(async () => Promise.reject(authError('auth/popup-closed-by-user'))),
    });
    await expect(signInWith('google', closed.deps)).rejects.toMatchObject({
      code: 'auth/popup-closed-by-user',
    });
    expect(closed.deps.signInWithCredential).not.toHaveBeenCalled();
  });

  it('asks a guest to continue with Google when the Facebook email has a Google account', async () => {
    const guest = fakeUser('guest');
    const { auth, deps } = setup(guest, {
      link: vi.fn(async () => Promise.reject(authError('auth/email-already-in-use'))),
      signInWithCredential: vi.fn(async () =>
        Promise.reject(authError('auth/account-exists-with-different-credential')),
      ),
    });
    await expect(signInWith('facebook', deps)).resolves.toEqual({
      status: 'linkNeeded',
      pending: { attempted: 'facebook', existing: 'google', credential: credential('facebook') },
    });
    // nothing changed yet: still the guest, nothing merged
    expect(auth.currentUser).toBe(guest);
    expect(deps.mergeGuest).not.toHaveBeenCalled();
  });

  it('asks a signed-out player to continue with the provider the server names', async () => {
    const { deps } = setup(null, {
      signIn: vi.fn(async () =>
        Promise.reject(
          authError('auth/account-exists-with-different-credential', {
            _tokenResponse: { verifiedProvider: ['google.com'] },
          }),
        ),
      ),
    });
    const result = await signInWith('facebook', deps);
    expect(result).toMatchObject({
      status: 'linkNeeded',
      pending: { attempted: 'facebook', existing: 'google' },
    });
  });

  it('cannot continue without the pending credential', async () => {
    const { deps } = setup(null, {
      signIn: vi.fn(async () =>
        Promise.reject(authError('auth/account-exists-with-different-credential')),
      ),
      credentialFrom: () => null,
    });
    await expect(signInWith('facebook', deps)).rejects.toMatchObject({
      code: 'auth/account-exists-with-different-credential',
    });
  });
});

describe('continueLink', () => {
  it('signs in with the existing provider, merges the guest and links the pending one', async () => {
    const guest = fakeUser('guest');
    const pending = {
      attempted: 'facebook' as const,
      existing: 'google' as const,
      credential: credential('facebook'),
    };
    const { auth, deps } = setup(guest, {
      link: vi.fn(async () => Promise.reject(authError('auth/credential-already-in-use'))),
    });
    await continueLink(pending, deps);
    expect(deps.link).toHaveBeenCalledWith(guest, 'google');
    expect(deps.signInWithCredential).toHaveBeenCalledWith(auth, credential('google'));
    expect(deps.mergeGuest).toHaveBeenCalledWith('token-of-guest');
    expect(deps.linkWithCredential).toHaveBeenCalledWith(auth.currentUser, credential('facebook'));
    expect(auth.currentUser?.uid).toBe('account');
  });

  it('treats an already linked provider as done and reports other link errors', async () => {
    const pending = {
      attempted: 'facebook' as const,
      existing: 'google' as const,
      credential: credential('facebook'),
    };
    const linked = setup(null, {
      linkWithCredential: vi.fn(async () =>
        Promise.reject(authError('auth/provider-already-linked')),
      ),
    });
    await expect(continueLink(pending, linked.deps)).resolves.toBeUndefined();
    // the player picked another Google account in the popup
    const other = setup(null, {
      linkWithCredential: vi.fn(async () => Promise.reject(authError('auth/email-already-in-use'))),
    });
    await expect(continueLink(pending, other.deps)).rejects.toMatchObject({
      code: 'auth/email-already-in-use',
    });
  });
});

describe('sign-in methods', () => {
  it('maps Firebase provider ids and lists the linked ones in order', () => {
    expect(providerFromFirebaseId('facebook.com')).toBe('facebook');
    expect(providerFromFirebaseId('password')).toBeNull();
    expect(providerFromFirebaseId(undefined)).toBeNull();
    expect(
      linkedProviders([
        { providerId: 'facebook.com' },
        { providerId: 'password' },
        { providerId: 'google.com' },
      ]),
    ).toEqual(['google', 'facebook']);
    expect(enabledProviders(false)).toEqual(['google']);
    expect(enabledProviders(true)).toEqual(['google', 'facebook']);
  });

  it('names the provider of the existing account', () => {
    const named = (ids: unknown) =>
      authError('x', { _tokenResponse: { verifiedProvider: ids } }) as unknown;
    expect(existingProvider(named(['google.com']), 'facebook')).toBe('google');
    // unknown or missing: the other provider
    expect(existingProvider(named(['apple.com']), 'facebook')).toBe('google');
    expect(existingProvider(authError('x'), 'google')).toBe('facebook');
    expect(existingProvider(null, 'facebook')).toBe('google');
  });

  it('re-confirms deletion with the provider of the session, else the first linked one', () => {
    const both = [{ providerId: 'google.com' }, { providerId: 'facebook.com' }];
    expect(reauthProvider(both, 'facebook.com')).toBe('facebook');
    expect(reauthProvider(both, 'google.com')).toBe('google');
    // a Facebook-only player is never sent to Google
    expect(reauthProvider([{ providerId: 'facebook.com' }], 'google.com')).toBe('facebook');
    expect(reauthProvider([{ providerId: 'facebook.com' }], undefined)).toBe('facebook');
    expect(reauthProvider([], 'anonymous')).toBeNull();
  });

  it('connects a method and reports accounts that belong to someone else', async () => {
    const user = fakeUser('account', ['google.com']);
    const link = vi.fn(async () => undefined);
    await expect(connectMethod(user, 'facebook', link)).resolves.toBeNull();
    expect(link).toHaveBeenCalledWith(user, 'facebook');
    const failing = (code: string) => () => Promise.reject(authError(code));
    expect(
      await connectMethod(user, 'facebook', failing('auth/credential-already-in-use')),
    ).toEqual({ kind: 'inUse', code: 'auth/credential-already-in-use' });
    expect(await connectMethod(user, 'facebook', failing('auth/email-already-in-use'))).toEqual({
      kind: 'emailInUse',
      code: 'auth/email-already-in-use',
    });
    expect(await connectMethod(user, 'facebook', failing('auth/popup-closed-by-user'))).toBeNull();
    expect(await connectMethod(user, 'facebook', failing('auth/provider-already-linked'))).toBe(
      null,
    );
    expect(await connectMethod(user, 'facebook', failing('auth/popup-blocked'))).toEqual({
      kind: 'popupBlocked',
      code: 'auth/popup-blocked',
    });
    // guests sign in instead
    expect(await connectMethod(fakeUser('guest'), 'facebook', link)).toMatchObject({
      kind: 'generic',
    });
  });

  it('never disconnects the last method', async () => {
    const unlink = vi.fn(async () => undefined);
    const both = fakeUser('account', ['google.com', 'facebook.com']);
    await expect(disconnectMethod(both, 'google', unlink)).resolves.toBeNull();
    expect(unlink).toHaveBeenCalledWith(both, 'google.com');
    unlink.mockClear();
    const one = fakeUser('account', ['facebook.com']);
    expect(await disconnectMethod(one, 'facebook', unlink)).toEqual({
      kind: 'lastMethod',
      code: undefined,
    });
    // not connected: nothing to do
    expect(await disconnectMethod(one, 'google', unlink)).toBeNull();
    expect(unlink).not.toHaveBeenCalled();
  });
});

describe('sign-in errors', () => {
  it('treats a closed popup or a declined consent as no error', () => {
    expect(isCancelled('auth/popup-closed-by-user')).toBe(true);
    expect(isCancelled('auth/cancelled-popup-request')).toBe(true);
    expect(isCancelled('auth/user-cancelled')).toBe(true);
    expect(isCancelled('auth/popup-blocked')).toBe(false);
  });

  it('maps codes to the messages the player sees', () => {
    expect(classifySignInError('auth/popup-blocked')).toBe('popupBlocked');
    expect(classifySignInError('auth/network-request-failed')).toBe('network');
    expect(classifySignInError('auth/operation-not-allowed')).toBe('notAvailable');
    expect(classifySignInError('auth/unauthorized-domain')).toBe('notAvailable');
    expect(classifySignInError('auth/requests-from-referer-https://x-are-blocked')).toBe(
      'notAvailable',
    );
    expect(classifySignInError('auth/internal-error')).toBe('generic');
    expect(classifySignInError(undefined)).toBe('generic');
  });
});
