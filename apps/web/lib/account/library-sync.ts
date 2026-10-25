'use client';

// Mirrors the browser library (lib/library.ts) to users/{uid}/library/state.
//
// - The first time a browser meets an account, the two libraries are merged, so a guest's or a
//   signed-out player's favorites and scores join the account.
// - After that the account is the source of truth: on every page load the browser copy is
//   replaced by the account copy (removals on another device stick), plus any changes made on
//   this page before the account had loaded.
// - Signing out clears the browser copy, so the next player on a shared device starts fresh.
import {
  EMPTY_LIBRARY,
  mergeLibraries,
  sameLibrary,
  sanitizeLibrary,
  type LibraryState,
} from '@ayvago/shared';
import { attachLibraryWriter, readLibrary, replaceLibrary } from '@/lib/library';
import { loadFirestore } from '@/lib/firebase/client';

// The uid whose library this browser currently mirrors.
const OWNER_KEY = 'ayvago:library-owner';
// Batches quick successive changes into one Firestore write.
const WRITE_DELAY_MS = 2000;

let attachedUid: string | null = null;
let pending: { uid: string; state: LibraryState } | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

function owner(): string | null {
  try {
    return window.localStorage.getItem(OWNER_KEY);
  } catch {
    return null;
  }
}

function setOwner(uid: string | null) {
  try {
    if (uid) window.localStorage.setItem(OWNER_KEY, uid);
    else window.localStorage.removeItem(OWNER_KEY);
  } catch {
    // Without storage every page load merges, which loses nothing.
  }
}

async function libraryRef(uid: string) {
  const db = await loadFirestore();
  const { doc } = await import('firebase/firestore');
  return doc(db, 'users', uid, 'library', 'state');
}

async function write(uid: string, state: LibraryState) {
  const ref = await libraryRef(uid);
  const { serverTimestamp, setDoc } = await import('firebase/firestore');
  await setDoc(ref, { ...state, updatedAt: serverTimestamp() });
}

function schedule(uid: string, state: LibraryState) {
  pending = { uid, state };
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    flushLibrary().catch((error) => console.error('[library] sync failed', error));
  }, WRITE_DELAY_MS);
}

/** Writes any batched change now (before signing out, or when the page is hidden). */
export async function flushLibrary(): Promise<void> {
  if (timer) clearTimeout(timer);
  timer = null;
  const job = pending;
  pending = null;
  if (job) await write(job.uid, job.state);
}

export async function attachLibrary(uid: string): Promise<void> {
  if (attachedUid === uid) return;
  attachedUid = uid;
  // A different account took over: its batched writes are not ours to send any more.
  if (timer) clearTimeout(timer);
  pending = null;

  const ref = await libraryRef(uid);
  const { getDoc } = await import('firebase/firestore');
  const snapshot = await getDoc(ref);
  if (attachedUid !== uid) return;

  const remote = snapshot.exists() ? sanitizeLibrary(snapshot.data()) : EMPTY_LIBRARY;
  const changes = attachLibraryWriter((state) => schedule(uid, state));
  const next =
    owner() === uid
      ? changes.reduce((state, change) => change(state), remote)
      : mergeLibraries(readLibrary(), remote);
  replaceLibrary(next);
  setOwner(uid);
  if (!snapshot.exists() || !sameLibrary(next, remote)) await write(uid, next);
}

/** Stops syncing without touching the browser copy (used right before deleting the account). */
export function cancelLibrarySync(): void {
  attachedUid = null;
  attachLibraryWriter(null);
  if (timer) clearTimeout(timer);
  timer = null;
  pending = null;
}

/** Called when nobody is signed in any more. */
export function detachLibrary(): void {
  attachedUid = null;
  attachLibraryWriter(null);
  if (timer) clearTimeout(timer);
  pending = null;
  // Only a mirrored account library is cleared; a never-synced local library stays.
  if (owner()) {
    replaceLibrary(EMPTY_LIBRARY);
    setOwner(null);
  }
}

if (typeof window !== 'undefined') {
  // Best effort: send a batched change when the tab is hidden or closed.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushLibrary().catch(() => {});
  });
}
