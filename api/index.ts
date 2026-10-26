import express from 'express';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { GoogleGenAI } from '@google/genai';

const app = express();

// Enable CORS & JSON parsing for Vercel Serverless
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Initialize Gemini AI Client
let aiClient: GoogleGenAI | null = null;
const getAI = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: { 'User-Agent': 'aistudio-build' },
      },
    });
  }
  return aiClient;
};

// Health check API
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    environment: 'vercel-serverless',
    hasGeminiKey: !!process.env.GEMINI_API_KEY,
    timestamp: new Date().toISOString(),
  });
});

// Gmail SMTP Transporter using Google App Password
const GMAIL_USER = process.env.GMAIL_USER || 'skyautomationtech@gmail.com';
const GMAIL_APP_PASS = (process.env.GMAIL_APP_PASSWORD || 'ealgyihwwtcxrsuz').replace(/\s+/g, '');

const gmailTransporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_APP_PASS,
  },
});

// Server-side OTP store for serverless
const otpStore = new Map<string, {
  hashedCode: string;
  expiresAt: number;
  attemptsLeft: number;
  lastSentAt: number;
  verified: boolean;
  verifiedUntil?: number;
}>();

const hashOtp = (code: string, salt = 'resellbd_otp_secret_salt_2026') => {
  return crypto.createHash('sha256').update(code + salt).digest('hex');
};

// 1. Send Email OTP API
app.post('/api/send-email-otp', async (req, res) => {
  try {
    const email = (req.body?.email || '').trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return res.status(400).json({ error: 'Please provide a valid email address.' });
    }

    // Check 60s cooldown
    const existing = otpStore.get(email);
    const now = Date.now();
    if (existing && existing.lastSentAt) {
      const elapsed = Math.floor((now - existing.lastSentAt) / 1000);
      if (elapsed < 60) {
        const waitTime = 60 - elapsed;
        return res.status(429).json({
          error: `Please wait ${waitTime} seconds before requesting a new OTP.`,
          cooldownSeconds: waitTime,
        });
      }
    }

    // Generate 6-digit random code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedCode = hashOtp(code);
    const expiresAt = now + 10 * 60 * 1000; // 10 minutes

    // Dispatch via Gmail SMTP
    try {
      await gmailTransporter.sendMail({
        from: `"ReSellBD Verification" <${GMAIL_USER}>`,
        to: email,
        subject: `${code} is your ReSellBD Reseller Verification Code`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 28px; background: #050B1A; color: #ffffff; border-radius: 20px; border: 1px solid rgba(255,255,255,0.15);">
            <div style="text-align: center; margin-bottom: 24px;">
              <h1 style="color: #3DD055; margin: 0; font-size: 26px; font-weight: 900; letter-spacing: -0.5px;">ReSellBD</h1>
              <p style="color: #0E9AA7; font-size: 13px; margin: 6px 0 0 0; text-transform: uppercase; font-weight: 700; letter-spacing: 1px;">Reseller Registration Verification</p>
            </div>
            <div style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); border-radius: 16px; padding: 24px; text-align: center; margin-bottom: 20px;">
              <p style="margin: 0 0 12px 0; color: #94a3b8; font-size: 14px;">Your 6-digit email verification code is:</p>
              <div style="font-size: 38px; font-weight: 900; letter-spacing: 8px; color: #3DD055; padding: 14px 20px; background: rgba(0,0,0,0.4); border-radius: 12px; display: inline-block; font-family: monospace;">
                ${code}
              </div>
              <p style="margin: 16px 0 0 0; color: #cbd5e1; font-size: 13px;">This code will expire in <strong>10 minutes</strong>. If you do not see this email in your Inbox, please check your <strong>Spam / Junk</strong> folder.</p>
            </div>
            <p style="color: #64748b; font-size: 11px; text-align: center; margin: 0;">
              Sent automatically by ReSellBD. Do not share this code with anyone.
            </p>
          </div>
        `,
      });
      console.log(`[Vercel OTP] Dispatched verification email to: ${email}`);
    } catch (err: any) {
      console.error('[Vercel OTP] SMTP send error:', err);
      return res.status(500).json({
        error: 'Could not send the verification email. Please try again later.',
      });
    }

    // Store hashed OTP
    otpStore.set(email, {
      hashedCode,
      expiresAt,
      attemptsLeft: 5,
      lastSentAt: now,
      verified: false,
    });

    res.json({
      success: true,
      message: `Verification code sent to ${email}. If not in Inbox, please check your Spam / Junk folder.`,
      email,
      expiresInSeconds: 600,
      cooldownSeconds: 60,
    });
  } catch (err: any) {
    console.error('[Vercel OTP] Send error:', err);
    res.status(500).json({
      error: 'Could not send the verification email. Please try again later.',
    });
  }
});

// 2. Verify Email OTP API
app.post('/api/verify-email-otp', (req, res) => {
  try {
    const email = (req.body?.email || '').trim().toLowerCase();
    const code = (req.body?.code || '').trim();

    if (!email || !code || code.length !== 6) {
      return res.status(400).json({ error: 'Please enter the full 6-digit verification code.' });
    }

    const record = otpStore.get(email);

    if (!record) {
      return res.status(404).json({ error: 'No active verification code found for this email. Please request a new code.' });
    }

    const now = Date.now();
    if (now > record.expiresAt) {
      otpStore.delete(email);
      return res.status(410).json({ error: 'Verification code has expired. Please request a new code.' });
    }

    if (record.attemptsLeft <= 0) {
      otpStore.delete(email);
      return res.status(429).json({ error: 'Maximum verification attempts exceeded. Please request a new code.' });
    }

    const inputHash = hashOtp(code);
    const isMatch = inputHash === record.hashedCode;

    if (!isMatch) {
      record.attemptsLeft -= 1;
      if (record.attemptsLeft <= 0) {
        otpStore.delete(email);
        return res.status(429).json({ error: 'Incorrect code. Maximum attempts exceeded. Please request a new code.' });
      }
      return res.status(400).json({
        error: `Incorrect code. ${record.attemptsLeft} ${record.attemptsLeft === 1 ? 'attempt' : 'attempts'} remaining.`,
        attemptsLeft: record.attemptsLeft,
      });
    }

    // Success
    record.verified = true;
    record.verifiedUntil = now + 30 * 60 * 1000;
    record.attemptsLeft = 0;

    res.json({
      success: true,
      verified: true,
      email,
      message: 'Email address verified successfully!',
    });
  } catch (err: any) {
    console.error('[Vercel OTP] Verify error:', err);
    res.status(500).json({ error: err.message || 'Failed to verify code.' });
  }
});

// 3. Finalize Registration API
app.post('/api/finalize-registration', async (req, res) => {
  try {
    const { email, formData } = req.body;
    const cleanEmail = (email || formData?.email || '').trim().toLowerCase();

    if (!cleanEmail) {
      return res.status(400).json({ error: 'Email address is required.' });
    }

    const record = otpStore.get(cleanEmail);
    const now = Date.now();

    if (!record || !record.verified || (record.verifiedUntil && now > record.verifiedUntil)) {
      return res.status(403).json({
        error: 'Email verification is required before finalizing registration. Please verify your email first.',
      });
    }

    otpStore.delete(cleanEmail);

    res.json({
      success: true,
      message: 'Registration validated by server.',
    });
  } catch (err: any) {
    console.error('[FinalizeRegistration] Error:', err);
    res.status(500).json({ error: err.message || 'Server registration validation failed.' });
  }
});

// 4. Shop Name Availability Check API
app.post('/api/check-shop-name', async (req, res) => {
  try {
    const rawName = (req.body?.shopName || req.body?.name || '').trim();
    const shopNameKey = rawName
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
      .trim()
      .replace(/\s+/g, ' ');

    if (!shopNameKey || shopNameKey.length < 2) {
      return res.status(400).json({
        available: false,
        shopNameKey,
        error: 'Shop name must be at least 2 characters long.',
      });
    }

    const excludeUid = req.body?.excludeUid;
    const docUrl = `https://firestore.googleapis.com/v1/projects/sky-automation-reseller/databases/ai-studio-5b67ed85-eca9-4578-81ec-a8f1bfd7298e/documents/shopNames/${encodeURIComponent(shopNameKey)}?key=AIzaSyBXbIRN0gBpQvP2l5ReztrUkC054PBwZIE`;

    const response = await fetch(docUrl);
    if (response.status === 404) {
      return res.json({
        available: true,
        shopNameKey,
        message: 'Shop name is available',
      });
    }

    if (response.ok) {
      const docData = await response.json();
      const existingUid = docData.fields?.uid?.stringValue;

      if (excludeUid && existingUid === excludeUid) {
        return res.json({
          available: true,
          shopNameKey,
          isOwn: true,
          message: 'Shop name is available',
        });
      }

      return res.json({
        available: false,
        shopNameKey,
        message: 'This shop name is already taken. Please choose a different name.',
      });
    }

    res.status(500).json({
      available: false,
      shopNameKey,
      error: 'Could not verify the name, will be checked again on submit',
    });
  } catch (err: any) {
    console.error('[ShopName] Check error:', err);
    res.status(500).json({
      available: false,
      error: 'Could not verify the name, will be checked again on submit',
    });
  }
});

// Default catch-all for /api
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: `API route ${req.path} not found.` });
});

export default app;
