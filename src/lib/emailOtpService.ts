import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export interface SendOtpResponse {
  success: boolean;
  message: string;
  email?: string;
  emailSent?: boolean;
  expiresInSeconds?: number;
  cooldownSeconds?: number;
}

export interface VerifyOtpResponse {
  success: boolean;
  verified: boolean;
  message: string;
}

/**
 * Sends a 6-digit OTP code to the specified email address.
 * First calls the Cloud Function 'sendEmailOtp'.
 * If the Cloud Function is not available (e.g. running in local preview),
 * falls back to the server API route (/api/send-email-otp).
 * Never exposes the code or uses client-side mock fallbacks.
 */
export async function sendEmailOtpCall(email: string): Promise<SendOtpResponse> {
  const cleanEmail = email.trim().toLowerCase();

  // 1. Try Firebase Callable Cloud Function first
  try {
    const sendFn = httpsCallable<{ email: string }, SendOtpResponse>(functions, 'sendEmailOtp');
    const result = await sendFn({ email: cleanEmail });
    if (result.data && result.data.success) {
      return result.data;
    }
  } catch (fnErr: any) {
    if (fnErr.code === 'resource-exhausted' || fnErr.message?.includes('wait')) {
      throw new Error(fnErr.message || 'Please wait before requesting a new code.');
    }
    if (fnErr.code === 'already-exists') {
      throw new Error('This email is already registered and approved. Please sign in.');
    }
    console.warn('[emailOtpService] Cloud Function sendEmailOtp failed or not deployed, trying server endpoint:', fnErr?.message || fnErr);
  }

  // 2. Try server Express API fallback (/api/send-email-otp)
  try {
    const res = await fetch('/api/send-email-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cleanEmail }),
    });

    const data = await res.json();
    if (res.ok && data.success) {
      return {
        success: true,
        message: data.message || 'Verification code sent to your email.',
        email: cleanEmail,
        emailSent: true,
        expiresInSeconds: data.expiresInSeconds || 600,
        cooldownSeconds: data.cooldownSeconds || 60,
      };
    } else if (res.status === 429) {
      throw new Error(data.error || 'Please wait before requesting a new code.');
    } else if (data.error) {
      throw new Error(data.error);
    }
  } catch (apiErr: any) {
    if (apiErr.message?.includes('wait') || apiErr.message?.includes('registered')) {
      throw apiErr;
    }
    console.warn('[emailOtpService] Local /api/send-email-otp failed:', apiErr);
  }

  // 3. Strict failure: never generate mock codes or fall back to demo mode
  throw new Error('Could not send the verification email. Please try again later.');
}

/**
 * Verifies the 6-digit code against the server.
 * First calls the Cloud Function 'verifyEmailOtp'.
 * If the Cloud Function is unreachable, falls back to /api/verify-email-otp.
 * Never performs verification on the client or accepts demo codes.
 */
export async function verifyEmailOtpCall(email: string, code: string): Promise<VerifyOtpResponse> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanCode = code.trim();

  if (cleanCode.length !== 6) {
    throw new Error('Please enter the full 6-digit code.');
  }

  // 1. Try Firebase Callable Cloud Function first
  try {
    const verifyFn = httpsCallable<{ email: string; code: string }, VerifyOtpResponse>(functions, 'verifyEmailOtp');
    const result = await verifyFn({ email: cleanEmail, code: cleanCode });
    if (result.data && result.data.verified) {
      return result.data;
    }
  } catch (fnErr: any) {
    if (fnErr.message && !fnErr.message.includes('not found') && fnErr.code !== 'functions/not-found' && fnErr.code !== 'functions/unavailable') {
      throw new Error(fnErr.message || 'Verification failed. Please check the code.');
    }
    console.warn('[emailOtpService] Cloud Function verifyEmailOtp failed or not deployed, trying server endpoint:', fnErr);
  }

  // 2. Try server Express API fallback (/api/verify-email-otp)
  try {
    const res = await fetch('/api/verify-email-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cleanEmail, code: cleanCode }),
    });

    const data = await res.json();
    if (res.ok && data.verified) {
      return {
        success: true,
        verified: true,
        message: data.message || 'Email address verified successfully!',
      };
    }
    throw new Error(data.error || 'Verification failed. Please check the code.');
  } catch (apiErr: any) {
    throw new Error(apiErr.message || 'Verification failed. Please check the code and try again.');
  }
}
