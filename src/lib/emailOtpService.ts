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
  if ((rawCode.includes('resource-exhausted') || rawMsg.includes('wait')) && rawMsg.includes('second')) {
    const secMatch = rawMsg.match(/(\d+)\s+second/i);
    const sec = secMatch ? secMatch[1] : '60';
    return {
      message: `দয়া করে ${sec} সেকেন্ড অপেক্ষা করে আবার কোড পাঠান। (Please wait ${sec}s before requesting a new code.)`,
      isWrongCode: false,
      code: 'resource-exhausted',
    };
  }

  // 5. Server configuration missing
  if (rawCode.includes('failed-precondition') && (rawMsg.includes('configuration') || rawMsg.includes('missing') || rawMsg.includes('delivery'))) {
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

export interface StoredOtpChallengeState {
  otpToken?: string;
  attemptToken?: string;
  lockoutToken?: string;
}

const memoryOtpState = new Map<string, StoredOtpChallengeState>();

export function getApiBaseUrl(): string {
  const envBase = (import.meta as any)?.env?.VITE_API_BASE_URL;
  return typeof envBase === 'string' && envBase.trim() ? envBase.trim().replace(/\/+$/, '') : '';
}

export function getOtpChallengeState(scope: 'register' | 'super_admin', email: string): StoredOtpChallengeState {
  const key = `resellbd_otp_state_${scope}_${email}`;
  const mem = memoryOtpState.get(key) || {};
  try {
    const raw = sessionStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredOtpChallengeState;
      return { ...parsed, ...mem };
    }
  } catch {
    // Ignore storage access issues
  }
  return mem;
}

export function saveOtpChallengeState(
  scope: 'register' | 'super_admin',
  email: string,
  patch: StoredOtpChallengeState
): void {
  const key = `resellbd_otp_state_${scope}_${email}`;
  const current = getOtpChallengeState(scope, email);
  const next: StoredOtpChallengeState = { ...current };

  if (patch.otpToken !== undefined) next.otpToken = patch.otpToken || undefined;
  if (patch.attemptToken !== undefined) next.attemptToken = patch.attemptToken || undefined;
  if (patch.lockoutToken !== undefined) next.lockoutToken = patch.lockoutToken || undefined;

  memoryOtpState.set(key, next);
  try {
    sessionStorage.setItem(key, JSON.stringify(next));
  } catch {
    // Ignore storage access issues
  }
}

export function clearOtpChallengeState(scope: 'register' | 'super_admin', email: string, keepLockout = true): void {
  const key = `resellbd_otp_state_${scope}_${email}`;
  const current = getOtpChallengeState(scope, email);
  const next: StoredOtpChallengeState = keepLockout && current.lockoutToken ? { lockoutToken: current.lockoutToken } : {};

  memoryOtpState.set(key, next);
  try {
    if (Object.keys(next).length > 0) {
      sessionStorage.setItem(key, JSON.stringify(next));
    } else {
      sessionStorage.removeItem(key);
    }
  } catch {
    // Ignore
  }
}

/**
 * Sends a 6-digit registration email OTP via stateless /api/send-email-otp (works on Free Plan & Preview),
 * falling back to Firebase Cloud Function 'sendEmailOtp' only if /api route is unreachable.
 */
export async function sendEmailOtpCall(email: string): Promise<SendOtpResponse> {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const state = getOtpChallengeState('register', cleanEmail);
  const apiUrl = `${getApiBaseUrl()}/api/send-email-otp`;

  let shouldTryCloudFunctionFallback = false;

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
        saveOtpChallengeState('register', cleanEmail, {
          otpToken: data.otpToken,
          attemptToken: data.attemptToken,
        });
        return data as SendOtpResponse;
      }

      const apiErr: any = new Error(data?.error || 'Could not send verification email.');
      apiErr.code = data?.code || (response.status === 429 ? 'resource-exhausted' : 'internal');
      apiErr.isLocked = !!data?.isLocked;
      throw apiErr;
    }
  } catch (apiErr: any) {
    if (apiErr?.code && apiErr.code !== 'network') {
      const formatted = formatOtpErrorMessage(apiErr);
      const errOut: any = new Error(formatted.message);
      errOut.code = formatted.code;
      errOut.isLocked = formatted.isLocked;
      throw errOut;
    }
    shouldTryCloudFunctionFallback = true;
  }

  if (shouldTryCloudFunctionFallback) {
    try {
      const sendFn = httpsCallable<{ email: string }, SendOtpResponse>(functions, 'sendEmailOtp');
      const result = await sendFn({ email: cleanEmail });
      if (result.data && result.data.success) {
        return result.data;
      }
    } catch (fnErr: any) {
      const formatted = formatOtpErrorMessage(fnErr);
      const errOut: any = new Error(formatted.message);
      errOut.code = formatted.code;
      errOut.isLocked = formatted.isLocked;
      throw errOut;
    }
  }

  const fallbackErr = formatOtpErrorMessage({ code: 'internal' });
  const out: any = new Error(fallbackErr.message);
  out.code = fallbackErr.code;
  throw out;
}

/**
 * Verifies the 6-digit registration email OTP via stateless /api/verify-email-otp (works on Free Plan & Preview),
 * falling back to Firebase Cloud Function 'verifyEmailOtp' only if /api route is unreachable.
 */
export async function verifyEmailOtpCall(email: string, code: string): Promise<VerifyOtpResponse> {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanCode = String(code || '').trim();

  if (!/^\d{6}$/.test(cleanCode)) {
    throw new Error('দয়া করে সম্পূর্ণ ৬ সংখ্যার কোডটি লিখুন। (Please enter the full 6-digit code.)');
  }

  const state = getOtpChallengeState('register', cleanEmail);
  const apiUrl = `${getApiBaseUrl()}/api/verify-email-otp`;
  let shouldTryCloudFunctionFallback = false;

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        email: cleanEmail,
        code: cleanCode,
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
        saveOtpChallengeState('register', cleanEmail, { attemptToken: data.attemptToken });
      }
      if (data?.lockoutToken) {
        saveOtpChallengeState('register', cleanEmail, { lockoutToken: data.lockoutToken });
        clearOtpChallengeState('register', cleanEmail, true);
      }

      if (response.ok && data?.verified) {
        clearOtpChallengeState('register', cleanEmail, false);
        return {
          success: true,
          verified: true,
          message: 'ইমেইল সফলভাবে যাচাই হয়েছে! (Email address verified successfully!)',
        };
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
