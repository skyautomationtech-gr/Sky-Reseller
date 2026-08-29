import React, { useState, useEffect } from 'react';
import { Product, UserProfile } from '../../types';
import { 
  generateAICopy, 
  AICopyPlatform, 
  AICopyTone, 
  PLATFORM_OPTIONS, 
  TONE_OPTIONS 
} from '../../lib/aiMarketingService';
import { 
  Sparkles, Bot, Copy, Check, Share2, MessageCircle, 
  RotateCw, RefreshCw, Send, Sliders, Smartphone, Video, 
  Zap, ShoppingBag, X, FileText, ChevronRight, Hash,
  ArrowRight, ShieldCheck, Flame, Layers
} from 'lucide-react';

interface AIMarketingModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  initialProduct?: Product | null;
  product?: Product | null;
  allProducts?: Product[];
  onOpenSocialShare?: (product: Product, captionText?: string) => void;
}

export const AIMarketingModal: React.FC<AIMarketingModalProps> = ({
  isOpen,
  onClose,
  user,
  initialProduct,
  product,
  allProducts = [],
  onOpenSocialShare,
}) => {
  const effectiveProduct = initialProduct || product || null;
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(effectiveProduct);
  
  // Mobile Tab State
  const [activeMobileTab, setActiveMobileTab] = useState<'inputs' | 'output'>('inputs');

  // Form fields
  const [productName, setProductName] = useState<string>('');
  const [categoryName, setCategoryName] = useState<string>('');
  const [sellingPrice, setSellingPrice] = useState<number>(0);
  const [originalPrice, setOriginalPrice] = useState<number>(0);
  const [warranty, setWarranty] = useState<string>('');
  const [features, setFeatures] = useState<string>('');
  const [platform, setPlatform] = useState<AICopyPlatform>('facebook_post');
  const [tone, setTone] = useState<AICopyTone>('engaging');
  const [shopName, setShopName] = useState<string>(user.shopName || 'Sky Reseller Hub');
  const [contactNumber, setContactNumber] = useState<string>(user.mobile || '');
  const [customPrompt, setCustomPrompt] = useState<string>('');

  // AI Generation State
  const [loading, setLoading] = useState<boolean>(false);
  const [generatedCopy, setGeneratedCopy] = useState<string>('');
  const [hashtags, setHashtags] = useState<string>('');
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [generationCount, setGenerationCount] = useState<number>(0);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  // Sync initial product
  useEffect(() => {
    const prod = initialProduct || product || null;
    if (prod) {
      setSelectedProduct(prod);
      populateFromProduct(prod);
    } else if (allProducts.length > 0 && !selectedProduct) {
      setSelectedProduct(allProducts[0]);
      populateFromProduct(allProducts[0]);
    }
  }, [initialProduct, product, allProducts]);

  const populateFromProduct = (prod: Product) => {
    setProductName(prod.name || '');
    setCategoryName(prod.categoryName || 'Gadgets');
    setSellingPrice(prod.retailPrice || 0);
    setOriginalPrice(Math.round((prod.retailPrice || 1000) * 1.3));
    setWarranty(prod.warranty || '6 Months Warranty');
    setFeatures(prod.description ? prod.description.slice(0, 180) : '');
  };

  const handleProductSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const prodId = e.target.value;
    const found = allProducts.find((p) => p.id === prodId);
    if (found) {
      setSelectedProduct(found);
      populateFromProduct(found);
    }
  };

  const handleGenerate = async (overrideTone?: AICopyTone, overridePlatform?: AICopyPlatform) => {
    if (!productName.trim()) {
      alert('অনুগ্রহ করে প্রোডাক্টের নাম প্রদান করুন।');
      return;
    }

    const currentTone = overrideTone || tone;
    const currentPlatform = overridePlatform || platform;

    setLoading(true);
    setIsCopied(false);
    // On mobile, switch automatically to output tab when generating
    setActiveMobileTab('output');

    try {
      const result = await generateAICopy({
        productName,
        categoryName,
        sellingPrice,
        originalPrice,
        warranty,
        features,
        platform: currentPlatform,
        tone: currentTone,
        shopName: shopName || user.shopName || 'Sky Reseller',
        contactNumber,
        customPrompt,
      });

      if (result.copy) {
        setGeneratedCopy(result.copy);
        setHashtags(result.hashtags || '');
        setGenerationCount((c) => c + 1);
      }
    } catch (err) {
      console.error('Error generating copy:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!generatedCopy) return;
    navigator.clipboard.writeText(generatedCopy);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);
  };

  const handleWhatsAppShare = () => {
    if (!generatedCopy) return;
    const encoded = encodeURIComponent(generatedCopy);
    window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
  };

  const handleFacebookShare = () => {
    handleCopy();
    window.open('https://www.facebook.com', '_blank');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/75 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 shadow-2xl max-w-4xl w-full max-h-[94vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 my-auto">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-800 text-white p-3.5 sm:p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center text-amber-300 shadow-inner shrink-0">
              <Bot className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <h2 className="text-sm sm:text-lg font-extrabold text-white truncate">
                  AI Marketing Assistant (বাংলা কপিরাইটার)
                </h2>
                <span className="text-[9px] sm:text-[10px] font-extrabold bg-amber-400 text-slate-950 px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 shrink-0">
                  <Sparkles className="w-3 h-3 fill-slate-950" /> SAT AI
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-blue-100/90 mt-0.5 truncate">
                ফেসবুক পেজ, টিকটক স্ক্রিপ্ট ও হোয়াটসঅ্যাপের জন্য ১-ক্লিকে বাংলা পোস্ট ক্যাপশন
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-white flex items-center justify-center transition-all cursor-pointer shrink-0 ml-2"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mobile View Tab Switcher */}
        <div className="flex sm:hidden border-b border-slate-200 bg-slate-50 px-2 shrink-0">
          <button
            onClick={() => setActiveMobileTab('inputs')}
            className={`flex-1 py-2.5 text-xs font-bold border-b-2 flex items-center justify-center gap-1.5 transition-colors ${
              activeMobileTab === 'inputs' ? 'border-blue-600 text-blue-600 bg-white' : 'border-transparent text-slate-500'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>১. তথ্য প্রদান (Inputs)</span>
          </button>
          <button
            onClick={() => setActiveMobileTab('output')}
            className={`flex-1 py-2.5 text-xs font-bold border-b-2 flex items-center justify-center gap-1.5 transition-colors relative ${
              activeMobileTab === 'output' ? 'border-blue-600 text-blue-600 bg-white' : 'border-transparent text-slate-500'
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span>২. AI পোস্ট কপি (Output)</span>
            {generatedCopy && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 absolute top-2 right-4" />
            )}
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-y-auto divide-y lg:divide-y-0 lg:divide-x divide-slate-200 min-h-0">
          
          {/* LEFT COLUMN: Controls & Product Info (5 cols) */}
          <div className={`lg:col-span-5 p-3.5 sm:p-5 space-y-3.5 bg-slate-50/70 overflow-y-auto ${
            activeMobileTab === 'output' ? 'hidden sm:block' : 'block'
          }`}>
            
            {/* Product Selector / Quick Pick */}
            {allProducts.length > 0 && (
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                  Select Product from Inventory
                </label>
                <select
                  value={selectedProduct?.id || ''}
                  onChange={handleProductSelect}
                  className="w-full text-xs font-semibold bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-slate-800 shadow-2xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="">-- Custom Product Input --</option>
                  {allProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (৳{p.retailPrice})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Product Name & Category */}
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Product Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="e.g. T900 Ultra Smartwatch"
                  className="w-full text-xs font-semibold bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-slate-800 shadow-2xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Selling Price (৳)
                  </label>
                  <input
                    type="number"
                    value={sellingPrice}
                    onChange={(e) => setSellingPrice(parseFloat(e.target.value) || 0)}
                    placeholder="990"
                    className="w-full text-xs font-bold bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-slate-800 shadow-2xs focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Regular Price (৳)
                  </label>
                  <input
                    type="number"
                    value={originalPrice}
                    onChange={(e) => setOriginalPrice(parseFloat(e.target.value) || 0)}
                    placeholder="1450"
                    className="w-full text-xs font-semibold bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-slate-800 shadow-2xs focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Platform Selection */}
            <div className="space-y-1.5 pt-1">
              <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                Target Platform / Format
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {PLATFORM_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setPlatform(opt.id)}
                    className={`p-2 sm:p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between cursor-pointer min-h-[52px] ${
                      platform === opt.id
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs ring-2 ring-blue-600/30'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100/80'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">{opt.icon}</span>
                      <span className="text-[11px] font-bold leading-tight truncate">{opt.label}</span>
                    </div>
                    <span className={`text-[9px] mt-1 leading-tight truncate ${
                      platform === opt.id ? 'text-blue-100' : 'text-slate-400'
                    }`}>
                      {opt.subLabel}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Tone Selector */}
            <div className="space-y-1.5 pt-1">
              <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                Post Tone / Style
              </label>
              <div className="flex flex-wrap gap-1.5">
                {TONE_OPTIONS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTone(t.id)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      tone === t.id
                        ? 'bg-purple-700 text-white shadow-xs'
                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                    title={t.desc}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Advanced Options Toggle */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-[11px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer py-1"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>{showAdvanced ? 'Hide Custom Details' : '+ Add Custom Shop & Contact Info'}</span>
              </button>

              {showAdvanced && (
                <div className="mt-2 p-3 bg-white rounded-xl border border-slate-200 space-y-2.5 animate-in fade-in duration-150">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Shop Name</label>
                      <input
                        type="text"
                        value={shopName}
                        onChange={(e) => setShopName(e.target.value)}
                        placeholder="My Gadget Shop"
                        className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Contact / WhatsApp</label>
                      <input
                        type="text"
                        value={contactNumber}
                        onChange={(e) => setContactNumber(e.target.value)}
                        placeholder="017XXXXXXXX"
                        className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Warranty / Special Note</label>
                    <input
                      type="text"
                      value={warranty}
                      onChange={(e) => setWarranty(e.target.value)}
                      placeholder="e.g. 6 Months Warranty, Free Delivery"
                      className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Custom Prompt Instruction</label>
                    <input
                      type="text"
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                      placeholder="e.g. Eid Mega Sale, Free Gift with order"
                      className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Generate Action Button */}
            <button
              onClick={() => handleGenerate()}
              disabled={loading || !productName.trim()}
              className="w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-extrabold text-xs sm:text-sm py-3 px-4 rounded-xl shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-amber-300" />
                  <span>Generating AI Marketing Copy...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>১-ক্লিকে বাংলা পোস্ট তৈরি করুন</span>
                </>
              )}
            </button>

          </div>

          {/* RIGHT COLUMN: Live Output & Action Hub (7 cols) */}
          <div className={`lg:col-span-7 p-3.5 sm:p-5 flex flex-col justify-between space-y-3.5 bg-white overflow-y-auto ${
            activeMobileTab === 'inputs' ? 'hidden sm:flex' : 'flex'
          }`}>
            
            {/* Output Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Generated Social Media Copy
                </h3>
              </div>

              {generatedCopy && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleGenerate()}
                    disabled={loading}
                    className="text-[11px] font-bold text-slate-500 hover:text-blue-600 flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                    title="Regenerate another version"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    <span>Regenerate</span>
                  </button>
                  
                  <span className="text-[10px] font-mono text-slate-400">
                    {generatedCopy.length} chars
                  </span>
                </div>
              )}
            </div>

            {/* Output Display Area */}
            <div className="flex-1 min-h-[260px] sm:min-h-[340px] flex flex-col">
              {loading ? (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-3 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-purple-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/20 animate-bounce">
                    <Sparkles className="w-6 h-6 text-amber-300" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-slate-800">SAT AI লিখছে...</h4>
                    <p className="text-xs text-slate-500 max-w-xs">
                      আপনার পণ্যের জন্য আকর্ষণীয় হুক, বাংলা সেলস বুলেট ও হ্যাশট্যাগ তৈরি করা হচ্ছে।
                    </p>
                  </div>
                </div>
              ) : generatedCopy ? (
                <div className="flex-1 flex flex-col space-y-3">
                  <textarea
                    value={generatedCopy}
                    onChange={(e) => setGeneratedCopy(e.target.value)}
                    className="flex-1 w-full p-3.5 text-xs sm:text-sm font-medium text-slate-800 bg-slate-50/70 border border-slate-200 rounded-2xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none leading-relaxed resize-none shadow-inner min-h-[220px]"
                    rows={10}
                  />

                  {/* Preset quick tone chips */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[10px] scrollbar-thin">
                    <span className="text-slate-400 font-bold shrink-0">Variations:</span>
                    <button
                      onClick={() => handleGenerate('urgent', 'urgency_flash_sale')}
                      className="px-2 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-md font-bold whitespace-nowrap hover:bg-amber-100"
                    >
                      ⚡ ফ্ল্যাশ সেল
                    </button>
                    <button
                      onClick={() => handleGenerate('engaging', 'tiktok_script')}
                      className="px-2 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-md font-bold whitespace-nowrap hover:bg-indigo-100"
                    >
                      🎬 টিকটক স্ক্রিপ্ট
                    </button>
                    <button
                      onClick={() => handleGenerate('trust_premium', 'facebook_post')}
                      className="px-2 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-md font-bold whitespace-nowrap hover:bg-purple-100"
                    >
                      💎 প্রিমিয়াম ট্রাস্ট
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-3 bg-slate-50 rounded-2xl border border-slate-200">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                    <Sparkles className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-slate-800">কোন কপি তৈরি হয়নি</h4>
                    <p className="text-xs text-slate-500 max-w-sm">
                      ইনপুট ট্যাবে প্রোডাক্টের তথ্য চেক করে <span className="font-semibold text-blue-600">"১-ক্লিকে বাংলা পোস্ট তৈরি করুন"</span> বাটনে ক্লিক করুন।
                    </p>
                  </div>
                  <button
                    onClick={() => handleGenerate()}
                    className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md shadow-blue-600/20 cursor-pointer active:scale-95 transition-transform"
                  >
                    Generate Sample Copy →
                  </button>
                </div>
              )}
            </div>

            {/* Quick Action Footer */}
            {generatedCopy && (
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  
                  {/* Copy Button */}
                  <button
                    onClick={handleCopy}
                    className={`px-3 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer select-none active:scale-95 ${
                      isCopied
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-900 hover:bg-slate-800 text-white'
                    }`}
                  >
                    {isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>{isCopied ? 'কপি হয়েছে!' : 'Copy Text'}</span>
                  </button>

                  {/* WhatsApp Share */}
                  <button
                    onClick={handleWhatsAppShare}
                    className="px-3 py-2.5 rounded-xl font-bold text-xs bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer select-none"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>WhatsApp</span>
                  </button>

                  {/* Facebook Share */}
                  <button
                    onClick={handleFacebookShare}
                    className="px-3 py-2.5 rounded-xl font-bold text-xs bg-blue-600 hover:bg-blue-700 active:scale-95 text-white flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer select-none"
                  >
                    <Share2 className="w-4 h-4" />
                    <span>Facebook</span>
                  </button>

                  {/* Apply to Poster Maker */}
                  {selectedProduct && onOpenSocialShare && (
                    <button
                      onClick={() => {
                        onClose();
                        onOpenSocialShare(selectedProduct, generatedCopy);
                      }}
                      className="px-3 py-2.5 rounded-xl font-bold text-xs bg-purple-600 hover:bg-purple-700 active:scale-95 text-white flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer select-none col-span-2 sm:col-span-1"
                    >
                      <Layers className="w-4 h-4" />
                      <span>Poster Maker</span>
                    </button>
                  )}
                </div>
              </div>
            )}

          </div>

        </div>

      </div>
    </div>
  );
};

