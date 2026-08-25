import { collection, addDoc, serverTimestamp, query, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { db } from './firebase';
import { UserProfile } from '../types';

export interface AppNotificationInput {
  title: string;
  message: string;
  type?: 'new_order' | 'order_status' | 'commission' | 'payout' | 'general' | 'notice' | 'support';
  targetAudience?: 'all' | 'admin' | 'reseller';
  targetResellerId?: string | null;
  targetResellerName?: string | null;
  metadata?: Record<string, any>;
  priority?: 'low' | 'normal' | 'high';
}

/**
 * Dispatches a notification to Firestore `notices` collection.
 * Handled in realtime by all active clients (admins, specific resellers, or all users).
 */
export async function createAppNotification(input: AppNotificationInput): Promise<string | null> {
  try {
    const docData: any = {
      title: input.title,
      message: input.message,
      content: input.message,
      type: input.type || 'general',
      targetAudience: input.targetAudience || 'all',
      targetResellerId: input.targetResellerId || null,
      targetResellerName: input.targetResellerName || null,
      metadata: input.metadata || {},
      priority: input.priority || 'normal',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const docRef = await addDoc(collection(db, 'notices'), docData);
    return docRef.id;
  } catch (error) {
    console.error('Failed to create app notification:', error);
    return null;
  }
}

/**
 * Plays a pleasant in-app chime sound using Web Audio API synthesis
 */
export function playNotificationChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const now = ctx.currentTime;

    // First tone (E5 ~ 659Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now);
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.18, now + 0.04);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    // Second tone (A5 ~ 880Hz - higher pleasant pitch)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880.0, now + 0.12);
    gain2.gain.setValueAtTime(0, now + 0.12);
    gain2.gain.linearRampToValueAtTime(0.22, now + 0.16);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.55);

    // Vibrate mobile if available
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([80, 40, 80]);
    }
  } catch (err) {
    console.debug('Could not play audio chime:', err);
  }
}

/**
 * Triggers a browser native / system notification if permission is granted
 */
export function showSystemNotification(title: string, body: string, data?: any) {
  try {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: 'sky_alert_' + Date.now(),
        data,
      });
    }
  } catch (err) {
    console.debug('System notification error:', err);
  }
}

/**
 * Realtime listener for incoming user notifications.
 * Automatically triggers banner popups and sounds.
 */
export function subscribeToRealtimeNotifications(
  user: UserProfile,
  onNewNotification: (notification: { id: string; title: string; body: string; data?: any }) => void
) {
  const sessionStartTime = Date.now() - 5000; // only alert on notifications from last 5s or fresh
  const seenIds = new Set<string>();

  const noticesQuery = query(collection(db, 'notices'), orderBy('createdAt', 'desc'), limit(15));

  const unsubscribe = onSnapshot(noticesQuery, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const data = change.doc.data();
        const id = change.doc.id;

        if (seenIds.has(id)) return;
        seenIds.add(id);

        // Check audience permission
        const isAdmin = user.role === 'admin' || user.role === 'super_admin';
        const isTargetReseller = data.targetResellerId === user.uid;
        const isAudienceAll = data.targetAudience === 'all' || !data.targetAudience;
        const isAudienceAdmin = data.targetAudience === 'admin' && isAdmin;
        const isAudienceReseller = data.targetAudience === 'reseller' && (!data.targetResellerId || isTargetReseller);

        const canView = isAudienceAll || isAudienceAdmin || isAudienceReseller || isTargetReseller;
        if (!canView) return;

        // Check if created recently (avoid spamming on initial historical fetch)
        const createdAtTime = data.createdAt?.toDate
          ? data.createdAt.toDate().getTime()
          : data.createdAt
          ? new Date(data.createdAt).getTime()
          : Date.now();

        if (createdAtTime >= sessionStartTime) {
          // Play sound
          playNotificationChime();

          const title = data.title || 'Sky Reseller Alert';
          const body = data.message || data.content || '';

          // Show in-app banner
          onNewNotification({
            id,
            title,
            body,
            data: {
              ...data.metadata,
              type: data.type,
              targetResellerId: data.targetResellerId,
            },
          });

          // Show system notification
          showSystemNotification(title, body, data.metadata);
        }
      }
    });
  });

  return unsubscribe;
}
