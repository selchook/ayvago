import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  linkWithCredential,
  signInAnonymously,
  signInWithCredential,
} from 'firebase/auth';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteInactiveGuests } from '../functions/src/guests';

const PROJECT = 'demo-ayvago';
let env: RulesTestEnvironment;
const apps: FirebaseApp[] = [];

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/accounts`, {
    method: 'DELETE',
  });
});

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => deleteApp(app)));
});

// A separate client app per player, like separate browsers.
function client() {
  const app = initializeApp({ apiKey: 'demo-key', projectId: PROJECT }, `player-${Math.random()}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const functions = getFunctions(app, 'europe-west1');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  return {
    auth,
    call: <T = unknown>(name: string, data: unknown) =>
      httpsCallable<unknown, T>(functions, name)(data).then((result) => result.data),
  };
}

const googleCredential = (email: string) =>
  GoogleAuthProvider.credential(
    JSON.stringify({ sub: `google-${email}`, email, email_verified: true }),
  );

async function registered(email: string, profile: Record<string, unknown> = {}) {
  const player = client();
  const { user } = await signInWithCredential(player.auth, googleCredential(email));
  await seedProfile(user.uid, { isGuest: false, ...profile });
  return { ...player, uid: user.uid };
}

async function guest() {
  const player = client();
  const { user } = await signInAnonymously(player.auth);
  await seedProfile(user.uid, { isGuest: true });
  return { ...player, uid: user.uid, user };
}

async function seedProfile(uid: string, data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users', uid), {
      username: 'PixelFox4821',
      locale: 'en',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      ...data,
    });
  });
}

async function seedLibrary(uid: string, favorites: string[], best: Record<string, number> = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users', uid, 'library', 'state'), {
      favorites,
      recent: favorites.map((slug, i) => ({ slug, playedAt: 1000 + i })),
      best: Object.fromEntries(
        Object.entries(best).map(([slug, score]) => [slug, { score, order: 'desc' }]),
      ),
      updatedAt: Timestamp.now(),
    });
  });
}

async function read(path: string) {
  let data: Record<string, unknown> | undefined;
  await env.withSecurityRulesDisabled(async (ctx) => {
    data = (await getDoc(doc(ctx.firestore(), path))).data();
  });
  return data;
}

async function authUserExists(uid: string) {
  const res = await fetch(
    `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:lookup`,
    {
      method: 'POST',
      headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({ localId: [uid] }),
    },
  );
  return ((await res.json()).users ?? []).length > 0;
}

// Resolves to the callable error's reason ("taken", "cooldown", …), or "ok".
const outcome = (promise: Promise<unknown>) =>
  promise.then(
    () => 'ok',
    (error: { details?: { reason?: string } }) => error.details?.reason ?? 'unknown',
  );

describe('reserveUsername', () => {
  it('reserves a name for a registered player', async () => {
    const ayla = await registered('ayla@example.com');
    await expect(ayla.call('reserveUsername', { username: 'Ayşe_99' })).resolves.toEqual({
      username: 'Ayşe_99',
    });
    expect(await read(`users/${ayla.uid}`)).toMatchObject({
      username: 'Ayşe_99',
      usernameKey: 'ayse_99',
    });
    expect(await read('usernames/ayse_99')).toMatchObject({ uid: ayla.uid, username: 'Ayşe_99' });
  });

  it('treats case and Turkish letters as the same name', async () => {
    const ayla = await registered('ayla@example.com');
    const bora = await registered('bora@example.com');
    await ayla.call('reserveUsername', { username: 'Ayşe_99' });
    expect(await outcome(bora.call('reserveUsername', { username: 'AYSE_99' }))).toBe('taken');
  });

  it('is only for registered players', async () => {
    const player = await guest();
    expect(await outcome(player.call('reserveUsername', { username: 'Guesty' }))).toBe(
      'registered-only',
    );
  });

  it('rejects invalid, reserved and offensive names', async () => {
    const ayla = await registered('ayla@example.com');
    expect(await outcome(ayla.call('reserveUsername', { username: 'x' }))).toBe('invalid');
    expect(await outcome(ayla.call('reserveUsername', { username: 'Admin' }))).toBe('reserved');
    expect(await outcome(ayla.call('reserveUsername', { username: 'Orospu1' }))).toBe('offensive');
    expect(await outcome(ayla.call('reserveUsername', {}))).toBe('invalid');
  });

  it('enforces the cooldown but allows changing only letter case', async () => {
    const ayla = await registered('ayla@example.com');
    await ayla.call('reserveUsername', { username: 'Ayşe_99' });
    const error = await ayla
      .call('reserveUsername', { username: 'Another' })
      .catch((e: { details?: { reason?: string; availableAt?: number } }) => e);
    expect(error).toMatchObject({ details: { reason: 'cooldown' } });
    expect((error as { details: { availableAt: number } }).details.availableAt).toBeGreaterThan(
      Date.now() + 29 * 24 * 3600 * 1000,
    );
    await expect(ayla.call('reserveUsername', { username: 'AYŞE_99' })).resolves.toEqual({
      username: 'AYŞE_99',
    });
  });

  it('releases the old name after the cooldown', async () => {
    const ayla = await registered('ayla@example.com');
    await ayla.call('reserveUsername', { username: 'OldName' });
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), 'users', ayla.uid),
        { usernameChangedAt: Timestamp.fromMillis(Date.now() - 31 * 24 * 3600 * 1000) },
        { merge: true },
      );
    });
    await ayla.call('reserveUsername', { username: 'NewName' });
    expect(await read('usernames/oldname')).toBeUndefined();
    expect(await read('usernames/newname')).toMatchObject({ uid: ayla.uid });
    const bora = await registered('bora@example.com');
    expect(await outcome(bora.call('reserveUsername', { username: 'OldName' }))).toBe('ok');
  });
});

describe('mergeGuestAccount', () => {
  it("moves a guest's library into the account and deletes the guest", async () => {
    const ayla = await registered('ayla@example.com');
    await seedLibrary(ayla.uid, ['orb-surge'], { 'orb-surge': 100 });
    const player = await guest();
    await seedLibrary(player.uid, ['chromashift'], { 'orb-surge': 250, chromashift: 40 });
    const guestIdToken = await player.user.getIdToken();

    await expect(ayla.call('mergeGuestAccount', { guestIdToken })).resolves.toEqual({
      merged: true,
    });
    const library = await read(`users/${ayla.uid}/library/state`);
    expect(library?.favorites).toEqual(['orb-surge', 'chromashift']);
    expect(library?.best).toEqual({
      'orb-surge': { score: 250, order: 'desc' },
      chromashift: { score: 40, order: 'desc' },
    });
    expect(await read(`users/${player.uid}`)).toBeUndefined();
    expect(await read(`users/${player.uid}/library/state`)).toBeUndefined();
    expect(await authUserExists(player.uid)).toBe(false);
  });

  it('refuses tokens that do not belong to an unlinked guest', async () => {
    const ayla = await registered('ayla@example.com');
    const bora = await registered('bora@example.com');
    const boraToken = await bora.auth.currentUser!.getIdToken();
    expect(await outcome(ayla.call('mergeGuestAccount', { guestIdToken: boraToken }))).toBe(
      'not-a-guest',
    );
    expect(await outcome(ayla.call('mergeGuestAccount', { guestIdToken: 'garbage' }))).toBe(
      'invalid-token',
    );
    expect(await authUserExists(bora.uid)).toBe(true);

    // A guest that has since linked Google is no longer a guest.
    const player = await guest();
    const staleToken = await player.user.getIdToken();
    await linkWithCredential(player.user, googleCredential('cem@example.com'));
    expect(await outcome(ayla.call('mergeGuestAccount', { guestIdToken: staleToken }))).toBe(
      'not-a-guest',
    );
    expect(await authUserExists(player.uid)).toBe(true);
  });

  it('cannot be called by a guest', async () => {
    const player = await guest();
    const other = await guest();
    const guestIdToken = await other.user.getIdToken();
    expect(await outcome(player.call('mergeGuestAccount', { guestIdToken }))).toBe(
      'registered-only',
    );
  });
});

describe('deleteInactiveGuests', () => {
  it('deletes inactive guests and their data, never registered players', async () => {
    const ayla = await registered('ayla@example.com');
    await seedLibrary(ayla.uid, ['orb-surge']);
    const player = await guest();
    await seedLibrary(player.uid, ['chromashift']);

    // A cutoff in the future makes every guest count as inactive.
    expect(await deleteInactiveGuests(Date.now() + 60_000)).toBe(1);
    expect(await authUserExists(player.uid)).toBe(false);
    expect(await read(`users/${player.uid}`)).toBeUndefined();
    expect(await read(`users/${player.uid}/library/state`)).toBeUndefined();
    expect(await authUserExists(ayla.uid)).toBe(true);
    expect(await read(`users/${ayla.uid}/library/state`)).toBeDefined();
  });

  it('keeps guests that were active after the cutoff', async () => {
    const player = await guest();
    expect(await deleteInactiveGuests(Date.now() - 60 * 60_000)).toBe(0);
    expect(await authUserExists(player.uid)).toBe(true);
  });
});
