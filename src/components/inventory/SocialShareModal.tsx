import React, { useState, useEffect, useRef } from 'react';
import { Product, UserProfile } from '../../types';
import { generateAICopy, AICopyPlatform, AICopyTone, PLATFORM_OPTIONS, TONE_OPTIONS } from '../../lib/aiMarketingService';
import { 
  X, Share2, Copy, Check, Download, Sparkles, MessageCircle, 
  Facebook, Smartphone, Image as ImageIcon, Tag, ShieldCheck, 
  Truck, Flame, Gift, Sliders, Palette, RefreshCw, Upload, Eye,
  Bot, RotateCw, Video, Layers
} from 'lucide-react';

interface SocialShareModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
}

type CaptionTemplateType = 'hot_deal' | 'cod_delivery' | 'whatsapp_quick' | 'warranty_quality';

export const SocialShareModal: React.FC<SocialShareModalProps> = ({
  product,
  isOpen,
  onClose,
  user,
}) => {
  if (!isOpen || !product) return null;

  // Selected Image Index
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  
  // Customization Options
  const [sellingPrice, setSellingPrice] = useState<number>(product.retailPrice || product.resellerPrice + 200);
  const [originalPrice, setOriginalPrice] = useState<number>(Math.round((product.retailPrice || product.resellerPrice + 200) * 1.25));
  const [showPriceBadge, setShowPriceBadge] = useState<boolean>(true);
  const [badgeText, setBadgeText] = useState<string>('স্পেশাল অফার');
  const [badgeTheme, setBadgeTheme] = useState<'orange' | 'emerald' | 'blue' | 'dark' | 'gold'>('orange');
  const [badgePosition, setBadgePosition] = useState<'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'bottom-strip'>('top-right');
  
  // Branding & Watermark
  const [shopName, setShopName] = useState<string>(user.shopName || user.fullName || 'Sky Reseller');
  const [contactNumber, setContactNumber] = useState<string>(user.mobile || '');
  const [showWatermark, setShowWatermark] = useState<boolean>(true);
  const [showContactPill, setShowContactPill] = useState<boolean>(true);
  const [watermarkOpacity, setWatermarkOpacity] = useState<number>(85);
  const [customLogoUrl, setCustomLogoUrl] = useState<string | null>(null);

  // Copywriting Templates & Custom Text
  const [captionMode, setCaptionMode] = useState<'template' | 'ai'>('ai');
  const [activeTemplate, setActiveTemplate] = useState<CaptionTemplateType>('hot_deal');
  const [aiPlatform, setAiPlatform] = useState<AICopyPlatform>('facebook_post');
  const [aiTone, setAiTone] = useState<AICopyTone>('engaging');
  const [isGeneratingAI, setIsGeneratingAI] = useState<boolean>(false);
  const [customCaption, setCustomCaption] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'poster' | 'caption'>('poster');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  const images = product.images || [];
  const currentImageUrl = images[selectedImageIndex]?.url || '';

  // Trigger Gemini AI generation
  const handleGenerateAICopy = async (overridePlatform?: AICopyPlatform, overrideTone?: AICopyTone) => {
    setIsGeneratingAI(true);
    try {
      const result = await generateAICopy({
        productName: product.name,
        categoryName: product.categoryName || 'Gadget',
        sellingPrice,
        originalPrice,
        warranty: product.warranty || '',
        description: product.description || '',
        platform: overridePlatform || aiPlatform,
        tone: overrideTone || aiTone,
        shopName: shopName || 'Sky Reseller',
        contactNumber,
      });

      if (result.copy) {
        setCustomCaption(result.copy);
      }
    } catch (err) {
      console.error('Error generating AI copy:', err);
    } finally {
      setIsGeneratingAI(false);
    }
  };

  // Generate caption based on template
  const generateCaptionText = (tpl: CaptionTemplateType, price: number, origPrice: number, sName: string, phone: string) => {
    const profitSavings = origPrice > price ? origPrice - price : 0;
    const warrantyText = product.warranty ? `🛡️ ওয়ারেন্টি: ${product.warranty}` : '';
    const categoryName = product.categoryName || 'গ্যাজেট আইটেম';

    switch (tpl) {
      case 'hot_deal':
        return `🔥 ${product.name} - ধামাকা অফার! 🔥
━━━━━━━━━━━━━━━━━━━━
✨ প্রিমিয়াম কোয়ালিটির আসল পণ্য এখন পান সেরা মূল্যে!

🏷️ নিয়মিত মূল্য: ৳${origPrice}
💥 আজকের অফার মূল্য: মাত্র ৳${price} /- ${profitSavings > 0 ? `(৳${profitSavings} ছাড়!)` : ''}
${warrantyText ? warrantyText + '\n' : ''}📦 ক্যাটাগরি: ${categoryName}

${product.description ? `📝 বিবরণ ও ফিচার:\n${product.description.slice(0, 280)}...\n\n` : ''}🚚 সারা বাংলাদেশে ক্যাশ অন ডেলিভারি (হোম ডেলিভারি) সুবিধা!
🛡️ প্রোডাক্ট হাতে পেয়ে চেক করে পেমেন্ট করার সুযোগ।

📩 অর্ডার করতে এখনই ইনবক্স করুন অথবা যোগাযোগ করুন:
🏪 শপ: ${sName}
📞 মোবাইল / WhatsApp: ${phone || 'ইনবক্স করুন'}`;

      case 'cod_delivery':
        return `🚚 ক্যাশ অন ডেলিভারিতে অর্ডার করুন: ${product.name}
━━━━━━━━━━━━━━━━━━━━
⭐ ১০০% অথেনটিক এবং নির্ভরযোগ্য কোয়ালিটি!

💰 আকর্ষণীয় অফার প্রাইজ: ৳${price} টাকা
${warrantyText ? `✅ ${warrantyText}\n` : ''}📦 ডেলিভারি চার্জ ছাড়া কোনো অগ্রিম টাকা দেওয়ার ঝামেলা নেই!
🏠 প্রোডাক্ট আপনার ঠিকানায় পৌঁছানোর পর মূল্য পরিশোধ করবেন।

🛒 এখনই দ্রুত অর্ডার কনফার্ম করতে:
👉 আপনার নাম, মোবাইল নম্বর এবং সম্পূর্ণ ঠিকানা লিখে ইনবক্স করুন।
📞 ফোন/WhatsApp: ${phone} (${sName})`;

      case 'whatsapp_quick':
        return `আসসালামু আলাইকুম! 👋
আমাদের কাছে পাচ্ছেন *${product.name}*।
💰 স্পেশাল ডিসকাউন্ট প্রাইস: *৳${price}* (রেগুলার ৳${origPrice})
${warrantyText ? `🛡️ ${warrantyText}\n` : ''}🚚 ক্যাশ অন ডেলিভারি ব্যবস্থা রয়েছে।

অর্ডার করতে রিপ্লাই দিন অথবা কল করুন:
📞 *${phone}* (${sName})`;

      case 'warranty_quality':
        return `⭐ প্রিমিয়াম কোয়ালিটি নিশ্চিত: ${product.name} ⭐
━━━━━━━━━━━━━━━━━━━━
আপনার বিশ্বস্ত গ্যাজেট শপ "${sName}" নিয়ে এলো আসল ও জেনুইন প্রোডাক্ট।

💎 বিশেষ মূল্য: ৳${price} /-
${warrantyText ? `🛡️ অফিসিয়াল ওয়ারেন্টি সুবিধা: ${product.warranty}\n` : ''}⚡ ফাস্ট হোম ডেলিভারি ও নিরাপদ প্যাকেজিং।

📞 বিস্তারিত জানতে ও অর্ডার করতে যোগাযোগ করুন:
📱 WhatsApp/Call: ${phone}
🏪 শপ: ${sName}`;

      default:
        return '';
    }
  };

  // Update caption whenever parameters change
  useEffect(() => {
    const text = generateCaptionText(activeTemplate, sellingPrice, originalPrice, shopName, contactNumber);
    setCustomCaption(text);
  }, [activeTemplate, sellingPrice, originalPrice, shopName, contactNumber, product]);

  // Handle Logo Upload
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setCustomLogoUrl(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Safe helper to draw rounded rectangle across all browser canvas engines
  const drawRoundedRect = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
  ) => {
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(x, y, width, height, radius);
    } else {
      const r = Math.min(radius, width / 2, height / 2);
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + width - r, y);
      ctx.arcTo(x + width, y, x + width, y + r, r);
      ctx.lineTo(x + width, y + height - r);
      ctx.arcTo(x + width, y + height, x + width - r, y + height, r);
      ctx.lineTo(x + r, y + height);
      ctx.arcTo(x, y + height, x, y + height - r, r);
      ctx.lineTo(x, y + r);
      ctx.arcTo(x, y, x + r, y, r);
      ctx.closePath();
    }
  };

  // Render Poster to Canvas
  const renderCanvasPoster = async (): Promise<HTMLCanvasElement | null> => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Set High-Res Canvas Size (1080 x 1080)
    const size = 1080;
    canvas.width = size;
    canvas.height = size;

    // Background base
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);

    // 1. Draw Product Image
    if (currentImageUrl) {
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = () => {
            // Fallback for CORS: try without crossOrigin
            const fallbackImg = new Image();
            fallbackImg.onload = resolve;
            fallbackImg.onerror = reject;
            fallbackImg.src = currentImageUrl;
          };
          img.src = currentImageUrl;
        });

        // Fit & Center Image in 1080x1080
        const hRatio = size / img.width;
        const vRatio = size / img.height;
        const ratio = Math.max(hRatio, vRatio);
        const centerShiftX = (size - img.width * ratio) / 2;
        const centerShiftY = (size - img.height * ratio) / 2;
        ctx.drawImage(img, 0, 0, img.width, img.height, centerShiftX, centerShiftY, img.width * ratio, img.height * ratio);
      } catch (e) {
        console.warn('Could not draw remote image onto canvas:', e);
        ctx.fillStyle = '#f1f5f9';
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = '#64748b';
        ctx.font = 'bold 36px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(product.name, size / 2, size / 2);
      }
    } else {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, size, size);
    }

    // 2. Draw Subtle Top & Bottom Gradient Shadows for Legibility
    const gradBottom = ctx.createLinearGradient(0, size - 260, 0, size);
    gradBottom.addColorStop(0, 'rgba(15, 23, 42, 0)');
    gradBottom.addColorStop(1, 'rgba(15, 23, 42, 0.75)');
    ctx.fillStyle = gradBottom;
    ctx.fillRect(0, size - 260, size, 260);

    const gradTop = ctx.createLinearGradient(0, 0, 0, 180);
    gradTop.addColorStop(0, 'rgba(15, 23, 42, 0.6)');
    gradTop.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = gradTop;
    ctx.fillRect(0, 0, size, 180);

    // 3. Draw Watermark / Shop Logo / Shop Name
    if (showWatermark && (shopName || customLogoUrl)) {
      ctx.save();
      ctx.globalAlpha = watermarkOpacity / 100;

      if (customLogoUrl) {
        try {
          const logoImg = new Image();
          await new Promise((res) => {
            logoImg.onload = res;
            logoImg.src = customLogoUrl;
          });
          // Draw logo in Top-Left
          const logoW = 180;
          const logoH = (logoImg.height / logoImg.width) * logoW;
          ctx.drawImage(logoImg, 40, 40, logoW, logoH);
        } catch (err) {
          console.warn('Logo draw failed:', err);
        }
      } else if (shopName) {
        // Set font first to measure properly
        ctx.font = 'bold 26px Arial, sans-serif';
        const textWidth = ctx.measureText(`🏪 ${shopName}`).width;
        const boxWidth = Math.min(Math.max(textWidth + 60, 200), 500);

        // Draw elegant Shop Badge Header (Top-Left)
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        drawRoundedRect(ctx, 40, 40, boxWidth, 64, 32);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Shop Icon & Name
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.fillText(`🏪 ${shopName}`, 65, 82);
      }
      ctx.restore();
    }

    // 4. Draw Custom Price Badge
    if (showPriceBadge) {
      ctx.save();

      // Theme Colors
      let primaryColor = '#f57224'; // Orange default
      let secondaryColor = '#ea580c';

      if (badgeTheme === 'emerald') {
        primaryColor = '#059669';
        secondaryColor = '#047857';
      } else if (badgeTheme === 'blue') {
        primaryColor = '#2563eb';
        secondaryColor = '#1d4ed8';
      } else if (badgeTheme === 'dark') {
        primaryColor = '#0f172a';
        secondaryColor = '#1e293b';
      } else if (badgeTheme === 'gold') {
        primaryColor = '#d97706';
        secondaryColor = '#b45309';
      }

      if (badgePosition === 'bottom-strip') {
        // Full Width Bottom Banner
        ctx.fillStyle = primaryColor;
        ctx.fillRect(0, size - 140, size, 140);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 36px Arial, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(badgeText || 'SPECIAL OFFER', 40, size - 60);

        ctx.textAlign = 'right';
        ctx.font = 'bold 48px Arial, sans-serif';
        ctx.fillText(`৳${sellingPrice}`, size - 40, size - 60);

        if (originalPrice > sellingPrice) {
          ctx.font = '28px Arial, sans-serif';
          ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
          ctx.fillText(`৳${originalPrice}`, size - 40, size - 105);
        }
      } else {
        // Rounded Floating Badge Block
        let bx = size - 360;
        let by = 40;
        const bw = 320;
        const bh = 145;

        if (badgePosition === 'top-left') {
          bx = 40;
          by = 40;
        } else if (badgePosition === 'bottom-right') {
          bx = size - 360;
          by = size - 280;
        } else if (badgePosition === 'bottom-left') {
          bx = 40;
          by = size - 280;
        }

        // Shadow & Container
        ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
        ctx.shadowBlur = 24;
        ctx.shadowOffsetY = 8;

        const gradBadge = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
        gradBadge.addColorStop(0, primaryColor);
        gradBadge.addColorStop(1, secondaryColor);
        ctx.fillStyle = gradBadge;

        drawRoundedRect(ctx, bx, by, bw, bh, 24);
        ctx.fill();

        ctx.shadowColor = 'transparent';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Badge Top Label
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(badgeText || 'SPECIAL OFFER', bx + bw / 2, by + 40);

        // Price Text
        ctx.font = 'bold 46px Arial, sans-serif';
        ctx.fillText(`৳${sellingPrice}`, bx + bw / 2, by + 92);

        // Original Strikethrough Price
        if (originalPrice > sellingPrice) {
          ctx.font = 'bold 20px Arial, sans-serif';
          ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
          const strikeText = `৳${originalPrice}`;
          const strikeWidth = ctx.measureText(strikeText).width;
          const strikeX = bx + bw / 2;
          const strikeY = by + 125;
          ctx.fillText(strikeText, strikeX, strikeY);
          
          // Line through strike text
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(strikeX - strikeWidth / 2 - 4, strikeY - 7);
          ctx.lineTo(strikeX + strikeWidth / 2 + 4, strikeY - 7);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // 5. Draw Bottom Contact & Order Pill (Mobile / WhatsApp Hotline)
    if (showContactPill && contactNumber) {
      ctx.save();
      const pillW = 460;
      const pillH = 74;
      const px = 40;
      const py = size - 110;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      drawRoundedRect(ctx, px, py, pillW, pillH, 37);
      ctx.fill();

      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Green WhatsApp dot / phone symbol
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(px + 40, py + 37, 16, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 26px Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`📞 Order: ${contactNumber}`, px + 75, py + 46);

      ctx.restore();
    }

    // 6. Draw Warranty Badge if present
    if (product.warranty) {
      ctx.save();
      const wx = size - 260;
      const wy = size - 95;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      drawRoundedRect(ctx, wx, wy, 220, 52, 26);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 20px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`🛡️ ${product.warranty}`, wx + 110, wy + 34);
      ctx.restore();
    }

    return canvas;
  };

  // Re-render preview canvas whenever controls change
  useEffect(() => {
    const timer = setTimeout(async () => {
      const c = await renderCanvasPoster();
      if (c) {
        try {
          const dataUrl = c.toDataURL('image/png');
          setPreviewBlobUrl(dataUrl);
        } catch (e) {
          console.debug('DataURL export error:', e);
        }
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [
    selectedImageIndex,
    sellingPrice,
    originalPrice,
    showPriceBadge,
    badgeText,
    badgeTheme,
    badgePosition,
    shopName,
    contactNumber,
    showWatermark,
    showContactPill,
    watermarkOpacity,
    customLogoUrl,
    currentImageUrl
  ]);

  // Download Generated Poster PNG
  const handleDownloadPoster = async () => {
    setIsGeneratingImage(true);
    try {
      const canvas = await renderCanvasPoster();
      if (!canvas) throw new Error('Canvas render failed');

      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${product.name.replace(/[^a-zA-Z0-9]/g, '_')}_poster.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setIsGeneratingImage(false);
      }, 'image/png');
    } catch (err) {
      console.error('Download failed:', err);
      setIsGeneratingImage(false);
    }
  };

  // Download All Original Images
  const handleDownloadAllImages = () => {
    images.forEach((img, idx) => {
      const a = document.createElement('a');
      a.href = img.url;
      a.target = '_blank';
      a.download = `${product.name}_image_${idx + 1}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });
  };

  // Copy Caption to Clipboard
  const handleCopyCaption = () => {
    navigator.clipboard.writeText(customCaption);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // One-Click WhatsApp Share
  const handleShareWhatsApp = () => {
    const encodedText = encodeURIComponent(customCaption);
    const waUrl = `https://wa.me/?text=${encodedText}`;
    window.open(waUrl, '_blank');
  };

  // One-Click Facebook Share
  const handleShareFacebook = () => {
    handleCopyCaption();
    // Open Facebook post creator
    window.open('https://www.facebook.com/', '_blank');
  };

  // Universal Native Mobile Web Share (File + Text)
  const handleNativeShare = async () => {
    try {
      const canvas = await renderCanvasPoster();
      if (canvas && navigator.share) {
        canvas.toBlob(async (blob) => {
          if (blob && navigator.canShare && navigator.canShare({ files: [new File([blob], 'product.png', { type: 'image/png' })] })) {
            const file = new File([blob], `${product.name}.png`, { type: 'image/png' });
            await navigator.share({
              title: product.name,
              text: customCaption,
              files: [file],
            });
          } else {
            await navigator.share({
              title: product.name,
              text: customCaption,
            });
          }
        }, 'image/png');
      } else {
        handleCopyCaption();
      }
    } catch (e) {
      console.debug('Native share cancelled or failed:', e);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
      {/* Hidden Offscreen Canvas for HD Export */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <div className="relative w-full max-w-4xl max-h-[94vh] flex flex-col bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-auto">
        
        {/* Header */}
        <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/30">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-extrabold flex items-center gap-2">
                Social Share & Marketing Post Maker
                <span className="text-[10px] bg-orange-500/20 text-orange-400 border border-orange-500/30 px-2 py-0.5 rounded-full font-mono font-bold">
                  Asset Hub
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                এক ক্লিকে প্রাইজ ব্যাজ, শপের ওয়াটারমার্ক এবং ফেসবুক/হোয়াটসঅ্যাপ মার্কেটিং পোস্ট তৈরি করুন
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs on Mobile */}
        <div className="flex sm:hidden border-b border-slate-200 bg-slate-50 px-2">
          <button
            onClick={() => setActiveTab('poster')}
            className={`flex-1 py-3 text-xs font-bold border-b-2 flex items-center justify-center gap-1.5 ${
              activeTab === 'poster' ? 'border-orange-500 text-orange-600 bg-white' : 'border-transparent text-slate-500'
            }`}
          >
            <ImageIcon className="w-4 h-4" />
            <span>Poster Image</span>
          </button>
          <button
            onClick={() => setActiveTab('caption')}
            className={`flex-1 py-3 text-xs font-bold border-b-2 flex items-center justify-center gap-1.5 ${
              activeTab === 'caption' ? 'border-orange-500 text-orange-600 bg-white' : 'border-transparent text-slate-500'
            }`}
          >
            <MessageCircle className="w-4 h-4" />
            <span>Post Caption</span>
          </button>
        </div>

        {/* Content Body Grid */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* LEFT COLUMN: Poster Live Preview & Image Selector (5 Cols) */}
          <div className={`lg:col-span-5 space-y-4 ${activeTab === 'caption' ? 'hidden sm:block' : 'block'}`}>
            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                  <Eye className="w-4 h-4 text-orange-500" />
                  Live Poster Preview (1080p)
                </span>
                <span className="text-[10px] font-bold text-slate-400 bg-white border border-slate-200 px-2 py-0.5 rounded-md">
                  HD Ready
                </span>
              </div>

              {/* Poster Image Preview Box */}
              <div className="relative aspect-square w-full rounded-2xl bg-slate-900 overflow-hidden shadow-md border border-slate-200 flex items-center justify-center">
                {previewBlobUrl ? (
                  <img
                    src={previewBlobUrl}
                    alt="Poster Preview"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="text-slate-400 text-xs flex flex-col items-center gap-2">
                    <RefreshCw className="w-6 h-6 animate-spin text-orange-500" />
                    <span>Generating live poster...</span>
                  </div>
                )}
              </div>

              {/* Product Gallery Selectors */}
              {images.length > 1 && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-slate-600 block">Select Base Image:</span>
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
                    {images.map((img, idx) => (
                      <button
                        key={idx}
                        onClick={() => setSelectedImageIndex(idx)}
                        className={`w-14 h-14 rounded-xl border-2 overflow-hidden shrink-0 transition-all cursor-pointer ${
                          selectedImageIndex === idx
                            ? 'border-orange-500 ring-2 ring-orange-200 scale-102'
                            : 'border-slate-200 opacity-70 hover:opacity-100'
                        }`}
                      >
                        <img src={img.url} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick Image Download Actions */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={handleDownloadPoster}
                  disabled={isGeneratingImage}
                  className="py-2.5 px-3 bg-slate-900 hover:bg-slate-800 active:scale-95 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer"
                >
                  <Download className="w-4 h-4 text-orange-400" />
                  <span>{isGeneratingImage ? 'Exporting...' : 'Download Poster'}</span>
                </button>

                <button
                  onClick={handleDownloadAllImages}
                  className="py-2.5 px-3 bg-white hover:bg-slate-100 active:scale-95 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  title="Download all original high-res product photos"
                >
                  <ImageIcon className="w-4 h-4 text-blue-500" />
                  <span>Original Photos</span>
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Customization Controls & Post Copywriting (7 Cols) */}
          <div className={`lg:col-span-7 space-y-5 ${activeTab === 'poster' ? 'hidden sm:block' : 'block'}`}>
            
            {/* 1. PRICE & WATERMARK CONTROLS ACCORDION */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200/80 pb-2.5">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-blue-600" />
                  <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                    Poster Customizer (প্রাইজ ও ওয়াটারমার্ক)
                  </h3>
                </div>
              </div>

              {/* Price Settings Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Selling Price */}
                <div>
                  <label className="text-[11px] font-bold text-slate-700 flex items-center justify-between mb-1">
                    <span>আপনার বিক্রয় মূল্য (Selling Price)</span>
                    <span className="text-blue-600 font-extrabold font-mono">৳{sellingPrice}</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">৳</span>
                    <input
                      type="number"
                      value={sellingPrice}
                      onChange={(e) => setSellingPrice(Number(e.target.value) || 0)}
                      className="w-full pl-7 pr-3 py-2 text-xs font-bold bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    কেনা মূল্য: ৳{product.resellerPrice} | লাভ: ৳{sellingPrice - product.resellerPrice}
                  </span>
                </div>

                {/* Original Strikethrough Price */}
                <div>
                  <label className="text-[11px] font-bold text-slate-700 flex items-center justify-between mb-1">
                    <span>নিয়মিত মূল্য (Original / Cut Price)</span>
                    <span className="text-slate-400 line-through font-mono">৳{originalPrice}</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">৳</span>
                    <input
                      type="number"
                      value={originalPrice}
                      onChange={(e) => setOriginalPrice(Number(e.target.value) || 0)}
                      className="w-full pl-7 pr-3 py-2 text-xs font-medium bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Badge Text & Style */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-200/60">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    ব্যাজ হেডার টেক্সট
                  </label>
                  <input
                    type="text"
                    value={badgeText}
                    onChange={(e) => setBadgeText(e.target.value)}
                    placeholder="স্পেশাল অফার"
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    ব্যাজ কালার থিম
                  </label>
                  <div className="flex items-center gap-1.5 pt-0.5">
                    {[
                      { id: 'orange', bg: 'bg-orange-500' },
                      { id: 'emerald', bg: 'bg-emerald-600' },
                      { id: 'blue', bg: 'bg-blue-600' },
                      { id: 'dark', bg: 'bg-slate-900' },
                      { id: 'gold', bg: 'bg-amber-500' },
                    ].map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setBadgeTheme(t.id as any)}
                        className={`w-7 h-7 rounded-lg ${t.bg} transition-all cursor-pointer ${
                          badgeTheme === t.id ? 'ring-2 ring-offset-2 ring-slate-800 scale-110' : 'opacity-70 hover:opacity-100'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    ব্যাজের পজিশন
                  </label>
                  <select
                    value={badgePosition}
                    onChange={(e) => setBadgePosition(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none font-medium"
                  >
                    <option value="top-right">Top Right (উপরে ডানে)</option>
                    <option value="top-left">Top Left (উপরে বামে)</option>
                    <option value="bottom-right">Bottom Right (নিচে ডানে)</option>
                    <option value="bottom-left">Bottom Left (নিচে বামে)</option>
                    <option value="bottom-strip">Full Bottom Banner (নিচের স্ট্রিপ)</option>
                  </select>
                </div>
              </div>

              {/* Shop Branding & Contact Overlay */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200/60">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    শপের নাম / ওয়াটারমার্ক
                  </label>
                  <input
                    type="text"
                    value={shopName}
                    onChange={(e) => setShopName(e.target.value)}
                    placeholder="আপনার পেজ বা শপের নাম"
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    হোয়াটসঅ্যাপ / কন্টাক্ট নম্বর
                  </label>
                  <input
                    type="text"
                    value={contactNumber}
                    onChange={(e) => setContactNumber(e.target.value)}
                    placeholder="017XXXXXXXX"
                    className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                  />
                </div>
              </div>

              {/* Custom Logo Upload option */}
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    ref={logoInputRef}
                    onChange={handleLogoUpload}
                    accept="image/*"
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    className="text-[11px] font-bold text-slate-700 hover:text-blue-600 bg-white border border-slate-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5 text-blue-500" />
                    <span>{customLogoUrl ? 'Change Shop Logo' : 'Upload Custom Shop Logo PNG'}</span>
                  </button>

                  {customLogoUrl && (
                    <button
                      type="button"
                      onClick={() => setCustomLogoUrl(null)}
                      className="text-[10px] font-bold text-rose-500 hover:underline"
                    >
                      Remove Logo
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showPriceBadge}
                      onChange={(e) => setShowPriceBadge(e.target.checked)}
                      className="rounded text-orange-600 focus:ring-orange-500"
                    />
                    <span>Show Price</span>
                  </label>
                  <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showWatermark}
                      onChange={(e) => setShowWatermark(e.target.checked)}
                      className="rounded text-orange-600 focus:ring-orange-500"
                    />
                    <span>Show Shop Name</span>
                  </label>
                </div>
              </div>
            </div>

            {/* 2. MARKETING CAPTION GENERATOR */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                <div className="flex items-center gap-2">
                  <div className="flex items-center bg-slate-200 p-0.5 rounded-lg text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => setCaptionMode('ai')}
                      className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1 ${
                        captionMode === 'ai'
                          ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Sparkles className="w-3 h-3 text-amber-300" />
                      <span>🤖 Gemini AI Copy</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCaptionMode('template')}
                      className={`px-2.5 py-1 rounded-md transition-all ${
                        captionMode === 'template'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Presets
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {captionMode === 'ai' && (
                    <button
                      type="button"
                      onClick={() => handleGenerateAICopy()}
                      disabled={isGeneratingAI}
                      className="text-[11px] font-bold text-blue-600 hover:text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-all cursor-pointer"
                    >
                      <RotateCw className={`w-3 h-3 ${isGeneratingAI ? 'animate-spin' : ''}`} />
                      <span>{isGeneratingAI ? 'Generating...' : 'Re-generate'}</span>
                    </button>
                  )}

                  <button
                    onClick={handleCopyCaption}
                    className={`text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-xs ${
                      copied
                        ? 'bg-emerald-600 text-white'
                        : 'bg-orange-500 hover:bg-orange-600 text-white'
                    }`}
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied!' : 'Copy Caption'}</span>
                  </button>
                </div>
              </div>

              {captionMode === 'ai' ? (
                /* AI Controls */
                <div className="space-y-2.5 animate-in fade-in duration-150">
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                    {PLATFORM_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setAiPlatform(opt.id);
                          handleGenerateAICopy(opt.id);
                        }}
                        className={`text-[11px] font-bold px-2.5 py-1 rounded-lg shrink-0 transition-all border flex items-center gap-1 cursor-pointer ${
                          aiPlatform === opt.id
                            ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <span>{opt.icon}</span>
                        <span>{opt.label}</span>
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 text-[10px]">
                    <span className="text-slate-400 font-bold shrink-0">টোন:</span>
                    {TONE_OPTIONS.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setAiTone(t.id);
                          handleGenerateAICopy(undefined, t.id);
                        }}
                        className={`px-2 py-0.5 rounded-md font-bold shrink-0 transition-all ${
                          aiTone === t.id
                            ? 'bg-purple-100 text-purple-800 border border-purple-300'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                /* Caption Template Chips */
                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
                  {[
                    { id: 'hot_deal', label: '🔥 হট অফার পোস্ট', icon: Flame },
                    { id: 'cod_delivery', label: '🚚 ক্যাশ অন ডেলিভারি', icon: Truck },
                    { id: 'whatsapp_quick', label: '💬 হোয়াটসঅ্যাপ মেসেজ', icon: MessageCircle },
                    { id: 'warranty_quality', label: '🛡️ ওয়ারেন্টি ও কোয়ালিটি', icon: ShieldCheck },
                  ].map((tpl) => (
                    <button
                      key={tpl.id}
                      onClick={() => setActiveTemplate(tpl.id as any)}
                      className={`text-xs font-bold px-3 py-1.5 rounded-xl shrink-0 transition-all border cursor-pointer ${
                        activeTemplate === tpl.id
                          ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {tpl.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Editable Caption Textarea */}
              <div className="relative">
                <textarea
                  value={customCaption}
                  onChange={(e) => setCustomCaption(e.target.value)}
                  rows={6}
                  className="w-full p-3 text-xs bg-white border border-slate-300 rounded-xl font-normal leading-relaxed focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none resize-none"
                  placeholder="Write or customize your marketing post..."
                />
                {isGeneratingAI && (
                  <div className="absolute inset-0 bg-white/80 backdrop-blur-2xs rounded-xl flex items-center justify-center gap-2 text-xs font-bold text-blue-700">
                    <Sparkles className="w-4 h-4 animate-spin text-amber-500" />
                    <span>Gemini AI বাংলা ক্যাপশন তৈরি করছে...</span>
                  </div>
                )}
              </div>
            </div>

            {/* 3. DIRECT ONE-CLICK SOCIAL SHARE BAR */}
            <div className="space-y-2">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider block">
                Direct One-Click Share
              </span>
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {/* WhatsApp Share Button */}
                <button
                  onClick={handleShareWhatsApp}
                  className="py-3 px-3 bg-[#25D366] hover:bg-[#20bd5a] text-white text-xs font-extrabold rounded-xl shadow-md flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                >
                  <MessageCircle className="w-4 h-4 fill-white" />
                  <span>WhatsApp</span>
                </button>

                {/* Facebook Share Button */}
                <button
                  onClick={handleShareFacebook}
                  className="py-3 px-3 bg-[#1877F2] hover:bg-[#166fe5] text-white text-xs font-extrabold rounded-xl shadow-md flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                >
                  <Facebook className="w-4 h-4 fill-white" />
                  <span>Facebook</span>
                </button>

                {/* Universal Native Share */}
                <button
                  onClick={handleNativeShare}
                  className="py-3 px-3 bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold rounded-xl shadow-md flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                >
                  <Share2 className="w-4 h-4 text-orange-400" />
                  <span>More Share</span>
                </button>
              </div>
            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-100 border-t border-slate-200 flex items-center justify-between shrink-0">
          <p className="text-[11px] text-slate-500 font-medium hidden sm:block">
            💡 ছবি ডাউনলোড করে ফেসবুক পেজ, গ্রুপ বা হোয়াটসঅ্যাপ স্টোরিতে পোস্ট করুন।
          </p>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-colors ml-auto cursor-pointer"
          >
            Done / Close
          </button>
        </div>

      </div>
    </div>
  );
};
