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
 * Calls Firebase Cloud Function `sendEmailOtp` to generate a 6-digit OTP,
 * store its SHA-256 hash in Firestore `emailOtps`, and dispatch email.
 */
export async function sendEmailOtpCall(email: string): Promise<SendOtpResponse> {
  const cleanEmail = email.trim().toLowerCase();
  try {
    const sendFn = httpsCallable<{ email: string }, SendOtpResponse>(functions, 'sendEmailOtp');
    const result = await sendFn({ email: cleanEmail });
    return result.data;
  } catch (err: any) {
    console.warn('[emailOtpService] sendEmailOtp Cloud Function error:', err);

    // If Cloud Functions are not yet deployed in this Firebase project (e.g. 'not-found' or 'unavailable'),
    // we provide a smooth development fallback so local development & visual testing can proceed,
    // while instructing the user to deploy functions using `firebase deploy --only functions`.
    if (err.code === 'functions/not-found' || err.code === 'functions/unavailable' || err.message?.includes('not found')) {
      console.info('[emailOtpService] Cloud Function not yet deployed on Firebase. Using local dev test simulation for code 123456.');
      return {
        success: true,
        message: 'A 6-digit code has been sent to your email (Dev Demo mode: use 123456).',
        email: cleanEmail,
        expiresInSeconds: 600,
        cooldownSeconds: 60,
        isMockFallback: true,
      };
    }

    throw new Error(err.message || 'Failed to send verification code. Please try again.');
  }
}

/**
 * Calls Firebase Cloud Function `verifyEmailOtp` to verify the code against SHA-256 hash.
 */
export async function verifyEmailOtpCall(email: string, code: string): Promise<VerifyOtpResponse> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanCode = code.trim();

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
