import React, { useState, useEffect, useRef } from 'react';
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Order, UserProfile } from '../../types';
import { QRCodeSVG } from 'qrcode.react';
import { SkyLogo } from '../common/SkyLogo';
import { 
  Download, Printer, X, Loader2, FileText, CheckCircle2, Store, 
  Upload, Image as ImageIcon, Sliders, Palette, Share2, Copy, Check, 
  MessageCircle, Phone, MapPin, Sparkles, ShieldCheck, RefreshCw, 
  ChevronDown, ChevronUp, Edit3, Sparkle, Receipt, Building2, User
} from 'lucide-react';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';

interface InvoiceModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  currentUser?: UserProfile | null;
  onInvoiceGenerated?: (updatedOrder: Order) => void;
}

type InvoiceTemplateMode = 'reseller_memo' | 'official_invoice';
type ThemeColor = 'navy' | 'emerald' | 'violet' | 'crimson' | 'monochrome';

const THEME_STYLES: Record<ThemeColor, {
  name: string;
  primary: string;
  badgeBg: string;
  badgeText: string;
  headerBorder: string;
  tableHeaderBg: string;
  accentText: string;
  dueBoxBg: string;
  dueBoxBorder: string;
  dueTextColor: string;
}> = {
  navy: {
    name: 'Royal Navy',
    primary: 'bg-slate-900',
    badgeBg: 'bg-slate-900',
    badgeText: 'text-white',
    headerBorder: 'border-slate-900',
    tableHeaderBg: 'bg-slate-100 text-slate-800',
    accentText: 'text-blue-600',
    dueBoxBg: 'bg-blue-50/80',
    dueBoxBorder: 'border-blue-200',
    dueTextColor: 'text-blue-900',
  },
  emerald: {
    name: 'Emerald Green',
    primary: 'bg-emerald-900',
    badgeBg: 'bg-emerald-800',
    badgeText: 'text-white',
    headerBorder: 'border-emerald-800',
    tableHeaderBg: 'bg-emerald-50 text-emerald-900',
    accentText: 'text-emerald-700',
    dueBoxBg: 'bg-emerald-50/80',
    dueBoxBorder: 'border-emerald-200',
    dueTextColor: 'text-emerald-950',
  },
  violet: {
    name: 'Luxury Violet',
    primary: 'bg-purple-950',
    badgeBg: 'bg-purple-900',
    badgeText: 'text-white',
    headerBorder: 'border-purple-900',
    tableHeaderBg: 'bg-purple-50 text-purple-950',
    accentText: 'text-purple-700',
    dueBoxBg: 'bg-purple-50/80',
    dueBoxBorder: 'border-purple-200',
    dueTextColor: 'text-purple-950',
  },
  crimson: {
    name: 'Crimson Rose',
    primary: 'bg-rose-950',
    badgeBg: 'bg-rose-900',
    badgeText: 'text-white',
    headerBorder: 'border-rose-900',
    tableHeaderBg: 'bg-rose-50 text-rose-950',
    accentText: 'text-rose-700',
    dueBoxBg: 'bg-rose-50/80',
    dueBoxBorder: 'border-rose-200',
    dueTextColor: 'text-rose-950',
  },
  monochrome: {
    name: 'Minimal Dark',
    primary: 'bg-zinc-900',
    badgeBg: 'bg-zinc-900',
    badgeText: 'text-white',
    headerBorder: 'border-zinc-900',
    tableHeaderBg: 'bg-zinc-100 text-zinc-900',
    accentText: 'text-zinc-800',
    dueBoxBg: 'bg-zinc-100',
    dueBoxBorder: 'border-zinc-300',
    dueTextColor: 'text-zinc-950',
  },
};

export const InvoiceModal: React.FC<InvoiceModalProps> = ({
  order,
  isOpen,
  onClose,
  currentUser,
  onInvoiceGenerated,
}) => {
  const [invoiceNumber, setInvoiceNumber] = useState<string>('');
  const [invoiceDate, setInvoiceDate] = useState<string>('');
  const [invoiceTime, setInvoiceTime] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [downloadingPdf, setDownloadingPdf] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [copiedMemo, setCopiedMemo] = useState<boolean>(false);

  // Template and Customization States
  const [templateMode, setTemplateMode] = useState<InvoiceTemplateMode>('reseller_memo');
  const [themeColor, setThemeColor] = useState<ThemeColor>('navy');
  const [showSettingsDrawer, setShowSettingsDrawer] = useState<boolean>(false);

  // Reseller Shop Editable Brand Info
  const [shopName, setShopName] = useState<string>('');
  const [shopTagline, setShopTagline] = useState<string>('আপনার বিশ্বস্ত অনলাইন শপিং পার্টনার');
  const [shopLogoUrl, setShopLogoUrl] = useState<string>('');
  const [shopPhone, setShopPhone] = useState<string>('');
  const [shopEmail, setShopEmail] = useState<string>('');
  const [shopAddress, setShopAddress] = useState<string>('');
  const [shopWhatsApp, setShopWhatsApp] = useState<string>('');

  // Editable Financials
  const [unitSellingPrice, setUnitSellingPrice] = useState<number>(0);
  const [quantity, setQuantity] = useState<number>(1);
  const [deliveryCharge, setDeliveryCharge] = useState<number>(0);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [advancePaid, setAdvancePaid] = useState<number>(0);
  const [customNote, setCustomNote] = useState<string>(
    'পণ্য গ্রহণের সময় ডেলিভারি ম্যানের সামনে চেক করে গ্রহণ করুন। কোনো সমস্যা হলে সাথে সাথে আমাদের সাথে যোগাযোগ করুন। ধন্যবাদ!'
  );
  const [showSealStamp, setShowSealStamp] = useState<boolean>(true);

  const printRef = useRef<HTMLDivElement | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  // Initialize and load default information
  useEffect(() => {
    if (isOpen && order) {
      initInvoice();
    }
  }, [isOpen, order?.id]);

  const initInvoice = async () => {
    if (!order) return;
    setLoading(true);
    setError('');

    // Default Reseller Info
    const initialShopName = currentUser?.shopName || order.resellerShopName || 'Reseller Shop';
    const initialPhone = currentUser?.mobile || '';
    const initialEmail = currentUser?.email || '';
    const initialAddress = currentUser?.address 
      ? `${currentUser.address}, ${currentUser.upazila || ''}, ${currentUser.district || ''}`.replace(/^,\s*|,\s*$/g, '') 
      : 'Dhaka, Bangladesh';
    const initialLogo = currentUser?.shopPhotoUrl || currentUser?.profilePhotoUrl || '';

    setShopName(initialShopName);
    setShopPhone(initialPhone);
    setShopEmail(initialEmail);
    setShopAddress(initialAddress);
    setShopLogoUrl(initialLogo);
    setShopWhatsApp(initialPhone);

    // Initial Pricing Setup
    const calculatedUnitPrice = order.sellingPrice !== undefined && order.sellingPrice > 0
      ? order.sellingPrice
      : (order.unitRetailPrice || (order.totalAmount / (order.quantity || 1)));
    
    setUnitSellingPrice(calculatedUnitPrice);
    setQuantity(order.quantity || 1);
    setDeliveryCharge(order.deliveryCost !== undefined ? order.deliveryCost : 0);
    setDiscountAmount(0);
    setAdvancePaid(order.paymentStatus === 'paid' ? order.totalAmount : 0);

    // Set default mode: If super admin viewing, maybe official, but resellers always default to custom memo
    if (currentUser?.role === 'reseller') {
      setTemplateMode('reseller_memo');
    } else {
      setTemplateMode('reseller_memo');
    }

    try {
      if (order.invoiceNumber) {
        setInvoiceNumber(order.invoiceNumber);
        const dateObj = order.invoiceGeneratedAt?.toDate
          ? order.invoiceGeneratedAt.toDate()
          : new Date(order.invoiceGeneratedAt || order.createdAt || Date.now());
        setInvoiceDate(dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }));
        setInvoiceTime(dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
        setLoading(false);
      } else {
        // Auto-generate incrementing Memo / Invoice Number using Firestore transaction
        let newInvNumber = '';
        await runTransaction(db, async (transaction) => {
          const counterRef = doc(db, 'counters', 'invoiceCounter');
          const counterSnap = await transaction.get(counterRef);

          let currentCount = 0;
          if (counterSnap.exists()) {
            currentCount = counterSnap.data().lastNumber || 0;
          }

          const nextCount = currentCount + 1;
          newInvNumber = `MEMO-${String(nextCount).padStart(6, '0')}`;

          transaction.set(counterRef, { lastNumber: nextCount }, { merge: true });

          const orderRef = doc(db, 'orders', order.id);
          transaction.update(orderRef, {
            invoiceNumber: newInvNumber,
            invoiceGeneratedAt: serverTimestamp(),
          });
        });

        const now = new Date();
        const todayStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

        setInvoiceNumber(newInvNumber);
        setInvoiceDate(todayStr);
        setInvoiceTime(timeStr);

        const updated = {
          ...order,
          invoiceNumber: newInvNumber,
          invoiceGeneratedAt: new Date(),
        };
        if (onInvoiceGenerated) {
          onInvoiceGenerated(updated);
        }
        setLoading(false);
      }
    } catch (err: any) {
      console.error('Error generating invoice:', err);
      // Fallback local memo id if offline/transient failure
      const fallbackId = `MEMO-${Math.floor(100000 + Math.random() * 900000)}`;
      setInvoiceNumber(fallbackId);
      setInvoiceDate(new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }));
      setInvoiceTime(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
      setLoading(false);
    }
  };

  // Logo file upload & conversion to Base64 (to avoid CORS canvas issues)
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      if (typeof event.target?.result === 'string') {
        setShopLogoUrl(event.target.result);
      }
    };
    reader.readAsDataURL(file);
  };

  // Calculations
  const itemSubtotal = (unitSellingPrice || 0) * (quantity || 1);
  const totalPayable = Math.max(0, itemSubtotal + (Number(deliveryCharge) || 0) - (Number(discountAmount) || 0));
  const dueCODAmount = Math.max(0, totalPayable - (Number(advancePaid) || 0));

  // PDF Generator using html2canvas and jsPDF
  const handleDownloadPDF = async () => {
    if (!printRef.current) return;
    setDownloadingPdf(true);

    try {
      const element = printRef.current;
      
      // Render canvas at 2x resolution for ultra-sharp typography
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: 1024,
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      const imgWidth = pdfWidth - 16; // 8mm margins
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      pdf.addImage(imgData, 'JPEG', 8, 8, imgWidth, Math.min(imgHeight, pdfHeight - 16));
      
      const fileName = `${shopName.replace(/\s+/g, '_')}_${invoiceNumber || order?.orderNumber || 'Cash_Memo'}.pdf`;
      pdf.save(fileName);
    } catch (err) {
      console.error('Error generating PDF:', err);
      alert('PDF generation failed. Please try the Print option.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Direct Print
  const handlePrint = () => {
    window.print();
  };

  // WhatsApp Share Message
  const handleShareWhatsApp = () => {
    if (!order) return;
    const cleanPhone = order.customerPhone.replace(/[^0-9]/g, '');
    const formattedPhone = cleanPhone.startsWith('88') ? cleanPhone : `88${cleanPhone}`;

    const text = `🛍️ *${shopName || 'আমাদের শপ'}* থেকে আপনার ক্যাশ মেমো:\n\n` +
      `📋 *মেমো নং:* ${invoiceNumber}\n` +
      `📦 *অর্ডার আইডি:* ${order.orderNumber}\n` +
      `👤 *গ্রাহক:* ${order.customerName}\n` +
      `📱 *মোবাইল:* ${order.customerPhone}\n` +
      `📍 *ঠিকানা:* ${order.customerAddress}\n\n` +
      `🛒 *পণ্য:* ${order.productName} ${order.variantColorName ? `(${order.variantColorName})` : ''}\n` +
      `🔢 *পরিমাণ:* ${quantity} টি\n` +
      `💵 *পণ্যের মূল্য:* ৳${itemSubtotal}\n` +
      (deliveryCharge > 0 ? `🚚 *ডেলিভারি চার্জ:* ৳${deliveryCharge}\n` : '') +
      (discountAmount > 0 ? `🎁 *ডিসকাউন্ট:* -৳${discountAmount}\n` : '') +
      `💰 *সর্বমোট বিল:* ৳${totalPayable}\n` +
      (advancePaid > 0 ? `✅ *অগ্রিম পরিশোধ:* ৳${advancePaid}\n` : '') +
      `🏷️ *ক্যাশ অন ডেলিভারি (বাকি):* ৳${dueCODAmount}\n\n` +
      `📞 *শপ হেল্পলাইন:* ${shopPhone || 'আমাদের ইনবক্স'}\n` +
      `🙏 ${customNote}`;

    const url = `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  // Copy Memo Text
  const handleCopyMemoText = () => {
    if (!order) return;
    const text = `🛍️ ${shopName}\n` +
      `মেমো নং: ${invoiceNumber}\n` +
      `তারিখ: ${invoiceDate}\n` +
      `গ্রাহক: ${order.customerName} (${order.customerPhone})\n` +
      `ঠিকানা: ${order.customerAddress}\n\n` +
      `পণ্য: ${order.productName} ${order.variantColorName ? `(${order.variantColorName})` : ''} x ${quantity}\n` +
      `মূল্য: ৳${itemSubtotal}\n` +
      `ডেলিভারি চার্জ: ৳${deliveryCharge}\n` +
      `সর্বমোট বিল: ৳${totalPayable}\n` +
      `ক্যাশ অন ডেলিভারি: ৳${dueCODAmount}\n\n` +
      `শপ যোগাযোগ: ${shopPhone}`;

    navigator.clipboard.writeText(text);
    setCopiedMemo(true);
    setTimeout(() => setCopiedMemo(false), 2500);
  };

  if (!isOpen || !order) return null;

  const currentTheme = THEME_STYLES[themeColor];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-xs overflow-y-auto print:p-0 print:bg-white print:static print:z-auto">
      <div className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-auto flex flex-col max-h-[96vh] print:max-h-none print:shadow-none print:border-none print:rounded-none">
        
        {/* Top App Bar (Hidden in Print) */}
        <div className="flex flex-wrap items-center justify-between px-4 sm:px-6 py-3 bg-slate-900 text-white gap-3 shrink-0 print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-500/20 rounded-xl border border-blue-400/30 text-blue-400">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base flex items-center gap-2">
                <span>কাস্টমার ক্যাশ মেমো ও ইনভয়েস জেনারেটর</span>
                <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full border border-blue-400/30">
                  Custom Brand
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                রিসেলার শপ ব্র্যান্ডিং ও কাস্টমাইজড বিলিং সহ PDF ডাউনলোড ও প্রিন্ট
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center flex-wrap gap-2">
            {/* Customization Toggle */}
            <button
              onClick={() => setShowSettingsDrawer(!showSettingsDrawer)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-all border cursor-pointer ${
                showSettingsDrawer 
                  ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-sm' 
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
              }`}
              title="Customize Shop & Invoice"
            >
              <Sliders className="w-4 h-4" />
              <span>{showSettingsDrawer ? 'প্যানেল লুকান' : 'কাস্টমাইজ করুন'}</span>
            </button>

            {/* Share WhatsApp */}
            <button
              onClick={handleShareWhatsApp}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-colors shadow-sm cursor-pointer"
              title="Send via WhatsApp to Customer"
            >
              <MessageCircle className="w-4 h-4" />
              <span className="hidden sm:inline">WhatsApp</span>
            </button>

            {/* Print Button */}
            <button
              onClick={handlePrint}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-colors border border-slate-700 cursor-pointer"
              title="Print Cash Memo"
            >
              <Printer className="w-4 h-4 text-blue-400" />
              <span className="hidden sm:inline">Print</span>
            </button>

            {/* Download PDF Button */}
            <button
              onClick={handleDownloadPDF}
              disabled={loading || downloadingPdf}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-extrabold rounded-xl transition-all shadow-md shadow-blue-500/20 cursor-pointer"
              title="Download PDF"
            >
              {downloadingPdf ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span>PDF ডাউনলোড</span>
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors ml-1 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Quick Toolbar (Mode & Themes) - Print Hidden */}
        <div className="flex flex-wrap items-center justify-between px-4 sm:px-6 py-2.5 bg-slate-100 border-b border-slate-200 gap-2 shrink-0 print:hidden text-xs">
          {/* Template Mode Tabs */}
          <div className="flex items-center bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
            <button
              onClick={() => setTemplateMode('reseller_memo')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                templateMode === 'reseller_memo'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Store className="w-3.5 h-3.5" />
              <span>রিসেলার শপ ক্যাশ মেমো</span>
            </button>
            <button
              onClick={() => setTemplateMode('official_invoice')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                templateMode === 'official_invoice'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>অফিসিয়াল Sky Tech ইনভয়েস</span>
            </button>
          </div>

          {/* Color Themes */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
              <Palette className="w-3.5 h-3.5 text-slate-400" />
              <span>কালার থিম:</span>
            </span>
            <div className="flex items-center gap-1.5">
              {(Object.keys(THEME_STYLES) as ThemeColor[]).map((themeKey) => (
                <button
                  key={themeKey}
                  onClick={() => setThemeColor(themeKey)}
                  className={`w-6 h-6 rounded-full border-2 transition-all cursor-pointer ${
                    themeColor === themeKey
                      ? 'border-blue-600 scale-110 shadow-xs ring-2 ring-blue-400/30'
                      : 'border-transparent hover:scale-105 opacity-80 hover:opacity-100'
                  }`}
                  style={{
                    backgroundColor:
                      themeKey === 'navy'
                        ? '#0f172a'
                        : themeKey === 'emerald'
                        ? '#059669'
                        : themeKey === 'violet'
                        ? '#7c3aed'
                        : themeKey === 'crimson'
                        ? '#e11d48'
                        : '#27272a',
                  }}
                  title={THEME_STYLES[themeKey].name}
                />
              ))}
            </div>

            {/* Copy Memo Button */}
            <button
              onClick={handleCopyMemoText}
              className="ml-2 flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 font-bold rounded-lg border border-slate-200 shadow-2xs transition-colors cursor-pointer"
              title="Copy text memo"
            >
              {copiedMemo ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedMemo ? 'কপি হয়েছে!' : 'টেক্সট কপি'}</span>
            </button>
          </div>
        </div>

        {/* Collapsible Settings Drawer (Print Hidden) */}
        {showSettingsDrawer && (
          <div className="p-4 sm:p-5 bg-amber-50/70 border-b border-amber-200 shrink-0 print:hidden space-y-4 max-h-[35vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h4 className="font-extrabold text-xs text-amber-950 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-600" />
                <span>মেমো কাস্টমাইজেশন ও শপ সেটিংস (Live Preview)</span>
              </h4>
              <span className="text-[10px] text-amber-800 font-medium">
                এখানে তথ্য পরিবর্তন করলে নিচের মেমোতে সাথে সাথে আপডেট হবে
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              {/* Shop Name */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  শপের নাম (Shop Name):
                </label>
                <input
                  type="text"
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                  placeholder="আপনার শপের নাম"
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none"
                />
              </div>

              {/* Shop Tagline */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  শপের স্লোগান / ট্যাগলাইন:
                </label>
                <input
                  type="text"
                  value={shopTagline}
                  onChange={(e) => setShopTagline(e.target.value)}
                  placeholder="যেমন: আপনার সেরা গ্যাজেট শপ"
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-slate-800 focus:ring-2 focus:ring-amber-500 outline-none"
                />
              </div>

              {/* Shop Phone */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  শপ মোবাইল নম্বর:
                </label>
                <input
                  type="text"
                  value={shopPhone}
                  onChange={(e) => setShopPhone(e.target.value)}
                  placeholder="01XXXXXXXXX"
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl font-mono text-slate-800 focus:ring-2 focus:ring-amber-500 outline-none"
                />
              </div>

              {/* Shop Logo Upload */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  শপের লোগো (Custom Logo):
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    ref={logoInputRef}
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    className="flex-1 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5 text-blue-600" />
                    <span>লোগো আপলোড</span>
                  </button>
                  {shopLogoUrl && (
                    <button
                      type="button"
                      onClick={() => setShopLogoUrl('')}
                      className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-xl"
                      title="Remove Logo"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Delivery Charge */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  ডেলিভারি চার্জ (৳):
                </label>
                <input
                  type="number"
                  min="0"
                  value={deliveryCharge}
                  onChange={(e) => setDeliveryCharge(Number(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none"
                />
              </div>

              {/* Discount Amount */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  ডিসকাউন্ট / ছাড় (৳):
                </label>
                <input
                  type="number"
                  min="0"
                  value={discountAmount}
                  onChange={(e) => setDiscountAmount(Number(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none"
                />
              </div>

              {/* Advance Paid */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  অগ্রিম পেমেন্ট (৳):
                </label>
                <input
                  type="number"
                  min="0"
                  value={advancePaid}
                  onChange={(e) => setAdvancePaid(Number(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none"
                />
              </div>

              {/* Unit Selling Price */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  পণ্যের রেট / বিক্রয় মূল্য (৳):
                </label>
                <input
                  type="number"
                  min="0"
                  value={unitSellingPrice}
                  onChange={(e) => setUnitSellingPrice(Number(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none"
                />
              </div>
            </div>

            {/* Custom Notes & Seal Toggle */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  মেমো ফুটনোট / শর্তাবলী:
                </label>
                <input
                  type="text"
                  value={customNote}
                  onChange={(e) => setCustomNote(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-slate-800 focus:ring-2 focus:ring-amber-500 outline-none"
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 p-2 bg-white border border-slate-300 rounded-xl w-full cursor-pointer hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={showSealStamp}
                    onChange={(e) => setShowSealStamp(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span className="font-bold text-[11px] text-slate-800">
                    অথরাইজড শপ সিল ও স্বাক্ষর দেখান
                  </span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Modal Body / Scrollable Printable Container */}
        <div className="p-4 sm:p-8 overflow-y-auto flex-1 bg-slate-100/70 print:bg-white print:p-0 print:overflow-visible">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500 space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              <p className="text-xs font-semibold">ক্যাশ মেমো লোড করা হচ্ছে...</p>
            </div>
          ) : error ? (
            <div className="p-6 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-xs font-medium text-center">
              {error}
            </div>
          ) : (
            /* Printable Document Wrapper */
            <div
              id="invoice-document"
              ref={printRef}
              className="bg-white p-6 sm:p-10 border border-slate-200 rounded-2xl shadow-sm text-slate-800 font-sans mx-auto max-w-2xl print:border-none print:shadow-none print:p-4 print:max-w-none"
              style={{ width: '100%', minHeight: '650px' }}
            >
              {/* HEADER SECTION */}
              <div className={`flex flex-col sm:flex-row sm:items-start justify-between pb-6 border-b-2 ${currentTheme.headerBorder} gap-4`}>
                {templateMode === 'reseller_memo' ? (
                  /* Reseller Custom Shop Header */
                  <div className="flex items-start gap-3.5">
                    {shopLogoUrl ? (
                      <img
                        src={shopLogoUrl}
                        alt={shopName}
                        crossOrigin="anonymous"
                        className="w-14 h-14 object-cover rounded-2xl border border-slate-200 shadow-2xs shrink-0"
                      />
                    ) : (
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-extrabold text-lg text-white shadow-2xs shrink-0 ${currentTheme.primary}`}>
                        {shopName ? shopName.charAt(0).toUpperCase() : 'S'}
                      </div>
                    )}
                    <div>
                      <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 leading-tight">
                        {shopName || 'Reseller Shop'}
                      </h1>
                      <p className="text-xs font-semibold text-slate-600 mt-0.5">
                        {shopTagline}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-y-1 gap-x-3 text-[11px] text-slate-600 font-medium">
                        {shopPhone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3 text-slate-400" />
                            <span className="font-mono">{shopPhone}</span>
                          </span>
                        )}
                        {shopAddress && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-slate-400" />
                            <span>{shopAddress}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Official Sky Automation Tech Header */
                  <div>
                    <div className="mb-2">
                      <SkyLogo size="md" showText={true} lightMode={true} />
                    </div>
                    <p className="text-[11px] text-slate-600 leading-snug">
                      House-12, Road-04, Block-B, Mirpur, Dhaka, Bangladesh<br />
                      Phone: 01722063777 | Email: skyautomationtech@gmail.com
                    </p>
                  </div>
                )}

                {/* Memo Meta & Badge */}
                <div className="text-left sm:text-right shrink-0">
                  <span className={`inline-block text-[11px] font-black px-3.5 py-1 rounded-lg uppercase tracking-wider mb-1.5 shadow-2xs ${currentTheme.badgeBg} ${currentTheme.badgeText}`}>
                    {templateMode === 'reseller_memo' ? 'CASH MEMO / ক্যাশ মেমো' : 'TAX INVOICE'}
                  </span>
                  <p className="text-xs font-mono font-extrabold text-slate-900 tracking-tight">
                    {invoiceNumber || order.orderNumber}
                  </p>
                  <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                    তারিখ: <span className="font-semibold text-slate-800">{invoiceDate}</span>
                  </p>
                  {invoiceTime && (
                    <p className="text-[10px] text-slate-400 font-mono">
                      সময়: {invoiceTime}
                    </p>
                  )}
                </div>
              </div>

              {/* CUSTOMER & ORDER REFERENCE SECTION */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-5 border-b border-slate-100 text-xs">
                {/* Billed To / Customer Details */}
                <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200/80">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1 mb-1.5">
                    <User className="w-3 h-3 text-slate-400" />
                    <span>ক্রেতার তথ্য (Billed To):</span>
                  </span>
                  <p className="font-bold text-slate-900 text-sm">{order.customerName}</p>
                  <p className="font-mono text-slate-700 font-bold mt-0.5 flex items-center gap-1">
                    <span>📱</span> {order.customerPhone}
                  </p>
                  <p className="text-slate-600 leading-relaxed mt-1 text-[11px]">
                    📍 {order.customerAddress}
                  </p>
                </div>

                {/* Order & Delivery Info */}
                <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200/80 flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
                      অর্ডার রেফারেন্স (Order Reference):
                    </span>
                    <div className="space-y-1 text-[11px]">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">অর্ডার আইডি:</span>
                        <span className="font-mono font-bold text-slate-900">{order.orderNumber}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">পেমেন্ট মেথড:</span>
                        <span className="font-bold text-slate-800">
                          {dueCODAmount > 0 ? 'ক্যাশ অন ডেলিভারি (COD)' : 'পেইড (Paid)'}
                        </span>
                      </div>
                      {order.deliveryPreference && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">ডেলিভারি টাইপ:</span>
                          <span className="capitalize font-semibold text-slate-800">
                            {order.deliveryPreference}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* PRODUCT / ITEMS TABLE */}
              <div className="py-5">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className={`border-b-2 border-slate-200 ${currentTheme.tableHeaderBg} text-[11px]`}>
                      <th className="py-2.5 px-3 font-extrabold rounded-l-lg">নং</th>
                      <th className="py-2.5 px-3 font-extrabold">পণ্যের বিবরণ (Description)</th>
                      <th className="py-2.5 px-3 text-center font-extrabold">পরিমাণ</th>
                      <th className="py-2.5 px-3 text-right font-extrabold">একক মূল্য</th>
                      <th className="py-2.5 px-3 text-right font-extrabold rounded-r-lg">মোট টাকা</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="py-3.5 px-3 font-bold text-slate-500 text-center">1</td>
                      <td className="py-3.5 px-3">
                        <p className="font-extrabold text-slate-900 text-xs sm:text-sm">{order.productName}</p>
                        {order.variantColorName && (
                          <span className="inline-block text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded mt-1 border border-amber-200">
                            কালার: {order.variantColorName}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-3 text-center font-extrabold text-slate-900 text-sm">
                        {quantity}
                      </td>
                      <td className="py-3.5 px-3 text-right font-semibold text-slate-800">
                        ৳{unitSellingPrice.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-3 text-right font-black text-slate-900 text-sm">
                        ৳{itemSubtotal.toLocaleString()}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* FINANCIAL CALCULATION & SUMMARY */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-3 pb-6 border-t-2 border-slate-100">
                {/* Notes & Return Policy */}
                <div className="space-y-2 text-xs">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                    <p className="text-[11px] font-bold text-slate-800 mb-1 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      <span>বিশেষ দ্রষ্টব্য ও পলিসি:</span>
                    </p>
                    <p className="text-[10px] text-slate-600 leading-relaxed">
                      {customNote}
                    </p>
                  </div>
                </div>

                {/* Calculation Box */}
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between py-1 text-slate-600">
                    <span>পণ্যের মোট মূল্য (Subtotal):</span>
                    <span className="font-bold text-slate-900">৳{itemSubtotal.toLocaleString()}</span>
                  </div>

                  {deliveryCharge > 0 && (
                    <div className="flex justify-between py-1 text-slate-600">
                      <span>ডেলিভারি চার্জ (Delivery):</span>
                      <span className="font-bold text-slate-900">+ ৳{deliveryCharge.toLocaleString()}</span>
                    </div>
                  )}

                  {discountAmount > 0 && (
                    <div className="flex justify-between py-1 text-emerald-700">
                      <span>স্পেশাল ছাড় (Discount):</span>
                      <span className="font-bold">- ৳{discountAmount.toLocaleString()}</span>
                    </div>
                  )}

                  <div className="flex justify-between py-1.5 border-t border-slate-200 font-bold text-slate-800">
                    <span>সর্বমোট বিল (Total Payable):</span>
                    <span className="font-extrabold text-slate-900 text-sm">৳{totalPayable.toLocaleString()}</span>
                  </div>

                  {advancePaid > 0 && (
                    <div className="flex justify-between py-1 text-emerald-700 font-semibold">
                      <span>অগ্রিম পরিশোধ (Advance Paid):</span>
                      <span>- ৳{advancePaid.toLocaleString()}</span>
                    </div>
                  )}

                  {/* Cash On Delivery Net Due Box */}
                  <div className={`mt-2 p-3 rounded-xl border flex items-center justify-between shadow-2xs ${currentTheme.dueBoxBg} ${currentTheme.dueBoxBorder}`}>
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider block text-slate-600">
                        ক্যাশ অন ডেলিভারি (পরিশোধযোগ্য):
                      </span>
                      <span className={`text-xs font-bold ${currentTheme.accentText}`}>
                        {dueCODAmount === 0 ? 'সম্পূর্ণ পরিশোধিত (PAID)' : 'ডেলিভারিতে প্রদেয় (Net Due)'}
                      </span>
                    </div>
                    <span className={`text-xl font-black ${currentTheme.dueTextColor}`}>
                      ৳{dueCODAmount.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* FOOTER & AUTH SIGNATURE SECTION */}
              <div className="mt-4 pt-5 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
                {/* QR Code & Barcode */}
                <div className="flex items-center gap-3">
                  <div className="bg-white p-1.5 rounded-lg border border-slate-200 shadow-2xs shrink-0">
                    <QRCodeSVG 
                      value={`MEMO:${invoiceNumber || order.orderNumber}|SHOP:${shopName}|CUST:${order.customerPhone}|DUE:BDT ${dueCODAmount}`} 
                      size={54} 
                      level="M" 
                    />
                  </div>
                  <div>
                    <p className="font-extrabold text-slate-900 text-xs">{shopName || 'Reseller Shop'}</p>
                    <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                      Memo: {invoiceNumber || order.orderNumber}
                    </p>
                    <p className="text-[9px] text-emerald-700 font-semibold flex items-center gap-1 mt-0.5">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>যাচাইকৃত ক্যাশ মেমো</span>
                    </p>
                  </div>
                </div>

                {/* Seal & Authorized Signature */}
                {showSealStamp && (
                  <div className="flex flex-col items-center sm:items-end text-center sm:text-right">
                    <div className="w-36 h-12 border-b border-dashed border-slate-400 mb-1 flex items-end justify-center relative">
                      <div className="absolute top-0 right-2 border-2 border-emerald-600/40 text-emerald-700 font-black text-[9px] px-2 py-0.5 rounded-md uppercase tracking-wider rotate-[-6deg] select-none pointer-events-none">
                        VERIFIED &bull; APPROVED
                      </div>
                    </div>
                    <p className="font-extrabold text-[11px] text-slate-900">স্বত্বাধিকারী / অনুমোদিত স্বাক্ষর</p>
                    <p className="text-[9px] text-slate-500">{shopName}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Bottom Footer (Print Hidden) */}
        <div className="px-4 sm:px-6 py-3 bg-slate-100 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0 print:hidden text-xs">
          <div className="flex items-center gap-2 text-slate-500">
            <Sparkle className="w-4 h-4 text-blue-500" />
            <span className="text-[11px]">
              ডাউনলোড বা প্রিন্ট করার পর মেমোর ব্যাকগ্রাউন্ড ও কালার নিখুঁতভাবে প্রদর্শিত হবে।
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleShareWhatsApp}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <MessageCircle className="w-4 h-4" />
              <span>WhatsApp এ কাস্টমারকে পাঠান</span>
            </button>
            <button
              onClick={handleDownloadPDF}
              disabled={downloadingPdf}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-extrabold rounded-xl flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
            >
              {downloadingPdf ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span>PDF মেমো ডাউনলোড</span>
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl transition-colors cursor-pointer"
            >
              বন্ধ করুন
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
