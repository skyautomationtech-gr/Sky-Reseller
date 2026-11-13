import { httpsCallable } from 'firebase/functions';
import { User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { functions, db, auth } from './firebase';
import { formatOtpErrorMessage } from './emailOtpService';
import { OTP_REQUIRED_ROLES } from '../config/authSecurity';

export interface StartSuperAdminLoginResponse {
  success: boolean;
  message: string;
  email?: string;
  expiresInSeconds?: number;
  cooldownSeconds?: number;
}

export interface VerifySuperAdminOtpResponse {
  success: boolean;
  verified: boolean;
  expiresAt: number;
  message: string;
}

/**
 * Checks whether the current user is required to undergo 2-Step OTP,
 * and if their Firebase Auth custom claim or active Firestore adminSessions doc is valid.
 */
export async function checkSuperAdminOtpStatus(
  firebaseUser: User | null,
  role?: string
): Promise<{ isRequired: boolean; isVerified: boolean; expiresAt?: number }> {
  if (!firebaseUser) {
    return { isRequired: false, isVerified: false };
  }

  const effectiveRole =
    role ||
    (firebaseUser.email?.toLowerCase() === 'skyautomationtech@gmail.com' ? 'super_admin' : 'reseller');
  const isRequired = OTP_REQUIRED_ROLES.includes(effectiveRole as any);

  if (!isRequired) {
    return { isRequired: false, isVerified: true };
  }

  const now = Date.now();

  try {
    // 1. Check Firebase ID token custom claims set by verifySuperAdminOtp Cloud Function
    const tokenResult = await firebaseUser.getIdTokenResult(false);
    const claims = tokenResult.claims;
    const otpSession = claims.otpSession as string | undefined;
    const otpExpiresAt = Number(claims.otpExpiresAt || 0);

    if (otpSession && otpExpiresAt > now) {
      return {
        isRequired: true,
        isVerified: true,
        expiresAt: otpExpiresAt,
      };
    }

    // 2. Check active Firestore adminSessions document
    try {
      const sessionDocSnap = await getDoc(doc(db, 'adminSessions', firebaseUser.uid));
      if (sessionDocSnap.exists()) {
        const sData = sessionDocSnap.data();
        if (sData.verified && sData.expiresAt && sData.expiresAt > now) {
          return {
            isRequired: true,
            isVerified: true,
            expiresAt: sData.expiresAt,
          };
        }
      }
    } catch (_) {}

    return {
      isRequired: true,
      isVerified: false,
      expiresAt: otpExpiresAt || undefined,
    };
  } catch (err) {
    console.warn('[superAdminAuth] Error inspecting user token claims:', err);
    return { isRequired: true, isVerified: false };
  }
}

/**
 * Initiates the 2-step Super Admin login flow exclusively via the Firebase Cloud Function 'startSuperAdminLogin' (asia-south1).
 * Never uses local/in-memory API fallbacks or returns fake success on failure.
 */
export async function startSuperAdminLoginCall(email?: string): Promise<StartSuperAdminLoginResponse> {
  const cleanEmail = String(email || '').trim().toLowerCase();

  try {
    const startCallable = httpsCallable<{ email?: string }, StartSuperAdminLoginResponse>(
      functions,
      'startSuperAdminLogin'
    );
    const result = await startCallable({ email: cleanEmail });
    if (result.data && result.data.success) {
      return result.data;
    }
    throw new Error('Could not send Super Admin verification email.');
  } catch (fnErr: any) {
    const rawCode = String(fnErr?.code || '').toLowerCase();
    const rawMsg = String(fnErr?.message || '');

    // Preserve active 60-second cooldown cleanly without flagging as an error
    if (
      (rawCode.includes('resource-exhausted') || rawMsg.toLowerCase().includes('wait')) &&
      rawMsg.toLowerCase().includes('second')
    ) {
      const cooldownMatch = rawMsg.match(/wait\s+(\d+)\s+second/i);
      const remaining = cooldownMatch && cooldownMatch[1] ? parseInt(cooldownMatch[1], 10) : 60;
      return {
        success: true,
        message: rawMsg,
        cooldownSeconds: remaining,
      };
    }

    const formatted = formatOtpErrorMessage(fnErr);
    const customErr: any = new Error(formatted.message);
    customErr.isLocked = formatted.isLocked;
    customErr.code = formatted.code;
    throw customErr;
  }
}

/**
 * Verifies the 6-digit Super Admin OTP exclusively via the Firebase Cloud Function 'verifySuperAdminOtp' (asia-south1).
 * Refreshes the Firebase ID token on success so custom claims take effect immediately.
 */
export async function verifySuperAdminOtpCall(
  code: string,
  email?: string
): Promise<VerifySuperAdminOtpResponse> {
  const cleanCode = String(code || '').trim();
  const cleanEmail = String(email || '').trim().toLowerCase();

  if (!/^\d{6}$/.test(cleanCode)) {
    throw new Error('দয়া করে সম্পূর্ণ ৬ সংখ্যার কোডটি লিখুন। (Please enter the full 6-digit verification code.)');
  }

  try {
    const verifyCallable = httpsCallable<{ code: string; email?: string }, VerifySuperAdminOtpResponse>(
      functions,
      'verifySuperAdminOtp'
    );
    const result = await verifyCallable({ code: cleanCode, email: cleanEmail });
    if (result.data && result.data.verified) {
      // Force refresh ID token so the new otpSession custom claims are available immediately
      if (auth.currentUser) {
        await auth.currentUser.getIdToken(true).catch(() => {});
      }
      return result.data;
    }
    throw new Error('Verification did not succeed.');
  } catch (fnErr: any) {
    const formatted = formatOtpErrorMessage(fnErr);
    const customErr: any = new Error(formatted.message);
    customErr.isWrongCode = formatted.isWrongCode;
    customErr.attemptsLeft = formatted.attemptsLeft;
    customErr.isLocked = formatted.isLocked;
    customErr.code = formatted.code;
    throw customErr;
  }
}

/**
 * Clears the Super Admin OTP custom claims and Firestore session on sign out.
 */
export async function clearSuperAdminOtpSessionCall(email?: string): Promise<void> {
  const cleanEmail = String(email || '').trim().toLowerCase();

  if (cleanEmail) {
    try {
      sessionStorage.removeItem(`sky_super_admin_session_${cleanEmail}`);
    } catch (_) {}
  }

  try {
    const clearCallable = httpsCallable<{ email?: string }, { success: boolean }>(
      functions,
      'clearSuperAdminOtpSession'
    );
    await clearCallable({ email: cleanEmail });
  } catch (err) {
    console.warn('[superAdminAuth] Could not clear OTP session via Cloud Function:', err);
  }
}
