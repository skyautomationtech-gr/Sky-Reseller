import { httpsCallable } from 'firebase/functions';
import { User } from 'firebase/auth';
import { doc, getDoc, deleteDoc } from 'firebase/firestore';
import { functions, db, auth } from './firebase';
import {
  formatOtpErrorMessage,
  getApiBaseUrl,
  getOtpChallengeState,
  saveOtpChallengeState,
  clearOtpChallengeState,
} from './emailOtpService';
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
 * Initiates the 2-step Super Admin login flow via stateless /api/super-admin/start-login
 * (works on Firebase Spark Free Plan, Vercel Hobby, and AI Studio Preview),
 * falling back to Cloud Function 'startSuperAdminLogin' only if /api route is unreachable.
 */
export async function startSuperAdminLoginCall(email?: string): Promise<StartSuperAdminLoginResponse> {
  const cleanEmail = String(email || auth.currentUser?.email || '').trim().toLowerCase();
  const state = getOtpChallengeState('super_admin', cleanEmail);
  const apiUrl = `${getApiBaseUrl()}/api/super-admin/start-login`;

  let shouldTryCloudFunctionFallback = false;

  try {
    const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      },
      credentials: 'same-origin',
      body: JSON.stringify({
        email: cleanEmail,
        otpToken: state.otpToken,
        attemptToken: state.attemptToken,
        lockoutToken: state.lockoutToken,
      }),
    });

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      shouldTryCloudFunctionFallback = true;
    } else {
      const data = await response.json();

      if (response.ok && data?.success) {
        if (data.otpToken || data.attemptToken) {
          saveOtpChallengeState('super_admin', cleanEmail, {
            otpToken: data.otpToken,
            attemptToken: data.attemptToken,
          });
        }
        return data as StartSuperAdminLoginResponse;
      }

      const apiErr: any = new Error(data?.error || 'Could not send Super Admin verification email.');
      apiErr.code = data?.code || 'internal';
      apiErr.isLocked = !!data?.isLocked;
      throw apiErr;
    }
  } catch (apiErr: any) {
    if (apiErr?.code && apiErr.code !== 'network') {
      const rawCode = String(apiErr.code || '').toLowerCase();
      const rawMsg = String(apiErr.message || '');

      if (
        !apiErr.isLocked &&
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

      const formatted = formatOtpErrorMessage(apiErr);
      const customErr: any = new Error(formatted.message);
      customErr.isLocked = formatted.isLocked;
      customErr.code = formatted.code;
      throw customErr;
    }
    shouldTryCloudFunctionFallback = true;
  }

  if (shouldTryCloudFunctionFallback) {
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

  const fallbackErr = formatOtpErrorMessage({ code: 'internal' });
  const customErr: any = new Error(fallbackErr.message);
  customErr.code = fallbackErr.code;
  throw customErr;
}

/**
 * Verifies the 6-digit Super Admin OTP via stateless /api/super-admin/verify-otp
 * (works on Firebase Spark Free Plan, Vercel Hobby, and AI Studio Preview),
 * falling back to Cloud Function 'verifySuperAdminOtp' only if /api route is unreachable.
 */
export async function verifySuperAdminOtpCall(
  code: string,
  email?: string
): Promise<VerifySuperAdminOtpResponse> {
  const cleanCode = String(code || '').trim();
  const cleanEmail = String(email || auth.currentUser?.email || '').trim().toLowerCase();

  if (!/^\d{6}$/.test(cleanCode)) {
    throw new Error('দয়া করে সম্পূর্ণ ৬ সংখ্যার কোডটি লিখুন। (Please enter the full 6-digit verification code.)');
  }

  const state = getOtpChallengeState('super_admin', cleanEmail);
  const apiUrl = `${getApiBaseUrl()}/api/super-admin/verify-otp`;
  let shouldTryCloudFunctionFallback = false;

  try {
    const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      },
      credentials: 'same-origin',
      body: JSON.stringify({
        code: cleanCode,
        email: cleanEmail,
        otpToken: state.otpToken,
        attemptToken: state.attemptToken,
        lockoutToken: state.lockoutToken,
      }),
    });

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      shouldTryCloudFunctionFallback = true;
    } else {
      const data = await response.json();

      if (data?.attemptToken) {
        saveOtpChallengeState('super_admin', cleanEmail, { attemptToken: data.attemptToken });
      }
      if (data?.lockoutToken) {
        saveOtpChallengeState('super_admin', cleanEmail, { lockoutToken: data.lockoutToken });
        clearOtpChallengeState('super_admin', cleanEmail, true);
      }

      if (response.ok && data?.verified) {
        clearOtpChallengeState('super_admin', cleanEmail, false);
        return data as VerifySuperAdminOtpResponse;
      }

      const apiErr: any = new Error(data?.error || 'Verification did not succeed.');
      apiErr.code = data?.code || 'internal';
      apiErr.attemptsLeft = data?.attemptsLeft;
      apiErr.isLocked = !!data?.isLocked;
      throw apiErr;
    }
  } catch (apiErr: any) {
    if (apiErr?.code && apiErr.code !== 'network') {
      const formatted = formatOtpErrorMessage(apiErr);
      const customErr: any = new Error(formatted.message);
      customErr.isWrongCode = formatted.isWrongCode;
      customErr.attemptsLeft =
        typeof apiErr.attemptsLeft === 'number' ? apiErr.attemptsLeft : formatted.attemptsLeft;
      customErr.isLocked = formatted.isLocked;
      customErr.code = formatted.code;
      throw customErr;
    }
    shouldTryCloudFunctionFallback = true;
  }

  if (shouldTryCloudFunctionFallback) {
    try {
      const verifyCallable = httpsCallable<{ code: string; email?: string }, VerifySuperAdminOtpResponse>(
        functions,
        'verifySuperAdminOtp'
      );
      const result = await verifyCallable({ code: cleanCode, email: cleanEmail });
      if (result.data && result.data.verified) {
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

  const fallbackErr = formatOtpErrorMessage({ code: 'internal' });
  const customErr: any = new Error(fallbackErr.message);
  customErr.code = fallbackErr.code;
  throw customErr;
}

/**
 * Clears the Super Admin OTP session in Firestore, sessionStorage, and server cookies on sign out.
 */
export async function clearSuperAdminOtpSessionCall(email?: string): Promise<void> {
  const cleanEmail = String(email || auth.currentUser?.email || '').trim().toLowerCase();

  if (cleanEmail) {
    clearOtpChallengeState('super_admin', cleanEmail, false);
    try {
      sessionStorage.removeItem(`sky_super_admin_session_${cleanEmail}`);
    } catch (_) {}
  }

  if (auth.currentUser) {
    try {
      await deleteDoc(doc(db, 'adminSessions', auth.currentUser.uid));
    } catch (_) {}
  }

  try {
    const idToken = auth.currentUser ? await auth.currentUser.getIdToken().catch(() => '') : '';
    await fetch(`${getApiBaseUrl()}/api/super-admin/clear-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      },
      credentials: 'same-origin',
      body: JSON.stringify({ email: cleanEmail }),
    });
  } catch {
    // Ignore cleanup errors
  }

  try {
    const clearCallable = httpsCallable<{ email?: string }, { success: boolean }>(
      functions,
      'clearSuperAdminOtpSession'
    );
    await clearCallable({ email: cleanEmail });
  } catch {
    // Ignore if Cloud Functions are not deployed on Spark plan
  }
}
