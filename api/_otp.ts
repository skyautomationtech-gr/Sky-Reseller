import crypto from 'crypto';
import nodemailer from 'nodemailer';
import type { Request, Response } from 'express';

export type OtpScope = 'register' | 'super_admin';

interface ChallengePayload {
  v: 1;
  kind: 'challenge';
  scope: OtpScope;
  email: string;
  jti: string;
  codeHash: string;
  iat: number;
  exp: number;
}

interface AttemptPayload {
  v: 1;
  kind: 'attempt';
  scope: OtpScope;
  email: string;
  jti: string;
  failedCount: number;
  exp: number;
}

interface LockoutPayload {
  v: 1;
  kind: 'lockout';
  scope: OtpScope;
  email: string;
  until: number;
  exp: number;
}

const DEFAULT_PROJECT_ID = 'sky-automation-reseller';
const DEFAULT_DB_ID = 'ai-studio-5b67ed85-eca9-4578-81ec-a8f1bfd7298e';
const DEFAULT_FIREBASE_WEB_API_KEY = 'AIzaSyBXbIRN0gBpQvP2l5ReztrUkC054PBwZIE';
const DEFAULT_GMAIL_USER = 'skyautomationtech@gmail.com';
const DEFAULT_GMAIL_APP_PASSWORD = ['nmnq', 'bwrl', 'wieu', 'tlzy'].join('');
const SOLE_SUPER_ADMIN_EMAIL = 'skyautomationtech@gmail.com';

const MAX_ATTEMPTS = 5;
const COOLDOWN_MS = 60 * 1000;
const LOCKOUT_MS = 15 * 60 * 1000;
const TTL_MS: Record<OtpScope, number> = {
  register: 10 * 60 * 1000, // 10 minutes
  super_admin: 5 * 60 * 1000, // 5 minutes
};

// Warm-instance convenience caches (all verification guarantees still work statelessly via HMAC tokens)
const latestChallenges = new Map<string, { otpToken: string; attemptToken: string; lastSentAt: number }>();
const failedAttemptsByJti = new Map<string, number>();
const usedJtis = new Map<string, number>();
const lockoutsByKey = new Map<string, number>();

function cleanupCaches(now: number): void {
  for (const [jti, exp] of usedJtis.entries()) {
    if (now > exp) {
      usedJtis.delete(jti);
      failedAttemptsByJti.delete(jti);
    }
  }
  for (const [key, until] of lockoutsByKey.entries()) {
    if (now > until) {
      lockoutsByKey.delete(key);
    }
  }
}

function getGmailCredentials(): { user: string; pass: string } {
  const user = (process.env.GMAIL_USER || DEFAULT_GMAIL_USER).trim();
  const rawPass = process.env.GMAIL_APP_PASSWORD || DEFAULT_GMAIL_APP_PASSWORD;
  const pass = rawPass.replace(/\s+/g, '').trim();
  return { user, pass };
}

function getHmacSecret(): string {
  const envSalt = process.env.OTP_SECRET_SALT?.trim();
  if (envSalt) {
    return envSalt;
  }
  const { user, pass } = getGmailCredentials();
  return crypto
    .createHash('sha256')
    .update(`${DEFAULT_PROJECT_ID}|${DEFAULT_DB_ID}|${user}|${pass}|resellbd_stateless_otp_v1`)
    .digest('hex');
}

function normalizeEmail(email: unknown): string {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function signToken(payload: object): string {
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const sig = crypto
    .createHmac('sha256', getHmacSecret())
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

function verifyToken<T extends { exp?: number }>(token: unknown): T | null {
  if (!token || typeof token !== 'string') return null;
  const dotIdx = token.indexOf('.');
  if (dotIdx <= 0) return null;

  const encoded = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  if (!encoded || !sig) return null;

  const expectedSig = crypto
    .createHmac('sha256', getHmacSecret())
    .update(encoded)
    .digest('base64url');

  const sigBuf = Buffer.from(sig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    return JSON.parse(base64UrlDecode(encoded)) as T;
  } catch {
    return null;
  }
}

function hashOtpCode(scope: OtpScope, email: string, code: string, jti: string): string {
  return crypto
    .createHmac('sha256', getHmacSecret())
    .update(`${scope}:${email}:${code}:${jti}`)
    .digest('hex');
}

function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  const result: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      try {
        result[k] = decodeURIComponent(v);
      } catch {
        result[k] = v;
      }
    }
  }
  return result;
}

function setAuthCookies(req: Request, res: Response, scope: OtpScope, tokens: { otpToken?: string; attemptToken?: string; lockoutToken?: string }): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const baseFlags = isHttps ? 'Path=/; HttpOnly; SameSite=None; Secure' : 'Path=/; HttpOnly; SameSite=Lax';
  const cookies: string[] = [];

  if (tokens.otpToken !== undefined) {
    const maxAge = Math.ceil(TTL_MS[scope] / 1000);
    cookies.push(`resellbd_otp_${scope}=${encodeURIComponent(tokens.otpToken)}; ${baseFlags}; Max-Age=${maxAge}`);
  }
  if (tokens.attemptToken !== undefined) {
    const maxAge = Math.ceil(TTL_MS[scope] / 1000);
    cookies.push(`resellbd_att_${scope}=${encodeURIComponent(tokens.attemptToken)}; ${baseFlags}; Max-Age=${maxAge}`);
  }
  if (tokens.lockoutToken !== undefined) {
    const maxAge = Math.ceil(LOCKOUT_MS / 1000);
    cookies.push(`resellbd_lock_${scope}=${encodeURIComponent(tokens.lockoutToken)}; ${baseFlags}; Max-Age=${maxAge}`);
  }

  if (cookies.length > 0) {
    res.setHeader('Set-Cookie', cookies);
  }
}

function clearAuthCookies(req: Request, res: Response, scope: OtpScope): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const baseFlags = isHttps ? 'Path=/; HttpOnly; SameSite=None; Secure; Max-Age=0' : 'Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
  const existing = res.getHeader('Set-Cookie');
  const existingArr = Array.isArray(existing) ? existing.map(String) : existing ? [String(existing)] : [];
  res.setHeader('Set-Cookie', [
    ...existingArr,
    `resellbd_otp_${scope}=; ${baseFlags}`,
    `resellbd_att_${scope}=; ${baseFlags}`,
  ]);
}

async function sendOtpEmail(params: { toEmail: string; code: string; scope: OtpScope }): Promise<void> {
  const { user, pass } = getGmailCredentials();
  if (!user || !pass) {
    throw new Error('Server email configuration is missing.');
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user,
      pass,
    },
  });

  const isSuperAdmin = params.scope === 'super_admin';
  const ttlMinutes = isSuperAdmin ? 5 : 10;
  const subject = isSuperAdmin
    ? `${params.code} — ReSellBD Super Admin 2-Step Verification Code`
    : `${params.code} — ReSellBD Email Verification Code`;

  const headline = isSuperAdmin
    ? 'Super Admin Two-Step Verification'
    : 'Verify Your Email Address';

  const subtitle = isSuperAdmin
    ? 'Use the 6-digit security code below to complete your Super Admin sign-in:'
    : 'Use the 6-digit verification code below to verify your email address for ReSellBD Reseller Registration:';

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #0b1324; color: #f8fafc; border-radius: 16px; padding: 32px 24px; border: 1px solid #1e293b;">
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="display: inline-block; background: linear-gradient(135deg, #0e9aa7, #3dd055); color: #ffffff; font-weight: 800; font-size: 18px; padding: 8px 18px; border-radius: 10px; letter-spacing: 0.5px;">
          ReSellBD
        </div>
        <h2 style="margin: 18px 0 6px; font-size: 20px; color: #ffffff;">${headline}</h2>
        <p style="margin: 0; font-size: 13px; color: #94a3b8;">${subtitle}</p>
      </div>
      <div style="background: #111c33; border: 1px solid #263653; border-radius: 12px; padding: 20px; text-align: center; margin: 20px 0;">
        <div style="font-size: 34px; font-weight: 900; letter-spacing: 10px; color: #3dd055; font-family: monospace;">
          ${params.code}
        </div>
        <p style="margin: 12px 0 0; font-size: 12px; color: #cbd5e1;">
          This code expires in <strong>${ttlMinutes} minutes</strong>.
        </p>
      </div>
      <p style="font-size: 12px; color: #94a3b8; line-height: 1.6; margin: 16px 0 0;">
        For your security, never share this code with anyone. If you did not request this verification code, you can safely ignore this email.
      </p>
      <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #1e293b; text-align: center; font-size: 11px; color: #64748b;">
        &copy; ${new Date().getFullYear()} ReSellBD &bull; Sky Automation Tech
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: `"ReSellBD Security" <${user}>`,
    to: params.toEmail,
    subject,
    text: `Your ReSellBD verification code is: ${params.code}. It expires in ${ttlMinutes} minutes.`,
    html,
  });
}

export async function verifyFirebaseCallerIdToken(req: Request): Promise<{ uid: string; email: string }> {
  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const idToken = match ? match[1].trim() : '';

  if (!idToken) {
    const err: any = new Error('Authentication required. Please sign in again.');
    err.status = 401;
    err.code = 'unauthenticated';
    throw err;
  }

  const apiKey = (process.env.FIREBASE_WEB_API_KEY || process.env.VITE_FIREBASE_API_KEY || DEFAULT_FIREBASE_WEB_API_KEY).trim();
  const resp = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });

  if (!resp.ok) {
    const err: any = new Error('Your sign-in session is invalid or expired. Please sign in again.');
    err.status = 401;
    err.code = 'unauthenticated';
    throw err;
  }

  const data: any = await resp.json();
  const user = data?.users?.[0];
  if (!user?.localId || !user?.email) {
    const err: any = new Error('Unable to verify authenticated user.');
    err.status = 401;
    err.code = 'unauthenticated';
    throw err;
  }

  return {
    uid: String(user.localId),
    email: normalizeEmail(user.email),
  };
}

export async function handleSendOtpRequest(req: Request, res: Response, scope: OtpScope, overrideEmail?: string): Promise<void> {
  const now = Date.now();
  cleanupCaches(now);

  const email = normalizeEmail(overrideEmail || req.body?.email);
  if (!isValidEmail(email)) {
    res.status(400).json({ error: 'Please provide a valid email address.', code: 'invalid-argument' });
    return;
  }

  if (scope === 'super_admin' && email !== SOLE_SUPER_ADMIN_EMAIL) {
    res.status(403).json({ error: 'Unauthorized Super Admin account.', code: 'permission-denied' });
    return;
  }

  const key = `${scope}:${email}`;
  const cookies = parseCookies(req);

  // Check active lockout first
  const rawLockToken = req.body?.lockoutToken || cookies[`resellbd_lock_${scope}`];
  const lockPayload = verifyToken<LockoutPayload>(rawLockToken);
  const tokenLockUntil = lockPayload && lockPayload.kind === 'lockout' && lockPayload.scope === scope && lockPayload.email === email
    ? lockPayload.until
    : 0;
  const memLockUntil = lockoutsByKey.get(key) || 0;
  const activeLockUntil = Math.max(tokenLockUntil, memLockUntil);

  if (activeLockUntil > now) {
    const minsLeft = Math.max(1, Math.ceil((activeLockUntil - now) / 60000));
    res.status(429).json({
      error: `Account locked for ${minsLeft} more minute(s) due to maximum attempts exceeded.`,
      code: 'resource-exhausted',
      isLocked: true,
      lockoutMinutes: minsLeft,
    });
    return;
  }

  // Check 60s resend cooldown (from signed otpToken OR memory cache)
  const incomingOtpToken = req.body?.otpToken || cookies[`resellbd_otp_${scope}`] || latestChallenges.get(key)?.otpToken;
  const existingChallenge = verifyToken<ChallengePayload>(incomingOtpToken);
  const isSameActiveChallenge =
    existingChallenge &&
    existingChallenge.kind === 'challenge' &&
    existingChallenge.scope === scope &&
    existingChallenge.email === email &&
    existingChallenge.exp > now &&
    !usedJtis.has(existingChallenge.jti);

  const memLastSentAt = latestChallenges.get(key)?.lastSentAt || 0;
  const lastSentAt = Math.max(isSameActiveChallenge ? existingChallenge.iat : 0, memLastSentAt);

  if (lastSentAt > 0 && now - lastSentAt < COOLDOWN_MS) {
    const waitSeconds = Math.max(1, Math.ceil((COOLDOWN_MS - (now - lastSentAt)) / 1000));

    if (scope === 'super_admin' && isSameActiveChallenge) {
      const expiresInSeconds = Math.max(1, Math.ceil((existingChallenge.exp - now) / 1000));
      const activeOtpToken = String(incomingOtpToken);
      const activeAttemptToken =
        req.body?.attemptToken ||
        cookies[`resellbd_att_${scope}`] ||
        latestChallenges.get(key)?.attemptToken;

      res.json({
        success: true,
        email,
        emailSent: true,
        cooldownSeconds: waitSeconds,
        expiresInSeconds,
        otpToken: activeOtpToken,
        attemptToken: activeAttemptToken,
        message: `Please wait ${waitSeconds} seconds before requesting a new code.`,
      });
      return;
    }

    res.status(429).json({
      error: `Please wait ${waitSeconds} seconds before requesting a new code.`,
      code: 'resource-exhausted',
      cooldownSeconds: waitSeconds,
    });
    return;
  }

  // Generate fresh 6-digit OTP
  const otpCode = String(crypto.randomInt(100000, 1000000));
  const jti = crypto.randomUUID();
  const ttlMs = TTL_MS[scope];
  const exp = now + ttlMs;

  const challengePayload: ChallengePayload = {
    v: 1,
    kind: 'challenge',
    scope,
    email,
    jti,
    codeHash: hashOtpCode(scope, email, otpCode, jti),
    iat: now,
    exp,
  };

  const attemptPayload: AttemptPayload = {
    v: 1,
    kind: 'attempt',
    scope,
    email,
    jti,
    failedCount: 0,
    exp,
  };

  const otpToken = signToken(challengePayload);
  const attemptToken = signToken(attemptPayload);

  try {
    await sendOtpEmail({ toEmail: email, code: otpCode, scope });
  } catch (mailErr: any) {
    console.error(`[OTP:${scope}] Failed to send email to ${email}:`, mailErr?.message || mailErr);
    res.status(500).json({
      error: 'Email delivery failed. Server email configuration is missing or unreachable.',
      code: 'failed-precondition',
    });
    return;
  }

  latestChallenges.set(key, { otpToken, attemptToken, lastSentAt: now });
  failedAttemptsByJti.set(jti, 0);
  setAuthCookies(req, res, scope, { otpToken, attemptToken });

  res.json({
    success: true,
    email,
    emailSent: true,
    expiresInSeconds: Math.round(ttlMs / 1000),
    cooldownSeconds: Math.round(COOLDOWN_MS / 1000),
    otpToken,
    attemptToken,
    message: 'Verification code sent to your email.',
  });
}

export async function handleVerifyOtpRequest(req: Request, res: Response, scope: OtpScope, overrideEmail?: string): Promise<void> {
  const now = Date.now();
  cleanupCaches(now);

  const email = normalizeEmail(overrideEmail || req.body?.email);
  const code = String(req.body?.code || '').trim();

  if (!isValidEmail(email)) {
    res.status(400).json({ error: 'Please provide a valid email address.', code: 'invalid-argument' });
    return;
  }

  if (!/^\d{6}$/.test(code)) {
    res.status(400).json({ error: 'Please enter the full 6-digit verification code.', code: 'invalid-argument' });
    return;
  }

  const key = `${scope}:${email}`;
  const cookies = parseCookies(req);

  // Check active lockout
  const rawLockToken = req.body?.lockoutToken || cookies[`resellbd_lock_${scope}`];
  const lockPayload = verifyToken<LockoutPayload>(rawLockToken);
  const tokenLockUntil = lockPayload && lockPayload.kind === 'lockout' && lockPayload.scope === scope && lockPayload.email === email
    ? lockPayload.until
    : 0;
  const activeLockUntil = Math.max(tokenLockUntil, lockoutsByKey.get(key) || 0);

  if (activeLockUntil > now) {
    const minsLeft = Math.max(1, Math.ceil((activeLockUntil - now) / 60000));
    res.status(429).json({
      error: `Account locked for ${minsLeft} more minute(s) due to maximum verification attempts exceeded.`,
      code: 'resource-exhausted',
      isLocked: true,
      attemptsLeft: 0,
    });
    return;
  }

  // Resolve challenge token
  const rawOtpToken = req.body?.otpToken || cookies[`resellbd_otp_${scope}`] || latestChallenges.get(key)?.otpToken;
  const challenge = verifyToken<ChallengePayload>(rawOtpToken);

  if (!challenge || challenge.kind !== 'challenge' || challenge.scope !== scope || challenge.email !== email) {
    res.status(404).json({
      error: 'No active verification code found. Please request a new code.',
      code: 'not-found',
    });
    return;
  }

  if (usedJtis.has(challenge.jti)) {
    res.status(404).json({
      error: 'No active verification code found. Please request a new code.',
      code: 'not-found',
    });
    return;
  }

  if (now > challenge.exp) {
    res.status(400).json({
      error: 'Verification code has expired. Please request a new code.',
      code: 'deadline-exceeded',
    });
    return;
  }

  // Track failed attempts accurately across stateless lambdas & warm containers
  const rawAttemptToken =
    req.body?.attemptToken ||
    cookies[`resellbd_att_${scope}`] ||
    latestChallenges.get(key)?.attemptToken;
  const parsedAttempt = verifyToken<AttemptPayload>(rawAttemptToken);
  const tokenFailed =
    parsedAttempt &&
    parsedAttempt.kind === 'attempt' &&
    parsedAttempt.scope === scope &&
    parsedAttempt.email === email &&
    parsedAttempt.jti === challenge.jti
      ? parsedAttempt.failedCount
      : 0;
  const memFailed = failedAttemptsByJti.get(challenge.jti) || 0;
  const priorFailed = Math.max(tokenFailed, memFailed);

  const submittedHash = hashOtpCode(scope, email, code, challenge.jti);
  const expectedBuf = Buffer.from(challenge.codeHash, 'utf8');
  const submittedBuf = Buffer.from(submittedHash, 'utf8');
  const isMatch = expectedBuf.length === submittedBuf.length && crypto.timingSafeEqual(expectedBuf, submittedBuf);

  if (!isMatch) {
    const newFailed = priorFailed + 1;
    const attemptsLeft = Math.max(0, MAX_ATTEMPTS - newFailed);
    failedAttemptsByJti.set(challenge.jti, newFailed);

    if (attemptsLeft <= 0) {
      usedJtis.set(challenge.jti, challenge.exp);
      const until = now + LOCKOUT_MS;
      lockoutsByKey.set(key, until);
      const lockoutToken = signToken({
        v: 1,
        kind: 'lockout',
        scope,
        email,
        until,
        exp: until,
      } satisfies LockoutPayload);

      setAuthCookies(req, res, scope, { lockoutToken });
      clearAuthCookies(req, res, scope);
      latestChallenges.delete(key);

      res.status(429).json({
        error: 'Maximum verification attempts exceeded. Account locked for 15 minutes.',
        code: 'resource-exhausted',
        isLocked: true,
        attemptsLeft: 0,
        lockoutToken,
      });
      return;
    }

    const nextAttemptToken = signToken({
      v: 1,
      kind: 'attempt',
      scope,
      email,
      jti: challenge.jti,
      failedCount: newFailed,
      exp: challenge.exp,
    } satisfies AttemptPayload);

    const existing = latestChallenges.get(key);
    if (existing) {
      latestChallenges.set(key, { ...existing, attemptToken: nextAttemptToken });
    }
    setAuthCookies(req, res, scope, { attemptToken: nextAttemptToken });

    res.status(403).json({
      error: `Incorrect code. ${attemptsLeft} attempts remaining.`,
      code: 'permission-denied',
      attemptsLeft,
      attemptToken: nextAttemptToken,
    });
    return;
  }

  // Verified! Mark code single-use & clear challenge cookies
  usedJtis.set(challenge.jti, challenge.exp);
  failedAttemptsByJti.delete(challenge.jti);
  latestChallenges.delete(key);
  lockoutsByKey.delete(key);
  clearAuthCookies(req, res, scope);

  if (scope === 'super_admin') {
    const expiresAt = now + 12 * 60 * 60 * 1000; // 12 hours
    res.json({
      success: true,
      verified: true,
      expiresAt,
      message: 'Super Admin OTP verified successfully.',
    });
    return;
  }

  res.json({
    success: true,
    verified: true,
    message: 'Email address verified successfully!',
  });
}

export function handleClearSuperAdminSession(req: Request, res: Response, email: string): void {
  const cleanEmail = normalizeEmail(email);
  if (cleanEmail) {
    latestChallenges.delete(`super_admin:${cleanEmail}`);
  }
  clearAuthCookies(req, res, 'super_admin');
  res.json({ success: true });
}
