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
 * Maps raw Firebase HttpsError codes or messages into friendly Bangla + English user-facing messages.
 * Never displays raw "internal", "functions/..." or stack traces.
 */
export function formatOtpErrorMessage(err: any): FormattedOtpError {
  const rawCode = String(err?.code || '').toLowerCase();
  const rawMsg = String(err?.message || '').toLowerCase();

  // 1. Lockout (15 minutes) - check before permission-denied since lockout may mention attempts
  if (
    rawMsg.includes('locked') ||
    rawMsg.includes('15 minutes') ||
    rawMsg.includes('maximum attempts exceeded') ||
    rawMsg.includes('maximum verification attempts') ||
    rawMsg.includes('account locked')
  ) {
    const minMatch = rawMsg.match(/(\d+)\s+(?:more\s+)?minute/i);
    const mins = minMatch ? minMatch[1] : '15';
    return {
      message: `অতিরিক্ত ভুল চেষ্টার কারণে অ্যাকাউন্টটি সাময়িকভাবে ${mins} মিনিটের জন্য লক করা হয়েছে। (Account locked for ${mins} minutes due to too many failed attempts.)`,
      isWrongCode: true,
      isLocked: true,
      attemptsLeft: 0,
      code: 'resource-exhausted',
    };
  }

  // 2. Wrong code / Incorrect code
  if (
    rawCode.includes('permission-denied') ||
    rawMsg.includes('incorrect code') ||
    rawMsg.includes('wrong code') ||
    rawMsg.includes('attempts remaining') ||
    rawMsg.includes('attempt(s) remaining')
  ) {
    const attemptsMatch = rawMsg.match(/(\d+)\s+attempt/i);
    const attemptsLeft = attemptsMatch ? parseInt(attemptsMatch[1], 10) : undefined;
    const countStr = attemptsLeft !== undefined ? attemptsLeft : 'কয়েক';

    return {
      message: `কোডটি ভুল। আর ${countStr} বার চেষ্টা করতে পারবেন। (Incorrect code.${attemptsLeft !== undefined ? ` ${attemptsLeft} attempts left.` : ''})`,
      isWrongCode: true,
      attemptsLeft,
      code: 'permission-denied',
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
    const sec = secMatch ? secMatch[1] : '60';
    return {
      message: `দয়া করে ${sec} সেকেন্ড অপেক্ষা করে আবার কোড পাঠান। (Please wait ${sec}s before requesting a new code.)`,
      isWrongCode: false,
      code: 'resource-exhausted',
    };
  }

  // 5. Server configuration missing
  if (rawCode.includes('failed-precondition') && (rawMsg.includes('configuration') || rawMsg.includes('missing'))) {
    return {
      message: 'ইমেইল বা OTP সার্ভার কনফিগারেশন সম্পূর্ণ নয়। অনুগ্রহ করে অ্যাডমিনের সাথে যোগাযোগ করুন। (Server email configuration is missing.)',
      isWrongCode: false,
      code: 'failed-precondition',
    };
  }

  // 6. No active code found / not found
  if (rawCode.includes('not-found') || rawMsg.includes('no active')) {
    return {
      message: 'কোনো সক্রিয় ভেরিফিকেশন কোড পাওয়া যায়নি। নতুন কোড পাঠান। (No active code found. Please request a new code.)',
      isWrongCode: false,
      code: 'not-found',
    };
  }

  // 7. Already registered
  if (rawCode.includes('already-exists') || rawMsg.includes('already registered')) {
    return {
      message: 'এই ইমেইলটি ইতিমধ্যে নিবন্ধিত ও অনুমোদিত। দয়া করে লগইন করুন। (This email is already registered. Please sign in.)',
      isWrongCode: false,
      code: 'already-exists',
    };
  }

  // 8. Network / connection issues
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

  // 9. Bad code format / invalid email
  if (rawCode.includes('invalid-argument') || rawMsg.includes('6-digit') || rawMsg.includes('valid email')) {
    return {
      message: rawMsg.includes('valid email')
        ? 'সঠিক ইমেইল ঠিকানা লিখুন। (Please provide a valid email address.)'
        : 'দয়া করে সম্পূর্ণ ৬ সংখ্যার কোডটি সঠিকভাবে লিখুন। (Please enter the full 6-digit verification code.)',
      isWrongCode: false,
      code: 'invalid-argument',
    };
  }

  // 10. Generic safe fallback
  return {
    message: 'সার্ভারে সাময়িক সমস্যা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন। (Server issue. Please try again later.)',
    isWrongCode: false,
    code: 'internal',
  };
}

/**
 * Sends a 6-digit OTP code exclusively via the Firebase Cloud Function 'sendEmailOtp' (asia-south1).
 * Never uses local/in-memory API fallbacks or returns fake success on failure.
 */
export async function sendEmailOtpCall(email: string): Promise<SendOtpResponse> {
  const cleanEmail = String(email || '').trim().toLowerCase();

  try {
    const sendFn = httpsCallable<{ email: string }, SendOtpResponse>(functions, 'sendEmailOtp');
    const result = await sendFn({ email: cleanEmail });
    if (result.data && result.data.success) {
      return result.data;
    }
    throw new Error('Could not send verification email.');
  } catch (fnErr: any) {
    const formatted = formatOtpErrorMessage(fnErr);
    const errOut: any = new Error(formatted.message);
    errOut.code = formatted.code;
    errOut.isLocked = formatted.isLocked;
    throw errOut;
  }
}

/**
 * Verifies the 6-digit code exclusively via the Firebase Cloud Function 'verifyEmailOtp' (asia-south1).
 * Never uses local/in-memory API fallbacks or client-side verification.
 */
export async function verifyEmailOtpCall(email: string, code: string): Promise<VerifyOtpResponse> {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanCode = String(code || '').trim();

  if (!/^\d{6}$/.test(cleanCode)) {
    throw new Error('দয়া করে সম্পূর্ণ ৬ সংখ্যার কোডটি লিখুন। (Please enter the full 6-digit code.)');
  }

  try {
    const verifyFn = httpsCallable<{ email: string; code: string }, VerifyOtpResponse>(
      functions,
      'verifyEmailOtp'
    );
    const result = await verifyFn({ email: cleanEmail, code: cleanCode });
    if (result.data && result.data.verified) {
      return {
        success: true,
        verified: true,
        message: 'ইমেইল সফলভাবে যাচাই হয়েছে! (Email address verified successfully!)',
      };
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
