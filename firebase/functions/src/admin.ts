import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import { getFirestore } from 'firebase-admin/firestore';

// One Admin SDK app per process. In the emulator the SDK picks up the *_EMULATOR_HOST variables.
if (getApps().length === 0) initializeApp();

export const db = () => getFirestore();
export const auth = () => getAuth();
/** The default Realtime Database instance (online match rooms). */
export const rtdb = () => getDatabase();
