import express from 'express';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { GoogleGenAI } from '@google/genai';

const app = express();

// Enable CORS & JSON parsing for Vercel Serverless Function
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

// Initialize Gemini AI Client lazily / securely
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
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_APP_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000,
});

// Server-side OTP store
const otpStore = new Map<string, {
  hashedCode: string;
  expiresAt: number;
  attemptsLeft: number;
  lastSentAt: number;
  verified: boolean;
  verifiedUntil?: number;
}>();

// Super Admin OTP & Session Stores
const superAdminOtpStore = new Map<string, {
  hashedCode: string;
  expiresAt: number;
  attemptsLeft: number;
  lastSentAt: number;
  lockedUntil?: number;
}>();

const superAdminSessions = new Map<string, {
  sessionId: string;
  expiresAt: number;
}>();

const hashOtp = (code: string, salt = 'resellbd_otp_secret_salt_2026') => {
  return crypto.createHash('sha256').update(code + salt).digest('hex');
};

// ==========================================
// 1. RESELLER REGISTRATION EMAIL OTP ROUTES
// ==========================================

// Send Reseller Email OTP
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
    } catch (mailErr: any) {
      console.error('[Vercel OTP] SMTP send error:', mailErr);
      return res.status(500).json({
        error: `Could not send verification email (${mailErr.message || mailErr}). Please check the email address.`,
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

// Verify Reseller Email OTP
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

// Finalize Registration
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

// ==========================================
// 2. SUPER ADMIN TWO-STEP VERIFICATION ROUTES
// ==========================================

// Start Super Admin Login
app.post('/api/super-admin/start-login', async (req, res) => {
  try {
    const email = (req.body?.email || 'skyautomationtech@gmail.com').trim().toLowerCase();
    const now = Date.now();

    superAdminSessions.delete(email);

    const existing = superAdminOtpStore.get(email);
    if (existing && existing.lockedUntil && now < existing.lockedUntil) {
      const remainingMinutes = Math.ceil((existing.lockedUntil - now) / 60000);
      return res.status(423).json({
        error: `অতিরিক্ত ভুল চেষ্টার কারণে অ্যাকাউন্টটি সাময়িকভাবে লক করা হয়েছে। দয়া করে ${remainingMinutes} মিনিট পর আবার চেষ্টা করুন। (Account locked for 15 minutes)`,
        isLocked: true,
        lockedUntil: existing.lockedUntil,
      });
    }

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

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedCode = hashOtp(code);
    const expiresInSeconds = 300; // 5 minutes
    const expiresAt = now + expiresInSeconds * 1000;

    try {
      await gmailTransporter.sendMail({
        from: `"ReSellBD Security" <${GMAIL_USER}>`,
        to: email,
        subject: `${code} is your Super Admin Two-Step Verification Code`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 28px; background: #050B1A; color: #ffffff; border-radius: 20px; border: 1px solid rgba(255,255,255,0.15);">
            <div style="text-align: center; margin-bottom: 24px;">
              <h1 style="color: #3DD055; margin: 0; font-size: 26px; font-weight: 900; letter-spacing: -0.5px;">ReSellBD Security</h1>
              <p style="color: #0E9AA7; font-size: 13px; margin: 6px 0 0 0; text-transform: uppercase; font-weight: 700; letter-spacing: 1px;">Super Admin Two-Step Verification (দ্বি-স্তরীয় নিরাপত্তা)</p>
            </div>
            <div style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); border-radius: 16px; padding: 24px; text-align: center; margin-bottom: 20px;">
              <p style="margin: 0 0 12px 0; color: #94a3b8; font-size: 14px;">Your 6-digit Super Admin verification code is:</p>
              <div style="font-size: 40px; font-weight: 900; letter-spacing: 10px; color: #3DD055; padding: 14px 20px; background: rgba(0,0,0,0.4); border-radius: 12px; display: inline-block; font-family: monospace;">
                ${code}
              </div>
              <p style="margin: 16px 0 0 0; color: #cbd5e1; font-size: 13px;">This code will expire in <strong>5 minutes</strong>. Maximum 5 verification attempts are permitted before a 15-minute security lock.</p>
            </div>
            <div style="background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 12px; padding: 14px; margin-bottom: 20px; font-size: 12px; color: #fde68a;">
              ⚠️ <strong>Security Notice:</strong> If you did not initiate this login, someone entered your password. Please change your password immediately.
            </div>
            <p style="color: #64748b; font-size: 11px; text-align: center; margin: 0;">
              Sent automatically by ReSellBD via Sky Automation Tech.
            </p>
          </div>
        `,
      });
      console.log(`[SuperAdmin OTP] Dispatched 2-Step OTP email to: ${email}`);
    } catch (mailErr: any) {
      console.error('[SuperAdmin OTP] SMTP Error:', mailErr);
      return res.status(500).json({
        error: `Could not send verification email (${mailErr.message || mailErr}). Please try again later.`,
      });
    }

    superAdminOtpStore.set(email, {
      hashedCode,
      expiresAt,
      attemptsLeft: 5,
      lastSentAt: now,
    });

    res.json({
      success: true,
      message: 'Verification code sent to your registered Super Admin email.',
      email,
      expiresInSeconds,
      cooldownSeconds: 60,
    });
  } catch (err: any) {
    console.error('[SuperAdmin OTP] Start login error:', err);
    res.status(500).json({ error: 'Failed to initiate Super Admin verification.' });
  }
});

// Verify Super Admin OTP
app.post('/api/super-admin/verify-otp', (req, res) => {
  try {
    const email = (req.body?.email || 'skyautomationtech@gmail.com').trim().toLowerCase();
    const code = (req.body?.code || '').trim();

    if (!code || code.length !== 6) {
      return res.status(400).json({ error: 'Please enter the full 6-digit code.' });
    }

    const now = Date.now();
    const record = superAdminOtpStore.get(email);

    if (!record) {
      return res.status(404).json({ error: 'No active verification code found. Please request a new code.' });
    }

    if (record.lockedUntil && now < record.lockedUntil) {
      const remainingMinutes = Math.ceil((record.lockedUntil - now) / 60000);
      return res.status(423).json({
        error: `অ্যাকাউন্টটি সাময়িকভাবে লক করা হয়েছে। দয়া করে ${remainingMinutes} মিনিট পর আবার চেষ্টা করুন। (Account locked for 15 minutes)`,
        isLocked: true,
      });
    }

    if (now > record.expiresAt) {
      superAdminOtpStore.delete(email);
      return res.status(410).json({ error: 'Verification code has expired. Please request a new code.' });
    }

    const inputHash = hashOtp(code);
    if (inputHash !== record.hashedCode) {
      record.attemptsLeft -= 1;
      if (record.attemptsLeft <= 0) {
        record.lockedUntil = now + 15 * 60 * 1000;
        return res.status(423).json({
          error: 'অতিরিক্ত ভুল চেষ্টার কারণে অ্যাকাউন্টটি সাময়িকভাবে ১৫ মিনিটের জন্য লক করা হয়েছে। (Account locked for 15 minutes)',
          isLocked: true,
        });
      }
      return res.status(400).json({
        error: `ভুল কোড। আপনার আর ${record.attemptsLeft}টি সুযোগ বাকি রয়েছে। (Incorrect code. ${record.attemptsLeft} attempts remaining)`,
        attemptsLeft: record.attemptsLeft,
      });
    }

    superAdminOtpStore.delete(email);
    const sessionId = crypto.randomUUID();
    const sessionExpiresAt = now + 12 * 60 * 60 * 1000;

    superAdminSessions.set(email, {
      sessionId,
      expiresAt: sessionExpiresAt,
    });

    res.json({
      success: true,
      verified: true,
      expiresAt: sessionExpiresAt,
      message: 'Two-step verification successful!',
    });
  } catch (err: any) {
    console.error('[SuperAdmin OTP] Verify error:', err);
    res.status(500).json({ error: 'Failed to verify code.' });
  }
});

// Clear Super Admin OTP Session
app.post('/api/super-admin/clear-session', (req, res) => {
  const email = (req.body?.email || 'skyautomationtech@gmail.com').trim().toLowerCase();
  superAdminSessions.delete(email);
  superAdminOtpStore.delete(email);
  res.json({ success: true, message: 'Super admin session cleared.' });
});

// Check Super Admin Session Status
app.get('/api/super-admin/check-session/:email', (req, res) => {
  const email = (req.params.email || '').trim().toLowerCase();
  const session = superAdminSessions.get(email);
  const now = Date.now();
  if (session && session.expiresAt > now) {
    return res.json({ isVerified: true, expiresAt: session.expiresAt, sessionId: session.sessionId });
  }
  res.json({ isVerified: false });
});

// ==========================================
// 3. SHOP NAME & AI MARKETING ROUTES
// ==========================================

// Shop Name Availability Check API
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

// AI Marketing Copywriting & Caption Generation API
app.post('/api/ai/generate-copy', async (req, res) => {
  try {
    const {
      productName,
      categoryName,
      retailPrice,
      resellerPrice,
      sellingPrice,
      originalPrice,
      warranty,
      description,
      features,
      platform = 'facebook_post',
      tone = 'engaging',
      targetAudience = 'general',
      shopName = 'ReSellBD Shop',
      contactNumber = '',
      customPrompt = '',
    } = req.body;

    if (!productName) {
      return res.status(400).json({ error: 'Product name is required' });
    }

    const finalSellingPrice = sellingPrice || retailPrice || resellerPrice || 0;
    const finalOriginalPrice = originalPrice || Math.round(finalSellingPrice * 1.25);
    const discount = finalOriginalPrice > finalSellingPrice ? finalOriginalPrice - finalSellingPrice : 0;

    const ai = getAI();

    if (!ai) {
      const fallbackResult = generateFallbackCopy({
        productName,
        categoryName,
        sellingPrice: finalSellingPrice,
        originalPrice: finalOriginalPrice,
        discount,
        warranty,
        description,
        platform,
        tone,
        shopName,
        contactNumber,
      });

      return res.json({
        success: true,
        copy: fallbackResult.text,
        hashtags: fallbackResult.hashtags,
        title: fallbackResult.title,
        isFallback: true,
        notice: 'Generated via fallback template',
      });
    }

    let platformGuideline = '';
    let formatGuideline = '';

    switch (platform) {
      case 'tiktok_script':
        platformGuideline = `টিকটক ও ফেসবুক রিলসের জন্য ৩০-৪৫ সেকেন্ডের ভাইরাল শর্ট ভিডিও স্ক্রিপ্ট।`;
        formatGuideline = 'ভিডিও দৃশ্য ও ডায়লগ পরিষ্কার সেকশনে ভাগ করে লিখুন।';
        break;
      case 'facebook_story':
        platformGuideline = 'ফেসবুক ও ইনস্টাগ্রাম স্টোরি/রিলসের জন্য ২-৩ লাইনের পাওয়ারফুল, ক্যাচি ও দ্রুত অ্যাকশন নেয়ার মতো শর্ট টেক্সট।';
        formatGuideline = 'খুব ছোট, আকর্ষণীয় ইমোজি সহ ২-৩ লাইনে প্রাইজ ও ইনবক্স করার আহ্বান থাকবে।';
        break;
      case 'whatsapp_broadcast':
        platformGuideline = 'হোয়াটসঅ্যাপ বা মেসেঞ্জারে কাস্টমারকে সরাসরি পাঠানোর মতো আন্তরিক মেসেজ।';
        formatGuideline = 'আসসালামু আলাইকুম দিয়ে শুরু, প্রোডাক্টের অফার ও সংক্ষেপে সুবিধা।';
        break;
      case 'seo_description':
        platformGuideline = 'ই-কমার্স ওয়েবসাইট বা ক্যাটালগের জন্য এসইও ফ্রেন্ডলি প্রোডাক্ট বিবরণী।';
        formatGuideline = 'প্যারাগ্রাফে প্রোডাক্টের মূল আকর্ষণ ও ফিচারসমূহ।';
        break;
      case 'urgency_flash_sale':
        platformGuideline = 'সীমিত সময়ের ধামাকা অফার / ফ্ল্যাশ সেলস পোস্ট (FOMO & Urgency)।';
        formatGuideline = 'স্টক শেষ হওয়ার আগে অর্ডারের তাগিদ ও মূল্য ছাড়।';
        break;
      case 'facebook_post':
      default:
        platformGuideline = `ফেসবুক পেজ ও গ্রুপের জন্য আকর্ষণীয় সেলস ও মার্কেটিং পোস্ট।`;
        formatGuideline = 'আকর্ষণীয় ও রিলেটেবল বাংলা ভাষায় ইমোজি সহ সাজিয়ে লিখুন।';
        break;
    }

    let toneGuideline = '';
    switch (tone) {
      case 'urgent':
        toneGuideline = 'জরুরি ও সীমিত সময়ের অফার ভাব';
        break;
      case 'trust_premium':
        toneGuideline = 'মার্জিত, অথেনটিক ও প্রিমিয়াম ট্রাস্ট ভিত্তিক ভাষা';
        break;
      case 'storytelling':
        toneGuideline = 'গল্পের ছলে সমস্যা ও সমাধানের সুন্দর উপস্থাপন';
        break;
      case 'punchy_short':
        toneGuideline = 'সংক্ষিপ্ত ও টু দ্য পয়েন্ট ভাষা';
        break;
      case 'engaging':
      default:
        toneGuideline = 'অত্যন্ত আকর্ষণীয়, ফ্রেন্ডলি ও ক্রেতা-বান্ধব বাংলা';
        break;
    }

    const systemInstruction = `You are an expert Bangladeshi E-commerce Copywriter. Write engaging, sales-driven natural Bengali copy with emojis.`;
    const prompt = `Please create a high-converting ${platform} in Bengali.
Product Name: ${productName}
Selling Price: ৳${finalSellingPrice}
Original Price: ৳${finalOriginalPrice}
Warranty: ${warranty || 'None'}
Shop Name: ${shopName}
Contact: ${contactNumber}
Platform Guideline: ${platformGuideline}
Tone: ${toneGuideline}
${customPrompt ? `User Custom Note: ${customPrompt}` : ''}`;

    let generatedText = '';
    let usedAI = false;

    if (ai) {
      const modelsToTry = ['gemini-3.6-flash', 'gemini-3.7-flash'];
      for (const modelName of modelsToTry) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: { systemInstruction, temperature: 0.75 },
          });
          if (response?.text) {
            generatedText = response.text;
            usedAI = true;
            break;
          }
        } catch {
          // Continue
        }
      }
    }

    if (!generatedText) {
      const fallbackResult = generateFallbackCopy({
        productName,
        categoryName,
        sellingPrice: finalSellingPrice,
        originalPrice: finalOriginalPrice,
        discount,
        warranty,
        description,
        platform,
        tone,
        shopName,
        contactNumber,
        features,
      });
      return res.json({
        success: true,
        copy: fallbackResult.text,
        hashtags: fallbackResult.hashtags,
        title: fallbackResult.title,
        isFallback: true,
      });
    }

    const hashtagMatch = generatedText.match(/(#\w+[\s,]*)+$/);
    const hashtags = hashtagMatch ? hashtagMatch[0].trim() : '#gadgetbd #offer #reseller';

    res.json({
      success: true,
      copy: generatedText,
      hashtags,
      title: `${productName} - ${platform.replace('_', ' ').toUpperCase()}`,
      isFallback: !usedAI,
    });
  } catch (error: any) {
    const { productName = 'Gadget Item', sellingPrice = 990, originalPrice = 1250, platform = 'facebook_post', shopName = 'ReSellBD Shop' } = req.body || {};
    const fallback = generateFallbackCopy({
      productName,
      sellingPrice,
      originalPrice,
      discount: originalPrice > sellingPrice ? originalPrice - sellingPrice : 0,
      platform,
      tone: 'engaging',
      shopName,
    });
    res.json({
      success: true,
      copy: fallback.text,
      hashtags: fallback.hashtags,
      title: fallback.title,
      isFallback: true,
    });
  }
});

function generateFallbackCopy(params: {
  productName: string;
  categoryName?: string;
  sellingPrice: number;
  originalPrice: number;
  discount: number;
  warranty?: string;
  description?: string;
  features?: string;
  platform: string;
  tone: string;
  shopName: string;
  contactNumber?: string;
}) {
  const { productName, sellingPrice, originalPrice, discount, warranty, platform, shopName, contactNumber } = params;
  const phoneText = contactNumber || 'ইনবক্স করুন';
  const warrantyStr = warranty ? `🛡️ ওয়ারেন্টি: ${warranty}` : '✅ ১০০% অরিজিনাল প্রোডাক্ট';

  return {
    title: `${productName} - ${platform}`,
    text: `💥 ${productName} - সেরা ধামাকা অফার!
🔥 বিশেষ মূল্য: মাত্র ৳${sellingPrice}/- (নিয়মিত মূল্য: ৳${originalPrice}) ${discount > 0 ? `[৳${discount} মেগা ডিসকাউন্ট!]` : ''}

${warrantyStr}
🚚 সারা দেশে ক্যাশ অন ডেলিভারি সুবিধা (প্রোডাক্ট চেক করে পেমেন্ট)

🛒 দ্রুত অর্ডার করতে ইনবক্সে মেসেজ দিন অথবা কল করুন:
🏪 শপ: ${shopName}
📞 ফোন / WhatsApp: ${phoneText}`,
    hashtags: `#${productName.replace(/\s+/g, '')} #ReSellBD #CashOnDelivery #GadgetBD`,
  };
}

// Default catch-all
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: `API route ${req.path} not found.` });
});

export default app;
