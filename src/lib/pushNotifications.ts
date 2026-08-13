import { Capacitor } from '@capacitor/core';
import { PushNotifications, PermissionStatus, ActionPerformed, PushNotificationSchema } from '@capacitor/push-notifications';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from './firebase';

export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: any;
}

/**
 * Checks whether native PushNotifications plugin is available.
 */
function isNativePushAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('PushNotifications');
}

/**
 * Checks the current push notification permission status.
 */
export async function checkPushNotificationPermission(): Promise<'granted' | 'denied' | 'prompt'> {
  try {
    if (typeof window === 'undefined') return 'denied';

    if (isNativePushAvailable()) {
      try {
        const perm = await PushNotifications.checkPermissions();
        if (perm.receive === 'granted') return 'granted';
        if (perm.receive === 'denied') return 'denied';
        return 'prompt';
      } catch (e) {
        console.warn('Native checkPermissions failed:', e);
      }
    }

    // Web Notification API Fallback
    if ('Notification' in window) {
      if (Notification.permission === 'granted') return 'granted';
      if (Notification.permission === 'denied') return 'denied';
      return 'prompt';
    }
  } catch (err) {
    console.warn('Error checking push permission:', err);
  }
  return 'denied';
}

/**
 * Requests push notification permissions and registers the FCM token to Firestore users/{userId}.
 */
export async function requestAndRegisterPushNotifications(userId: string): Promise<boolean> {
  if (!userId) return false;
  localStorage.setItem('push_permission_prompted', 'true');

  try {
    // 1. Capacitor Native PushNotifications (Android / iOS)
    if (isNativePushAvailable()) {
      try {
        let permStatus = await PushNotifications.checkPermissions();
        if (permStatus.receive === 'prompt' || permStatus.receive === 'prompt-with-rationale') {
          permStatus = await PushNotifications.requestPermissions();
        }

        if (permStatus.receive === 'granted') {
          await PushNotifications.register();
          return true;
        }
      } catch (capErr) {
        console.warn('Native push registration error:', capErr);
      }
    }

    // 2. Web Notification fallback
    if ('Notification' in window) {
      const webPerm = await Notification.requestPermission();
      if (webPerm === 'granted') {
        const mockWebToken = 'web_fcm_' + userId + '_' + Date.now().toString(36);
        try {
          const userRef = doc(db, 'users', userId);
          await updateDoc(userRef, {
            fcmTokens: arrayUnion(mockWebToken)
          });
        } catch (dbErr) {
          console.error('Error saving Web FCM token:', dbErr);
        }
        return true;
      }
    }
  } catch (err) {
    console.error('Error requesting push notification permission:', err);
  }
  return false;
}

/**
 * Attaches registration & push event listeners. Saves FCM token to Firestore upon registration.
 */
export function registerPushNotificationListeners(
  userId: string,
  onNotificationReceived?: (payload: PushNotificationPayload) => void,
  onNotificationAction?: (data: any) => void
) {
  if (typeof window === 'undefined') return;

  if (!isNativePushAvailable()) {
    console.log('PushNotifications plugin is not native/available on web. Native listeners skipped.');
    return;
  }

  try {
    // Listen for registration success token
    PushNotifications.addListener('registration', async (token) => {
      console.log('Push Registration Token success:', token.value);
      if (userId && token.value) {
        try {
          const userRef = doc(db, 'users', userId);
          await updateDoc(userRef, {
            fcmTokens: arrayUnion(token.value)
          });
          console.log('Saved FCM Token to user profile in Firestore.');
        } catch (err) {
          console.error('Failed to save FCM token to Firestore:', err);
        }
      }
    });

    // Listen for registration errors
    PushNotifications.addListener('registrationError', (error) => {
      console.error('Push registration error: ', error);
    });

    // Handle incoming notification while app is open
    PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
      console.log('Push notification received in foreground:', notification);
      const title = notification.title || notification.data?.title || 'Sky Reseller Alert';
      const body = notification.body || notification.data?.body || '';

      if (onNotificationReceived) {
        onNotificationReceived({
          title,
          body,
          data: notification.data
        });
      }
    });

    // Handle tap action from lock screen / notification tray
    PushNotifications.addListener('pushNotificationActionPerformed', (notification: ActionPerformed) => {
      console.log('Push notification action performed:', notification);
      const data = notification.notification?.data || {};
      if (onNotificationAction) {
        onNotificationAction(data);
      }
    });

  } catch (err) {
    console.warn('PushNotification listeners registration skipped:', err);
  }
}
