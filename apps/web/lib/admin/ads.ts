'use client';

import { readAdSettings, type AdSettings } from '@ayvago/shared';
import { loadAuth, loadFirestore } from '@/lib/firebase/client';

// Admin panel "Ads" section (docs/plan/phase-3.md §3.1). The switch and the caps are one public
// document, config/ads, that admins write directly under the Firestore rules (which check every
// field); each save adds an entry to config/ads/history naming the admin, in the same batch.
// A missing document means "off": the first save creates it.

export type AdsHistoryEntry = { id: string; name: string; at: number; enabled: boolean };

export type AdsAdminState = {
  settings: AdSettings;
  /** False until the first save: everything shown is the default (off). */
  exists: boolean;
  history: AdsHistoryEntry[];
};

export async function loadAdsAdmin(): Promise<AdsAdminState> {
  const db = await loadFirestore();
  const { collection, doc, getDoc, getDocs, limit, orderBy, query } =
    await import('firebase/firestore');
  const [current, history] = await Promise.all([
    getDoc(doc(db, 'config', 'ads')),
    getDocs(query(collection(db, 'config', 'ads', 'history'), orderBy('at', 'desc'), limit(5))),
  ]);
  return {
    settings: readAdSettings(current.data()),
    exists: current.exists(),
    history: history.docs.map((entry) => {
      const d = entry.data();
      return {
        id: entry.id,
        name: typeof d.name === 'string' ? d.name : '?',
        at: d.at?.toMillis?.() ?? 0,
        enabled: d.enabled === true,
      };
    }),
  };
}

/** Saves the whole settings document and its history entry together. */
export async function saveAdSettings(settings: AdSettings, name: string): Promise<AdsAdminState> {
  const [db, auth] = await Promise.all([loadFirestore(), loadAuth()]);
  const { collection, doc, serverTimestamp, writeBatch } = await import('firebase/firestore');
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('signed-out');
  // Normalized first, so only known fields in range are ever written.
  const clean = readAdSettings(settings);
  const batch = writeBatch(db);
  batch.set(doc(db, 'config', 'ads'), { ...clean, updatedAt: serverTimestamp() });
  batch.set(doc(collection(db, 'config', 'ads', 'history')), {
    by: uid,
    name: name.slice(0, 80),
    at: serverTimestamp(),
    enabled: clean.enabled,
    settings: clean,
  });
  await batch.commit();
  return loadAdsAdmin();
}
