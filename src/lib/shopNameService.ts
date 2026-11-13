import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { normalizeShopName } from '../utils/shopName';

export interface CheckShopNameResult {
  available: boolean;
  shopNameKey: string;
  message?: string;
  isOwn?: boolean;
}

/**
 * Live check for shop name uniqueness across all resellers.
 * 1. Calls Firebase Cloud Function 'checkShopName' (callable, works pre-auth).
 * 2. If Cloud Function is unreachable (local preview / before deploy), falls back to Express API '/api/check-shop-name'.
 * 3. If both fail or device is offline, throws error to trigger the fail-safe:
 *    "Could not verify the name, will be checked again on submit".
 */
export async function checkShopNameAvailability(
  name: string,
  excludeUid?: string
): Promise<CheckShopNameResult> {
  const cleanName = (name || '').trim();
  const shopNameKey = normalizeShopName(cleanName);

  if (!shopNameKey || shopNameKey.length < 2) {
    return {
      available: false,
      shopNameKey,
      message: 'Shop name must be at least 2 characters long.',
    };
  }

  // 1. Try server Express / Vercel API first (avoids Cloud Functions 404 on Spark Free Plan)
  try {
    const res = await fetch('/api/check-shop-name', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shopName: cleanName, excludeUid }),
    });

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json') && res.ok) {
      const data = await res.json();
      return {
        available: !!data.available,
        shopNameKey,
        message: data.message,
        isOwn: data.isOwn,
      };
    }
  } catch (proxyErr) {
    console.warn('API /api/check-shop-name check failed:', proxyErr);
  }

  // 2. Try Cloud Function fallback (if deployed on Blaze)
  try {
    const checkCallable = httpsCallable<
      { name: string; excludeUid?: string },
      CheckShopNameResult
    >(functions, 'checkShopName');

    const res = await checkCallable({ name: cleanName, excludeUid });
    if (res.data) {
      return res.data;
    }
  } catch (fnErr: any) {
    if (fnErr.code === 'already-exists') {
      return {
        available: false,
        shopNameKey,
        message: 'This shop name is already taken. Please choose a different name.',
      };
    }
  }

  // 3. Fail-safe trigger: throw so the caller displays the fail-safe message
  throw new Error('Could not verify the name, will be checked again on submit');
}

/**
 * Updates a reseller's shop name atomically:
 * Releasing old reservation and creating new reservation in a single transaction.
 */
export async function updateShopNameAtomic(
  newShopName: string,
  targetUid?: string
): Promise<{ success: boolean; shopNameKey: string }> {
  const cleanName = newShopName.trim();
  const newKey = normalizeShopName(cleanName);

  if (!newKey || newKey.length < 2) {
    throw new Error('Shop name must be at least 2 characters long.');
  }

  // Call Cloud Function 'updateShopName'
  try {
    const updateCallable = httpsCallable<
      { newShopName: string; targetUid?: string },
      { success: boolean; shopNameKey: string }
    >(functions, 'updateShopName');

    const res = await updateCallable({ newShopName: cleanName, targetUid });
    if (res.data?.success) {
      return res.data;
    }
    throw new Error('Failed to update shop name.');
  } catch (fnErr: any) {
    if (fnErr.message?.includes('already taken') || fnErr.code === 'already-exists') {
      throw new Error('This shop name is already taken. Please choose a different name.');
    }
    throw new Error(fnErr?.message || 'Failed to update shop name.');
  }
}

/**
 * Triggers the admin migration to reserve shop names and generate shopNameKey for all existing resellers.
 */
export async function runShopNameMigration(): Promise<{
  success: boolean;
  totalResellers: number;
  migratedCount: number;
  duplicateCount: number;
  duplicates: Array<{
    shopNameKey: string;
    shopName: string;
    resellers: Array<{ uid: string; resellerId: string; email: string; shopName: string }>;
  }>;
}> {
  const migrateCallable = httpsCallable<
    void,
    {
      success: boolean;
      totalResellers: number;
      migratedCount: number;
      duplicateCount: number;
      duplicates: any[];
    }
  >(functions, 'migrateShopNames');

  const res = await migrateCallable();
  if (res.data?.success) {
    return res.data;
  }
  throw new Error('Failed to run shop name migration.');
}
