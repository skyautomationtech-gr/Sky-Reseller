import { 
  doc, getDoc, setDoc, collection, addDoc, getDocs, query, orderBy, 
  updateDoc, deleteDoc, serverTimestamp 
} from 'firebase/firestore';
import { db } from './firebase';
import { AppVersionConfig, ChangelogEntry, ReleaseType } from '../types';

export const DEFAULT_VERSION = '1.0.0';

/**
 * Fetches the current active version configuration.
 * Auto-creates document with default version 1.0.0 if not found.
 */
export async function getCurrentAppVersion(): Promise<AppVersionConfig> {
  try {
    const vRef = doc(db, 'appVersion', 'current');
    const vSnap = await getDoc(vRef);
    if (vSnap.exists()) {
      return vSnap.data() as AppVersionConfig;
    } else {
      const initialConfig: AppVersionConfig = {
        version: DEFAULT_VERSION,
        releasedAt: new Date(),
        releaseNotes: 'Initial release of Sky Reseller platform.',
      };
      await setDoc(vRef, initialConfig);

      // Create initial changelog entry
      const cRef = collection(db, 'changelogs');
      await addDoc(cRef, {
        version: DEFAULT_VERSION,
        title: 'Initial Release (v1.0.0)',
        description: '• Wholesale reseller product catalog\n• Real-time wallet & commission tracking\n• Order management & courier dispatch\n• Role-based access control & security audit logs',
        releaseType: 'major' as ReleaseType,
        publishedAt: serverTimestamp(),
        publishedBy: 'system',
        publishedByName: 'System Admin',
      });

      return initialConfig;
    }
  } catch (err) {
    console.error('Error fetching current app version:', err);
    return { version: DEFAULT_VERSION, releasedAt: new Date() };
  }
}

/**
 * Fetches all published changelogs ordered by publishedAt desc
 */
export async function getChangelogs(): Promise<ChangelogEntry[]> {
  try {
    const q = query(collection(db, 'changelogs'), orderBy('publishedAt', 'desc'));
    const snap = await getDocs(q);
    const list: ChangelogEntry[] = [];
    snap.forEach((docSnap) => {
      list.push({ id: docSnap.id, ...docSnap.data() } as ChangelogEntry);
    });
    return list;
  } catch (err) {
    console.error('Error fetching changelogs:', err);
    return [];
  }
}

/**
 * Publishes a new version, creating a changelog and updating appVersion/current
 */
export async function publishNewVersion(params: {
  version: string;
  title: string;
  description: string;
  releaseType: ReleaseType;
  publishedBy: string;
  publishedByName: string;
}): Promise<boolean> {
  try {
    // 1. Add to changelogs collection
    await addDoc(collection(db, 'changelogs'), {
      version: params.version.trim(),
      title: params.title.trim(),
      description: params.description.trim(),
      releaseType: params.releaseType,
      publishedAt: serverTimestamp(),
      publishedBy: params.publishedBy,
      publishedByName: params.publishedByName,
    });

    // 2. Update current app version
    await setDoc(doc(db, 'appVersion', 'current'), {
      version: params.version.trim(),
      releasedAt: serverTimestamp(),
      releaseNotes: params.title.trim(),
    });

    return true;
  } catch (err) {
    console.error('Error publishing new version:', err);
    return false;
  }
}

/**
 * Updates an existing changelog entry
 */
export async function updateChangelog(id: string, updates: Partial<ChangelogEntry>): Promise<boolean> {
  try {
    const ref = doc(db, 'changelogs', id);
    await updateDoc(ref, updates);
    return true;
  } catch (err) {
    console.error('Error updating changelog:', err);
    return false;
  }
}

/**
 * Deletes a changelog entry
 */
export async function deleteChangelog(id: string): Promise<boolean> {
  try {
    await deleteDoc(doc(db, 'changelogs', id));
    return true;
  } catch (err) {
    console.error('Error deleting changelog:', err);
    return false;
  }
}

/**
 * Updates user's lastSeenVersion
 */
export async function updateUserLastSeenVersion(uid: string, version: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'users', uid), {
      lastSeenVersion: version,
    });
  } catch (err) {
    console.error('Error updating lastSeenVersion:', err);
  }
}
