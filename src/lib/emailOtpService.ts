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
  success?: boolean;
  verified: boolean;
  message?: string;
}

export interface FormattedOtpError {
  message: string;
  isWrongCode: boolean;
  isLocked?: boolean;
  attemptsLeft?: number;
  code?: string;
}

/**
 * Masks an email address into privacy-preserving format: e.g. s***o@gmail.com
 */
export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return email || '';
  const [user, domain] = email.split('@');
  if (user.length <= 2) {
    return `${user[0] || '*'}***@${domain}`;
  }
  const first = user[0];
  const last = user[user.length - 1];
  return `${first}***${last}@${domain}`;
}

/**
 * Maps raw error codes or messages into friendly Bangla + English user-facing messages.
 * Never displays raw "internal", "functions/..." or stack traces.
 */
export function formatOtpErrorMessage(err: any): FormattedOtpError {
  const rawCode = String(err?.code || '').toLowerCase();
  const rawMsg = String(err?.message || '').toLowerCase();

  // 1. Wrong code / Incorrect code
  if (
    rawCode.includes('permission-denied') || 
    rawMsg.includes('incorrect code') || 
    rawMsg.includes('wrong code') || 
    rawMsg.includes('attempts remaining')
  ) {
    const attemptsMatch = rawMsg.match(/(\d+)\s+attempt/i);
    const attemptsLeft = attemptsMatch ? parseInt(attemptsMatch[1], 10) : undefined;
    const countStr = attemptsLeft !== undefined ? attemptsLeft : 'কয়েক';

    return {
      message: `কোডটি ভুল। আর ${countStr} বার চেষ্টা করতে পারবেন। (Incorrect code. ${attemptsLeft !== undefined ? attemptsLeft : ''} attempts left.)`,
      isWrongCode: true,
      attemptsLeft,
      code: 'permission-denied',
    };
  }

  // 2. Lockout (15 minutes)
  if (
    rawMsg.includes('locked') || 
    rawMsg.includes('15 minutes') || 
    rawMsg.includes('maximum attempts exceeded') ||
    rawMsg.includes('account locked')
  ) {
    const minMatch = rawMsg.match(/(\d+)\s+more\s+minute/i);
    const mins = minMatch ? minMatch[1] : '১৫';
    return {
      message: `অতিরিক্ত ভুল চেষ্টার কারণে অ্যাকাউন্টটি সাময়িকভাবে ${mins} মিনিটের জন্য লক করা হয়েছে। (Account locked for ${mins} minutes due to too many failed attempts.)`,
      isWrongCode: true,
      isLocked: true,
      attemptsLeft: 0,
      code: 'resource-exhausted',
    };
  }

  // 3. Expired code
  if (rawCode.includes('deadline-exceeded') || rawMsg.includes('expired')) {
    return {
      message: 'কোডের মেয়াদ শেষ হয়ে গেছে। দয়া করে নতুন কোড পাঠান। (Verification code has expired. Please request a new code.)',
      isWrongCode: false,
      code: 'deadline-exceeded',
    };
  }

  // 4. Cooldown (resend too fast)
  if (rawCode.includes('resource-exhausted') && (rawMsg.includes('wait') || rawMsg.includes('seconds'))) {
    const secMatch = rawMsg.match(/(\d+)\s+second/i);
    const sec = secMatch ? secMatch[1] : 'কিছু';
    return {
      message: `দয়া করে ${sec} সেকেন্ড অপেক্ষা করে আবার কোড পাঠান। (Please wait ${sec}s before requesting a new code.)`,
      isWrongCode: false,
      code: 'resource-exhausted',
    };
  }

  // 5. No active code found / not found
  if (rawCode.includes('not-found') || rawMsg.includes('no active') || rawCode.includes('failed-precondition')) {
    return {
      message: 'কোনো সক্রিয় ভেরিফিকেশন কোড পাওয়া যায়নি। নতুন কোড পাঠান। (No active code found. Please request a new code.)',
      isWrongCode: false,
      code: 'not-found',
    };
  }

  // 6. Already registered
  if (rawCode.includes('already-exists') || rawMsg.includes('already registered')) {
    return {
      message: 'এই ইমেইলটি ইতিমধ্যে নিবন্ধিত ও অনুমোদিত। দয়া করে লগইন করুন। (This email is already registered. Please sign in.)',
      isWrongCode: false,
      code: 'already-exists',
    };
  }

  // 7. Network / connection issues
  if (
    rawCode.includes('unavailable') || 
    rawMsg.includes('network') || 
    rawMsg.includes('offline') || 
    rawMsg.includes('failed to fetch') ||
    rawMsg.includes('load failed')
  ) {
    return {
      message: 'Connection problem. Please try again. (ইন্টারনেট সংযোগ সমস্যা। আবার চেষ্টা করুন।)',
      isWrongCode: false,
      code: 'network',
    };
  }

  // 8. Bad code format
  if (rawCode.includes('invalid-argument') || rawMsg.includes('6-digit')) {
    return {
      message: 'দয়া করে সম্পূর্ণ ৬ সংখ্যার কোডটি সঠিকভাবে লিখুন। (Please enter the full 6-digit verification code.)',
      isWrongCode: false,
      code: 'invalid-argument',
    };
  }

  // 9. Generic safe fallback (NEVER expose raw "internal" or stack trace)
  return {
    message: 'সার্ভারে সাময়িক সমস্যা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন। (Server issue. Please try again later.)',
    isWrongCode: false,
    code: 'internal',
  };
}

/**
 * Sends a 6-digit OTP code to the specified email address.
 * First calls the Cloud Function 'sendEmailOtp'.
 * If the Cloud Function is not available (e.g. running in local preview),
 * falls back to the server API route (/api/send-email-otp).
 * Never exposes the code or uses client-side mock fallbacks.
 */
export async function sendEmailOtpCall(email: string): Promise<SendOtpResponse> {
  const cleanEmail = String(email || '').trim().toLowerCase();

  // 1. Try Firebase Callable Cloud Function first
  try {
    const sendFn = httpsCallable<{ email: string }, SendOtpResponse>(functions, 'sendEmailOtp');
    const result = await sendFn({ email: cleanEmail });
    if (result.data && result.data.success) {
      return result.data;
    }
  } catch (fnErr: any) {
    if (fnErr.code === 'resource-exhausted' || fnErr.code === 'already-exists' || fnErr.code === 'invalid-argument') {
      const formatted = formatOtpErrorMessage(fnErr);
      throw new Error(formatted.message);
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
    } else if (data.error) {
      const formatted = formatOtpErrorMessage({ message: data.error, code: res.status === 429 ? 'resource-exhausted' : undefined });
      throw new Error(formatted.message);
    }
  } catch (apiErr: any) {
    if (apiErr.message?.includes('দয়া করে') || apiErr.message?.includes('অ্যাকাউন্ট') || apiErr.message?.includes('নিবন্ধিত')) {
      throw apiErr;
    }
    console.warn('[emailOtpService] Local /api/send-email-otp failed:', apiErr);
  }

  // 3. Strict failure: friendly message
  throw new Error('সার্ভারে সাময়িক সমস্যা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন। (Could not send verification email. Please try again later.)');
}

/**
 * Verifies the 6-digit code against the server.
 * First calls the Cloud Function 'verifyEmailOtp'.
 * If the Cloud Function is unreachable, falls back to /api/verify-email-otp.
 * Never performs verification on the client or accepts demo codes.
 */
export async function verifyEmailOtpCall(email: string, code: string): Promise<VerifyOtpResponse> {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const rawCode = String(code || '').trim();
  const cleanCode = rawCode.replace(/\D/g, '');

  if (cleanCode.length !== 6) {
    throw new Error('দয়া করে সম্পূর্ণ ৬ সংখ্যার কোডটি লিখুন। (Please enter the full 6-digit code.)');
  }

  // 1. Try Firebase Callable Cloud Function first
  try {
    const verifyFn = httpsCallable<{ email: string; code: string }, VerifyOtpResponse>(functions, 'verifyEmailOtp');
    const result = await verifyFn({ email: cleanEmail, code: cleanCode });
    if (result.data && result.data.verified) {
      return {
        success: true,
        verified: true,
        message: 'ইমেইল সফলভাবে যাচাই হয়েছে! (Email address verified successfully!)',
      };
    }
  } catch (fnErr: any) {
    // If it's a specific domain error (wrong code, expired, locked, no active code), throw formatted message directly
    if (
      fnErr.code === 'permission-denied' || 
      fnErr.code === 'resource-exhausted' || 
      fnErr.code === 'deadline-exceeded' || 
      fnErr.code === 'invalid-argument'
    ) {
      const formatted = formatOtpErrorMessage(fnErr);
      const customErr: any = new Error(formatted.message);
      customErr.isWrongCode = formatted.isWrongCode;
      customErr.attemptsLeft = formatted.attemptsLeft;
      customErr.isLocked = formatted.isLocked;
      customErr.code = formatted.code;
      throw customErr;
    }

    console.warn('[emailOtpService] Cloud Function verifyEmailOtp failed, attempting local server API fallback:', fnErr?.message || fnErr);
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
        message: 'ইমেইল সফলভাবে যাচাই হয়েছে! (Email address verified successfully!)',
      };
    }
    const formatted = formatOtpErrorMessage({
      message: data.error,
      code: res.status === 403 ? 'permission-denied' : (res.status === 429 ? 'resource-exhausted' : (res.status === 410 ? 'deadline-exceeded' : undefined))
    });
    const customErr: any = new Error(formatted.message);
    customErr.isWrongCode = formatted.isWrongCode;
    customErr.attemptsLeft = formatted.attemptsLeft;
    customErr.isLocked = formatted.isLocked;
    customErr.code = formatted.code;
    throw customErr;
  } catch (apiErr: any) {
    if (apiErr.isWrongCode !== undefined || apiErr.code) {
      throw apiErr;
    }
    const formatted = formatOtpErrorMessage(apiErr);
    const customErr: any = new Error(formatted.message);
    customErr.isWrongCode = formatted.isWrongCode;
    customErr.attemptsLeft = formatted.attemptsLeft;
    customErr.isLocked = formatted.isLocked;
    customErr.code = formatted.code;
    throw customErr;
  }
}
