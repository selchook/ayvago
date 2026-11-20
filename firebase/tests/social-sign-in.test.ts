import {
  deleteUser,
  linkWithCredential,
  reauthenticateWithCredential,
  signInWithCredential,
  unlink,
  type Auth,
} from 'firebase/auth';
import { Timestamp } from 'firebase/firestore';
import { describe, expect, it } from 'vitest';
import {
  connectMethod,
  continueLink,
  disconnectMethod,
  reauthProvider,
  signInWith,
  type SignInDeps,
  type SignInProvider,
} from '../../apps/web/lib/account/sign-in-flow';
import {
  authUserExists,
  client,
  facebookCredential,
  facebookPlayer,
  googleCredential,
  guest,
  read,
  registered,
  useEmulators,
  write,
} from './helpers';

// Slice 5.33 (docs/adr/0028-social-sign-in-providers.md): the web app's provider flow
// (apps/web/lib/account/sign-in-flow.ts) against the real Auth emulator and the real
// mergeGuestAccount function. The emulator cannot open Google's or Meta's popups, so the
// "popup" of each provider is a fake credential, the way the web app's emulator hook does it.
//
// Error codes observed in the emulator (the paths the flow handles):
//   guest links a Facebook account another user has     auth/credential-already-in-use
//   guest links Facebook whose email has a Google user  auth/email-already-in-use
//   signs in with that Facebook account                 auth/account-exists-with-different-credential
//   registered user links another user's Facebook       auth/credential-already-in-use
useEmulators();

type Identity = { google: string | null; facebook: string | null };

/** The flow's dependencies for one browser, with fake popups that "pick" the given accounts. */
function deps(auth: Auth, pick: Partial<Identity>, call: ReturnType<typeof client>['call']) {
  const merges: Promise<unknown>[] = [];
  const credentialFor = (provider: SignInProvider) => {
    const id = pick[provider];
    if (id === undefined) throw new Error(`no ${provider} account picked`);
    return provider === 'google'
      ? googleCredential(id!)
      : facebookCredential(id ?? 'none', id?.includes('@') ? id : null);
  };
  const flow: SignInDeps = {
    auth,
    link: (user, provider) => linkWithCredential(user, credentialFor(provider)),
    signIn: (provider) => signInWithCredential(auth, credentialFor(provider)),
    // The emulator's errors carry no credential (production's do); the fake one is known.
    credentialFrom: (provider) => credentialFor(provider),
    signInWithCredential,
    linkWithCredential,
    upgraded: async (user) => {
      await write(`users/${user.uid}`, { isGuest: false }, true);
    },
    mergeGuest: (guestIdToken) => {
      merges.push(call('mergeGuestAccount', { guestIdToken }));
    },
  };
  return { flow, merges };
}

async function seedLibrary(uid: string, favorites: string[]) {
  await write(`users/${uid}/library/state`, {
    favorites,
    recent: favorites.map((slug, i) => ({ slug, playedAt: 1000 + i })),
    best: {},
    updatedAt: Timestamp.now(),
  });
}

const providerIds = (auth: Auth) =>
  auth.currentUser!.providerData.map((entry) => entry.providerId).sort();

describe('Facebook sign-in', () => {
  it('upgrades a guest in place: same uid, no email needed', async () => {
    const player = await guest();
    await seedLibrary(player.uid, ['snake']);
    const { flow, merges } = deps(player.auth, { facebook: 'cem-fb' }, player.call);

    await expect(signInWith('facebook', flow)).resolves.toEqual({ status: 'done' });
    const user = player.auth.currentUser!;
    expect(user.uid).toBe(player.uid);
    expect(user.isAnonymous).toBe(false);
    expect(user.email).toBeNull();
    expect(providerIds(player.auth)).toEqual(['facebook.com']);
    expect(merges).toHaveLength(0);
    expect(await read(`users/${player.uid}`)).toMatchObject({ isGuest: false });
    expect(await read(`users/${player.uid}/library/state`)).toMatchObject({ favorites: ['snake'] });
    // the token now names Facebook, which the rules and functions read
    expect((await user.getIdTokenResult(true)).signInProvider).toBe('facebook.com');
  });

  it("switches to the account that has the Facebook login and merges the guest's data", async () => {
    const cem = await facebookPlayer('cem@example.com', 'cem@example.com', { username: 'Cem' });
    await seedLibrary(cem.uid, ['tetrix']);
    const player = await guest();
    await seedLibrary(player.uid, ['snake']);
    const { flow, merges } = deps(player.auth, { facebook: 'cem@example.com' }, player.call);

    await expect(signInWith('facebook', flow)).resolves.toEqual({ status: 'done' });
    expect(player.auth.currentUser!.uid).toBe(cem.uid);
    expect(merges).toHaveLength(1);
    await expect(merges[0]).resolves.toEqual({ merged: true });
    expect((await read(`users/${cem.uid}/library/state`))?.favorites).toEqual(['tetrix', 'snake']);
    expect(await authUserExists(player.uid)).toBe(false);
  });

  it('connects Facebook to the Google account with the same email, keeping the guest data', async () => {
    const ayla = await registered('ayla@example.com', { username: 'Ayla' });
    await seedLibrary(ayla.uid, ['tetrix']);
    const player = await guest();
    await seedLibrary(player.uid, ['snake']);
    const { flow, merges } = deps(
      player.auth,
      { facebook: 'ayla@example.com', google: 'ayla@example.com' },
      player.call,
    );

    // Step 1: Facebook's email belongs to a Google account. Nothing changes yet.
    const result = await signInWith('facebook', flow);
    expect(result).toMatchObject({
      status: 'linkNeeded',
      pending: { attempted: 'facebook', existing: 'google' },
    });
    expect(player.auth.currentUser!.uid).toBe(player.uid);
    expect(merges).toHaveLength(0);

    // Step 2: the player continues with Google; the guest is merged, Facebook is connected.
    if (result.status !== 'linkNeeded') throw new Error('expected linkNeeded');
    await continueLink(result.pending, flow);
    expect(player.auth.currentUser!.uid).toBe(ayla.uid);
    expect(providerIds(player.auth)).toEqual(['facebook.com', 'google.com']);
    await expect(merges[0]).resolves.toEqual({ merged: true });
    expect((await read(`users/${ayla.uid}/library/state`))?.favorites).toEqual(['tetrix', 'snake']);
    expect(await authUserExists(player.uid)).toBe(false);

    // From now on Facebook alone opens the same account.
    const later = client();
    const { user } = await signInWithCredential(
      later.auth,
      facebookCredential('ayla@example.com', 'ayla@example.com'),
    );
    expect(user.uid).toBe(ayla.uid);
  });

  it('asks a signed-out player to continue with Google, then connects Facebook', async () => {
    const ayla = await registered('ayla@example.com', { username: 'Ayla' });
    const visitor = client();
    const { flow } = deps(
      visitor.auth,
      { facebook: 'ayla@example.com', google: 'ayla@example.com' },
      visitor.call,
    );
    const result = await signInWith('facebook', flow);
    expect(result).toMatchObject({ status: 'linkNeeded', pending: { existing: 'google' } });
    expect(visitor.auth.currentUser).toBeNull();
    if (result.status !== 'linkNeeded') throw new Error('expected linkNeeded');
    await continueLink(result.pending, flow);
    expect(visitor.auth.currentUser!.uid).toBe(ayla.uid);
    expect(providerIds(visitor.auth)).toEqual(['facebook.com', 'google.com']);
  });

  it('does not connect Facebook to another Google account picked in the popup', async () => {
    await registered('ayla@example.com', { username: 'Ayla' });
    const visitor = client();
    const { flow } = deps(
      visitor.auth,
      { facebook: 'ayla@example.com', google: 'other@example.com' },
      visitor.call,
    );
    const result = await signInWith('facebook', flow);
    if (result.status !== 'linkNeeded') throw new Error('expected linkNeeded');
    await expect(continueLink(result.pending, flow)).rejects.toMatchObject({
      code: 'auth/email-already-in-use',
    });
    expect(providerIds(visitor.auth)).toEqual(['google.com']);
  });

  it('lets a Google sign-in join a Facebook-only account with the same email', async () => {
    const cem = await facebookPlayer('cem@example.com', 'cem@example.com');
    const player = await guest();
    const { flow, merges } = deps(player.auth, { google: 'cem@example.com' }, player.call);
    // The guest's link fails (auth/email-already-in-use); Google's verified email signs in.
    await expect(signInWith('google', flow)).resolves.toEqual({ status: 'done' });
    expect(player.auth.currentUser!.uid).toBe(cem.uid);
    await expect(merges[0]).resolves.toEqual({ merged: true });
  });
});

describe('sign-in methods on the profile page', () => {
  it('connects and disconnects Facebook, never the last method', async () => {
    const ayla = await registered('ayla@example.com');
    const user = ayla.auth.currentUser!;
    const link = (target: typeof user) =>
      linkWithCredential(target, facebookCredential('ayla-fb', null));

    expect(await connectMethod(user, 'facebook', link)).toBeNull();
    expect(providerIds(ayla.auth)).toEqual(['facebook.com', 'google.com']);
    expect(await disconnectMethod(user, 'google', unlink)).toBeNull();
    expect(providerIds(ayla.auth)).toEqual(['facebook.com']);
    // Firebase itself would unlink the last provider; the flow refuses.
    expect(await disconnectMethod(user, 'facebook', unlink)).toEqual({
      kind: 'lastMethod',
      code: undefined,
    });
    expect(providerIds(ayla.auth)).toEqual(['facebook.com']);
    // signs in with Facebook alone now
    const later = client();
    const { user: again } = await signInWithCredential(
      later.auth,
      facebookCredential('ayla-fb', null),
    );
    expect(again.uid).toBe(ayla.uid);
  });

  it('reports a Facebook account that belongs to someone else, without switching', async () => {
    const cem = await facebookPlayer('cem-fb', null);
    const ayla = await registered('ayla@example.com');
    const error = await connectMethod(ayla.auth.currentUser!, 'facebook', (target) =>
      linkWithCredential(target, facebookCredential('cem-fb', null)),
    );
    expect(error).toEqual({ kind: 'inUse', code: 'auth/credential-already-in-use' });
    expect(ayla.auth.currentUser!.uid).toBe(ayla.uid);
    expect(await authUserExists(cem.uid)).toBe(true);
  });
});

describe('deleting a Facebook-only account', () => {
  it('re-confirms with Facebook, never Google, and deletes data and sign-in', async () => {
    const cem = await facebookPlayer('cem-fb', null, { username: 'Cem' });
    await seedLibrary(cem.uid, ['snake']);
    const user = cem.auth.currentUser!;
    const { signInProvider } = await user.getIdTokenResult();
    expect(reauthProvider(user.providerData, signInProvider)).toBe('facebook');
    // what the profile page does with a stale sign-in: re-confirm with that provider
    await reauthenticateWithCredential(user, facebookCredential('cem-fb', null));

    await expect(cem.call('deleteMyData', {})).resolves.toEqual({ deleted: true });
    await deleteUser(user);
    expect(await read(`users/${cem.uid}`)).toBeUndefined();
    expect(await read(`users/${cem.uid}/library/state`)).toBeUndefined();
    expect(await authUserExists(cem.uid)).toBe(false);
  });
});
