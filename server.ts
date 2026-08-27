import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Initialize Gemini AI Client lazily / securely on server
  let aiClient: GoogleGenAI | null = null;
  const getAI = () => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('GEMINI_API_KEY is not set in environment variables');
      return null;
    }
    if (!aiClient) {
      aiClient = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
    }
    return aiClient;
  };

  // Health check API
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      hasGeminiKey: !!process.env.GEMINI_API_KEY,
      timestamp: new Date().toISOString(),
    });
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
        platform = 'facebook_post', // 'facebook_post' | 'tiktok_script' | 'facebook_story' | 'whatsapp_broadcast' | 'seo_description' | 'urgency_flash_sale'
        tone = 'engaging', // 'engaging' | 'urgent' | 'trust_premium' | 'storytelling' | 'punchy_short'
        targetAudience = 'general',
        shopName = 'Sky Reseller Shop',
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
        // High quality fallback copy generator when key is not configured
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
          notice: 'Generated via fallback template (Configure GEMINI_API_KEY in Settings > Secrets for customized AI generation)',
        });
      }

      // Construct tailored prompt for Gemini 3.7 Flash
      let platformGuideline = '';
      let formatGuideline = '';

      switch (platform) {
        case 'tiktok_script':
          platformGuideline = `টিকটক ও ফেসবুক রিলসের জন্য ৩০-৪৫ সেকেন্ডের ভাইরাল শর্ট ভিডিও স্ক্রিপ্ট।
স্ক্রিপ্টের ফরম্যাট হবে:
[ভিডিও হুক (১-৫ সেকেন্ড)]: ক্যামেরায় যা দেখাবেন ও মুখে যা বলবেন
[সমস্যা ও সমাধানের উপস্থাপন (৬-২০ সেকেন্ড)]: গ্রাহকের দৈনন্দিন সমস্যা ও কীভাবে এই প্রোডাক্টটি সমাধান দিচ্ছে
[প্রোডাক্টের সেরা ফিচার ও অফার প্রাইজ (২১-৩৫ সেকেন্ড)]: স্পেশাল মূল্য ও ক্যাশ অন ডেলিভারি
[কল-টু-অ্যাকশন (৩৬-৪৫ সেকেন্ড)]: কীভাবে অর্ডার করবে (ইনবক্স / বায়ো লিংক / হোয়াটসঅ্যাপ)`;
          formatGuideline = 'ভিডিও দৃশ্য ও ডায়লগ পরিষ্কার সেকশনে ভাগ করে লিখুন।';
          break;

        case 'facebook_story':
          platformGuideline = 'ফেসবুক ও ইনস্টাগ্রাম স্টোরি/রিলসের জন্য ২-৩ লাইনের পাওয়ারফুল, ক্যাচি ও দ্রুত অ্যাকশন নেয়ার মতো শর্ট টেক্সট।';
          formatGuideline = 'খুব ছোট, আকর্ষণীয় ইমোজি সহ ২-৩ লাইনে প্রাইজ ও ইনবক্স করার আহ্বান থাকবে।';
          break;

        case 'whatsapp_broadcast':
          platformGuideline = 'হোয়াটসঅ্যাপ বা মেসেঞ্জারে কাস্টমারকে সরাসরি পাঠানোর মতো আন্তরিক, সম্মানজনক এবং আকর্ষণীয় ডিরেক্ট মেসেজ।';
          formatGuideline = 'আসসালামু আলাইকুম দিয়ে শুরু, প্রোডাক্টের অফার ও সংক্ষেপে সুবিধা, দ্রুত রিপ্লাই দেওয়ার আহ্বান।';
          break;

        case 'seo_description':
          platformGuideline = 'ই-কমার্স ওয়েবসাইট বা অনলাইন শপ ক্যাটালগের জন্য এসইও ফ্রেন্ডলি প্রফেশনাল প্রোডাক্ট বিবরণী (Product Description & Specifications)।';
          formatGuideline = 'প্যারাগ্রাফে প্রোডাক্টের মূল আকর্ষণ, এরপর বুলেট পয়েন্টে ফিচার ও টেকনিক্যাল স্পেসিফিকেশন এবং কেন আমাদের থেকে কিনবেন তার কারণ।';
          break;

        case 'urgency_flash_sale':
          platformGuideline = 'সীমিত সময়ের ধামাকা অফার / ফ্ল্যাশ সেলস পোস্ট (FOMO & Urgency)।';
          formatGuideline = 'স্টক শেষ হওয়ার আগে অর্ডারের তাগিদ, মূল্য ছাড়ের স্পষ্ট হাইলাইট, এবং এখনই অর্ডার করার স্ট্রং কল-টু-অ্যাকশন।';
          break;

        case 'facebook_post':
        default:
          platformGuideline = `ফেসবুক পেজ ও গ্রুপের জন্য আকর্ষণীয় সেলস ও মার্কেটিং পোস্ট।
পোস্টের স্ট্রাকচার:
১. চোখ ধাঁধানো আকর্ষণীয় প্রথম লাইন (Attention Grabber / Hook)
২. প্রোডাক্টের মূল উপকারিতা ও সুবিধা (Bullet points with emojis)
৩. নিয়মিত মূল্য বনাম আজকের অফার মূল্য (৳${finalOriginalPrice} এর জায়গায় মাত্র ৳${finalSellingPrice})
৪. সারা বাংলাদেশে ক্যাশ অন ডেলিভারি ও চেক করে নেওয়ার নিশ্চয়তা
৫. অর্ডার করার সহজ নিয়ম ও কন্টাক্ট ইনফো
৬. প্রাসঙ্গিক ট্রেন্ডিং বাংলা ও ইংরেজি হ্যাশট্যাগ (#)`;
          formatGuideline = 'আকর্ষণীয় ও রিলেটেবল বাংলা ভাষায় ইমোজি সহ সাজিয়ে লিখুন।';
          break;
      }

      let toneGuideline = '';
      switch (tone) {
        case 'urgent':
          toneGuideline = 'জরুরি ও সীমিত সময়ের অফার ভাব (Urgent, FOMO, High conversion, Limited Stock Alert)';
          break;
        case 'trust_premium':
          toneGuideline = 'মার্জিত, অথেনটিক, অফিসিয়াল কোয়ালিটি ও ১০০% অরিজিনাল ট্রাস্ট ভিত্তিক ভাষা';
          break;
        case 'storytelling':
          toneGuideline = 'গল্পের ছলে সমস্যা ও সমাধানের সুন্দর উপস্থাপন (Relatable Customer Story)';
          break;
        case 'punchy_short':
          toneGuideline = 'সংক্ষিপ্ত, টু দ্য পয়েন্ট ও দ্রুত পড়ার মতো ক্রিস্প ভাষা';
          break;
        case 'engaging':
        default:
          toneGuideline = 'অত্যন্ত আকর্ষণীয়, ফ্রেন্ডলি, ক্রেতা-বান্ধব ও কথোপকথনমূলক বাংলা';
          break;
      }

      const systemInstruction = `You are an expert Bangladeshi E-commerce Copywriter and Social Media Marketing Strategist specializing in gadgets, electronics, and lifestyle products.
Your job is to generate highly engaging, sales-driven, natural-sounding Bengali (বাংলা) marketing copy, captions, and scripts.
Rules:
- Write strictly in high-quality, natural Bengali (বাংলা) with standard English terms used naturally in Bangladesh (e.g. ক্যাশ অন ডেলিভারি, হোম ডেলিভারি, ওয়ারেন্টি, প্রিমিয়াম কোয়ালিটি, ব্যাটারি ব্যাকআপ).
- Avoid robotic or unnatural literal translation. Use engaging colloquial e-commerce slang (যেমন: ধামাকা অফার, আসল প্রোডাক্ট, দেখে চেক করে নেওয়ার সুযোগ, স্টক সীমিত).
- Include relevant emojis strategically.
- Calculate and highlight savings/discounts clearly.
- Provide 5-8 trending, relevant hashtags at the bottom.`;

      const prompt = `Please create a high-converting ${platform} in Bengali.

Product Details:
- Product Name: ${productName}
- Category: ${categoryName || 'Gadget & Electronics'}
- Selling Price: ৳${finalSellingPrice}
- Original / Regular Price: ৳${finalOriginalPrice}
${discount > 0 ? `- Discount / Savings: ৳${discount}` : ''}
${warranty ? `- Warranty: ${warranty}` : ''}
${description ? `- Product Info/Features: ${description}` : ''}
${features ? `- Key Highlights: ${features}` : ''}
- Shop Name: ${shopName}
- Contact / WhatsApp Number: ${contactNumber || 'Inbox us'}
- Target Audience: ${targetAudience}

Format Requirement: ${platformGuideline}
Tone: ${toneGuideline}
Specific Structure Requirement: ${formatGuideline}
${customPrompt ? `Additional Instructions from User: ${customPrompt}` : ''}

Provide ONLY the final ready-to-copy marketing copy text with hashtags at the end.`;

      let generatedText = '';
      let usedAI = false;

      if (ai) {
        // Try active modern models
        const modelsToTry = ['gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.6-pro'];
        
        for (const modelName of modelsToTry) {
          try {
            const response = await ai.models.generateContent({
              model: modelName,
              contents: prompt,
              config: {
                systemInstruction,
                temperature: 0.75,
              },
            });

            if (response && response.text) {
              generatedText = response.text;
              usedAI = true;
              break;
            }
          } catch {
            // Silently proceed to next model or fallback
          }
        }
      }

      if (!generatedText) {
        // High quality smart copy generator
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
          notice: 'Generated via high-converting smart marketing template',
        });
      }

      // Extract hashtags if any
      const hashtagMatch = generatedText.match(/(#\w+[\s,]*)+$/);
      const hashtags = hashtagMatch ? hashtagMatch[0].trim() : '#gadgetbd #offer #reseller #cashondelivery';

      res.json({
        success: true,
        copy: generatedText,
        hashtags,
        title: `${productName} - ${platform.replace('_', ' ').toUpperCase()}`,
        isFallback: !usedAI,
      });

    } catch (error: any) {
      console.warn('Handling AI copywriting fallback gracefully:', error?.message || error);

      // Graceful fallback on any unexpected error
      const {
        productName = 'Gadget Item',
        categoryName = 'Electronics',
        sellingPrice = 990,
        originalPrice = 1250,
        warranty = '',
        description = '',
        features = '',
        platform = 'facebook_post',
        tone = 'engaging',
        shopName = 'Sky Reseller Shop',
        contactNumber = '',
      } = req.body || {};

      const fallback = generateFallbackCopy({
        productName,
        categoryName,
        sellingPrice,
        originalPrice,
        discount: originalPrice > sellingPrice ? originalPrice - sellingPrice : 0,
        warranty,
        description,
        features,
        platform,
        tone,
        shopName,
        contactNumber,
      });

      res.json({
        success: true,
        copy: fallback.text,
        hashtags: fallback.hashtags,
        title: fallback.title,
        isFallback: true,
        notice: 'Generated via smart template',
      });
    }
  });

  // Vite middleware for dev or static serving in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

// Fallback generator helper
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
  const {
    productName,
    categoryName = 'গ্যাজেট',
    sellingPrice,
    originalPrice,
    discount,
    warranty,
    description,
    features,
    platform,
    tone,
    shopName,
    contactNumber,
  } = params;

  const phoneText = contactNumber || 'ইনবক্স করুন';
  const warrantyStr = warranty ? `🛡️ অফিশিয়াল ওয়ারেন্টি: ${warranty}` : '✅ ১০০% অরিজিনাল ও অথেনটিক প্রোডাক্ট গ্যারান্টি';
  const featuresList = features || description || 'প্রিমিয়াম বিল্ড কোয়ালিটি ও দীর্ঘস্থায়ী কার্যক্ষমতা';

  if (platform === 'urgency_flash_sale') {
    return {
      title: `${productName} - Flash Sale Post`,
      text: `🚨 [জরুরি স্টক সীমিত ফ্ল্যাশ সেল] 🚨
⚡ স্টক শেষ হওয়ার আগেই লুফে নিন আসল ${productName}!

💥 রেগুলার প্রাইস: ৳${originalPrice}
🔥 ফ্ল্যাশ সেল প্রাইস: মাত্র ৳${sellingPrice}/- ${discount > 0 ? `(৳${discount} মেগা ডিসকাউন্ট!)` : ''}

🌟 মূল সুবিধাসমূহ:
🔹 ${featuresList}
🔹 ${warrantyStr}
🔹 ক্যাশ অন ডেলিভারি সারা দেশে (প্রোডাক্ট দেখে চেক করে পেমেন্ট)

⚠️ অফারটি নির্দিষ্ট সংখ্যক অর্ডারের জন্যই প্রযোজ্য!
📲 এখনই ইনবক্সে আপনার নাম, ঠিকানা ও মোবাইল নম্বর পাঠিয়ে দ্রুত অর্ডার কনফার্ম করুন।
🏪 শপ: ${shopName}
📞 যোগাযোগ / WhatsApp: ${phoneText}`,
      hashtags: `#FlashSaleBD #${productName.replace(/\s+/g, '')} #LimitedStock #MegaOffer #GadgetBangladesh #CashOnDelivery`,
    };
  }

  if (platform === 'seo_description') {
    return {
      title: `${productName} - SEO Product Description`,
      text: `📌 প্রোডাক্টের বিবরণ (Product Overview):
${productName} হলো বর্তমান সময়ের অন্যতম জনপ্রিয় ও প্রিমিয়াম কোয়ালিটির ${categoryName}। আধুনিক ডিজাইন ও শক্তিশালী বিল্ড কোয়ালিটির কারণে এটি দৈনন্দিন ব্যবহারে নিশ্চিত করে অসাধারণ অভিজ্ঞতা।

✨ প্রধান বৈশিষ্ট্য ও স্পেসিফিকেশন (Key Highlights):
• প্রিমিয়াম মেটেরিয়াল ও টেকসই স্থায়িত্ব
• উচ্চমানের পারফরম্যান্স ও আধুনিক প্রযুক্তি
• ${featuresList}
• ${warrantyStr}

💰 মূল্য ও অফার:
• নিয়মিত বাজার মূল্য: ৳${originalPrice}
• আমাদের বিশেষ অফার মূল্য: ৳${sellingPrice} টাকা মাত্র

🚚 ডেলিভারি পলিসি:
আমরা সারা বাংলাদেশে দ্রুততম হোম ডেলিভারি দিয়ে থাকি। পার্সেল ডেলিভারি ম্যানের সামনে খুলে চেক করে নেওয়ার ১০০% সুবিধা রয়েছে।

🛒 অর্ডার করতে ক্লিক করুন অথবা যোগাযোগ করুন: ${shopName} (${phoneText})`,
      hashtags: `#${productName.replace(/\s+/g, '')} #ProductReview #OriginalGadget #ECommerceBD #${categoryName.replace(/\s+/g, '')}`,
    };
  }

  if (platform === 'tiktok_script') {
    return {
      title: `${productName} - TikTok & Reels Script`,
      text: `🎬 [ভিডিও হুক (০-৫ সেকেন্ড)]:
(ক্যামেরায় প্রোডাক্টটি হাতে নিয়ে বা ব্যবহার করতে করতে বলুন)
"আপনি কি এখনও নরমাল গ্যাজেট ব্যবহার করে বিরক্ত? তাহলে আজকের এই ভিডিওটি আপনার জন্য!"

📦 [সমস্যা ও ফিচার (৬-২০ সেকেন্ড)]:
"প্রতিদিনের কাজের জন্য আপনার প্রয়োজন এমন একটি ${categoryName}, যা আপনাকে দেবে দীর্ঘস্থায়ী পারফরম্যান্স।
${productName} নিয়ে এলো দুর্দান্ত বিল্ড কোয়ালিটি ও লেটেস্ট টেকনোলজি!"

💰 [অফার প্রাইজ ও গ্যারান্টি (২১-৩৫ সেকেন্ড)]:
"মার্কেট রেগুলার প্রাইস ৳${originalPrice} হলেও, আমাদের শপে আজকের জন্য পাচ্ছেন মাত্র ৳${sellingPrice} টাকায়! ${warrantyStr}"

🛒 [কল-টু-অ্যাকশন (৩৬-৪৫ সেকেন্ড)]:
"সারা বাংলাদেশে ক্যাশ অন ডেলিভারিতে হোম ডেলিভারি পেতে এখনই আমাদের বায়ো লিংকে ক্লিক করুন অথবা ইনবক্সে মেসেজ পাঠান!"`,
      hashtags: `#${productName.replace(/\s+/g, '')} #viralgadget #tiktokbd #foryou #gadgetlover #cashondelivery #bangladesh`,
    };
  }

  if (platform === 'whatsapp_broadcast') {
    return {
      title: `${productName} - WhatsApp Message`,
      text: `আসসালামু আলাইকুম! 👋
আমাদের কাছে পাচ্ছেন সেরা কোয়ালিটির আসল *${productName}*।

🏷️ নিয়মিত মূল্য: ~৳${originalPrice}~
🔥 অফার প্রাইস: *৳${sellingPrice}* ${discount > 0 ? `(৳${discount} ছাড়!)` : ''}
${warrantyStr}
🚚 সারা বাংলাদেশে হোম ডেলিভারি ও প্রোডাক্ট হাতে পেয়ে পেমেন্ট সুবিধা।

অর্ডার করতে সরাসরি আপনার নাম, মোবাইল ও ঠিকানা লিখে রিপ্লাই করুন:
🏪 শপ: *${shopName}*
📞 কল / WhatsApp: *${phoneText}*`,
      hashtags: '#whatsappoffer #gadgetoffer #resellerbd',
    };
  }

  if (platform === 'facebook_story') {
    return {
      title: `${productName} - Story Caption`,
      text: `🔥 ধামাকা অফার: ${productName}
💥 মাত্র ৳${sellingPrice} (রেগুলার ৳${originalPrice})
🚚 ক্যাশ অন ডেলিভারি সারা বাংলাদেশে!
📩 অর্ডার করতে এখনই ইনবক্সে মেসেজ পাঠান! 🏪 ${shopName}`,
      hashtags: '#specialoffer #storypost #gadgetbd',
    };
  }

  // Default Facebook Post tailored to Tone
  let toneHeadline = `🔥 প্রিমিয়াম কোয়ালিটি নিশ্চিত: ${productName} 🔥`;
  if (tone === 'urgent') {
    toneHeadline = `⚡ সীমিত সময়ের অফার: লুফে নিন ${productName}! ⚡`;
  } else if (tone === 'trust_premium') {
    toneHeadline = `💎 ১০০% খাঁটি ও অথেনটিক: ${productName} 💎`;
  } else if (tone === 'storytelling') {
    toneHeadline = `✨ প্রতিদিনের জীবনকে আরও সহজ করতে সেরা সঙ্গী: ${productName} ✨`;
  } else if (tone === 'punchy_short') {
    toneHeadline = `⚡ বেস্ট গ্যাজেট ডিল: ${productName} ⚡`;
  }

  return {
    title: `${productName} - Facebook Post`,
    text: `${toneHeadline}
━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ আসল ও খাঁটি গ্যাজেট আইটেম এখন পাচ্ছেন সেরা অফার মূল্যে! 

✨ কেন এই প্রোডাক্টটি আপনার জন্য সেরা:
✔️ দীর্ঘস্থায়ী ও মজবুত প্রিমিয়াম বিল্ড কোয়ালিটি
✔️ দৈনন্দিন ব্যবহার ও উপহার দেওয়ার জন্য দারুণ উপযোগী
✔️ চমৎকার পারফরম্যান্স ও আধুনিক ডিজাইন: ${featuresList}
${warrantyStr}

💰 প্রাইস ডিটেইলস:
🏷️ নিয়মিত মূল্য: ৳${originalPrice}
💥 আজকের স্পেশাল অফার মূল্য: মাত্র ৳${sellingPrice}/- ${discount > 0 ? `(৳${discount} সেভিং!)` : ''}

🚚 ডেলিভারি সুবিধা:
📦 সারা বাংলাদেশে ক্যাশ অন ডেলিভারি (হোম ডেলিভারি) ব্যবস্থা।
🛡️ ডেলিভারি ম্যানের সামনে প্রোডাক্ট দেখে চেক করে পেমেন্ট করার সম্পূর্ণ নিশ্চয়তা!

📩 অর্ডার করতে এখনই আপনার নাম, মোবাইল নম্বর ও পূর্ণ ঠিকানা লিখে ইনবক্স করুন।
🏪 পেজ / শপ: ${shopName}
📞 মোবাইল / WhatsApp: ${phoneText}`,
    hashtags: `#${productName.replace(/\s+/g, '')} #gadgetbd #onlineshopping #cashondelivery #bangladesh #specialoffer #${shopName.replace(/\s+/g, '')}`,
  };
}

startServer();
