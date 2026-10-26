import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
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

  it('lets the owner save avatar, theme and mode preferences', async () => {
    await seed('alice');
    await assertSucceeds(
      updateDoc(doc(guest('alice'), 'users', 'alice'), {
        avatarId: 'rocket-violet',
        theme: 'retro',
        mode: 'dark',
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('rejects unknown preference values', async () => {
    await seed('alice');
    for (const change of [
      { avatarId: 'https://evil.example/a.png' },
      { avatarId: 'Rocket-Violet' },
      { avatarId: 42 },
      { theme: 'neon' },
      { mode: 'auto' },
    ]) {
      await assertFails(
        updateDoc(doc(guest('alice'), 'users', 'alice'), {
          ...change,
          updatedAt: serverTimestamp(),
        }),
      );
    }
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

describe('users/{uid} delete', () => {
  it('lets players delete their own profile and nobody else', async () => {
    await seed('alice');
    await assertFails(deleteDoc(doc(guest('mallory'), 'users', 'alice')));
    await assertFails(deleteDoc(doc(env.unauthenticatedContext().firestore(), 'users', 'alice')));
    await assertSucceeds(deleteDoc(doc(guest('alice'), 'users', 'alice')));
  });
});

describe('users/{uid}/library/state', () => {
  const library = (overrides: Record<string, unknown> = {}) => ({
    favorites: ['orb-surge'],
    recent: [{ slug: 'orb-surge', playedAt: 1700000000000 }],
    best: { 'orb-surge': { score: 420, order: 'desc' } },
    updatedAt: serverTimestamp(),
    ...overrides,
  });
  const ref = (db: ReturnType<typeof guest>, uid: string) =>
    doc(db, 'users', uid, 'library', 'state');

  it('lets the owner write and read their library, guests included', async () => {
    await assertSucceeds(setDoc(ref(guest('alice'), 'alice'), library()));
    await assertSucceeds(getDoc(ref(guest('alice'), 'alice')));
    await assertSucceeds(setDoc(ref(google('bob'), 'bob'), library({ favorites: [] })));
  });

  it("keeps other players out of someone's library", async () => {
    await assertFails(setDoc(ref(guest('mallory'), 'alice'), library()));
    await assertSucceeds(setDoc(ref(guest('alice'), 'alice'), library()));
    await assertFails(getDoc(ref(guest('mallory'), 'alice')));
    await assertFails(getDoc(ref(env.unauthenticatedContext().firestore(), 'alice')));
  });

  it('rejects unknown fields, wrong types and client timestamps', async () => {
    await assertFails(setDoc(ref(guest('alice'), 'alice'), library({ coins: 1e6 })));
    await assertFails(setDoc(ref(guest('alice'), 'alice'), library({ favorites: 'orb-surge' })));
    await assertFails(setDoc(ref(guest('alice'), 'alice'), library({ best: ['x'] })));
    await assertFails(
      setDoc(
        ref(guest('alice'), 'alice'),
        library({ updatedAt: Timestamp.fromDate(new Date('2020-01-01')) }),
      ),
    );
    const { recent: _recent, ...withoutRecent } = library();
    await assertFails(setDoc(ref(guest('alice'), 'alice'), withoutRecent));
  });

  it('enforces the size limits', async () => {
    const slugs = (n: number) => Array.from({ length: n }, (_, i) => `game-${i}`);
    await assertSucceeds(setDoc(ref(guest('alice'), 'alice'), library({ favorites: slugs(200) })));
    await assertFails(setDoc(ref(guest('alice'), 'alice'), library({ favorites: slugs(201) })));
    const plays = (n: number) => slugs(n).map((slug, i) => ({ slug, playedAt: i }));
    await assertFails(setDoc(ref(guest('alice'), 'alice'), library({ recent: plays(21) })));
    const bests = Object.fromEntries(slugs(301).map((slug) => [slug, { score: 1, order: 'desc' }]));
    await assertFails(setDoc(ref(guest('alice'), 'alice'), library({ best: bests })));
  });

  it('can be deleted by its owner only, and not written by banned players', async () => {
    await assertSucceeds(setDoc(ref(guest('alice'), 'alice'), library()));
    await assertFails(deleteDoc(ref(guest('mallory'), 'alice')));
    await assertSucceeds(deleteDoc(ref(guest('alice'), 'alice')));
    await assertFails(setDoc(ref(google('bob', { banned: true }), 'bob'), library()));
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

describe('leaderboards', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'leaderboards/orbsurge/boards/season'), { periodKey: 's', top: [] });
      await setDoc(doc(db, 'leaderboards/orbsurge/boards/season/entries/u1'), { score: 10 });
      await setDoc(doc(db, 'leaderboards/orbsurge/seasons/s-2026-W43'), { top: [] });
      await setDoc(doc(db, 'sessions/abc'), { uid: 'u1' });
      await setDoc(doc(db, 'scoreFlags/abc'), { uid: 'u1' });
    });
  });

  it('can be read by anyone, including signed-out visitors', async () => {
    const visitor = env.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(visitor, 'leaderboards/orbsurge/boards/season')));
    await assertSucceeds(getDoc(doc(visitor, 'leaderboards/orbsurge/boards/season/entries/u1')));
    await assertSucceeds(getDoc(doc(visitor, 'leaderboards/orbsurge/seasons/s-2026-W43')));
  });

  it('cannot be written by players', async () => {
    const db = google('u1');
    await assertFails(setDoc(doc(db, 'leaderboards/orbsurge/boards/season'), { top: [] }));
    await assertFails(
      setDoc(doc(db, 'leaderboards/orbsurge/boards/season/entries/u1'), { score: 1e9 }),
    );
    await assertFails(deleteDoc(doc(db, 'leaderboards/orbsurge/boards/season/entries/u1')));
    await assertFails(setDoc(doc(db, 'leaderboards/orbsurge/seasons/x'), { top: [] }));
  });

  it('keeps score sessions and flags private', async () => {
    const db = google('u1');
    await assertFails(getDoc(doc(db, 'sessions/abc')));
    await assertFails(setDoc(doc(db, 'sessions/new'), { uid: 'u1' }));
    await assertFails(getDoc(doc(db, 'scoreFlags/abc')));
  });
});

describe('votes and rankings', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'games/orbsurge'), { likes: 3, dislikes: 1 });
      await setDoc(doc(db, 'games/orbsurge/votes/u1'), { value: 1 });
      await setDoc(doc(db, 'games/orbsurge/daily/2026-10-26'), { started: 3 });
      await setDoc(doc(db, 'games/orbsurge/feedback/2026-10-26'), { count: 1 });
      await setDoc(doc(db, 'rankings/catalog'), { games: {} });
      await setDoc(doc(db, 'users/u1/stats/orbsurge'), { playSeconds: 90 });
    });
  });

  it('shows counters and rankings to everyone', async () => {
    const visitor = env.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(visitor, 'games/orbsurge')));
    await assertSucceeds(getDoc(doc(visitor, 'rankings/catalog')));
  });

  it('lets players read only their own vote and stats', async () => {
    const db = google('u1');
    await assertSucceeds(getDoc(doc(db, 'games/orbsurge/votes/u1')));
    await assertSucceeds(getDoc(doc(db, 'users/u1/stats/orbsurge')));
    const other = google('u2');
    await assertFails(getDoc(doc(other, 'games/orbsurge/votes/u1')));
    await assertFails(getDoc(doc(other, 'users/u1/stats/orbsurge')));
  });

  it('keeps votes, stats and counters server-written and feedback private', async () => {
    const db = google('u1');
    await assertFails(setDoc(doc(db, 'games/orbsurge/votes/u1'), { value: -1 }));
    await assertFails(setDoc(doc(db, 'games/orbsurge'), { likes: 999 }));
    await assertFails(setDoc(doc(db, 'users/u1/stats/orbsurge'), { playSeconds: 9999 }));
    await assertFails(getDoc(doc(db, 'games/orbsurge/daily/2026-10-26')));
    await assertFails(getDoc(doc(db, 'games/orbsurge/feedback/2026-10-26')));
    await assertFails(setDoc(doc(db, 'rankings/catalog'), { games: {} }));
  });
});
