import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { generateGuestName } from '@ayvago/shared';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-ayvago',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

const guest = (uid: string) =>
  env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore();
const google = (uid: string, claims: Record<string, unknown> = {}) =>
  env
    .authenticatedContext(uid, { firebase: { sign_in_provider: 'google.com' }, ...claims })
    .firestore();

function newProfile(overrides: Record<string, unknown> = {}) {
  return {
    username: 'PixelFox4821',
    isGuest: true,
    locale: 'en',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}

// Seeds a profile bypassing the rules, as if created earlier.
async function seed(uid: string, data: Record<string, unknown> = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users', uid), {
      username: 'PixelFox4821',
      isGuest: true,
      locale: 'en',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      ...data,
    });
  });
}

describe('users/{uid} create', () => {
  it('lets a guest create their own profile', async () => {
    await assertSucceeds(setDoc(doc(guest('alice'), 'users', 'alice'), newProfile()));
  });

  it('accepts generated Turkish guest names', async () => {
    const username = generateGuestName('tr', () => 0.4);
    await assertSucceeds(
      setDoc(doc(guest('alice'), 'users', 'alice'), newProfile({ username, locale: 'tr' })),
    );
  });

  it('lets a Google user create a registered profile', async () => {
    await assertSucceeds(
      setDoc(doc(google('bob'), 'users', 'bob'), newProfile({ isGuest: false })),
    );
  });

  it("rejects writing someone else's profile", async () => {
    await assertFails(setDoc(doc(guest('mallory'), 'users', 'alice'), newProfile()));
  });

  it('rejects signed-out writes', async () => {
    await assertFails(
      setDoc(doc(env.unauthenticatedContext().firestore(), 'users', 'alice'), newProfile()),
    );
  });

  it('rejects a guest claiming to be registered and vice versa', async () => {
    await assertFails(
      setDoc(doc(guest('alice'), 'users', 'alice'), newProfile({ isGuest: false })),
    );
    await assertFails(setDoc(doc(google('bob'), 'users', 'bob'), newProfile({ isGuest: true })));
  });

  it('rejects fields the client may not set', async () => {
    for (const extra of [{ level: 99 }, { xp: 1e9 }, { country: 'TR' }, { banned: false }]) {
      await assertFails(setDoc(doc(guest('alice'), 'users', 'alice'), newProfile(extra)));
    }
  });

  it('rejects missing fields', async () => {
    const { locale: _locale, ...withoutLocale } = newProfile();
    await assertFails(setDoc(doc(guest('alice'), 'users', 'alice'), withoutLocale));
  });

  it('rejects invalid usernames and locales', async () => {
    for (const username of ['ab', '1abc', 'a'.repeat(21), '<script>', 'has space', 42]) {
      await assertFails(setDoc(doc(guest('alice'), 'users', 'alice'), newProfile({ username })));
    }
    await assertFails(setDoc(doc(guest('alice'), 'users', 'alice'), newProfile({ locale: 'de' })));
  });

  it('rejects client-chosen timestamps', async () => {
    const past = Timestamp.fromDate(new Date('2020-01-01'));
    await assertFails(
      setDoc(doc(guest('alice'), 'users', 'alice'), newProfile({ createdAt: past })),
    );
  });

  it('rejects banned players', async () => {
    await assertFails(
      setDoc(doc(google('bob', { banned: true }), 'users', 'bob'), newProfile({ isGuest: false })),
    );
  });
});

describe('users/{uid} read', () => {
  it('lets the owner read their profile and nobody else', async () => {
    await seed('alice');
    await assertSucceeds(getDoc(doc(guest('alice'), 'users', 'alice')));
    await assertFails(getDoc(doc(guest('mallory'), 'users', 'alice')));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'users', 'alice')));
  });
});

describe('users/{uid} update', () => {
  it('marks the profile registered after the guest links Google (same uid)', async () => {
    await seed('alice');
    await assertSucceeds(
      updateDoc(doc(google('alice'), 'users', 'alice'), {
        isGuest: false,
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('keeps isGuest consistent with the sign-in provider', async () => {
    await seed('alice');
    await assertFails(
      updateDoc(doc(guest('alice'), 'users', 'alice'), {
        isGuest: false,
        updatedAt: serverTimestamp(),
      }),
    );
    await seed('bob', { isGuest: false });
    await assertFails(
      updateDoc(doc(google('bob'), 'users', 'bob'), {
        isGuest: true,
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('lets the owner change their locale', async () => {
    await seed('alice');
    await assertSucceeds(
      updateDoc(doc(guest('alice'), 'users', 'alice'), {
        locale: 'tr',
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('does not allow changing the username yet', async () => {
    await seed('alice');
    await assertFails(
      updateDoc(doc(guest('alice'), 'users', 'alice'), {
        username: 'Admin',
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('requires a server timestamp and rejects other users', async () => {
    await seed('alice');
    await assertFails(updateDoc(doc(guest('alice'), 'users', 'alice'), { locale: 'tr' }));
    await assertFails(
      updateDoc(doc(guest('mallory'), 'users', 'alice'), {
        locale: 'tr',
        updatedAt: serverTimestamp(),
      }),
    );
  });
});

describe('everything else', () => {
  it('stays closed', async () => {
    await assertFails(setDoc(doc(guest('alice'), 'games', 'orbsurge'), { title: 'x' }));
    await assertFails(getDoc(doc(guest('alice'), 'usernames', 'pixelfox4821')));
    await assertFails(
      setDoc(doc(guest('alice'), 'users', 'alice', 'saves', 'orbsurge'), { data: 1 }),
    );
  });
});
