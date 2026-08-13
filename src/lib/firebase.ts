import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, getFirestore, CACHE_SIZE_UNLIMITED, Firestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfigData from '../../firebase-applet-config.json';

const firebaseConfig = {
  apiKey: firebaseConfigData.apiKey,
  authDomain: firebaseConfigData.authDomain,
  projectId: firebaseConfigData.projectId,
  storageBucket: firebaseConfigData.storageBucket,
  messagingSenderId: firebaseConfigData.messagingSenderId,
  appId: firebaseConfigData.appId,
  measurementId: firebaseConfigData.measurementId,
};

// Initialize Firebase
export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

let firestoreInstance: Firestore;
try {
  firestoreInstance = initializeFirestore(app, {
    experimentalForceLongPolling: true,
    useFetchStreams: false,
    cacheSizeBytes: CACHE_SIZE_UNLIMITED,
  } as any, firebaseConfigData.firestoreDatabaseId || undefined);
} catch (_e) {
  firestoreInstance = getFirestore(app, firebaseConfigData.firestoreDatabaseId || undefined);
}

export const db = firestoreInstance;
export const storage = getStorage(app);

// Secondary app for creating admin accounts without logging out super_admin
export function createSecondaryAppForAdmin() {
  const secondaryName = 'secondaryAdminApp-' + Date.now();
  const secondaryApp = initializeApp(firebaseConfig, secondaryName);
  return {
    secondaryAuth: getAuth(secondaryApp),
  };
}
