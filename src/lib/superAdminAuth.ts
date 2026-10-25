import { httpsCallable } from 'firebase/functions';
import { User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { functions, db } from './firebase';
import {
  OTP_REQUIRED_ROLES,
  SUPER_ADMIN_OTP_EXPIRY_SECONDS,
  SUPER_ADMIN_OTP_RESEND_COOLDOWN_SECONDS,
} from '../config/authSecurity';

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
 * and if their current session custom claim or verified server session is active.
 */
export async function checkSuperAdminOtpStatus(
  firebaseUser: User | null,
  role?: string
): Promise<{ isRequired: boolean; isVerified: boolean; expiresAt?: number }> {
  if (!firebaseUser) {
    return { isRequired: false, isVerified: false };
  }

  const effectiveRole = role || (firebaseUser.email?.toLowerCase() === 'skyautomationtech@gmail.com' ? 'super_admin' : 'reseller');
  const isRequired = OTP_REQUIRED_ROLES.includes(effectiveRole as any);

  if (!isRequired) {
    return { isRequired: false, isVerified: true };
  }

  const now = Date.now();
  const cleanEmail = (firebaseUser.email || '').toLowerCase().trim();

  try {
    // 1. Check Firebase token claims (Production Cloud Function custom claims)
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
          if (cleanEmail) {
            sessionStorage.setItem(`sky_super_admin_session_${cleanEmail}`, JSON.stringify({
              sessionId: 'firestore_session_' + firebaseUser.uid,
              expiresAt: sData.expiresAt,
            }));
          }
          return {
            isRequired: true,
            isVerified: true,
            expiresAt: sData.expiresAt,
          };
        }
      }
    } catch (_) {}

    // 3. Check local preview session storage (for local dev server / preview persistence)
    if (cleanEmail) {
      const localSessionRaw = sessionStorage.getItem(`sky_super_admin_session_${cleanEmail}`);
      if (localSessionRaw) {
        try {
          const localSession = JSON.parse(localSessionRaw);
          if (localSession.sessionId && localSession.expiresAt && localSession.expiresAt > now) {
            return {
              isRequired: true,
              isVerified: true,
              expiresAt: localSession.expiresAt,
            };
          }
        } catch (_) {}
      }

      // 3. Check server dev session status
      try {
        const res = await fetch(`/api/super-admin/check-session/${encodeURIComponent(cleanEmail)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.isVerified && data.expiresAt > now) {
            sessionStorage.setItem(`sky_super_admin_session_${cleanEmail}`, JSON.stringify({
              sessionId: data.sessionId || 'session_' + now,
              expiresAt: data.expiresAt,
            }));
            return {
              isRequired: true,
              isVerified: true,
              expiresAt: data.expiresAt,
            };
          }
        }
      } catch (_) {}
    }

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
 * Initiates the 2-step Super Admin login flow:
 * Clears any previous session custom claim, generates an OTP on the server, and emails it.
 */
export async function startSuperAdminLoginCall(email?: string): Promise<StartSuperAdminLoginResponse> {
  const cleanEmail = (email || '').toLowerCase().trim();

  // 1. Try Firebase Cloud Function callable first
  try {
    const startCallable = httpsCallable<{ email?: string }, StartSuperAdminLoginResponse>(
      functions,
      'startSuperAdminLogin'
    );
    const result = await startCallable({ email: cleanEmail });
    if (result.data && result.data.success) {
      return result.data;
    }
  } catch (fnErr: any) {
    if (fnErr.code === 'resource-exhausted' || fnErr.message?.includes('wait')) {
      throw new Error(fnErr.message || 'Please wait before requesting a new code.');
    }
    if (fnErr.code === 'permission-denied' && (fnErr.message?.includes('locked') || fnErr.message?.includes('minutes'))) {
      throw new Error(fnErr.message);
    }
    console.warn('[superAdminAuth] Cloud Function startSuperAdminLogin unavailable, using server endpoint:', fnErr?.message || fnErr);
  }

  // 2. Try Server Express API fallback
  try {
    const res = await fetch('/api/super-admin/start-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cleanEmail }),
    });

    const data = await res.json();
    if (res.ok && data.success) {
      return {
        success: true,
        message: data.message || 'Verification code sent to your registered Super Admin email.',
        email: data.email,
        expiresInSeconds: data.expiresInSeconds || SUPER_ADMIN_OTP_EXPIRY_SECONDS,
        cooldownSeconds: data.cooldownSeconds || SUPER_ADMIN_OTP_RESEND_COOLDOWN_SECONDS,
      };
    } else if (res.status === 429) {
      throw new Error(data.error || 'Please wait before requesting a new code.');
    } else if (res.status === 423 || data.isLocked) {
      throw new Error(data.error || 'Account is temporarily locked. Please try again in 15 minutes.');
    } else if (data.error) {
      throw new Error(data.error);
    }
  } catch (apiErr: any) {
    if (apiErr.message?.includes('wait') || apiErr.message?.includes('locked') || apiErr.message?.includes('15 minutes')) {
      throw apiErr;
    }
    console.warn('[superAdminAuth] Local API fallback error:', apiErr);
  }

  throw new Error('Could not dispatch the verification email. Please try again later.');
}

/**
 * Verifies the 6-digit Super Admin OTP on the server.
 * Sets the otpSession custom claim on success with a 12-hour expiration window.
 */
export async function verifySuperAdminOtpCall(
  code: string,
  email?: string
): Promise<VerifySuperAdminOtpResponse> {
  const cleanCode = code.trim();
  const cleanEmail = (email || '').toLowerCase().trim();

  if (cleanCode.length !== 6) {
    throw new Error('Please enter the full 6-digit verification code.');
  }

  // 1. Try Firebase Cloud Function callable first
  try {
    const verifyCallable = httpsCallable<{ code: string; email?: string }, VerifySuperAdminOtpResponse>(
      functions,
      'verifySuperAdminOtp'
    );
    const result = await verifyCallable({ code: cleanCode, email: cleanEmail });
    if (result.data && result.data.verified) {
      if (cleanEmail) {
        sessionStorage.setItem(`sky_super_admin_session_${cleanEmail}`, JSON.stringify({
          sessionId: 'cf_session_' + Date.now(),
          expiresAt: result.data.expiresAt,
        }));
      }
      return result.data;
    }
  } catch (fnErr: any) {
    // If account was explicitly locked by the server, rethrow immediately
    if (fnErr.message?.includes('locked') || fnErr.message?.includes('15 minutes') || (fnErr.code === 'permission-denied' && fnErr.message?.includes('locked'))) {
      throw new Error(fnErr.message || 'Account is temporarily locked for 15 minutes.');
    }
    // If it's a genuine invalid code error with attempt counter from Cloud Function
    if (fnErr.code === 'invalid-argument' && fnErr.message?.includes('remaining')) {
      throw new Error(fnErr.message);
    }
    // If it's an internal, network, or not-found error (e.g. Cloud Function not yet deployed on GCP), fall through to local server endpoint
    console.warn('[superAdminAuth] Cloud Function verifySuperAdminOtp unavailable or internal error, falling back to server API:', fnErr?.message || fnErr);
  }

  // 2. Try Server Express API fallback
  try {
    const res = await fetch('/api/super-admin/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: cleanCode, email: cleanEmail }),
    });

    const data = await res.json();
    if (res.ok && data.verified) {
      const expiresAt = data.expiresAt || (Date.now() + 12 * 60 * 60 * 1000);
      if (cleanEmail) {
        sessionStorage.setItem(`sky_super_admin_session_${cleanEmail}`, JSON.stringify({
          sessionId: data.sessionId || 'session_' + Date.now(),
          expiresAt,
        }));
      }
      return {
        success: true,
        verified: true,
        expiresAt,
        message: data.message || 'Two-step verification successful!',
      };
    }
    if (res.status === 423 || data.isLocked) {
      throw new Error(data.error || 'Account is temporarily locked for 15 minutes due to too many failed attempts.');
    }
    throw new Error(data.error || 'Incorrect code. Please try again.');
  } catch (apiErr: any) {
    throw new Error(apiErr.message || 'Verification failed. Please check the code.');
  }
}

/**
 * Clears the Super Admin OTP custom claim and server session on sign out.
 */
export async function clearSuperAdminOtpSessionCall(email?: string): Promise<void> {
  const cleanEmail = (email || '').toLowerCase().trim();

  if (cleanEmail) {
    sessionStorage.removeItem(`sky_super_admin_session_${cleanEmail}`);
  }

  // Try Cloud Function
  try {
    const clearCallable = httpsCallable<{ email?: string }, { success: boolean }>(
      functions,
      'clearSuperAdminOtpSession'
    );
    await clearCallable({ email: cleanEmail });
  } catch (_) {
    // Ignore
  }

  // Try Server API
  try {
    await fetch('/api/super-admin/clear-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cleanEmail }),
    });
  } catch (_) {
    // Ignore
  }
}
