import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
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
    const deviceInfo = navigator.userAgent || 'Unknown Device';
    await addDoc(collection(db, 'userSessions'), {
      userId,
      userName,
      userRole,
      deviceInfo,
      timestamp: serverTimestamp(),
    });
  } catch (err) {
    console.error('Failed to log session:', err);
  }
};
