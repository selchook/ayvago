import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { DEFAULT_AD_SETTINGS } from '@ayvago/shared';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

// Phase 3 ads (docs/adr/0023-ads-behind-an-admin-switch.md): config/ads and its history,
// entitlements/{uid}, users/{uid}/adRewards and users/{uid}/adQuota.

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

const anonymous = () => env.unauthenticatedContext().firestore();
const player = (uid: string) =>
  env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore();
const adminDb = (uid = 'boss') =>
  env
    .authenticatedContext(uid, { firebase: { sign_in_provider: 'google.com' }, admin: true })
    .firestore();

const settings = (changes: Record<string, unknown> = {}) => ({
  ...DEFAULT_AD_SETTINGS,
  updatedAt: serverTimestamp(),
  ...changes,
});

async function seed(path: string, data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
  });
}

describe('config/ads', () => {
  it('is readable by anyone, signed in or not (a missing document means off)', async () => {
    await assertSucceeds(getDoc(doc(anonymous(), 'config/ads')));
    await seed('config/ads', { ...DEFAULT_AD_SETTINGS, updatedAt: Timestamp.now() });
    await assertSucceeds(getDoc(doc(anonymous(), 'config/ads')));
    await assertSucceeds(getDoc(doc(player('alice'), 'config/ads')));
  });

  it('keeps the other config documents closed', async () => {
    await seed('config/appCheck', { mode: 'monitor' });
    await assertFails(getDoc(doc(anonymous(), 'config/appCheck')));
    await assertFails(getDoc(doc(player('alice'), 'config/appCheck')));
  });

  it('lets an admin create it on first save and switch it on and off', async () => {
    const db = adminDb();
    await assertSucceeds(setDoc(doc(db, 'config/ads'), settings()));
    await assertSucceeds(setDoc(doc(db, 'config/ads'), settings({ enabled: true })));
    await assertSucceeds(
      updateDoc(doc(db, 'config/ads'), { enabled: false, updatedAt: serverTimestamp() }),
    );
  });

  it('refuses writes from players, guests and visitors', async () => {
    await assertFails(setDoc(doc(player('alice'), 'config/ads'), settings({ enabled: true })));
    await assertFails(setDoc(doc(anonymous(), 'config/ads'), settings({ enabled: true })));
    const registered = env
      .authenticatedContext('carol', { firebase: { sign_in_provider: 'google.com' } })
      .firestore();
    await assertFails(setDoc(doc(registered, 'config/ads'), settings({ enabled: true })));
    await seed('config/ads', { ...DEFAULT_AD_SETTINGS, updatedAt: Timestamp.now() });
    await assertFails(
      updateDoc(doc(player('alice'), 'config/ads'), {
        enabled: true,
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(deleteDoc(doc(player('alice'), 'config/ads')));
  });

  it('refuses malformed settings even from an admin', async () => {
    const db = adminDb();
    const bad = [
      settings({ enabled: 'yes' }),
      settings({ interstitialGapSeconds: 60 }), // under the 3-minute floor
      settings({ interstitialGapSeconds: 200.5 }),
      settings({ rewardedPerDay: 500 }),
      settings({ interstitialsPerDay: -1 }),
      settings({ rewardAmount: 5000 }),
      settings({ extra: true }),
      settings({ updatedAt: Timestamp.fromMillis(0) }),
    ];
    for (const data of bad) await assertFails(setDoc(doc(db, 'config/ads'), data));
    const { banner: _, ...missing } = settings();
    await assertFails(setDoc(doc(db, 'config/ads'), missing));
  });

  it('keeps an audit trail only admins write (as themselves) and read', async () => {
    const db = adminDb('boss');
    const entry = {
      by: 'boss',
      name: 'Boss',
      at: serverTimestamp(),
      enabled: true,
      settings: { ...DEFAULT_AD_SETTINGS, enabled: true },
    };
    await assertSucceeds(addDoc(collection(db, 'config/ads/history'), entry));
    await assertFails(addDoc(collection(db, 'config/ads/history'), { ...entry, by: 'someone' }));
    await assertFails(
      addDoc(collection(db, 'config/ads/history'), { ...entry, at: Timestamp.fromMillis(0) }),
    );
    await assertSucceeds(getDocs(collection(db, 'config/ads/history')));

    await seed('config/ads/history/one', { ...entry, at: Timestamp.now() });
    await assertFails(updateDoc(doc(db, 'config/ads/history/one'), { enabled: false }));
    await assertFails(deleteDoc(doc(db, 'config/ads/history/one')));
    await assertFails(getDocs(collection(player('alice'), 'config/ads/history')));
    await assertFails(getDoc(doc(anonymous(), 'config/ads/history/one')));
    await assertFails(
      addDoc(collection(player('alice'), 'config/ads/history'), { ...entry, by: 'alice' }),
    );
  });
});

describe('entitlements/{uid}', () => {
  beforeEach(async () => {
    await seed('entitlements/alice', { removeAds: true, source: 'test' });
  });

  it('lets the player and admins read it', async () => {
    await assertSucceeds(getDoc(doc(player('alice'), 'entitlements/alice')));
    await assertSucceeds(getDoc(doc(adminDb(), 'entitlements/alice')));
    // A player without an entitlement can still ask (the document is just missing).
    await assertSucceeds(getDoc(doc(player('bob'), 'entitlements/bob')));
  });

  it('hides it from other players and visitors', async () => {
    await assertFails(getDoc(doc(player('bob'), 'entitlements/alice')));
    await assertFails(getDoc(doc(anonymous(), 'entitlements/alice')));
  });

  it('is never written from a client, not even by admins', async () => {
    await assertFails(setDoc(doc(player('bob'), 'entitlements/bob'), { removeAds: true }));
    await assertFails(updateDoc(doc(player('alice'), 'entitlements/alice'), { removeAds: false }));
    await assertFails(deleteDoc(doc(player('alice'), 'entitlements/alice')));
    await assertFails(setDoc(doc(adminDb(), 'entitlements/bob'), { removeAds: true }));
  });
});

describe('reward records', () => {
  beforeEach(async () => {
    await seed('users/alice/adRewards/t1', { status: 'granted', day: '2026-11-11' });
    await seed('users/alice/adQuota/2026-11-11', { granted: 1, tickets: 1 });
  });

  it('lets the player and admins read their rewards', async () => {
    await assertSucceeds(getDoc(doc(player('alice'), 'users/alice/adRewards/t1')));
    await assertSucceeds(getDocs(collection(player('alice'), 'users/alice/adRewards')));
    await assertSucceeds(getDoc(doc(adminDb(), 'users/alice/adRewards/t1')));
  });

  it('hides them from other players', async () => {
    await assertFails(getDoc(doc(player('bob'), 'users/alice/adRewards/t1')));
    await assertFails(getDoc(doc(anonymous(), 'users/alice/adRewards/t1')));
  });

  it('never lets a client write a reward or the daily counter', async () => {
    const db = player('alice');
    await assertFails(setDoc(doc(db, 'users/alice/adRewards/t2'), { status: 'granted' }));
    await assertFails(updateDoc(doc(db, 'users/alice/adRewards/t1'), { status: 'pending' }));
    await assertFails(deleteDoc(doc(db, 'users/alice/adRewards/t1')));
    await assertFails(setDoc(doc(db, 'users/alice/adQuota/2026-11-11'), { granted: 0 }));
    await assertFails(getDoc(doc(db, 'users/alice/adQuota/2026-11-11')));
    await assertFails(setDoc(doc(adminDb(), 'users/alice/adRewards/t3'), { status: 'granted' }));
  });
});
