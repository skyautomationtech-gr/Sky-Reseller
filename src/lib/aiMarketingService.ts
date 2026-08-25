export type AICopyPlatform = 
  | 'facebook_post' 
  | 'tiktok_script' 
  | 'facebook_story' 
  | 'whatsapp_broadcast' 
  | 'seo_description' 
  | 'urgency_flash_sale';

export type AICopyTone = 
  | 'engaging' 
  | 'urgent' 
  | 'trust_premium' 
  | 'storytelling' 
  | 'punchy_short';

export interface GenerateCopyParams {
  productName: string;
  categoryName?: string;
  retailPrice?: number;
  resellerPrice?: number;
  sellingPrice?: number;
  originalPrice?: number;
  warranty?: string;
  description?: string;
  features?: string;
  platform?: AICopyPlatform;
  tone?: AICopyTone;
  targetAudience?: string;
  shopName?: string;
  contactNumber?: string;
  customPrompt?: string;
}

export interface GenerateCopyResponse {
  success: boolean;
  copy: string;
  hashtags: string;
  title: string;
  isFallback?: boolean;
  notice?: string;
  error?: string;
}

export const PLATFORM_OPTIONS: { id: AICopyPlatform; label: string; subLabel: string; icon: string }[] = [
  { 
    id: 'facebook_post', 
    label: 'ফেসবুক সেলস পোস্ট', 
    subLabel: 'Facebook Feed & Group Sales Copy', 
    icon: '📱' 
  },
  { 
    id: 'tiktok_script', 
    label: 'টিকটক ও রিলস স্ক্রিপ্ট', 
    subLabel: 'TikTok / Reels 30s Video Script', 
    icon: '🎬' 
  },
  { 
    id: 'facebook_story', 
    label: 'স্টোরি / শর্ট ক্যাপশন', 
    subLabel: 'Facebook & Insta Story Pitch', 
    icon: '⚡' 
  },
  { 
    id: 'whatsapp_broadcast', 
    label: 'WhatsApp ডিরেক্ট মেসেজ', 
    subLabel: 'Customer Broadcast Message', 
    icon: '💬' 
  },
  { 
    id: 'seo_description', 
    label: 'এসইও প্রোডাক্ট বিবরণী', 
    subLabel: 'E-commerce Catalog & SEO Details', 
    icon: '📄' 
  },
  { 
    id: 'urgency_flash_sale', 
    label: 'ধামাকা ফ্ল্যাশ সেল পোস্ট', 
    subLabel: 'Limited Time FOMO & Urgency Copy', 
    icon: '🔥' 
  },
];

export const TONE_OPTIONS: { id: AICopyTone; label: string; desc: string }[] = [
  { id: 'engaging', label: '🔥 হট ও আকর্ষণীয়', desc: 'হাই কনভার্সন ও ফ্রেন্ডলি বাংলা' },
  { id: 'urgent', label: '⚡ জরুরি ও অফার অ্যালার্ট', desc: 'সীমিত স্টক ও দ্রুত অর্ডারের তাগিদ' },
  { id: 'trust_premium', label: '💎 ১০০% প্রিমিয়াম ও ট্রাস্ট', desc: 'অথেনটিক কোয়ালিটি ও অফিসিয়াল ভরসা' },
  { id: 'storytelling', label: '📖 প্রবলেম-সলভিং গল্প', desc: 'গ্রাহকের সমস্যা ও সমাধানের উপস্থাপন' },
  { id: 'punchy_short', label: '🎯 সংক্ষিপ্ত ও সরাসরি', desc: 'টু-দ্য-পয়েন্ট ও দ্রুত পড়ার মতো' },
];

/**
 * Generate AI Bengali marketing copy via backend endpoint
 */
export async function generateAICopy(params: GenerateCopyParams): Promise<GenerateCopyResponse> {
  try {
    const res = await fetch('/api/ai/generate-copy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    const data = await res.json();
    return data;
  } catch (error: any) {
    console.error('Failed to generate AI copy via API:', error);
    // Return friendly fallback client response
    return {
      success: true,
      copy: generateClientFallback(params),
      hashtags: '#gadgetbd #specialoffer #resellerbd #cashondelivery',
      title: `${params.productName} Copy`,
      isFallback: true,
      error: error.message,
    };
  }
}

function generateClientFallback(p: GenerateCopyParams): string {
  const sellPrice = p.sellingPrice || p.retailPrice || 990;
  const regPrice = p.originalPrice || Math.round(sellPrice * 1.25);
  const discount = regPrice > sellPrice ? regPrice - sellPrice : 0;
  const shop = p.shopName || 'Sky Reseller Shop';
  const phone = p.contactNumber || 'ইনবক্স করুন';
  const warranty = p.warranty ? `🛡️ অফিশিয়াল ওয়ারেন্টি: ${p.warranty}` : '✅ ১০০% অরিজিনাল ও অথেনটিক প্রোডাক্ট গ্যারান্টি';
  const featuresList = p.features || p.description || 'প্রিমিয়াম বিল্ড কোয়ালিটি ও দীর্ঘস্থায়ী কার্যক্ষমতা';

  if (p.platform === 'urgency_flash_sale') {
    return `🚨 [জরুরি স্টক সীমিত ফ্ল্যাশ সেল] 🚨
⚡ স্টক শেষ হওয়ার আগেই লুফে নিন আসল ${p.productName}!

💥 রেগুলার প্রাইস: ৳${regPrice}
🔥 ফ্ল্যাশ সেল প্রাইস: মাত্র ৳${sellPrice}/- ${discount > 0 ? `(৳${discount} মেগা ডিসকাউন্ট!)` : ''}

🌟 মূল সুবিধাসমূহ:
🔹 ${featuresList}
🔹 ${warranty}
🔹 ক্যাশ অন ডেলিভারি সারা দেশে (প্রোডাক্ট দেখে চেক করে পেমেন্ট)

⚠️ অফারটি নির্দিষ্ট সংখ্যক অর্ডারের জন্যই প্রযোজ্য!
📲 এখনই ইনবক্সে আপনার নাম, ঠিকানা ও মোবাইল নম্বর পাঠিয়ে দ্রুত অর্ডার কনফার্ম করুন।
🏪 শপ: ${shop}
📞 যোগাযোগ / WhatsApp: ${phone}`;
  }

  if (p.platform === 'seo_description') {
    return `📌 প্রোডাক্টের বিবরণ (Product Overview):
${p.productName} হলো বর্তমান সময়ের অন্যতম জনপ্রিয় ও প্রিমিয়াম কোয়ালিটির ${p.categoryName || 'গ্যাজেট'}। আধুনিক ডিজাইন ও শক্তিশালী বিল্ড কোয়ালিটির কারণে এটি দৈনন্দিন ব্যবহারে নিশ্চিত করে অসাধারণ অভিজ্ঞতা।

✨ প্রধান বৈশিষ্ট্য ও স্পেসিফিকেশন (Key Highlights):
• প্রিমিয়াম মেটেরিয়াল ও টেকসই স্থায়িত্ব
• উচ্চমানের পারফরম্যান্স ও আধুনিক প্রযুক্তি
• ${featuresList}
• ${warranty}

💰 মূল্য ও অফার:
• নিয়মিত বাজার মূল্য: ৳${regPrice}
• আমাদের বিশেষ অফার মূল্য: ৳${sellPrice} টাকা মাত্র

🚚 ডেলিভারি পলিসি:
আমরা সারা বাংলাদেশে দ্রুততম হোম ডেলিভারি দিয়ে থাকি। পার্সেল ডেলিভারি ম্যানের সামনে খুলে চেক করে নেওয়ার ১০০% সুবিধা রয়েছে।

🛒 অর্ডার করতে ক্লিক করুন অথবা যোগাযোগ করুন: ${shop} (${phone})`;
  }

  if (p.platform === 'tiktok_script') {
    return `🎬 [ভিডিও হুক (০-৫ সেকেন্ড)]:
(ক্যামেরায় প্রোডাক্টটি হাতে নিয়ে বা ব্যবহার করতে করতে বলুন)
"আপনি কি এখনও নরমাল গ্যাজেট ব্যবহার করে বিরক্ত? তাহলে আজকের এই ভিডিওটি আপনার জন্য!"

📦 [সমস্যা ও ফিচার (৬-২০ সেকেন্ড)]:
"প্রতিদিনের কাজের জন্য আপনার প্রয়োজন এমন একটি ${p.categoryName || 'গ্যাজেট'}, যা আপনাকে দেবে দীর্ঘস্থায়ী পারফরম্যান্স।
${p.productName} নিয়ে এলো দুর্দান্ত বিল্ড কোয়ালিটি ও লেটেস্ট টেকনোলজি!"

💰 [অফার প্রাইজ ও গ্যারান্টি (২১-৩৫ সেকেন্ড)]:
"মার্কেট রেগুলার প্রাইস ৳${regPrice} হলেও, আমাদের শপে আজকের জন্য পাচ্ছেন মাত্র ৳${sellPrice} টাকায়! ${warranty}"

🛒 [কল-টু-অ্যাকশন (৩৬-৪৫ সেকেন্ড)]:
"সারা বাংলাদেশে ক্যাশ অন ডেলিভারিতে হোম ডেলিভারি পেতে এখনই আমাদের বায়ো লিংকে ক্লিক করুন অথবা ইনবক্সে মেসেজ পাঠান!"`;
  }

  if (p.platform === 'whatsapp_broadcast') {
    return `আসসালামু আলাইকুম! 👋
আমাদের কাছে পাচ্ছেন সেরা কোয়ালিটির আসল *${p.productName}*।

🏷️ নিয়মিত মূল্য: ~৳${regPrice}~
🔥 অফার প্রাইস: *৳${sellPrice}* ${discount > 0 ? `(৳${discount} ছাড়!)` : ''}
${warranty}
🚚 সারা বাংলাদেশে হোম ডেলিভারি ও প্রোডাক্ট হাতে পেয়ে পেমেন্ট সুবিধা।

অর্ডার করতে সরাসরি আপনার নাম, মোবাইল ও ঠিকানা লিখে রিপ্লাই করুন:
🏪 শপ: *${shop}*
📞 কল / WhatsApp: *${phone}*`;
  }

  if (p.platform === 'facebook_story') {
    return `🔥 ধামাকা অফার: ${p.productName}
💥 মাত্র ৳${sellPrice} (রেগুলার ৳${regPrice})
🚚 ক্যাশ অন ডেলিভারি সারা বাংলাদেশে!
📩 অর্ডার করতে এখনই ইনবক্সে মেসেজ পাঠান! 🏪 ${shop}`;
  }

  let headline = `🔥 প্রিমিয়াম কোয়ালিটি নিশ্চিত: ${p.productName} 🔥`;
  if (p.tone === 'urgent') headline = `⚡ সীমিত সময়ের অফার: লুফে নিন ${p.productName}! ⚡`;
  if (p.tone === 'trust_premium') headline = `💎 ১০০% খাঁটি ও অথেনটিক: ${p.productName} 💎`;
  if (p.tone === 'storytelling') headline = `✨ প্রতিদিনের জীবনকে আরও সহজ করতে সেরা সঙ্গী: ${p.productName} ✨`;
  if (p.tone === 'punchy_short') headline = `⚡ বেস্ট গ্যাজেট ডিল: ${p.productName} ⚡`;

  return `${headline}
━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ আসল ও খাঁটি গ্যাজেট আইটেম এখন পাচ্ছেন সেরা অফার মূল্যে! 

✨ কেন এই প্রোডাক্টটি আপনার জন্য সেরা:
✔️ দীর্ঘস্থায়ী ও মজবুত প্রিমিয়াম বিল্ড কোয়ালিটি
✔️ দৈনন্দিন ব্যবহার ও উপহার দেওয়ার জন্য দারুণ উপযোগী
✔️ চমৎকার পারফরম্যান্স ও আধুনিক ডিজাইন: ${featuresList}
${warranty}

💰 প্রাইস ডিটেইলস:
🏷️ নিয়মিত মূল্য: ৳${regPrice}
💥 আজকের স্পেশাল অফার মূল্য: মাত্র ৳${sellPrice}/- ${discount > 0 ? `(৳${discount} সেভিং!)` : ''}

🚚 ডেলিভারি সুবিধা:
📦 সারা বাংলাদেশে ক্যাশ অন ডেলিভারি (হোম ডেলিভারি) ব্যবস্থা।
🛡️ ডেলিভারি ম্যানের সামনে প্রোডাক্ট দেখে চেক করে পেমেন্ট করার সম্পূর্ণ নিশ্চয়তা!

📩 অর্ডার করতে এখনই আপনার নাম, মোবাইল নম্বর ও পূর্ণ ঠিকানা লিখে ইনবক্স করুন।
🏪 পেজ / শপ: ${shop}
📞 মোবাইল / WhatsApp: ${phone}`;
}
