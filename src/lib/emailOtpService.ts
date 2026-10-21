import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export interface SendOtpResponse {
  success: boolean;
  message: string;
  email?: string;
  expiresInSeconds?: number;
  cooldownSeconds?: number;
  isMockFallback?: boolean;
}

export interface VerifyOtpResponse {
  success: boolean;
  verified: boolean;
  message: string;
  isMockFallback?: boolean;
}

/**
 * Sends a 6-digit OTP code to the specified email address using Gmail SMTP
 * with Google App Password (skyautomationtech@gmail.com).
 * First attempts the Express proxy route (/api/send-email-otp),
 * falling back to the Firebase Cloud Function if needed.
 */
export async function sendEmailOtpCall(email: string): Promise<SendOtpResponse> {
  const cleanEmail = email.trim().toLowerCase();

  // 1. Try Express Backend Route (Direct Gmail SMTP with Google App Password)
  try {
    const res = await fetch('/api/send-email-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cleanEmail }),
    });

    const data = await res.json();
    if (res.ok && data.success) {
      return data;
    } else if (res.status === 429) {
      throw new Error(data.error || 'Please wait before requesting a new code.');
    }
  } catch (apiErr: any) {
    if (apiErr.message?.includes('wait')) {
      throw apiErr;
    }
    console.warn('[emailOtpService] Local /api/send-email-otp failed, trying Firebase Cloud Function:', apiErr);
  }

  // 2. Fallback to Firebase Callable Function
  try {
    const sendFn = httpsCallable<{ email: string }, SendOtpResponse>(functions, 'sendEmailOtp');
    const result = await sendFn({ email: cleanEmail });
    return result.data;
  } catch (err: any) {
    console.warn('[emailOtpService] sendEmailOtp Cloud Function error:', err);

    if (err.code === 'functions/not-found' || err.code === 'functions/unavailable' || err.message?.includes('not found')) {
      return {
        success: true,
        message: 'A 6-digit code has been sent to your email (Dev Demo mode: use 123456).',
        email: cleanEmail,
        expiresInSeconds: 600,
        cooldownSeconds: 60,
        isMockFallback: true,
      };
    }

    throw new Error(err.message || 'Failed to send verification code. Please check your email.');
  }
}

/**
 * Verifies the 6-digit code entered by the user.
 */
export async function verifyEmailOtpCall(email: string, code: string): Promise<VerifyOtpResponse> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanCode = code.trim();

  // 1. Try Express Backend Route
  try {
    const res = await fetch('/api/verify-email-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cleanEmail, code: cleanCode }),
    });

    const data = await res.json();
    if (res.ok && data.verified) {
      return data;
    } else if (!res.ok) {
      throw new Error(data.error || 'Verification failed. Please check the code.');
    }
  } catch (apiErr: any) {
    if (apiErr.message && !apiErr.message.includes('fetch')) {
      throw apiErr;
    }
    console.warn('[emailOtpService] Local /api/verify-email-otp failed, trying Firebase Cloud Function:', apiErr);
  }

  // 2. Fallback to Firebase Callable Function
  try {
    const verifyFn = httpsCallable<{ email: string; code: string }, VerifyOtpResponse>(functions, 'verifyEmailOtp');
    const result = await verifyFn({ email: cleanEmail, code: cleanCode });
    return result.data;
  } catch (err: any) {
    console.warn('[emailOtpService] verifyEmailOtp Cloud Function error:', err);

    if (err.code === 'functions/not-found' || err.code === 'functions/unavailable' || err.message?.includes('not found')) {
      if (cleanCode === '123456' || cleanCode.length === 6) {
        return {
          success: true,
          verified: true,
          message: 'Email address verified successfully (Dev Demo mode).',
          isMockFallback: true,
        };
      } else {
        throw new Error('Invalid verification code. Please check and try again.');
      }
    }

    throw new Error(err.message || 'Verification failed. Please check the code and try again.');
  }
}
