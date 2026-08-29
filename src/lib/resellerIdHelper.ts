import { UserProfile } from '../types';

/**
 * Generates a clean 4-character uppercase alphanumeric code.
 * E.g. 'ERTY', '7K9P', 'X9Q2'
 */
export function generateRandomResellerSuffix(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // excluding I, O, 0, 1 for clarity
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Returns the standardized Reseller ID format: SGR-XXXX (e.g. SGR-ERTY).
 * If user.resellerCode is already set, it returns that.
 * Otherwise, derives a deterministic 4-character code from user.uid, or creates SGR-XXXX.
 */
export function formatResellerId(userOrUid?: UserProfile | string | null, fallbackCode?: string): string {
  if (!userOrUid) return 'SGR-0000';

  if (typeof userOrUid === 'string') {
    // If it's already in SGR-XXXX format, return as is
    if (userOrUid.startsWith('SGR-')) {
      return userOrUid.toUpperCase();
    }
    if (fallbackCode) {
      return fallbackCode.startsWith('SGR-') ? fallbackCode.toUpperCase() : `SGR-${fallbackCode.toUpperCase()}`;
    }
    // Deterministic 4-character suffix from UID
    const cleanUid = userOrUid.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const suffix = (cleanUid.length >= 4 ? cleanUid.slice(0, 4) : cleanUid.padEnd(4, 'X')).toUpperCase();
    return `SGR-${suffix}`;
  }

  // It's a UserProfile object
  if (userOrUid.resellerCode && userOrUid.resellerCode.trim() !== '') {
    const code = userOrUid.resellerCode.trim().toUpperCase();
    return code.startsWith('SGR-') ? code : `SGR-${code}`;
  }

  // Derive from UID
  const cleanUid = (userOrUid.uid || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const suffix = (cleanUid.length >= 4 ? cleanUid.slice(0, 4) : cleanUid.padEnd(4, 'X')).toUpperCase();
  return `SGR-${suffix}`;
}
