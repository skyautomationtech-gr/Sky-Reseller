import { Device } from '@capacitor/device';
import { Capacitor } from '@capacitor/core';
import { 
  collection, doc, getDoc, getDocFromServer, setDoc, updateDoc, deleteDoc, getDocs, 
  query, orderBy, limit, serverTimestamp, arrayRemove, onSnapshot, Timestamp 
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './firebase';

/** Retention period for login history (in minutes). Easy to change. */
export const LOGIN_HISTORY_RETENTION_MINUTES = 60;

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
  expireAt?: any;
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
 * 4. Adds expireAt (createdAt + 60 minutes) to the loginHistory record.
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

    // SERVER WRITE FIRST: Create/revive device record immediately with status 'active' and new activeSessionId
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

    // Append separate entry to loginHistory with expireAt = now + 60 minutes for TTL
    const expireAtMs = Date.now() + LOGIN_HISTORY_RETENTION_MINUTES * 60 * 1000;
    const historyCol = collection(db, 'users', userId, 'loginHistory');
    setDoc(doc(historyCol), {
      timestamp: serverTimestamp(),
      expireAt: Timestamp.fromMillis(expireAtMs),
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
 * Callable acknowledgeSignedOut:
 * Called by a device just before it signs itself out to delete its device record from Firestore.
 */
export async function acknowledgeSignedOut(userId: string, deviceId: string): Promise<boolean> {
  if (!userId || !deviceId) return false;
  try {
    const devRef = doc(db, 'users', userId, 'devices', deviceId);
    await deleteDoc(devRef);
    console.log('[AuthDebug] acknowledgeSignedOut: deleted device record from Firestore:', deviceId);
    return true;
  } catch (err) {
    console.warn('[AuthDebug] acknowledgeSignedOut error:', err);
    return false;
  }
}

/**
 * Real-time subscription for active user devices.
 * Filters out logged-out devices so they disappear IMMEDIATELY from the UI in real-time.
 */
export function subscribeUserDevices(
  userId: string,
  onUpdate: (activeDevices: DeviceItem[]) => void
): () => void {
  if (!userId) {
    onUpdate([]);
    return () => {};
  }

  const currentDeviceId = getOrCreateDeviceId();
  const devicesCol = collection(db, 'users', userId, 'devices');

  const unsub = onSnapshot(devicesCol, (snap) => {
    const rawDevices: DeviceItem[] = [];
    snap.docs.forEach((d) => {
      const data = d.data();
      // Only keep active devices (status === 'active')
      if (data.status === 'active' || !data.status) {
        rawDevices.push({
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
          status: 'active',
          activeSessionId: data.activeSessionId || null,
          lastActive: data.lastActive,
          createdAt: data.createdAt,
          fcmToken: data.fcmToken,
          isCurrent: (data.deviceId || d.id) === currentDeviceId,
        });
      }
    });

    // Deduplicate physical device entries
    const mergedMap = new Map<string, DeviceItem>();
    rawDevices.forEach((dev) => {
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
          mergedMap.set(dedupeKey, dev);
        }
      }
    });

    const activeList = Array.from(mergedMap.values());
    activeList.sort((a, b) => {
      if (a.isCurrent) return -1;
      if (b.isCurrent) return 1;
      return getTimestampMs(b.lastActive) - getTimestampMs(a.lastActive);
    });

    onUpdate(activeList);
  }, (err) => {
    console.warn('subscribeUserDevices error:', err);
  });

  return unsub;
}

/**
 * Real-time subscription for login history.
 * Enforces rule (a): UI ONLY shows entries created/timestamped within the last LOGIN_HISTORY_RETENTION_MINUTES (60 min).
 */
export function subscribeUserLoginHistory(
  userId: string,
  onUpdate: (items: LoginHistoryItem[]) => void
): () => void {
  if (!userId) {
    onUpdate([]);
    return () => {};
  }

  const historyCol = collection(db, 'users', userId, 'loginHistory');
  const q = query(historyCol, orderBy('timestamp', 'desc'), limit(30));

  const unsub = onSnapshot(q, (snap) => {
    const now = Date.now();
    const cutoffMs = now - LOGIN_HISTORY_RETENTION_MINUTES * 60 * 1000;

    const filtered: LoginHistoryItem[] = [];
    snap.docs.forEach((docSnap) => {
      const data = docSnap.data();
      const tsMs = getTimestampMs(data.timestamp || data.createdAt);

      // UI filter: only show entries newer than 60 minutes
      if (tsMs === 0 || tsMs >= cutoffMs) {
        const parsed = parseUserAgentFriendly(data.userAgent || data.deviceModel);
        filtered.push({
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
        });
      }
    });

    onUpdate(filtered);
  }, (err) => {
    console.warn('subscribeUserLoginHistory error:', err);
  });

  return unsub;
}

/**
 * Sign out one specific remote device:
 * Deletes the device record directly from Firestore so it disappears immediately.
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
    }

    // Delete record immediately from Firestore so the device row disappears from every active list
    await deleteDoc(devRef).catch(() => {});

    // 1. Try Cloud Function logoutDevice (sends force_logout FCM with targetSessionId)
    try {
      const logoutFn = httpsCallable<{ deviceId: string; targetSessionId?: string | null }, { success: boolean }>(functions, 'logoutDevice');
      await logoutFn({ deviceId: targetDeviceId, targetSessionId });
    } catch (cfErr) {
      console.warn('Callable logoutDevice notice:', cfErr);
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
 * Deletes all device records from Firestore so they disappear immediately.
 */
export async function signOutAllDevices(userId: string): Promise<boolean> {
  if (!userId) return false;

  try {
    // 1. Delete all device records in users/{uid}/devices directly from Firestore
    const devicesCol = collection(db, 'users', userId, 'devices');
    const snap = await getDocs(devicesCol);
    await Promise.all(
      snap.docs.map((d) => deleteDoc(d.ref).catch(() => {}))
    );

    // 2. Invalidate all sessions via sessionsValidFrom and wipe fcmTokens
    await updateDoc(doc(db, 'users', userId), {
      sessionsValidFrom: serverTimestamp(),
      fcmTokens: [],
      fcmToken: null,
    }).catch(() => {});

    // 3. Try Cloud Function logoutAllDevices
    try {
      const logoutAllFn = httpsCallable<void, { success: boolean }>(functions, 'logoutAllDevices');
      await logoutAllFn();
    } catch (cfErr) {
      console.warn('Callable logoutAllDevices notice:', cfErr);
    }

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
 * A device whose record is missing counts as signed out ONLY if it had a record before
 * (never during the first 10 seconds after a new login).
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

  // 10-second grace period after login: never count as signed out during initial 10s after new login
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

    // If record is missing, auto-heal and register device session rather than assuming remote logout
    if (!devSnap.exists()) {
      console.log('[AuthDebug] Device record does not exist on server. Auto-registering active device session now...');
      recordLoginHistory(userId).catch((regErr) => console.warn('[AuthDebug] Could not auto-register device session:', regErr));
      return { valid: true };
    }

    const data = devSnap.data();
    // Only sign out if the server document explicitly confirms status 'signed_out' AND activeSessionId differs from our current local sessionId
    if (data.status === 'signed_out' && data.activeSessionId && data.activeSessionId !== localSessionId) {
      console.warn('[AuthDebug] Server confirms device signed_out for session:', { serverSession: data.activeSessionId, localSessionId });
      return { valid: false, reason: 'You were signed out from another device' };
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

    // If device document was deleted from Firestore (remote logout):
    if (!snap.exists()) {
      console.warn('[AuthDebug] Realtime listener: device document deleted remotely.');
      onForceLogout('You were signed out from another device');
      return;
    }

    const data = snap.data();
    // Only trigger if status is signed_out AND activeSessionId does not match current local sessionId
    if (data.status === 'signed_out' && data.activeSessionId !== localSessionId) {
      console.warn('[AuthDebug] Realtime listener: device marked signed_out for session:', { serverSession: data.activeSessionId, localSessionId });
      onForceLogout('You were signed out from another device');
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
 * Legacy fetch for initial load or backward compatibility
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

  try {
    const devicesCol = collection(db, 'users', userId, 'devices');
    const snap = await getDocs(devicesCol);
    const activeDevices: DeviceItem[] = [];

    snap.docs.forEach((d) => {
      const data = d.data();
      if (data.status === 'active' || !data.status) {
        activeDevices.push({
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
          status: 'active',
          activeSessionId: data.activeSessionId || null,
          lastActive: data.lastActive,
          createdAt: data.createdAt,
          fcmToken: data.fcmToken,
          isCurrent: (data.deviceId || d.id) === currentDeviceId,
        });
      }
    });

    activeDevices.sort((a, b) => {
      if (a.isCurrent) return -1;
      if (b.isCurrent) return 1;
      return getTimestampMs(b.lastActive) - getTimestampMs(a.lastActive);
    });

    return {
      activeDevices,
      previousDevices: [], // Previous devices removed completely
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
 * Legacy fetch for initial load or backward compatibility
 */
export async function fetchUserLoginHistory(userId: string): Promise<LoginHistoryItem[]> {
  if (!userId) return [];
  try {
    const historyCol = collection(db, 'users', userId, 'loginHistory');
    const q = query(historyCol, orderBy('timestamp', 'desc'), limit(30));
    const snap = await getDocs(q);

    const now = Date.now();
    const cutoffMs = now - LOGIN_HISTORY_RETENTION_MINUTES * 60 * 1000;

    const filtered: LoginHistoryItem[] = [];
    snap.docs.forEach((docSnap) => {
      const data = docSnap.data();
      const tsMs = getTimestampMs(data.timestamp || data.createdAt);

      if (tsMs === 0 || tsMs >= cutoffMs) {
        const parsed = parseUserAgentFriendly(data.userAgent || data.deviceModel);
        filtered.push({
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
        });
      }
    });

    return filtered;
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
