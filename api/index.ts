import express from 'express';
import { GoogleGenAI } from '@google/genai';
import {
  handleSendOtpRequest,
  handleVerifyOtpRequest,
  handleClearSuperAdminSession,
  verifyFirebaseCallerIdToken,
} from './_otp';

const app = express();

// Enable CORS & JSON parsing for Vercel Serverless Function
app.use((req, res, next) => {
  const origin = req.headers.origin;
  res.header('Access-Control-Allow-Origin', origin || '*');
  if (origin) {
    res.header('Vary', 'Origin');
    res.header('Access-Control-Allow-Credentials', 'true');
  }
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

// ==========================================
// 0. FREE-PLAN STATELESS OTP & SUPER ADMIN 2-STEP ROUTES
// ==========================================
app.post('/api/send-email-otp', async (req, res) => {
  await handleSendOtpRequest(req, res, 'register');
});

app.post('/api/verify-email-otp', async (req, res) => {
  await handleVerifyOtpRequest(req, res, 'register');
});

app.post('/api/super-admin/start-login', async (req, res) => {
  try {
    const caller = await verifyFirebaseCallerIdToken(req);
    await handleSendOtpRequest(req, res, 'super_admin', caller.email);
  } catch (err: any) {
    res.status(err?.status || 401).json({
      error: err?.message || 'Unauthorized',
      code: err?.code || 'unauthenticated',
    });
  }
});

app.post('/api/super-admin/verify-otp', async (req, res) => {
  try {
    const caller = await verifyFirebaseCallerIdToken(req);
    await handleVerifyOtpRequest(req, res, 'super_admin', caller.email);
  } catch (err: any) {
    res.status(err?.status || 401).json({
      error: err?.message || 'Unauthorized',
      code: err?.code || 'unauthenticated',
    });
  }
});

app.post('/api/super-admin/clear-session', async (req, res) => {
  try {
    const caller = await verifyFirebaseCallerIdToken(req);
    handleClearSuperAdminSession(req, res, caller.email);
  } catch {
    handleClearSuperAdminSession(req, res, String(req.body?.email || ''));
  }
});

// ==========================================
// 1. SHOP NAME & AI MARKETING ROUTES
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
