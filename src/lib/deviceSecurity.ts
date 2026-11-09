import { Device } from '@capacitor/device';
import { Capacitor } from '@capacitor/core';
import { 
  collection, doc, getDoc, getDocFromServer, setDoc, updateDoc, deleteDoc, getDocs, 
  query, orderBy, limit, serverTimestamp, arrayRemove, onSnapshot 
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './firebase';

export interface DeviceItem {
  id?: string;
  deviceId: string;
  deviceName: string;
  platform: 'android' | 'ios' | 'web';
  os: string;
  osVersion: string;
  browser: string;
  model: string;
  appVersion: string;
  deviceType: 'phone' | 'tablet' | 'laptop';
  status: 'active' | 'signed_out' | 'inactive';
  activeSessionId?: string | null;
  lastActive: any;
  createdAt?: any;
  fcmToken?: string | null;
  signedOutAt?: any;
  signedOutBy?: string | null;
  isCurrent?: boolean;
}

export interface LoginHistoryItem {
  id?: string;
  timestamp: any;
  platform: string;
  deviceName: string;
  deviceModel: string;
  os: string;
  osVersion: string;
  browser: string;
  appVersion: string;
  deviceId: string;
  deviceType: 'phone' | 'tablet' | 'laptop';
  isNewDevice: boolean;
  userAgent?: string;
}

const DEVICE_ID_STORAGE_KEY = 'resellbd_device_id_v2';
const LEGACY_STORAGE_KEY = 'resellbd_device_id_v1';

/**
 * Returns the active session ID stored locally for the given user.
 */
export function getLocalSessionId(userId: string): string | null {
  try {
    return (
      localStorage.getItem(`sky_active_session_id_${userId}`) ||
      sessionStorage.getItem(`sky_active_session_id_${userId}`) ||
      null
    );
  } catch {
    return null;
  }
}

/**
 * Generates and persists a brand new random session ID for the given user.
 */
export function createNewSessionId(userId: string): string {
  const rand = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
  const sessionId = 'sess_' + rand;
  const nowMs = Date.now();
  try {
    localStorage.setItem(`sky_active_session_id_${userId}`, sessionId);
    sessionStorage.setItem(`sky_active_session_id_${userId}`, sessionId);
    localStorage.setItem(`sky_session_login_time_${userId}`, String(nowMs));
    sessionStorage.setItem(`sky_session_auth_time_${userId}`, String(nowMs));
  } catch (_) {}
  return sessionId;
}

/**
 * Returns a stable physical device identifier.
 * - On Native (Capacitor Android/iOS): uses Device.getId() (UUID identifier).
 * - On Web: generates a persistent UUID/random ID stored in localStorage.
 */
export async function getStableDeviceId(): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    try {
      const idInfo = await Device.getId();
      if (idInfo && idInfo.identifier) {
        return 'native_' + idInfo.identifier;
      }
    } catch (err) {
      console.warn('Could not read native device id, falling back to local storage:', err);
    }
  }

  try {
    let id = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (!id) {
      // Check legacy key if available to preserve existing device identity
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy) {
        id = legacy;
      } else {
        const rand = typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
        id = 'web_' + rand;
      }
      localStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
    }
    return id;
  } catch {
    return 'web_fallback_' + Date.now().toString(36);
  }
}

/**
 * Synchronous accessor for UI components where async is impractical
 */
export function getOrCreateDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (!id) {
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      id = legacy || ('web_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36));
      localStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
    }
    return id;
  } catch {
    return 'web_fallback_' + Date.now().toString(36);
  }
}

/**
 * Parse a raw user-agent string into human-friendly, professional device attributes.
 * Never outputs raw "Windows NT 10.0", "Android Device", or single characters like "K".
 */
export function parseUserAgentFriendly(uaString?: string): {
  deviceName: string;
  os: string;
  osVersion: string;
  browser: string;
  model: string;
  deviceType: 'phone' | 'tablet' | 'laptop';
  platform: 'android' | 'ios' | 'web';
} {
  const ua = uaString || (typeof navigator !== 'undefined' ? navigator.userAgent : '') || '';

  // 1. Determine OS and OS Version
  let os = 'Unknown OS';
  let osVersion = '';
  let platform: 'android' | 'ios' | 'web' = 'web';
  let extractedModel = '';

  if (/windows/i.test(ua)) {
    os = 'Windows';
    platform = 'web';
    if (/windows nt 10\.0/i.test(ua)) {
      osVersion = '10/11';
    } else if (/windows nt 6\.3/i.test(ua)) {
      osVersion = '8.1';
    } else if (/windows nt 6\.2/i.test(ua)) {
      osVersion = '8';
    } else if (/windows nt 6\.1/i.test(ua)) {
      osVersion = '7';
    } else {
      osVersion = '10';
    }
    extractedModel = 'PC';
  } else if (/iphone/i.test(ua)) {
    os = 'iOS';
    platform = 'ios';
    const match = ua.match(/OS ([0-9_]+)/i);
    osVersion = match ? match[1].replace(/_/g, '.') : '';
    extractedModel = 'iPhone';
  } else if (/ipad/i.test(ua)) {
    os = 'iPadOS';
    platform = 'ios';
    const match = ua.match(/OS ([0-9_]+)/i);
    osVersion = match ? match[1].replace(/_/g, '.') : '';
    extractedModel = 'iPad';
  } else if (/android/i.test(ua)) {
    os = 'Android';
    platform = 'android';
    const verMatch = ua.match(/Android\s+([0-9.]+)/i);
    osVersion = verMatch ? verMatch[1] : '';

    // Attempt to extract mobile model from UA string: e.g. "Android 14; SM-A546E Build/..."
    const modelMatch = ua.match(/Android[^;]+;\s*([^;)]+)\s*Build/i) || ua.match(/Android[^;]+;\s*([^;)]+)\)/i);
    if (modelMatch && modelMatch[1]) {
      const candidate = modelMatch[1].trim();
      // Sanitize candidate (exclude single characters like "K" or generic strings)
      if (candidate.length > 1 && !/^(k|wv|generic)$/i.test(candidate)) {
        extractedModel = candidate;
      }
    }
    if (!extractedModel) {
      extractedModel = 'Android Phone';
    }
  } else if (/macintosh|mac os x/i.test(ua)) {
    os = 'macOS';
    platform = 'web';
    const match = ua.match(/Mac OS X ([0-9_]+)/i);
    osVersion = match ? match[1].replace(/_/g, '.') : '';
    extractedModel = 'Mac';
  } else if (/cros/i.test(ua)) {
    os = 'Chrome OS';
    platform = 'web';
    extractedModel = 'Chromebook';
  } else if (/linux/i.test(ua)) {
    os = 'Linux';
    platform = 'web';
    extractedModel = 'Linux Desktop';
  }

  // 2. Determine Browser Name and Major Version
  let browser = 'Unknown browser';
  if (/edg\/([0-9]+)/i.test(ua)) {
    const m = ua.match(/edg\/([0-9]+)/i);
    browser = `Edge ${m ? m[1] : ''}`.trim();
  } else if (/samsungbrowser\/([0-9]+)/i.test(ua)) {
    const m = ua.match(/samsungbrowser\/([0-9]+)/i);
    browser = `Samsung Internet ${m ? m[1] : ''}`.trim();
  } else if (/opr\/([0-9]+)|opera/i.test(ua)) {
    const m = ua.match(/opr\/([0-9]+)/i);
    browser = `Opera ${m ? m[1] : ''}`.trim();
  } else if (/chrome\/([0-9]+)/i.test(ua)) {
    const m = ua.match(/chrome\/([0-9]+)/i);
    browser = `Chrome ${m ? m[1] : ''}`.trim();
  } else if (/firefox\/([0-9]+)/i.test(ua)) {
    const m = ua.match(/firefox\/([0-9]+)/i);
    browser = `Firefox ${m ? m[1] : ''}`.trim();
  } else if (/version\/([0-9]+).*safari/i.test(ua) || /safari/i.test(ua)) {
    const m = ua.match(/version\/([0-9]+)/i);
    browser = `Safari ${m ? m[1] : ''}`.trim();
  }

  // 3. Determine Device Type
  let deviceType: 'phone' | 'tablet' | 'laptop' = 'laptop';
  if (/ipad|tablet|playbook|silk/i.test(ua)) {
    deviceType = 'tablet';
  } else if (/iphone|ipod|mobile/i.test(ua) || platform === 'android') {
    deviceType = 'phone';
  }

  // 4. Construct Friendly Device Name
  let deviceName = '';
  if (os === 'Windows') {
    deviceName = `${browser} on Windows ${osVersion}`.trim();
  } else if (os === 'iOS') {
    deviceName = `${browser} on ${extractedModel || 'iPhone'}`;
  } else if (os === 'iPadOS') {
    deviceName = `${browser} on iPad`;
  } else if (os === 'Android') {
    if (extractedModel && extractedModel !== 'Android Phone') {
      deviceName = `${browser} on ${extractedModel}`;
    } else {
      deviceName = `${browser} on Android ${osVersion}`.trim();
    }
  } else if (os === 'macOS') {
    deviceName = `${browser} on Mac`;
  } else if (os === 'Linux') {
    deviceName = `${browser} on Linux`;
  } else if (browser !== 'Unknown browser') {
    deviceName = browser;
  } else {
    deviceName = 'Web Client';
  }

  return {
    deviceName,
    os,
    osVersion,
    browser,
    model: extractedModel || 'Browser',
    deviceType,
    platform,
  };
}

/**
 * Gathers complete, accurate device metadata using @capacitor/device (for Native APK/iOS)
 * or friendly user-agent parsing (for Web).
 */
export async function getDeviceMetadata(): Promise<{
  deviceId: string;
  deviceName: string;
  platform: 'android' | 'ios' | 'web';
  os: string;
  osVersion: string;
  browser: string;
  model: string;
  appVersion: string;
  deviceType: 'phone' | 'tablet' | 'laptop';
  userAgent: string;
}> {
  const deviceId = await getStableDeviceId();
  const rawUa = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const parsed = parseUserAgentFriendly(rawUa);
  const appVersion = '2.4.0';

  if (Capacitor.isNativePlatform()) {
    try {
      const info = await Device.getInfo();
      const manufacturer = (info.manufacturer || '').trim();
      const rawModel = (info.model || '').trim();

      // Clean model name: if model already contains manufacturer, do not repeat
      let cleanModel = rawModel;
      if (manufacturer && !rawModel.toLowerCase().includes(manufacturer.toLowerCase())) {
        cleanModel = `${manufacturer} ${rawModel}`.trim();
      }
      if (!cleanModel) cleanModel = 'Android Device';

      const os = info.operatingSystem === 'android' ? 'Android' : info.operatingSystem === 'ios' ? 'iOS' : (info.operatingSystem || 'Android');
      const osVersion = info.osVersion || '';
      const platform: 'android' | 'ios' = info.platform === 'ios' ? 'ios' : 'android';
      const deviceType: 'phone' | 'tablet' = (platform === 'ios' && /ipad/i.test(cleanModel)) ? 'tablet' : 'phone';

      // Example: "Samsung SM-A546E", "Xiaomi Redmi Note 12"
      const deviceName = cleanModel;

      return {
        deviceId,
        deviceName,
        platform,
        os,
        osVersion,
        browser: 'App',
        model: cleanModel,
        appVersion: info.appVersion || appVersion,
        deviceType,
        userAgent: rawUa,
      };
    } catch (e) {
      console.warn('Error reading Capacitor device info:', e);
    }
  }

  return {
    deviceId,
    deviceName: parsed.deviceName,
    platform: parsed.platform,
    os: parsed.os,
    osVersion: parsed.osVersion,
    browser: parsed.browser,
    model: parsed.model,
    appVersion,
    deviceType: parsed.deviceType,
    userAgent: rawUa,
  };
}

/**
 * On user login:
 * 1. Creates a brand new random activeSessionId and saves it locally.
 * 2. Writes status: 'active', activeSessionId, lastActive, sessionStartedAt to users/{uid}/devices/{deviceId}.
 * 3. AWAITS this server write FIRST before resolving.
 * 4. Revives any previously "signed_out" device document without blocking login.
 */
export async function recordLoginHistory(userId: string, fcmToken?: string | null): Promise<{
  isNewDevice: boolean;
  meta: Awaited<ReturnType<typeof getDeviceMetadata>>;
  sessionId: string;
}> {
  const meta = await getDeviceMetadata();
  let isNewDevice = true;

  if (!userId) {
    return { isNewDevice: false, meta, sessionId: '' };
  }

  const sessionId = createNewSessionId(userId);
  console.log('[AuthDebug] recordLoginHistory: initialized new sessionId:', sessionId, 'for device:', meta.deviceId);

  try {
    const deviceRef = doc(db, 'users', userId, 'devices', meta.deviceId);
    const existingSnap = await getDoc(deviceRef);

    if (existingSnap.exists()) {
      isNewDevice = false;
    } else {
      isNewDevice = true;
    }

    // SERVER WRITE FIRST: Revive device record immediately with status 'active' and new activeSessionId
    const devicePayload = {
      deviceId: meta.deviceId,
      deviceName: meta.deviceName,
      platform: meta.platform,
      os: meta.os,
      osVersion: meta.osVersion,
      browser: meta.browser,
      model: meta.model,
      appVersion: meta.appVersion,
      deviceType: meta.deviceType,
      status: 'active',
      activeSessionId: sessionId,
      lastActive: serverTimestamp(),
      sessionStartedAt: serverTimestamp(),
      signedOutAt: null,
      signedOutBy: null,
      ...(fcmToken ? { fcmToken } : {}),
      ...(isNewDevice ? { createdAt: serverTimestamp() } : {}),
    };

    // Await setDoc FIRST so Firestore server holds status: 'active' before UI listeners attach
    await setDoc(deviceRef, devicePayload, { merge: true });
    console.log('[AuthDebug] recordLoginHistory: device document updated on server as active:', meta.deviceId);

    // Append separate entry to loginHistory (keep audit trail)
    const historyCol = collection(db, 'users', userId, 'loginHistory');
    setDoc(doc(historyCol), {
      timestamp: serverTimestamp(),
      deviceId: meta.deviceId,
      deviceName: meta.deviceName,
      deviceModel: meta.model,
      platform: meta.platform,
      os: meta.os,
      osVersion: meta.osVersion,
      browser: meta.browser,
      appVersion: meta.appVersion,
      deviceType: meta.deviceType,
      isNewDevice,
      userAgent: (meta.userAgent || '').slice(0, 160),
    }).catch(() => {});

  } catch (err) {
    console.error('Error recording device login:', err);
  }

  return {
    isNewDevice,
    meta,
    sessionId,
  };
}

/**
 * Fetches all registered physical devices for the user and categorizes them:
 * - Active: status === 'active' AND lastActive within 30 days
 * - Signed Out / Inactive: explicitly signed_out or inactive >30 days
 * Automatically deduplicates records that belong to the same physical device/browser.
 */
export async function fetchUserDevices(userId: string): Promise<{
  activeDevices: DeviceItem[];
  previousDevices: DeviceItem[];
  currentDeviceId: string;
}> {
  if (!userId) {
    return { activeDevices: [], previousDevices: [], currentDeviceId: '' };
  }

  const currentDeviceId = await getStableDeviceId();
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

  try {
    const devicesCol = collection(db, 'users', userId, 'devices');
    const snap = await getDocs(devicesCol);
    let allDevices: DeviceItem[] = [];

    // If no devices exist in devices collection, migrate from recent loginHistory
    if (snap.empty) {
      allDevices = await migrateLegacyLoginHistoryToDevices(userId, currentDeviceId);
    } else {
      allDevices = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          deviceId: data.deviceId || d.id,
          deviceName: data.deviceName || data.model || 'Device',
          platform: data.platform || 'web',
          os: data.os || '',
          osVersion: data.osVersion || '',
          browser: data.browser || '',
          model: data.model || '',
          appVersion: data.appVersion || '1.0.0',
          deviceType: data.deviceType || 'laptop',
          status: data.status || 'active',
          activeSessionId: data.activeSessionId || null,
          lastActive: data.lastActive,
          createdAt: data.createdAt,
          fcmToken: data.fcmToken,
          signedOutAt: data.signedOutAt,
          isCurrent: (data.deviceId || d.id) === currentDeviceId,
        } as DeviceItem;
      });
    }

    // Merge duplicate records (same platform + deviceName + similar browser/model)
    const mergedMap = new Map<string, DeviceItem>();
    const duplicateDocIdsToDelete: string[] = [];

    allDevices.forEach((dev) => {
      // Key for physical deduplication
      const dedupeKey = dev.deviceId === currentDeviceId
        ? `CURRENT_${dev.deviceId}`
        : `${dev.platform}_${dev.deviceName.toLowerCase().replace(/\s+/g, '')}`;

      if (!mergedMap.has(dedupeKey)) {
        mergedMap.set(dedupeKey, dev);
      } else {
        const existing = mergedMap.get(dedupeKey)!;
        const devTs = getTimestampMs(dev.lastActive);
        const existingTs = getTimestampMs(existing.lastActive);

        if (devTs > existingTs) {
          // Keep newer
          mergedMap.set(dedupeKey, dev);
        }
      }
    });

    const uniqueList = Array.from(mergedMap.values());

    // Segregate into Active vs Previous (Signed out / Inactive)
    const activeDevices: DeviceItem[] = [];
    const previousDevices: DeviceItem[] = [];

    uniqueList.forEach((dev) => {
      const isCur = dev.deviceId === currentDeviceId;
      const lastActiveMs = getTimestampMs(dev.lastActive);
      const isRecent = lastActiveMs >= thirtyDaysAgo;

      if (dev.status === 'signed_out') {
        previousDevices.push({ ...dev, status: 'signed_out', isCurrent: isCur });
      } else if (!isRecent && !isCur) {
        previousDevices.push({ ...dev, status: 'inactive', isCurrent: isCur });
      } else {
        // Active session
        activeDevices.push({ ...dev, status: 'active', isCurrent: isCur });
      }
    });

    // Ensure Current Device is always at the top of activeDevices
    activeDevices.sort((a, b) => {
      if (a.isCurrent) return -1;
      if (b.isCurrent) return 1;
      return getTimestampMs(b.lastActive) - getTimestampMs(a.lastActive);
    });

    previousDevices.sort((a, b) => getTimestampMs(b.lastActive) - getTimestampMs(a.lastActive));

    return {
      activeDevices,
      previousDevices,
      currentDeviceId,
    };
  } catch (err) {
    console.warn('Error fetching user devices:', err);
    return {
      activeDevices: [],
      previousDevices: [],
      currentDeviceId,
    };
  }
}

/**
 * Migration helper: Populates users/{uid}/devices from legacy users/{uid}/loginHistory
 */
async function migrateLegacyLoginHistoryToDevices(userId: string, currentDeviceId: string): Promise<DeviceItem[]> {
  try {
    const historyCol = collection(db, 'users', userId, 'loginHistory');
    const q = query(historyCol, orderBy('timestamp', 'desc'), limit(30));
    const snap = await getDocs(q);

    if (snap.empty) {
      // Create record for current device immediately
      const meta = await getDeviceMetadata();
      const devRef = doc(db, 'users', userId, 'devices', meta.deviceId);
      const initialDev: DeviceItem = {
        id: meta.deviceId,
        deviceId: meta.deviceId,
        deviceName: meta.deviceName,
        platform: meta.platform,
        os: meta.os,
        osVersion: meta.osVersion,
        browser: meta.browser,
        model: meta.model,
        appVersion: meta.appVersion,
        deviceType: meta.deviceType,
        status: 'active',
        activeSessionId: getLocalSessionId(userId),
        lastActive: serverTimestamp(),
        createdAt: serverTimestamp(),
        isCurrent: true,
      };
      await setDoc(devRef, initialDev).catch(() => {});
      return [initialDev];
    }

    const seenMap = new Map<string, DeviceItem>();

    snap.docs.forEach((d) => {
      const data = d.data();
      const devId = data.deviceId || 'legacy_' + d.id;
      const parsed = parseUserAgentFriendly(data.userAgent || data.deviceModel);
      const key = `${data.platform || 'web'}_${parsed.deviceName.toLowerCase().replace(/\s+/g, '')}`;

      if (!seenMap.has(key)) {
        const item: DeviceItem = {
          id: devId,
          deviceId: devId,
          deviceName: parsed.deviceName,
          platform: (data.platform === 'android' ? 'android' : data.platform === 'ios' ? 'ios' : 'web'),
          os: parsed.os,
          osVersion: parsed.osVersion,
          browser: parsed.browser,
          model: data.deviceModel || parsed.model,
          appVersion: data.appVersion || '2.4.0',
          deviceType: parsed.deviceType,
          status: devId === currentDeviceId ? 'active' : 'signed_out',
          activeSessionId: devId === currentDeviceId ? getLocalSessionId(userId) : null,
          lastActive: data.timestamp,
          createdAt: data.timestamp,
          isCurrent: devId === currentDeviceId,
        };
        seenMap.set(key, item);
      }
    });

    const migrated = Array.from(seenMap.values());
    // Persist migrated devices to Firestore
    Promise.all(
      migrated.map((item) => setDoc(doc(db, 'users', userId, 'devices', item.deviceId), item, { merge: true }).catch(() => {}))
    ).catch(() => {});

    return migrated;
  } catch (err) {
    console.warn('Migration error:', err);
    return [];
  }
}

/**
 * Sign out one specific remote device:
 * 1. Sets status: 'signed_out', activeSessionId: null, signedOutAt in users/{uid}/devices/{targetDeviceId}.
 * 2. Calls Cloud Function logoutDevice(targetDeviceId, targetSessionId) (sends force_logout FCM with targetSessionId).
 * 3. MUST NOT call revokeRefreshTokens and MUST NOT touch sessionsValidFrom.
 */
export async function signOutSingleDevice(userId: string, targetDeviceId: string): Promise<boolean> {
  if (!userId || !targetDeviceId) return false;

  try {
    const devRef = doc(db, 'users', userId, 'devices', targetDeviceId);
    const snap = await getDoc(devRef);
    let targetSessionId: string | null = null;
    let tokenToRemove: string | null = null;

    if (snap.exists()) {
      const dData = snap.data();
      targetSessionId = dData.activeSessionId || null;
      tokenToRemove = dData.fcmToken || null;
      
      await updateDoc(devRef, {
        status: 'signed_out',
        activeSessionId: null,
        fcmToken: null,
        signedOutAt: serverTimestamp(),
        signedOutBy: userId,
      });
    }

    // 1. Try Cloud Function logoutDevice (sends force_logout FCM message containing targetSessionId)
    try {
      const logoutFn = httpsCallable<{ deviceId: string; targetSessionId?: string | null }, { success: boolean }>(functions, 'logoutDevice');
      await logoutFn({ deviceId: targetDeviceId, targetSessionId });
    } catch (cfErr) {
      console.warn('Callable logoutDevice notice (using direct database update):', cfErr);
    }

    // 2. Remove token from user document array
    if (tokenToRemove) {
      await updateDoc(doc(db, 'users', userId), {
        fcmTokens: arrayRemove(tokenToRemove),
      }).catch(() => {});
    }

    // 3. Invoke server proxy endpoint for single device
    await fetch('/api/auth/logout-device', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: userId, deviceId: targetDeviceId, targetSessionId }),
    }).catch(() => {});

    return true;
  } catch (err) {
    console.error('Error signing out single device:', err);
    return false;
  }
}

/**
 * Log out from ALL devices:
 * 1. Calls Cloud Function logoutAllDevices() (revokes refresh tokens, sets sessionsValidFrom,
 *    marks all devices signed_out, sends force_logout FCM messages)
 * 2. Updates Firestore users/{uid}.sessionsValidFrom and marks every device signed_out
 * 3. Clears ALL fcmTokens from user document
 */
export async function signOutAllDevices(userId: string): Promise<boolean> {
  if (!userId) return false;

  try {
    // 1. Try Cloud Function logoutAllDevices first
    try {
      const logoutAllFn = httpsCallable<void, { success: boolean }>(functions, 'logoutAllDevices');
      await logoutAllFn();
    } catch (cfErr) {
      console.warn('Callable logoutAllDevices notice (using direct database update):', cfErr);
    }

    // 2. Direct Firestore enforcement updates
    const devicesCol = collection(db, 'users', userId, 'devices');
    const snap = await getDocs(devicesCol);
    await Promise.all(
      snap.docs.map((d) => 
        updateDoc(d.ref, {
          status: 'signed_out',
          activeSessionId: null,
          fcmToken: null,
          signedOutAt: serverTimestamp(),
          signedOutBy: userId,
        }).catch(() => {})
      )
    );

    // 3. Invalidate all sessions via sessionsValidFrom and wipe fcmTokens
    await updateDoc(doc(db, 'users', userId), {
      sessionsValidFrom: serverTimestamp(),
      fcmTokens: [],
      fcmToken: null,
    }).catch(() => {});

    // 4. Invoke local server revocation endpoints
    await Promise.allSettled([
      fetch('/api/auth/logout-all-devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: userId }),
      }),
      fetch('/api/auth/revoke-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: userId }),
      }),
    ]);

    return true;
  } catch (err) {
    console.error('Error logging out all devices:', err);
    return false;
  }
}

/**
 * Verifies if the current physical device's session has been revoked/signed out remotely.
 * Enforces reading directly from the SERVER (not cache).
 * Respects a 10-second grace period after login.
 */
export async function verifyCurrentDeviceSession(userId: string): Promise<{
  valid: boolean;
  isOffline?: boolean;
  reason?: string;
}> {
  if (!userId) return { valid: true };

  const localSessionId = getLocalSessionId(userId);
  const loginTimeMs = Number(
    localStorage.getItem(`sky_session_login_time_${userId}`) ||
    sessionStorage.getItem(`sky_session_auth_time_${userId}`) ||
    0
  );
  const now = Date.now();

  // 10-second grace period after login: do not revoke during initial load right after login
  if (loginTimeMs > 0 && (now - loginTimeMs < 10000)) {
    console.log('[AuthDebug] verifyCurrentDeviceSession: within 10s grace period. Session valid.');
    return { valid: true };
  }

  try {
    const currentDeviceId = await getStableDeviceId();
    const devRef = doc(db, 'users', userId, 'devices', currentDeviceId);

    // READ FROM SERVER (bypasses cache)
    let devSnap;
    try {
      devSnap = await getDocFromServer(devRef);
    } catch (err: any) {
      if (err?.message?.includes('offline') || err?.code === 'unavailable' || !navigator.onLine) {
        return { valid: false, isOffline: true, reason: 'Device is offline and server cannot be reached.' };
      }
      throw err;
    }

    if (devSnap && devSnap.exists()) {
      const data = devSnap.data();
      // Only sign out if the server document says status 'signed_out' AND activeSessionId differs from our current local sessionId
      if (data.status === 'signed_out' && data.activeSessionId !== localSessionId) {
        console.warn('[AuthDebug] Server confirms device signed_out for session:', { serverSession: data.activeSessionId, localSessionId });
        return { valid: false, reason: 'You were signed out from another device' };
      }
    }

    // Check user document sessionsValidFrom directly from server
    try {
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDocFromServer(userRef);
      if (userSnap && userSnap.exists()) {
        const uData = userSnap.data();
        const validFrom = uData.sessionsValidFrom;
        if (validFrom) {
          const validFromMs = getTimestampMs(validFrom);
          if (loginTimeMs > 0 && validFromMs > (loginTimeMs + 3000)) {
            console.warn('[AuthDebug] Server confirms sessionsValidFrom newer than login time:', { validFromMs, loginTimeMs });
            return { valid: false, reason: 'You were signed out from all devices' };
          }
        }
      }
    } catch (uErr: any) {
      if (uErr?.message?.includes('offline') || uErr?.code === 'unavailable' || !navigator.onLine) {
        return { valid: false, isOffline: true, reason: 'Device is offline and server cannot be reached.' };
      }
    }

    return { valid: true };
  } catch (err: any) {
    console.warn('Session verification check warning:', err);
    if (!navigator.onLine) {
      return { valid: false, isOffline: true, reason: 'Device is offline' };
    }
    return { valid: true };
  }
}

/**
 * Attaches real-time live listeners to:
 * 1. users/{uid}/devices/{myDeviceId}
 * 2. users/{uid} (sessionsValidFrom)
 * Ignores cache snapshots and enforces 10-second grace period after login.
 */
export function setupSessionEnforcementListener(
  userId: string,
  onForceLogout: (reason: string) => void
): () => void {
  if (!userId) return () => {};

  let isUnsubscribed = false;
  const currentDeviceId = getOrCreateDeviceId();
  const localSessionId = getLocalSessionId(userId);
  const loginTimeMs = Number(
    localStorage.getItem(`sky_session_login_time_${userId}`) ||
    sessionStorage.getItem(`sky_session_auth_time_${userId}`) ||
    Date.now()
  );

  // 1. Device document live listener
  const devRef = doc(db, 'users', userId, 'devices', currentDeviceId);
  const unsubDev = onSnapshot(devRef, (snap) => {
    if (isUnsubscribed) return;

    // Ignore cache snapshots (which might contain old pre-login state)
    if (snap.metadata.fromCache) return;

    // Ignore updates during 10-second grace period after login
    if (Date.now() - loginTimeMs < 10000) return;

    if (snap.exists()) {
      const data = snap.data();
      // Only trigger if status is signed_out AND activeSessionId does not match current local sessionId
      if (data.status === 'signed_out' && data.activeSessionId !== localSessionId) {
        console.warn('[AuthDebug] Realtime listener: device marked signed_out for session:', { serverSession: data.activeSessionId, localSessionId });
        onForceLogout('You were signed out from another device');
      }
    }
  }, (err) => {
    console.warn('[Security] Device live listener notice:', err);
  });

  // 2. User document live listener (watches sessionsValidFrom)
  const userRef = doc(db, 'users', userId);
  const unsubUser = onSnapshot(userRef, (snap) => {
    if (isUnsubscribed) return;

    if (snap.metadata.fromCache) return;
    if (Date.now() - loginTimeMs < 10000) return;

    if (snap.exists()) {
      const data = snap.data();
      const validFrom = data.sessionsValidFrom;
      if (validFrom) {
        const validFromMs = getTimestampMs(validFrom);
        if (loginTimeMs > 0 && validFromMs > (loginTimeMs + 3000)) {
          console.warn('[AuthDebug] Realtime listener: sessionsValidFrom was updated remotely.');
          onForceLogout('You were signed out from all devices');
        }
      }
    }
  }, (err) => {
    console.warn('[Security] User live listener notice:', err);
  });

  return () => {
    isUnsubscribed = true;
    try {
      unsubDev();
    } catch (_) {}
    try {
      unsubUser();
    } catch (_) {}
  };
}

/**
 * Fetches the last 20 login history records, applying human-friendly device names
 * and ensuring 'isNewDevice' only appears on legitimate first-time device entries.
 */
export async function fetchUserLoginHistory(userId: string): Promise<LoginHistoryItem[]> {
  if (!userId) return [];
  try {
    const historyCol = collection(db, 'users', userId, 'loginHistory');
    const q = query(historyCol, orderBy('timestamp', 'desc'), limit(20));
    const snap = await getDocs(q);

    return snap.docs.map((docSnap) => {
      const data = docSnap.data();
      const parsed = parseUserAgentFriendly(data.userAgent || data.deviceModel);
      return {
        id: docSnap.id,
        timestamp: data.timestamp,
        platform: data.platform || parsed.platform || 'web',
        deviceName: data.deviceName || parsed.deviceName,
        deviceModel: data.deviceModel || parsed.model,
        os: data.os || parsed.os,
        osVersion: data.osVersion || parsed.osVersion,
        browser: data.browser || parsed.browser,
        appVersion: data.appVersion || '2.4.0',
        deviceId: data.deviceId || docSnap.id,
        deviceType: data.deviceType || parsed.deviceType,
        isNewDevice: !!data.isNewDevice,
        userAgent: data.userAgent,
      };
    });
  } catch (err) {
    console.warn('Error fetching user login history:', err);
    return [];
  }
}

function getTimestampMs(ts: any): number {
  if (!ts) return 0;
  if (ts.toDate && typeof ts.toDate === 'function') {
    return ts.toDate().getTime();
  }
  if (ts.seconds) {
    return ts.seconds * 1000;
  }
  if (typeof ts === 'string' || typeof ts === 'number') {
    const n = new Date(ts).getTime();
    return isNaN(n) ? 0 : n;
  }
  return 0;
}
