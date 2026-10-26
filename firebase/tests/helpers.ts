import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  signInAnonymously,
  signInWithCredential,
} from 'firebase/auth';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';

// Shared setup for the tests that call the Cloud Functions running in the emulator.

export const PROJECT = 'demo-ayvago';
let env: RulesTestEnvironment;
const apps: FirebaseApp[] = [];

export function useEmulators() {
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
}

// A separate client app per player, like separate browsers.
export function client() {
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

export const googleCredential = (email: string) =>
  GoogleAuthProvider.credential(
    JSON.stringify({ sub: `google-${email}`, email, email_verified: true }),
  );

export async function registered(email: string, profile: Record<string, unknown> = {}) {
  const player = client();
  const { user } = await signInWithCredential(player.auth, googleCredential(email));
  await seedProfile(user.uid, { isGuest: false, ...profile });
  return { ...player, uid: user.uid };
}

export async function guest(profile: Record<string, unknown> = {}) {
  const player = client();
  const { user } = await signInAnonymously(player.auth);
  await seedProfile(user.uid, { isGuest: true, ...profile });
  return { ...player, uid: user.uid, user };
}

export async function seedProfile(uid: string, data: Record<string, unknown>) {
  await write(`users/${uid}`, {
    username: 'PixelFox4821',
    locale: 'en',
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    ...data,
  });
}

/** Writes a document bypassing the rules, as the server would. */
export async function write(path: string, data: Record<string, unknown>, merge = false) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data, { merge });
  });
}

export async function read(path: string) {
  let data: Record<string, unknown> | undefined;
  await env.withSecurityRulesDisabled(async (ctx) => {
    data = (await getDoc(doc(ctx.firestore(), path))).data();
  });
  return data;
}

export async function authUserExists(uid: string) {
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
export const outcome = (promise: Promise<unknown>) =>
  promise.then(
    () => 'ok',
    (error: { details?: { reason?: string } }) => error.details?.reason ?? 'unknown',
  );

/** The local fixture game (scoring: min 5 s, max 1000 points per second), live in the emulator. */
export const FIXTURE = 'bridgefixture';

export type Player = { uid: string; call: ReturnType<typeof client>['call'] };
export type Session = { sessionId: string; token: string };

export const start = (player: Player, gameId = FIXTURE) =>
  player.call<Session>('startSession', { gameId });

/** Pretends the session started `ms` ago, so runs need not last for real. */
export async function age(session: Session, ms: number) {
  await write(
    `sessions/${session.sessionId}`,
    { startedAt: Timestamp.fromMillis(Date.now() - ms) },
    true,
  );
}

/** Starts a run, lets it last `seconds` and finishes it with `score`. */
export async function play(player: Player, score: number, seconds = 60) {
  const session = await start(player);
  await age(session, seconds * 1000);
  return player.call<Record<string, unknown>>('finishSession', {
    ...session,
    score,
    durationMs: seconds * 1000,
    continues: 0,
  });
}
