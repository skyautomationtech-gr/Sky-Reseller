import { Device } from '@capacitor/device';
import { collection, doc, addDoc, getDocs, query, orderBy, limit, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

export interface LoginHistoryItem {
  id?: string;
  timestamp: any;
  platform: string;
  deviceModel: string;
  osVersion: string;
  appVersion: string;
  deviceId: string;
  isNewDevice: boolean;
  userAgent?: string;
}

const DEVICE_ID_KEY = 'resellbd_device_id_v1';

export function getOrCreateDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = 'dev_' + Math.random().toString(36).substring(2, 12) + '_' + Date.now().toString(36);
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return 'dev_fallback_' + Date.now().toString(36);
  }
}

/**
 * Gathers device metadata using @capacitor/device with web browser fallbacks
 */
export async function getDeviceMetadata(): Promise<{
  deviceId: string;
  platform: string;
  deviceModel: string;
  osVersion: string;
  appVersion: string;
  userAgent: string;
}> {
  const deviceId = getOrCreateDeviceId();
  let platform = 'web';
  let deviceModel = 'Web Browser';
  let osVersion = 'Unknown';
  const appVersion = '2.4.0';
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';

  try {
    const info = await Device.getInfo();
    platform = info.platform || 'web';
    deviceModel = info.model || info.manufacturer || 'Browser';
    osVersion = info.osVersion || (info as any).operatingSystem || 'Web';
  } catch {
    // Fallback based on navigator
    if (typeof navigator !== 'undefined') {
      if (/android/i.test(userAgent)) {
        platform = 'android';
        deviceModel = 'Android Device';
      } else if (/iphone|ipad|ipod/i.test(userAgent)) {
        platform = 'ios';
        deviceModel = 'Apple iOS Device';
      } else if (/windows/i.test(userAgent)) {
        platform = 'windows';
        deviceModel = 'Windows PC';
      } else if (/mac/i.test(userAgent)) {
        platform = 'mac';
        deviceModel = 'Mac';
      }
    }
  }

  return {
    deviceId,
    platform,
    deviceModel,
    osVersion,
    appVersion,
    userAgent,
  };
}

/**
 * Checks whether this deviceId has previously logged in for this user,
 * and records the new login in users/{uid}/loginHistory.
 */
export async function recordLoginHistory(userId: string): Promise<{
  isNewDevice: boolean;
  meta: Awaited<ReturnType<typeof getDeviceMetadata>>;
}> {
  const meta = await getDeviceMetadata();
  let isNewDevice = true;

  try {
    const historyCol = collection(db, 'users', userId, 'loginHistory');
    // Fetch recent logins to check if deviceId was seen before
    const recentSnap = await getDocs(query(historyCol, limit(50)));
    
    if (!recentSnap.empty) {
      const match = recentSnap.docs.some((d) => d.data().deviceId === meta.deviceId);
      if (match) {
        isNewDevice = false;
      }
    }

    // Record login
    await addDoc(historyCol, {
      timestamp: serverTimestamp(),
      platform: meta.platform,
      deviceModel: meta.deviceModel,
      osVersion: meta.osVersion,
      appVersion: meta.appVersion,
      deviceId: meta.deviceId,
      isNewDevice,
      userAgent: meta.userAgent.slice(0, 150),
    });
  } catch (err) {
    console.warn('Error recording login history:', err);
  }

  return {
    isNewDevice,
    meta,
  };
}

/**
 * Fetches last 20 login sessions for a user
 */
export async function fetchUserLoginHistory(userId: string): Promise<LoginHistoryItem[]> {
  if (!userId) return [];
  try {
    const historyCol = collection(db, 'users', userId, 'loginHistory');
    const q = query(historyCol, orderBy('timestamp', 'desc'), limit(20));
    const snap = await getDocs(q);
    return snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as LoginHistoryItem[];
  } catch (err) {
    console.warn('Error fetching user login history:', err);
    return [];
  }
}
