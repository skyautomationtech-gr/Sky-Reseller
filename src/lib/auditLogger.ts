import { collection, addDoc, setDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { UserRole } from '../types';

export const logAuditAction = async (
  performedBy: string,
  performedByName: string,
  performedByRole: UserRole,
  action: string,
  targetId: string | null = null,
  details: string = ''
) => {
  try {
    await addDoc(collection(db, 'auditLogs'), {
      action,
      performedBy,
      performedByName,
      performedByRole,
      targetId,
      details,
      timestamp: serverTimestamp(),
    });
  } catch (err) {
    console.error('Failed to record audit log:', err);
  }
};

export const logUserSession = async (
  userId: string,
  userName: string,
  userRole: UserRole
) => {
  try {
    if (!userId) return;
    // Deduplicate within the same browser tab session so we don't spam writes on every reload/refresh
    const sessionKey = `logged_session_${userId}`;
    const now = Date.now();
    const lastLogged = sessionStorage.getItem(sessionKey);
    if (lastLogged && now - Number(lastLogged) < 15 * 60 * 1000) {
      return; // Already logged in this session within last 15 minutes
    }

    const deviceInfo = navigator.userAgent || 'Unknown Device';
    const newSessionRef = doc(collection(db, 'userSessions'));
    await setDoc(newSessionRef, {
      userId,
      userName: userName || 'User',
      userRole,
      deviceInfo,
      timestamp: serverTimestamp(),
    }, { merge: true });

    sessionStorage.setItem(sessionKey, String(now));
  } catch (err: any) {
    // If document collision or transient write error occurs, ignore gracefully
    if (err?.code === 'already-exists' || err?.message?.includes('already exists')) {
      return;
    }
    console.warn('Notice: session log skipped:', err?.message || err);
  }
};
