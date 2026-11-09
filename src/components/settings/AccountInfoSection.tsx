import React, { useState, useEffect } from 'react';
import { 
  doc, getDoc, setDoc, collection, getDocs, query, orderBy, 
  addDoc, updateDoc, deleteDoc, serverTimestamp 
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserProfile, CompanySettings } from '../../types';
import { triggerHaptic } from '../../lib/nativeFeedback';
import { DENSITY_TOKENS as DT } from '../../utils/densityTokens';
import { 
  FileText, Shield, Scale, CreditCard, DollarSign, 
  HelpCircle, ChevronRight, ArrowLeft, Search, Plus, 
  Edit3, Trash2, Eye, EyeOff, Check, AlertCircle, X,
  Clock, CheckCircle2, Globe, Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PageHeader } from '../common/PageHeader';

interface AccountInfoSectionProps {
  user: UserProfile;
  canAccessFullApp?: boolean;
  onRefreshUser?: () => void;
  onBack?: () => void;
  initialPolicyKey?: string | null;
}

export interface PolicyDocument {
  id: string;
  title: string;
  titleBn?: string;
  version: string;
  updatedAt: any;
  contentEn: string;
  contentBn?: string;
  category?: string;
}

export interface FAQItem {
  id: string;
  question: string;
  questionBn?: string;
  answer: string;
  answerBn?: string;
  category: 'account' | 'commission' | 'orders' | 'returns' | 'general';
  order: number;
  isHidden?: boolean;
}

// 5 Mandatory Policy Definitions with B2B Bangladesh Reseller Default Drafts
const DEFAULT_POLICIES: Record<string, { title: string; version: string; contentEn: string; contentBn?: string; icon: React.ElementType }> = {
  terms: {
    title: 'Terms & Conditions',
    version: '1.2',
    icon: FileText,
    contentEn: `### 1. Introduction & Acceptance
Welcome to ReSellBD, an enterprise wholesale dropshipping & reseller commerce network operated by Sky Automation Technologies Ltd. By accessing or using the ReSellBD platform, web portal, or mobile applications, you agree to comply with and be bound by these Terms & Conditions.

### 2. Reseller Eligibility & Account Verification
• To operate as a verified reseller, individuals must be at least 18 years of age and reside in Bangladesh.
• Valid National Identification (NID) or Birth Certificate, a registered Bangladeshi mobile number, and accurate shop details must be provided during registration.
• Accounts remain in "Pending Review" status until verified by ReSellBD administration. Operating duplicate or fraudulent accounts is strictly prohibited.

### 3. Catalog Pricing & Reselling Standards
• All wholesale reseller prices displayed in the catalog are exclusive to approved resellers.
• Resellers may set their own custom customer selling prices, provided they meet or exceed the designated minimum retail price.
• Selling below the designated cost or price floors is prohibited to maintain marketplace integrity.

### 4. Order Dispatch & Delivery Fulfilment
• ReSellBD fulfills orders through certified third-party logistics partners (Pathao, Steadfast).
• Delivery fees within Dhaka are typically ৳60 and outside Dhaka ৳120, subject to periodic carrier adjustments.
• Delivery attempts are logged; in the event of customer rejection or return, return shipping fees may be debited from the reseller's wallet balance.

### 5. Termination & Suspension
ReSellBD reserves the right to suspend or terminate any reseller account involved in fraudulent bookings, abusive chargebacks, brand infringement, or violation of these terms.`,
  },
  privacy: {
    title: 'Privacy Policy',
    version: '1.1',
    icon: Shield,
    contentEn: `### 1. Information We Collect
ReSellBD collects information necessary to facilitate wholesale ordering, courier dispatch, and wallet payouts:
• **Personal & Business Profile**: Full legal name, shop trade name, email, mobile phone number, and physical store address.
• **Verification Documents**: Government NID or birth certificate numbers and verification photos.
• **Financial Information**: Mobile Financial Services (bKash, Nagad, Rocket, Upay) account numbers and banking details for payout transfers.
• **Order & Transaction Records**: Delivery addresses, customer phone numbers, parcels dispatched, and commissions earned.
• **Device & Security Logs**: IP addresses, device hardware identifiers, and sign-in timestamps.

### 2. How We Use Your Data
• Verifying reseller identities and preventing fraudulent transactions.
• Processing courier waybills and generating delivery barcode labels.
• Disbursing wallet balances and calculating commissions.
• Delivering real-time push and SMS order notifications.

### 3. Data Protection & Access Rights
ReSellBD does not sell or rent personal information to third parties. Customer address data is only transmitted to courier logistics partners for package delivery.`,
  },
  reseller_rules: {
    title: 'Reseller Rules & Code of Conduct',
    version: '1.0',
    icon: Scale,
    contentEn: `### 1. Professional Customer Engagement
• Resellers must accurately represent product features, specifications, and warranty coverage as stated in the ReSellBD product catalog.
• Deceptive marketing, fake stock claims, or altered manufacturer warranties are grounds for immediate suspension.

### 2. Authentic Order Placement
• Resellers must only place orders on behalf of verified customers who have confirmed purchase intent.
• Artificial orders created to manipulate sales contests, abuse promotional vouchers, or exploit delivery tracking are strictly banned.

### 3. Return & Damage Inspection
• Defective or transit-damaged items must be reported within 48 hours of customer delivery with unboxing video documentation.
• Customer change-of-mind returns are subject to standard return shipping costs.`,
  },
  payout_policy: {
    title: 'Payout Policy',
    version: '1.3',
    icon: CreditCard,
    contentEn: `### 1. Payout Processing Schedule
• Reseller withdrawal requests are processed on official business days (Saturday through Thursday, 10:00 AM to 8:00 PM).
• Standard payout processing time is within 24 to 48 hours following security clearance.

### 2. Supported Disbursement Channels
• Mobile Financial Services: bKash Personal/Merchant, Nagad, Rocket, and Upay.
• Bank Transfers: Direct BEFTN / NPSB bank transfers to registered Bangladeshi commercial banks.

### 3. Minimum & Maximum Withdrawal Limits
• The minimum withdrawal threshold is ৳100 per transaction.
• Resellers must have a verified payout method with matching account holder credentials.
• Payouts may be held temporarily if associated orders are flagged for courier return or fraud investigation.`,
  },
  commission_policy: {
    title: 'Commission Policy',
    version: '1.2',
    icon: DollarSign,
    contentEn: `### 1. Commission Calculation Formula
Reseller profit is calculated transparently using the standard mathematical formula:

**Commission = (Customer Selling Price - Wholesale Reseller Price) × Quantity**

*Example Calculation:*
• Wholesale Reseller Price: ৳850
• Reseller Defined Selling Price: ৳1,200
• Quantity: 2 Units
• Calculation: (৳1,200 - ৳850) × 2 = **৳700 Total Commission**

### 2. Commission Crediting Lifecycle
• **Estimated Commission**: Shown upon order placement as pending earnings.
• **Matured Commission**: Credited to the reseller's available wallet balance immediately once the parcel is marked **Delivered** by the courier partner.
• **Returned / Cancelled Orders**: If a parcel is returned or rejected by the recipient, no commission is credited.`,
  },
};

// 9 Seed FAQs for Reseller Platform
const SEED_FAQS: Omit<FAQItem, 'id'>[] = [
  {
    question: 'How does the reseller account approval process work?',
    answer: 'After you submit your registration with your shop name, contact number, and verification document, our compliance team reviews your profile within 2 to 24 hours. Once verified, you gain full access to wholesale prices, ordering, and wallet withdrawals.',
    category: 'account',
    order: 1,
  },
  {
    question: 'How is my reseller commission calculated?',
    answer: 'Your commission is calculated as: (Customer Selling Price - Wholesale Cost) × Quantity. You have complete freedom to set your customer selling price above the wholesale base rate.',
    category: 'commission',
    order: 2,
  },
  {
    question: 'How do I withdraw my earnings to bKash, Nagad, or Bank?',
    answer: 'Navigate to the Wallet tab, tap "Withdraw", select your verified payout account (bKash, Nagad, Rocket, or Bank), enter the desired amount (minimum ৳100), and submit. Disbursements are processed within 24 to 48 business hours.',
    category: 'commission',
    order: 3,
  },
  {
    question: 'What are the different order statuses and what do they mean?',
    answer: '• Pending: Order received and awaiting verification.\n• Confirmed: Order verified and forwarded to our fulfillment warehouse.\n• Processing: Package packed and waybill label attached.\n• Shipped: Picked up by courier (Pathao/Steadfast) with live tracking.\n• Delivered: Customer received parcel and paid cash on delivery; commission released to wallet.\n• Cancelled / Returned: Parcel could not be delivered.',
    category: 'orders',
    order: 4,
  },
  {
    question: 'What is the return and replacement warranty policy?',
    answer: 'All electronic items carry a 48-hour replacement warranty for manufacturing defects. To claim warranty, submit a ticket within 48 hours of delivery along with an unboxing video and photo of the issue.',
    category: 'returns',
    order: 5,
  },
  {
    question: 'How does courier shipping and COD (Cash on Delivery) work?',
    answer: 'We dispatch parcels via Pathao and Steadfast courier services. Customers pay cash upon delivery. Standard delivery charges are ৳60 inside Dhaka (1-2 days) and ৳120 outside Dhaka (2-4 days).',
    category: 'orders',
    order: 6,
  },
  {
    question: 'Can I change my registered shop name or mobile number?',
    answer: 'Yes. For security reasons, shop name and phone number updates require administrative approval. You can submit an update request from Settings > Account & Profile.',
    category: 'account',
    order: 7,
  },
  {
    question: 'How do I deposit funds into my wallet?',
    answer: 'Go to Wallet > Deposit, choose bKash, Nagad, or Rocket, follow the merchant payment instructions, and submit your Transaction ID (TrxID). Once verified by admin, your wallet balance updates immediately.',
    category: 'commission',
    order: 8,
  },
  {
    question: 'How can I get immediate assistance from customer support?',
    answer: 'You can reach our dedicated reseller support team via phone call, official WhatsApp chat, or by submitting a ticket under Settings > Help & Support from Saturday to Thursday, 10:00 AM to 8:00 PM.',
    category: 'general',
    order: 9,
  },
];

export const AccountInfoSection: React.FC<AccountInfoSectionProps> = ({
  user,
  canAccessFullApp = true,
  onRefreshUser,
  onBack,
  initialPolicyKey = null,
}) => {
  const isAdminUser = user.role === 'admin' || user.role === 'super_admin';

  // Active Policy Reading View: null = show list; string = show policy document
  const [activePolicyKey, setActivePolicyKey] = useState<string | null>(initialPolicyKey);
  const [activePolicyDoc, setActivePolicyDoc] = useState<PolicyDocument | null>(null);

  // Instantly reset scroll to top on mount and whenever a policy document is opened/closed
  useScrollToTop([activePolicyKey]);
  const [language, setLanguage] = useState<'en' | 'bn'>('en');
  const [loadingPolicy, setLoadingPolicy] = useState(false);

  // FAQs State
  const [faqs, setFaqs] = useState<FAQItem[]>([]);
  const [loadingFaqs, setLoadingFaqs] = useState(true);
  const [faqSearch, setFaqSearch] = useState('');
  const [selectedFaqCategory, setSelectedFaqCategory] = useState<string>('All');
  const [expandedFaqIds, setExpandedFaqIds] = useState<Record<string, boolean>>({});

  // Company Settings
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);

  // Admin FAQ Management Dialog
  const [isAdminFaqModalOpen, setIsAdminFaqModalOpen] = useState(false);
  const [editingFaq, setEditingFaq] = useState<FAQItem | null>(null);
  const [faqFormQuestion, setFaqFormQuestion] = useState('');
  const [faqFormAnswer, setFaqFormAnswer] = useState('');
  const [faqFormCategory, setFaqFormCategory] = useState<'account' | 'commission' | 'orders' | 'returns' | 'general'>('general');
  const [faqFormOrder, setFaqFormOrder] = useState<number>(1);
  const [isSavingFaq, setIsSavingFaq] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3200);
  };

  // Fetch Company Settings
  useEffect(() => {
    const fetchCompany = async () => {
      try {
        const sSnap = await getDoc(doc(db, 'settings', 'general'));
        if (sSnap.exists()) {
          setCompanySettings(sSnap.data() as CompanySettings);
        }
      } catch (err) {
        console.warn('Error fetching company settings:', err);
      }
    };
    fetchCompany();
  }, []);

  // Fetch or Seed FAQs
  useEffect(() => {
    const fetchFaqs = async () => {
      setLoadingFaqs(true);
      try {
        const q = query(collection(db, 'faqs'), orderBy('order', 'asc'));
        const snap = await getDocs(q);

        if (snap.empty) {
          // Seed default FAQs
          const seededList: FAQItem[] = [];
          for (const item of SEED_FAQS) {
            const docRef = await addDoc(collection(db, 'faqs'), {
              ...item,
              createdAt: serverTimestamp(),
            });
            seededList.push({ id: docRef.id, ...item });
          }
          setFaqs(seededList);
        } else {
          const list: FAQItem[] = [];
          snap.forEach((d) => {
            const data = d.data();
            list.push({ id: d.id, ...data } as FAQItem);
          });
          setFaqs(list);
        }
      } catch (err) {
        console.error('Error fetching FAQs:', err);
        // Fallback to local seed items
        setFaqs(SEED_FAQS.map((item, idx) => ({ id: `local_${idx}`, ...item })));
      } finally {
        setLoadingFaqs(false);
      }
    };
    fetchFaqs();
  }, []);

  // Open Policy Document for Reading
  const handleOpenPolicy = async (key: string) => {
    triggerHaptic('light');
    setActivePolicyKey(key);
    setLoadingPolicy(true);

    try {
      const pRef = doc(db, 'policyPages', key);
      const pSnap = await getDoc(pRef);

      const defaultData = DEFAULT_POLICIES[key];
      if (pSnap.exists()) {
        const data = pSnap.data();
        setActivePolicyDoc({
          id: key,
          title: data.title || defaultData.title,
          titleBn: data.titleBn,
          version: data.version || defaultData.version,
          updatedAt: data.updatedAt,
          contentEn: data.contentEn || defaultData.contentEn,
          contentBn: data.contentBn || defaultData.contentBn,
        });
      } else {
        // Create initial draft in Firestore
        const initialDoc: PolicyDocument = {
          id: key,
          title: defaultData.title,
          version: defaultData.version,
          updatedAt: new Date(),
          contentEn: defaultData.contentEn,
          contentBn: defaultData.contentBn,
        };
        await setDoc(pRef, {
          title: initialDoc.title,
          version: initialDoc.version,
          updatedAt: serverTimestamp(),
          contentEn: initialDoc.contentEn,
        });
        setActivePolicyDoc(initialDoc);
      }
    } catch (err) {
      console.warn('Error loading policy page:', err);
      // Fallback to memory default
      const def = DEFAULT_POLICIES[key];
      setActivePolicyDoc({
        id: key,
        title: def.title,
        version: def.version,
        updatedAt: new Date(),
        contentEn: def.contentEn,
      });
    } finally {
      setLoadingPolicy(false);
    }
  };

  // Toggle FAQ Accordion
  const toggleFaq = (id: string) => {
    triggerHaptic('light');
    setExpandedFaqIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Filter FAQs
  const filteredFaqs = faqs.filter((faq) => {
    if (faq.isHidden && !isAdminUser) return false;
    const matchesCategory =
      selectedFaqCategory === 'All' ||
      faq.category?.toLowerCase() === selectedFaqCategory.toLowerCase();
    const queryStr = faqSearch.toLowerCase().trim();
    const matchesSearch =
      !queryStr ||
      faq.question.toLowerCase().includes(queryStr) ||
      faq.answer.toLowerCase().includes(queryStr);
    return matchesCategory && matchesSearch;
  });

  // Admin FAQ Save
  const handleSaveFaq = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!faqFormQuestion.trim() || !faqFormAnswer.trim()) {
      showToast('Question and Answer are required', 'error');
      return;
    }

    setIsSavingFaq(true);
    triggerHaptic('medium');

    try {
      if (editingFaq) {
        // Update
        const fRef = doc(db, 'faqs', editingFaq.id);
        await updateDoc(fRef, {
          question: faqFormQuestion.trim(),
          answer: faqFormAnswer.trim(),
          category: faqFormCategory,
          order: Number(faqFormOrder) || 1,
          updatedAt: serverTimestamp(),
        });
        setFaqs((prev) =>
          prev.map((f) =>
            f.id === editingFaq.id
              ? {
                  ...f,
                  question: faqFormQuestion.trim(),
                  answer: faqFormAnswer.trim(),
                  category: faqFormCategory,
                  order: Number(faqFormOrder) || 1,
                }
              : f
          )
        );
        showToast('FAQ updated successfully');
      } else {
        // Create
        const docRef = await addDoc(collection(db, 'faqs'), {
          question: faqFormQuestion.trim(),
          answer: faqFormAnswer.trim(),
          category: faqFormCategory,
          order: Number(faqFormOrder) || faqs.length + 1,
          createdAt: serverTimestamp(),
        });
        setFaqs((prev) => [
          ...prev,
          {
            id: docRef.id,
            question: faqFormQuestion.trim(),
            answer: faqFormAnswer.trim(),
            category: faqFormCategory,
            order: Number(faqFormOrder) || faqs.length + 1,
          },
        ]);
        showToast('FAQ created successfully');
      }
      setIsAdminFaqModalOpen(false);
      setEditingFaq(null);
      setFaqFormQuestion('');
      setFaqFormAnswer('');
    } catch (err) {
      console.error('Error saving FAQ:', err);
      showToast('Failed to save FAQ', 'error');
    } finally {
      setIsSavingFaq(false);
    }
  };

  // Admin Delete FAQ
  const handleDeleteFaq = async (faqId: string) => {
    if (!confirm('Are you sure you want to delete this FAQ entry?')) return;
    try {
      await deleteDoc(doc(db, 'faqs', faqId));
      setFaqs((prev) => prev.filter((f) => f.id !== faqId));
      showToast('FAQ deleted');
    } catch (err) {
      console.error('Failed to delete FAQ:', err);
      showToast('Could not delete FAQ', 'error');
    }
  };

  // Helper: Format acceptance timestamp
  const formatAcceptedDate = (timestamp: any) => {
    if (!timestamp) return 'On registration';
    if (timestamp.toDate) return timestamp.toDate().toLocaleDateString();
    if (timestamp instanceof Date) return timestamp.toLocaleDateString();
    return String(timestamp);
  };

  // ==========================================
  // VIEW B: POLICY DOCUMENT READING PAGE
  // ==========================================
  if (activePolicyKey && activePolicyDoc) {
    const isBn = language === 'bn' && activePolicyDoc.contentBn;
    const displayedContent = isBn ? activePolicyDoc.contentBn : activePolicyDoc.contentEn;
    const displayedTitle = isBn && activePolicyDoc.titleBn ? activePolicyDoc.titleBn : activePolicyDoc.title;

    return (
      <div className="space-y-3.5">
        {/* Top Reading Navigation Header */}
        <PageHeader
          title={displayedTitle}
          subtitle={`Version ${activePolicyDoc.version || '1.0'} · Last updated ${formatDate(activePolicyDoc.updatedAt)}`}
          onBack={() => {
            triggerHaptic('light');
            setActivePolicyKey(null);
          }}
          backTitle="All Policies"
          rightAction={
            activePolicyDoc.contentBn ? (
              <div className="bg-slate-100 p-0.5 rounded-xl flex items-center border border-slate-200/80">
                <button
                  type="button"
                  onClick={() => setLanguage('en')}
                  className={`h-[26px] px-2 rounded-lg text-[10px] font-bold transition-all ${
                    language === 'en' ? 'bg-white text-[#04203F] shadow-xs' : 'text-slate-500'
                  }`}
                >
                  English
                </button>
                <button
                  type="button"
                  onClick={() => setLanguage('bn')}
                  className={`h-[26px] px-2 rounded-lg text-[10px] font-bold transition-all ${
                    language === 'bn' ? 'bg-white text-[#04203F] shadow-xs' : 'text-slate-500'
                  }`}
                >
                  বাংলা
                </button>
              </div>
            ) : undefined
          }
          sticky={false}
        />

        {/* Policy Header Card */}
        <div className={`${DT.settingsGroupCard} p-3.5 space-y-1.5`}>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] font-extrabold text-[#0E9AA7] bg-teal-50 border border-teal-200/80 px-2 py-0.5 rounded-md">
              Version {activePolicyDoc.version}
            </span>
            <span className="text-[11px] font-medium text-slate-400">
              Last updated:{' '}
              {activePolicyDoc.updatedAt?.toDate
                ? activePolicyDoc.updatedAt.toDate().toLocaleDateString()
                : 'Current'}
            </span>
          </div>

          <h1 className="text-[16px] font-bold text-[#04203F] leading-snug">
            {displayedTitle}
          </h1>

          <p className="text-[11px] font-medium text-slate-500">
            Official operational policy for ReSellBD registered partners.
          </p>
        </div>

        {/* Policy Content Text Body */}
        <div className={`${DT.settingsGroupCard} p-4 space-y-4`}>
          {loadingPolicy ? (
            <div className="py-8 text-center text-slate-400 text-xs">Loading document...</div>
          ) : (
            <div className="text-[13px] text-slate-700 leading-relaxed font-normal space-y-3 whitespace-pre-line">
              {displayedContent}
            </div>
          )}

          {/* Legal Review Disclaimer */}
          <div className="pt-3 border-t border-slate-100 flex items-start gap-2 text-[10.5px] text-slate-400 leading-tight">
            <AlertCircle className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
            <span>
              Note: These terms and policies are provided as operational draft guidelines and should be reviewed by a legal professional for local regulatory compliance.
            </span>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW A: MAIN ACCOUNT INFORMATION LIST
  // ==========================================
  return (
    <div className="space-y-3.5">
      {/* Toast Feedback */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-3.5 py-1.5 rounded-full text-[12px] font-bold shadow-lg flex items-center gap-1.5 ${
              toastMessage.type === 'error'
                ? 'bg-rose-600 text-white'
                : 'bg-[#04203F] text-white border border-teal-500/30'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-[#3DD055]" />
            <span>{toastMessage.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 1. LEGAL & COMMERCIAL POLICIES GROUP */}
      <div className="space-y-1.5">
        <div className={DT.settingsGroupLabel}>Official Policies & Guidelines</div>
        <div className={DT.settingsGroupCard}>
          {/* Terms & Conditions */}
          <div
            onClick={() => handleOpenPolicy('terms')}
            className={DT.settingsRow}
          >
            <div className="flex items-center gap-2.5 min-w-0 pr-3">
              <div className="w-[28px] h-[28px] rounded-[8px] flex items-center justify-center shrink-0 border bg-teal-50 text-[#0E9AA7] border-teal-200/60">
                <FileText className="w-[18px] h-[18px]" />
              </div>
              <div className="min-w-0">
                <span className={DT.settingsRowTitle}>Terms & Conditions</span>
                <p className={DT.settingsRowHelper}>
                  Accepted on {formatAcceptedDate(user.createdAt)} (v1.2)
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/70 px-2 py-0.5 rounded-full">
                Active
              </span>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </div>
          </div>

          {/* Privacy Policy */}
          <div
            onClick={() => handleOpenPolicy('privacy')}
            className={DT.settingsRow}
          >
            <div className="flex items-center gap-2.5 min-w-0 pr-3">
              <div className="w-[28px] h-[28px] rounded-[8px] flex items-center justify-center shrink-0 border bg-blue-50 text-blue-700 border-blue-200/60">
                <Shield className="w-[18px] h-[18px]" />
              </div>
              <div className="min-w-0">
                <span className={DT.settingsRowTitle}>Privacy Policy</span>
                <p className={DT.settingsRowHelper}>
                  Accepted on {formatAcceptedDate(user.createdAt)} (v1.1)
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/70 px-2 py-0.5 rounded-full">
                Active
              </span>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </div>
          </div>

          {/* Reseller Rules */}
          <div
            onClick={() => handleOpenPolicy('reseller_rules')}
            className={DT.settingsRow}
          >
            <div className="flex items-center gap-2.5 min-w-0 pr-3">
              <div className="w-[28px] h-[28px] rounded-[8px] flex items-center justify-center shrink-0 border bg-amber-50 text-amber-700 border-amber-200/60">
                <Scale className="w-[18px] h-[18px]" />
              </div>
              <div className="min-w-0">
                <span className={DT.settingsRowTitle}>Reseller Rules & Code of Conduct</span>
                <p className={DT.settingsRowHelper}>Authentic orders and customer marketing standards</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
          </div>

          {/* Payout Policy */}
          <div
            onClick={() => handleOpenPolicy('payout_policy')}
            className={DT.settingsRow}
          >
            <div className="flex items-center gap-2.5 min-w-0 pr-3">
              <div className="w-[28px] h-[28px] rounded-[8px] flex items-center justify-center shrink-0 border bg-emerald-50 text-[#3DD055] border-emerald-200/60">
                <CreditCard className="w-[18px] h-[18px]" />
              </div>
              <div className="min-w-0">
                <span className={DT.settingsRowTitle}>Payout Policy</span>
                <p className={DT.settingsRowHelper}>Withdrawal rules, schedules, and thresholds</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
          </div>

          {/* Commission Policy */}
          <div
            onClick={() => handleOpenPolicy('commission_policy')}
            className={DT.settingsRow}
          >
            <div className="flex items-center gap-2.5 min-w-0 pr-3">
              <div className="w-[28px] h-[28px] rounded-[8px] flex items-center justify-center shrink-0 border bg-teal-50 text-[#0E9AA7] border-teal-200/60">
                <DollarSign className="w-[18px] h-[18px]" />
              </div>
              <div className="min-w-0">
                <span className={DT.settingsRowTitle}>Commission Policy</span>
                <p className={DT.settingsRowHelper}>Formula: (Selling Price - Reseller Price) × Qty</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
          </div>
        </div>
      </div>

      {/* 2. FREQUENTLY ASKED QUESTIONS (FAQ) */}
      <div className="space-y-1.5 pt-1">
        <div className="flex items-center justify-between px-3 pb-1">
          <span className={DT.settingsGroupLabel.replace('px-3 pb-1.5', '')}>
            Frequently Asked Questions
          </span>
          {isAdminUser && (
            <button
              onClick={() => {
                setEditingFaq(null);
                setFaqFormQuestion('');
                setFaqFormAnswer('');
                setFaqFormCategory('general');
                setFaqFormOrder(faqs.length + 1);
                setIsAdminFaqModalOpen(true);
              }}
              className="text-[11px] font-bold text-[#0E9AA7] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Manage FAQs</span>
            </button>
          )}
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search FAQs (commission, wallet, delivery)..."
            value={faqSearch}
            onChange={(e) => setFaqSearch(e.target.value)}
            className="w-full h-[36px] pl-8.5 pr-8 bg-white/70 backdrop-blur-md border border-slate-200/80 rounded-xl text-[12px] placeholder:text-slate-400 outline-none focus:border-[#0E9AA7] transition-all"
          />
          {faqSearch && (
            <button
              onClick={() => setFaqSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Category Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar pt-0.5">
          {['All', 'Account', 'Commission', 'Orders', 'Returns', 'General'].map((cat) => (
            <button
              key={cat}
              onClick={() => {
                triggerHaptic('light');
                setSelectedFaqCategory(cat);
              }}
              className={`h-[26px] px-2.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-all cursor-pointer ${
                selectedFaqCategory === cat
                  ? 'bg-[#04203F] text-white shadow-2xs'
                  : 'bg-white/80 text-slate-600 border border-slate-200/80 hover:bg-slate-50'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* FAQ Accordion Card */}
        <div className={DT.settingsGroupCard}>
          {loadingFaqs ? (
            <div className="p-6 text-center text-slate-400 text-xs">Loading answers...</div>
          ) : filteredFaqs.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-xs">
              No matching questions found for "{faqSearch}".
            </div>
          ) : (
            filteredFaqs.map((faq) => {
              const isExpanded = !!expandedFaqIds[faq.id];
              return (
                <div key={faq.id} className="transition-colors">
                  <div
                    onClick={() => toggleFaq(faq.id)}
                    className="w-full min-h-[48px] px-3.5 py-2.5 flex items-center justify-between hover:bg-slate-50/70 active:bg-slate-100/60 text-left cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <HelpCircle className="w-3.5 h-3.5 text-[#0E9AA7] shrink-0" />
                      <span className="text-[12.5px] font-semibold text-[#04203F] leading-snug">
                        {faq.question}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isAdminUser && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingFaq(faq);
                            setFaqFormQuestion(faq.question);
                            setFaqFormAnswer(faq.answer);
                            setFaqFormCategory(faq.category);
                            setFaqFormOrder(faq.order);
                            setIsAdminFaqModalOpen(true);
                          }}
                          className="p-1 text-slate-400 hover:text-slate-700"
                          title="Edit FAQ"
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                      )}
                      <ChevronRight
                        className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                          isExpanded ? 'rotate-90 text-[#0E9AA7]' : ''
                        }`}
                      />
                    </div>
                  </div>

                  {/* Expanded Answer */}
                  {isExpanded && (
                    <div className="px-3.5 py-2.5 bg-slate-50/70 border-t border-slate-100/90 text-[11.5px] text-slate-600 leading-relaxed whitespace-pre-line font-normal">
                      {faq.answer}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ADMIN FAQ EDIT / CREATE MODAL */}
      <AnimatePresence>
        {isAdminFaqModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-md w-full p-4 border border-slate-200 shadow-2xl space-y-3"
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h3 className="text-[14px] font-bold text-[#04203F]">
                  {editingFaq ? 'Edit FAQ Item' : 'Add New FAQ Item'}
                </h3>
                <button
                  onClick={() => setIsAdminFaqModalOpen(false)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveFaq} className="space-y-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">
                    Question
                  </label>
                  <input
                    type="text"
                    required
                    value={faqFormQuestion}
                    onChange={(e) => setFaqFormQuestion(e.target.value)}
                    placeholder="e.g. How does commission payout work?"
                    className="w-full h-[36px] px-3 text-[12px] bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-[#0E9AA7]"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">
                    Answer (Markdown/Bullet points supported)
                  </label>
                  <textarea
                    required
                    rows={4}
                    value={faqFormAnswer}
                    onChange={(e) => setFaqFormAnswer(e.target.value)}
                    placeholder="Detailed explanation..."
                    className="w-full p-2.5 text-[12px] bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-[#0E9AA7] resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">
                      Category
                    </label>
                    <select
                      value={faqFormCategory}
                      onChange={(e) => setFaqFormCategory(e.target.value as any)}
                      className="w-full h-[36px] px-2 text-[12px] bg-slate-50 border border-slate-200 rounded-xl outline-none"
                    >
                      <option value="account">Account & Verification</option>
                      <option value="commission">Commission & Wallet</option>
                      <option value="orders">Orders & Shipping</option>
                      <option value="returns">Returns & Policy</option>
                      <option value="general">General Support</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">
                      Display Order
                    </label>
                    <input
                      type="number"
                      value={faqFormOrder}
                      onChange={(e) => setFaqFormOrder(Number(e.target.value))}
                      className="w-full h-[36px] px-3 text-[12px] bg-slate-50 border border-slate-200 rounded-xl outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  {editingFaq ? (
                    <button
                      type="button"
                      onClick={() => handleDeleteFaq(editingFaq.id)}
                      className="text-rose-600 text-[11px] font-bold hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  ) : <span />}

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsAdminFaqModalOpen(false)}
                      className="h-[32px] px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingFaq}
                      className="h-[32px] px-3.5 rounded-xl bg-[#04203F] hover:bg-[#0E9AA7] text-white text-[11px] font-bold cursor-pointer transition-all shadow-xs disabled:opacity-50"
                    >
                      {isSavingFaq ? 'Saving...' : 'Save FAQ'}
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
