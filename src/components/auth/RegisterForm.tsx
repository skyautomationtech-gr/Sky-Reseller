import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, updateDoc, addDoc, collection, serverTimestamp, arrayUnion } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import resellbdLogo from '../../assets/images/logo.png';
import { SkyLogo } from '../common/SkyLogo';
import { useNetwork } from '../../context/NetworkContext';
import { generateRandomResellerSuffix } from '../../lib/resellerIdHelper';
import { triggerHaptic } from '../../lib/nativeFeedback';
import { 
  User, Store, Calendar, Users, Mail, Phone, MessageSquare, 
  MapPin, Landmark, Briefcase, Camera, Lock, CheckCircle2, 
  ChevronRight, ChevronLeft, AlertCircle, Sparkles, ShieldCheck, 
  Eye, EyeOff, Upload, FileText, Check, ExternalLink, Globe, 
  Trash2, Crop, AlertTriangle, FileCheck, ArrowRight, ChevronDown, ChevronUp, Copy, BookOpen, Loader2
} from 'lucide-react';
import { checkShopNameAvailability, updateShopNameAtomic } from '../../lib/shopNameService';
import { normalizeShopName } from '../../utils/shopName';
import { OtpVerificationInput } from './register/OtpVerificationInput';
import { SearchableSelect, SelectOption } from './register/SearchableSelect';
import { SquareCropModal } from './register/SquareCropModal';
import { PasswordStrengthIndicator, evaluatePassword } from './register/PasswordStrengthIndicator';
import { PolicyModal } from './register/PolicyModal';
import { RegistrationSuccessScreen } from './register/RegistrationSuccessScreen';
import { DEFAULT_TERMS_POLICY, DEFAULT_PRIVACY_POLICY, PolicyDoc } from '../../data/defaultPolicies';
import { finalizeResellerRegistration } from '../../lib/resellerRegistrationService';
import { 
  getDivisions, getDistricts, getUpazilas, getUnions,
  BdDivision, BdDistrict, BdUpazila, BdUnion 
} from '../../data/bd/geocodeService';
import { BANGLADESH_BANKS } from '../../data/bangladeshBanks';
import { PayoutMethod, UserProfile } from '../../types';

interface RegisterFormProps {
  onSwitchToLogin: () => void;
  onRegistered: () => void;
  initialProfile?: UserProfile | null;
  isResubmit?: boolean;
}

// Data-driven 8 steps
export interface WizardStep {
  id: number;
  key: string;
  title: string;
  shortTitle: string;
  encouragement: string;
  icon: React.ElementType;
}

const WIZARD_STEPS: WizardStep[] = [
  { id: 1, key: 'basic', title: 'Basic Details', shortTitle: 'Basic', encouragement: 'Great start! Let\'s get to know you.', icon: User },
  { id: 2, key: 'contact', title: 'Contact Information', shortTitle: 'Contact', encouragement: 'Securing your communication channels.', icon: Mail },
  { id: 3, key: 'address', title: 'Shop Address', shortTitle: 'Address', encouragement: 'Connecting you to all 64 districts in Bangladesh.', icon: MapPin },
  { id: 4, key: 'payout', title: 'Payout Information', shortTitle: 'Payout', encouragement: 'Where you receive your weekly profit payouts.', icon: Landmark },
  { id: 5, key: 'business', title: 'Business Information', shortTitle: 'Business', encouragement: 'Your social storefront and sales channels.', icon: Briefcase },
  { id: 6, key: 'photos', title: 'Photography & Documents', shortTitle: 'Photos', encouragement: 'Verify your store credibility and identity.', icon: Camera },
  { id: 7, key: 'security', title: 'Account Security & Terms', shortTitle: 'Security', encouragement: 'Almost done! Set your secure password.', icon: Lock },
  { id: 8, key: 'review', title: 'Review & Submit', shortTitle: 'Review', encouragement: 'Double-check everything and launch your account.', icon: CheckCircle2 },
];

const DRAFT_STORAGE_KEY = 'resellbd_reseller_registration_draft_v3';

// Utility to compress images to canvas data URL (< 80KB)
const compressImage = (file: File | Blob, maxWidth = 1024, maxHeight = 1024, quality = 0.72): Promise<string> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        } else {
          resolve((e.target?.result as string) || '');
        }
      };
      img.onerror = () => resolve((e.target?.result as string) || '');
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
};

export const RegisterForm: React.FC<RegisterFormProps> = ({ 
  onSwitchToLogin, 
  onRegistered,
  initialProfile,
  isResubmit = false
}) => {
  const { isOnline } = useNetwork();
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Form State Object
  const [formData, setFormData] = useState({
    // Step 1: Basic Details
    fullName: '',
    shopName: '',
    dob: '',
    gender: 'male' as 'male' | 'female' | 'transgender',

    // Step 2: Contact Information
    email: '',
    emailVerified: false,
    mobile: '',
    whatsappNumber: '',
    sameAsMobile: true,

    // Step 3: Shop Address
    division: '',
    divisionId: '',
    district: '',
    districtId: '',
    upazila: '',
    upazilaId: '',
    union: '',
    unionId: '',
    ward: '',
    postalCode: '',
    address: '',
    customDivision: '',
    customDistrict: '',
    customUpazila: '',
    customUnion: '',

    // Step 4: Payout Information
    payoutMethod: 'bkash' as 'bkash' | 'nagad' | 'rocket' | 'upay' | 'bank',
    accountHolderName: '',
    accountNumber: '',
    bankName: '',
    customBankName: '',
    branchName: '',
    routingNumber: '',

    // Step 5: Business Information
    facebookPage: '',
    tiktokUrl: '',
    instagramUrl: '',
    youtubeUrl: '',

    // Step 6: Photography & Documents
    shopLogoUrl: '',
    documentType: 'nid' as 'nid' | 'birth_certificate',
    nidFrontUrl: '',
    nidBackUrl: '',
    birthCertificateUrl: '',

    // Legacy fields for backward compatibility
    profilePhotoUrl: '',
    shopPhotoUrl: '',
    nidUrl: '',
    nidNumber: '',
    bkashNumber: '',
    nagadNumber: '',
    rocketNumber: '',
    upayNumber: '',

    // Step 7: Security & Terms
    password: '',
    confirmPassword: '',
    agreeToTerms: false,
    agreeToPrivacy: false,
    hasScrolledTerms: false,
    hasScrolledPrivacy: false,
    termsVersion: '1.0',
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stepError, setStepError] = useState('');
  const [shakeFields, setShakeFields] = useState<Set<string>>(new Set());

  // Policy Modal state
  const [activePolicyModal, setActivePolicyModal] = useState<PolicyDoc | null>(null);

  // Success Screen state
  const [registrationSuccessData, setRegistrationSuccessData] = useState<{
    resellerId: string;
    shopName: string;
  } | null>(null);

  // Review card collapsible states
  const [collapsedCards, setCollapsedCards] = useState<{ [key: string]: boolean }>({});

  // Live shop name uniqueness checking state
  const [shopNameCheck, setShopNameCheck] = useState<{
    status: 'idle' | 'checking' | 'available' | 'taken' | 'error';
    message: string;
    key: string;
  }>({
    status: 'idle',
    message: '',
    key: '',
  });

  // Debounced live availability check (600 ms) for Shop Name
  useEffect(() => {
    const raw = formData.shopName.trim();
    if (raw.length < 2) {
      setShopNameCheck({ status: 'idle', message: '', key: '' });
      return;
    }

    setShopNameCheck((prev) => ({
      ...prev,
      status: 'checking',
      message: 'Checking...',
    }));

    const timer = setTimeout(async () => {
      try {
        const res = await checkShopNameAvailability(
          raw,
          isResubmit && initialProfile ? initialProfile.uid : undefined
        );
        if (res.available) {
          setShopNameCheck({
            status: 'available',
            message: 'Shop name is available',
            key: res.shopNameKey,
          });
        } else {
          setShopNameCheck({
            status: 'taken',
            message: 'This shop name is already taken. Please choose a different name.',
            key: res.shopNameKey,
          });
        }
      } catch (_err) {
        // Fail-safe: if the check cannot run (offline/error), show "Could not verify the name, will be checked again on submit"
        setShopNameCheck({
          status: 'error',
          message: 'Could not verify the name, will be checked again on submit',
          key: '',
        });
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [formData.shopName, isResubmit, initialProfile]);

  // Submitting detailed step progress text
  const [submittingStepText, setSubmittingStepText] = useState('');

  // Crop Modal state
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [rawImageForCrop, setRawImageForCrop] = useState('');

  // Upload progress tracking simulation per file
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});

  // Bangladesh Administrative Geocode Lists
  const [divisionsList, setDivisionsList] = useState<BdDivision[]>([]);
  const [districtsList, setDistrictsList] = useState<BdDistrict[]>([]);
  const [upazilasList, setUpazilasList] = useState<BdUpazila[]>([]);
  const [unionsList, setUnionsList] = useState<BdUnion[]>([]);

  // Auto-scroll input into view on focus so mobile keyboard doesn't hide it
  const handleInputFocus = (e: React.FocusEvent<HTMLElement>) => {
    e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // Restore Draft from LocalStorage on mount or Prefill from initialProfile if resubmitting
  useEffect(() => {
    if (isResubmit && initialProfile) {
      setFormData((prev) => ({
        ...prev,
        fullName: initialProfile.fullName || '',
        shopName: initialProfile.shopName || '',
        dob: initialProfile.dob || '',
        gender: initialProfile.gender || 'male',
        email: initialProfile.email || '',
        emailVerified: true,
        mobile: initialProfile.mobile || '',
        whatsappNumber: initialProfile.whatsappNumber || initialProfile.whatsapp || '',
        sameAsMobile: !initialProfile.whatsappNumber || initialProfile.whatsappNumber === initialProfile.mobile,
        division: initialProfile.division || '',
        divisionId: initialProfile.divisionId || '',
        district: initialProfile.district || '',
        districtId: initialProfile.districtId || '',
        upazila: initialProfile.upazila || '',
        upazilaId: initialProfile.upazilaId || '',
        union: initialProfile.union || '',
        ward: initialProfile.ward || '',
        postalCode: initialProfile.postalCode || '',
        address: initialProfile.address || '',
        payoutMethod: (initialProfile.payoutMethod as any) || 'bkash',
        accountHolderName: initialProfile.accountHolderName || '',
        accountNumber: initialProfile.accountNumber || '',
        bankName: initialProfile.bankName || '',
        branchName: initialProfile.branchName || '',
        routingNumber: initialProfile.routingNumber || '',
        facebookPage: initialProfile.facebookPage || '',
        tiktokUrl: initialProfile.tiktokUrl || '',
        instagramUrl: initialProfile.instagramUrl || '',
        youtubeUrl: initialProfile.youtubeUrl || '',
        shopLogoUrl: initialProfile.shopLogoUrl || initialProfile.shopPhotoUrl || '',
        profilePhotoUrl: initialProfile.profilePhotoUrl || '',
        shopPhotoUrl: initialProfile.shopPhotoUrl || '',
        documentType: initialProfile.documentType || 'nid',
        nidFrontUrl: initialProfile.nidFrontUrl || initialProfile.nidUrl || '',
        nidBackUrl: initialProfile.nidBackUrl || '',
        birthCertificateUrl: initialProfile.birthCertificateUrl || '',
        agreeToTerms: true,
        agreeToPrivacy: true,
        hasScrolledTerms: true,
        hasScrolledPrivacy: true,
      }));
    } else {
      try {
        const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          delete parsed.password;
          delete parsed.confirmPassword;
          setFormData((prev) => ({ ...prev, ...parsed }));
        }
      } catch {
        // Ignore
      }
    }
  }, [isResubmit, initialProfile]);

  // Auto-save draft on form change (excluding passwords)
  useEffect(() => {
    try {
      const safeDraft = { ...formData };
      delete (safeDraft as any).password;
      delete (safeDraft as any).confirmPassword;
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(safeDraft));
    } catch {
      // Ignore
    }
  }, [formData]);

  // Warning when leaving with in-memory uploaded files
  useEffect(() => {
    const hasUnsavedFiles = !!(formData.shopLogoUrl || formData.nidFrontUrl || formData.nidBackUrl || formData.birthCertificateUrl);
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedFiles && currentStep < 8) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [formData, currentStep]);

  // Load Divisions on mount
  useEffect(() => {
    getDivisions().then(setDivisionsList);
  }, []);

  // Load Districts when division changes
  useEffect(() => {
    if (formData.divisionId) {
      getDistricts(formData.divisionId).then(setDistrictsList);
    } else {
      setDistrictsList([]);
    }
  }, [formData.divisionId]);

  // Load Upazilas when district changes
  useEffect(() => {
    if (formData.districtId) {
      getUpazilas(formData.districtId).then(setUpazilasList);
    } else {
      setUpazilasList([]);
    }
  }, [formData.districtId]);

  // Load Unions when upazila changes
  useEffect(() => {
    if (formData.upazilaId) {
      getUnions(formData.upazilaId).then(setUnionsList);
    } else {
      setUnionsList([]);
    }
  }, [formData.upazilaId]);

  // Format Helpers
  const normalizeBdPhone = (input: string): string => {
    let clean = input.replace(/\D/g, '');
    if (clean.startsWith('880')) {
      clean = clean.slice(2);
    }
    return clean;
  };

  const validateBdPhone = (phone: string): boolean => {
    const normalized = normalizeBdPhone(phone);
    return /^01[3-9]\d{8}$/.test(normalized);
  };

  const calculateAge = (dobString: string): number => {
    if (!dobString) return 0;
    const dob = new Date(dobString);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    return age;
  };

  // URL Validation Helpers
  const isValidFacebookUrl = (url: string) => {
    if (!url.trim()) return false;
    return /^(?:https?:\/\/)?(?:www\.)?(?:facebook\.com|fb\.com)\/[A-Za-z0-9_.-]+\/?/i.test(url.trim());
  };

  const isValidTikTokUrl = (url: string) => {
    if (!url.trim()) return true;
    return /^(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@[A-Za-z0-9_.-]+\/?/i.test(url.trim());
  };

  const isValidInstagramUrl = (url: string) => {
    if (!url.trim()) return true;
    return /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/[A-Za-z0-9_.-]+\/?/i.test(url.trim());
  };

  const isValidYouTubeUrl = (url: string) => {
    if (!url.trim()) return true;
    return /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:c\/|channel\/|user\/|@)?|youtu\.be\/)[A-Za-z0-9_.-]+\/?/i.test(url.trim());
  };

  const handleOpenLink = (rawUrl: string) => {
    if (!rawUrl.trim()) return;
    let url = rawUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Profile Completeness Percentage Calculation
  const completeness = useMemo(() => {
    let score = 0;
    const maxScore = 20;

    // Step 1
    if (formData.fullName.trim().length >= 3) score += 1;
    if (formData.shopName.trim().length >= 2) score += 1;
    if (formData.dob && calculateAge(formData.dob) >= 18) score += 1;
    if (formData.gender) score += 1;

    // Step 2
    if (formData.email && formData.emailVerified) score += 2;
    if (validateBdPhone(formData.mobile)) score += 1;
    if (validateBdPhone(formData.sameAsMobile ? formData.mobile : formData.whatsappNumber)) score += 1;

    // Step 3
    if (formData.division || formData.customDivision) score += 1;
    if (formData.district || formData.customDistrict) score += 1;
    if (formData.upazila || formData.customUpazila) score += 1;
    if (formData.postalCode.length === 4) score += 1;
    if (formData.address.trim().length >= 5) score += 1;

    // Step 4
    if (formData.payoutMethod === 'bank') {
      if ((formData.bankName || formData.customBankName) && formData.accountNumber.length >= 8 && /^\d{9}$/.test(formData.routingNumber) && formData.branchName) score += 2;
    } else {
      if (validateBdPhone(formData.accountNumber) && formData.accountHolderName.trim()) score += 2;
    }

    // Step 5
    if (isValidFacebookUrl(formData.facebookPage)) score += 1;
    if (formData.tiktokUrl || formData.instagramUrl || formData.youtubeUrl) score += 1;

    // Step 6
    if (formData.shopLogoUrl) score += 2;
    if (formData.documentType === 'nid' ? (formData.nidFrontUrl || formData.nidBackUrl) : formData.birthCertificateUrl) score += 1;

    // Step 7
    if (formData.password.length >= 6 && formData.password === formData.confirmPassword) score += 1;

    return Math.min(100, Math.round((score / maxScore) * 100));
  }, [formData]);

  const triggerShake = (fieldKeys: string[]) => {
    setShakeFields(new Set(fieldKeys));
    triggerHaptic('medium');
    setTimeout(() => {
      setShakeFields(new Set());
    }, 600);
  };

  // Validation Logic per step
  const validateCurrentStep = (): boolean => {
    setStepError('');

    // Step 1: Basic Details
    if (currentStep === 1) {
      const invalid: string[] = [];
      if (formData.fullName.trim().length < 3) invalid.push('fullName');
      if (formData.shopName.trim().length < 2) invalid.push('shopName');
      if (!formData.dob || calculateAge(formData.dob) < 18) invalid.push('dob');
      if (!formData.gender) invalid.push('gender');

      if (invalid.length > 0) {
        triggerShake(invalid);
        if (invalid.includes('dob') && formData.dob) {
          setStepError('You must be at least 18 years old to register as a reseller.');
        } else {
          setStepError('Please complete all required fields (Full Name, Shop Name, DOB 18+, Gender).');
        }
        return false;
      }

      // Block advancing if shop name is already taken or still being checked
      if (shopNameCheck.status === 'taken') {
        triggerShake(['shopName']);
        setStepError('This shop name is already taken. Please choose a different name.');
        return false;
      }
      if (shopNameCheck.status === 'checking') {
        triggerShake(['shopName']);
        setStepError('Checking shop name availability... Please wait a moment.');
        return false;
      }

      return true;
    }

    // Step 2: Contact Information
    if (currentStep === 2) {
      const invalid: string[] = [];
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!formData.email || !emailRegex.test(formData.email)) invalid.push('email');
      if (!formData.emailVerified) invalid.push('emailOtp');
      if (!validateBdPhone(formData.mobile)) invalid.push('mobile');
      const actualWa = formData.sameAsMobile ? formData.mobile : formData.whatsappNumber;
      if (!validateBdPhone(actualWa)) invalid.push('whatsappNumber');

      if (invalid.length > 0) {
        triggerShake(invalid);
        if (invalid.includes('emailOtp')) {
          setStepError('অনুগ্রহ করে আপনার ইমেইল ভেরিফাই করুন। "Send OTP" বাটনে ক্লিক করে ইমেইলে পাওয়া ৬-ডিজিট কোডটি প্রবেশ করান (ইনবক্স বা Spam ফোল্ডার চেক করুন)।');
        } else if (invalid.includes('mobile') || invalid.includes('whatsappNumber')) {
          setStepError('Please enter valid 11-digit Bangladesh phone numbers (01[3-9]XXXXXXXX).');
        } else {
          setStepError('Please complete all contact details.');
        }
        return false;
      }
      return true;
    }

    // Step 3: Shop Address
    if (currentStep === 3) {
      const invalid: string[] = [];
      const effectiveDiv = formData.division || formData.customDivision;
      const effectiveDist = formData.district || formData.customDistrict;
      const effectiveUpa = formData.upazila || formData.customUpazila;

      if (!effectiveDiv) invalid.push('division');
      if (!effectiveDist) invalid.push('district');
      if (!effectiveUpa) invalid.push('upazila');
      if (!/^\d{4}$/.test(formData.postalCode.trim())) invalid.push('postalCode');
      if (formData.address.trim().length < 5) invalid.push('address');

      if (invalid.length > 0) {
        triggerShake(invalid);
        if (invalid.includes('postalCode')) {
          setStepError('Please enter a valid 4-digit postal code (e.g. 1205).');
        } else if (invalid.includes('address')) {
          setStepError('Please provide your full shop/holding address (min 5 characters).');
        } else {
          setStepError('Please select Division, District, and Upazila.');
        }
        return false;
      }
      return true;
    }

    // Step 4: Payout Information
    if (currentStep === 4) {
      const invalid: string[] = [];
      if (formData.payoutMethod === 'bank') {
        const effectiveBank = formData.bankName || formData.customBankName;
        if (!effectiveBank) invalid.push('bankName');
        if (!formData.accountHolderName.trim()) invalid.push('accountHolderName');
        if (!formData.branchName.trim()) invalid.push('branchName');
        if (!/^\d{9}$/.test(formData.routingNumber.trim())) invalid.push('routingNumber');
        if (!/^\d{8,20}$/.test(formData.accountNumber.trim())) invalid.push('accountNumber');

        if (invalid.length > 0) {
          triggerShake(invalid);
          if (invalid.includes('routingNumber')) {
            setStepError('Bank Routing Number must be exactly 9 digits.');
          } else if (invalid.includes('accountNumber')) {
            setStepError('Bank Account Number must be between 8 and 20 digits.');
          } else {
            setStepError('Please fill in all required bank payout fields.');
          }
          return false;
        }
      } else {
        // Mobile Wallets (bKash, Nagad, Rocket, Upay)
        if (!formData.accountHolderName.trim()) invalid.push('accountHolderName');
        if (!validateBdPhone(formData.accountNumber)) invalid.push('accountNumber');

        if (invalid.length > 0) {
          triggerShake(invalid);
          if (invalid.includes('accountNumber')) {
            setStepError(`Please enter a valid Bangladesh mobile wallet number for ${formData.payoutMethod.toUpperCase()} (01XXXXXXXXX).`);
          } else {
            setStepError('Please enter the Account Holder Name.');
          }
          return false;
        }
      }
      return true;
    }

    // Step 5: Business Information
    if (currentStep === 5) {
      const invalid: string[] = [];
      if (!isValidFacebookUrl(formData.facebookPage)) {
        invalid.push('facebookPage');
      }
      if (formData.tiktokUrl && !isValidTikTokUrl(formData.tiktokUrl)) {
        invalid.push('tiktokUrl');
      }
      if (formData.instagramUrl && !isValidInstagramUrl(formData.instagramUrl)) {
        invalid.push('instagramUrl');
      }
      if (formData.youtubeUrl && !isValidYouTubeUrl(formData.youtubeUrl)) {
        invalid.push('youtubeUrl');
      }

      if (invalid.length > 0) {
        triggerShake(invalid);
        if (invalid.includes('facebookPage')) {
          setStepError('A valid Facebook page or profile link is required (e.g. https://facebook.com/yourshop).');
        } else if (invalid.includes('tiktokUrl')) {
          setStepError('Invalid TikTok link format (e.g. https://tiktok.com/@yourshop).');
        } else if (invalid.includes('instagramUrl')) {
          setStepError('Invalid Instagram link format (e.g. https://instagram.com/yourshop).');
        } else {
          setStepError('Invalid YouTube channel link.');
        }
        return false;
      }
      return true;
    }

    // Step 6: Photography & Documents
    if (currentStep === 6) {
      const invalid: string[] = [];
      if (!formData.shopLogoUrl) {
        invalid.push('shopLogoUrl');
      }
      if (formData.documentType === 'birth_certificate' && !formData.birthCertificateUrl) {
        invalid.push('birthCertificateUrl');
      }

      if (invalid.length > 0) {
        triggerShake(invalid);
        if (invalid.includes('shopLogoUrl')) {
          setStepError('Shop Logo (1:1 square image) is required.');
        } else if (invalid.includes('birthCertificateUrl')) {
          setStepError('Birth Certificate Photo is required when Birth Certificate is chosen as document type.');
        }
        return false;
      }
      return true;
    }

    // Step 7: Account Security & Terms
    if (currentStep === 7) {
      if (isResubmit) {
        return true;
      }
      const invalid: string[] = [];
      const pwdEval = evaluatePassword(formData.password);
      if (!pwdEval.isAcceptable) invalid.push('password');
      if (formData.password !== formData.confirmPassword) invalid.push('confirmPassword');
      if (!formData.agreeToTerms) invalid.push('agreeToTerms');
      if (!formData.agreeToPrivacy) invalid.push('agreeToPrivacy');

      if (invalid.length > 0) {
        triggerShake(invalid);
        if (invalid.includes('password')) {
          setStepError('Password must be at least 8 characters long and reach at least "Medium" strength.');
        } else if (invalid.includes('confirmPassword')) {
          setStepError('Passwords do not match. Please re-enter your confirm password.');
        } else if (invalid.includes('agreeToTerms')) {
          setStepError('Please review and accept the ReSellBD Reseller Terms & Conditions.');
        } else {
          setStepError('Please review and accept the ReSellBD Privacy Policy.');
        }
        return false;
      }
      return true;
    }

    return true;
  };

  const handleNext = () => {
    if (!validateCurrentStep()) return;
    triggerHaptic('light');
    if (currentStep < WIZARD_STEPS.length) {
      setCurrentStep((prev) => prev + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleBack = () => {
    triggerHaptic('light');
    setStepError('');
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Image Upload Handler for Shop Logo with 1:1 Square & Resolution Check
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size limit: 5MB
    if (file.size > 5 * 1024 * 1024) {
      setStepError('Logo file size exceeds 5MB limit. Please choose a smaller image.');
      return;
    }

    setUploadProgress((prev) => ({ ...prev, shopLogo: 25 }));
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const img = new Image();
      img.onload = async () => {
        setUploadProgress((prev) => ({ ...prev, shopLogo: 60 }));

        // Check minimum resolution (500x500)
        if (img.width < 500 || img.height < 500) {
          setUploadProgress((prev) => ({ ...prev, shopLogo: 0 }));
          setStepError(`Image resolution is ${img.width}x${img.height}px. Minimum required size is 500x500 px.`);
          return;
        }

        // Check if image is square (allow ±5px tolerance)
        const isSquare = Math.abs(img.width - img.height) <= 5;

        if (!isSquare) {
          // Open built-in Square Crop Tool
          setRawImageForCrop(dataUrl);
          setCropModalOpen(true);
        } else {
          // Already square: compress and save
          const compressed = await compressImage(file, 1024, 1024, 0.75);
          setFormData((prev) => ({ 
            ...prev, 
            shopLogoUrl: compressed,
            profilePhotoUrl: compressed,
            shopPhotoUrl: compressed 
          }));
          setUploadProgress((prev) => ({ ...prev, shopLogo: 100 }));
          setTimeout(() => setUploadProgress((prev) => ({ ...prev, shopLogo: 0 })), 600);
          triggerHaptic('light');
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Document Upload Handler (NID Front, NID Back, Birth Certificate)
  const handleDocumentUpload = async (e: React.ChangeEvent<HTMLInputElement>, fieldKey: 'nidFrontUrl' | 'nidBackUrl' | 'birthCertificateUrl') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setStepError('Document file size exceeds 5MB limit.');
      return;
    }

    setUploadProgress((prev) => ({ ...prev, [fieldKey]: 35 }));
    try {
      const compressed = await compressImage(file, 1200, 1200, 0.70);
      setUploadProgress((prev) => ({ ...prev, [fieldKey]: 75 }));
      await new Promise((r) => setTimeout(r, 120));
      setFormData((prev) => ({ ...prev, [fieldKey]: compressed }));
      setUploadProgress((prev) => ({ ...prev, [fieldKey]: 100 }));
      setTimeout(() => setUploadProgress((prev) => ({ ...prev, [fieldKey]: 0 })), 600);
      triggerHaptic('light');
    } catch (err) {
      console.error('Document compression error:', err);
      setStepError('Failed to process image. Please try again.');
    }
    e.target.value = '';
  };

  // Final Registration Submission with multi-stage verification
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOnline) {
      setStepError('You are offline. An active internet connection is required to register.');
      return;
    }

    if (!validateCurrentStep()) return;

    if (!formData.emailVerified) {
      setStepError('Please complete email verification in Step 2 before submitting.');
      setCurrentStep(2);
      return;
    }

    setLoading(true);
    setStepError('');
    triggerHaptic('medium');

    try {
      const cleanMobile = normalizeBdPhone(formData.mobile);
      const cleanWhatsApp = normalizeBdPhone(formData.sameAsMobile ? formData.mobile : formData.whatsappNumber);

      // Handle Resubmission of a previously rejected application
      if (isResubmit && initialProfile) {
        setSubmittingStepText('1/3: Checking shop name & updating registration info...');

        const rawShopName = formData.shopName.trim();
        const shopNameKey = normalizeShopName(rawShopName);

        // Enforce shop name reservation on resubmit atomically
        try {
          await updateShopNameAtomic(rawShopName, initialProfile.uid);
        } catch (resubmitNameErr: any) {
          if (resubmitNameErr.message?.includes('already taken')) {
            setShopNameCheck({
              status: 'taken',
              message: 'This shop name is already taken. Please choose a different name.',
              key: shopNameKey,
            });
            setCurrentStep(1);
            setStepError('This shop name is already taken. Please choose a different name.');
            triggerShake(['shopName']);
            setLoading(false);
            return;
          }
          console.warn('Shop name update check error on resubmit:', resubmitNameErr);
        }

        const defaultPayoutMethod: PayoutMethod = {
          id: 'payout_' + Date.now(),
          type: formData.payoutMethod === 'bank' ? 'Bank' : formData.payoutMethod === 'bkash' ? 'bKash' : formData.payoutMethod === 'nagad' ? 'Nagad' : formData.payoutMethod === 'rocket' ? 'Rocket' : 'Upay',
          accountNumber: ((formData.payoutMethod === 'bank' ? formData.accountNumber : formData.accountNumber || cleanMobile) || '').trim(),
          accountHolderName: (formData.accountHolderName || formData.fullName || '').trim(),
          bankName: formData.payoutMethod === 'bank' ? ((formData.bankName || formData.customBankName || '').trim() || null) : null,
          branchName: formData.payoutMethod === 'bank' ? ((formData.branchName || '').trim() || null) : null,
          routingNumber: formData.payoutMethod === 'bank' ? ((formData.routingNumber || '').trim() || null) : null,
          isDefault: true,
          verified: false,
          addedAt: new Date().toISOString(),
        };

        setSubmittingStepText('2/3: Archiving previous feedback & submitting for review...');
        const userRef = doc(db, 'users', initialProfile.uid);
        const resubmitHistoryEntry = {
          resubmittedAt: new Date().toISOString(),
          previousRejectReason: initialProfile.rejectReason || 'No reason provided',
          previousRejectedSections: initialProfile.rejectedSections || [],
        };

        await updateDoc(userRef, {
          fullName: (formData.fullName || '').trim(),
          shopName: rawShopName,
          shopNameKey,
          dob: formData.dob || '',
          gender: formData.gender || 'male',
          mobile: cleanMobile,
          whatsapp: cleanWhatsApp,
          whatsappNumber: cleanWhatsApp,
          division: formData.division || formData.customDivision || '',
          divisionId: formData.divisionId || '',
          district: formData.district || formData.customDistrict || '',
          districtId: formData.districtId || '',
          upazila: formData.upazila || formData.customUpazila || '',
          upazilaId: formData.upazilaId || '',
          union: formData.union || '',
          ward: formData.ward || '',
          postalCode: (formData.postalCode || '').trim(),
          address: (formData.address || '').trim(),
          payoutMethod: formData.payoutMethod || 'bkash',
          accountHolderName: (formData.accountHolderName || '').trim(),
          accountNumber: (formData.accountNumber || '').trim(),
          bankName: formData.bankName || formData.customBankName || '',
          branchName: formData.branchName || '',
          routingNumber: formData.routingNumber || '',
          payoutMethods: [defaultPayoutMethod],
          facebookPage: formData.facebookPage || '',
          tiktokUrl: formData.tiktokUrl || '',
          instagramUrl: formData.instagramUrl || '',
          youtubeUrl: formData.youtubeUrl || '',
          shopLogoUrl: formData.shopLogoUrl || '',
          profilePhotoUrl: formData.profilePhotoUrl || formData.shopLogoUrl || '',
          shopPhotoUrl: formData.shopPhotoUrl || formData.shopLogoUrl || '',
          documentType: formData.documentType || 'nid',
          nidFrontUrl: formData.nidFrontUrl || '',
          nidBackUrl: formData.nidBackUrl || '',
          birthCertificateUrl: formData.birthCertificateUrl || '',
          status: 'pending',
          rejectReason: null,
          rejectedSections: [],
          slaNotified: false,
          updatedAt: serverTimestamp(),
          resubmissions: arrayUnion(resubmitHistoryEntry),
        });

        // Notify Admins about the resubmission
        try {
          await addDoc(collection(db, 'notifications'), {
            title: 'Reseller Resubmitted Registration',
            message: `${rawShopName || formData.fullName} (${initialProfile.resellerId || initialProfile.uid.slice(0, 8)}) has corrected their details and resubmitted for review.`,
            type: 'registration_resubmitted',
            targetRole: 'admin',
            userId: initialProfile.uid,
            read: false,
            createdAt: serverTimestamp(),
          });
        } catch (notifErr) {
          console.warn('Admin notification error:', notifErr);
        }

        setSubmittingStepText('3/3: Application resubmitted! Loading dashboard...');
        try {
          localStorage.removeItem(DRAFT_STORAGE_KEY);
        } catch {
          // Ignore
        }
        triggerHaptic('heavy');
        onRegistered();
        return;
      }

      setSubmittingStepText('1/4: Verifying credentials & creating secure account...');
      const cleanEmail = formData.email.trim().toLowerCase();

      let uid = '';
      let createdAuthUser: any = null;
      try {
        const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, formData.password);
        createdAuthUser = userCredential.user;
        uid = userCredential.user.uid;
      } catch (authErr: any) {
        if (authErr.code === 'auth/email-already-in-use') {
          setStepError('This email is already registered on ReSellBD. Please sign in or use "Forgot Password" to recover your account.');
          setLoading(false);
          return;
        } else if (authErr.code === 'auth/weak-password') {
          setStepError('Password does not satisfy security criteria. Please use at least 8 characters with letters, numbers, and symbols.');
          setLoading(false);
          return;
        } else {
          throw authErr;
        }
      }

      setSubmittingStepText('2/4: Finalizing payout structure & KYC documents...');

      // Build PayoutMethod object adhering to payoutMethods[] standard
      const defaultPayoutMethod: PayoutMethod = {
        id: 'payout_' + Date.now(),
        type: formData.payoutMethod === 'bank' ? 'Bank' : formData.payoutMethod === 'bkash' ? 'bKash' : formData.payoutMethod === 'nagad' ? 'Nagad' : formData.payoutMethod === 'rocket' ? 'Rocket' : 'Upay',
        accountNumber: ((formData.payoutMethod === 'bank' ? formData.accountNumber : formData.accountNumber || cleanMobile) || '').trim(),
        accountHolderName: (formData.accountHolderName || formData.fullName || '').trim(),
        bankName: formData.payoutMethod === 'bank' ? ((formData.bankName || formData.customBankName || '').trim() || null) : null,
        branchName: formData.payoutMethod === 'bank' ? ((formData.branchName || '').trim() || null) : null,
        routingNumber: formData.payoutMethod === 'bank' ? ((formData.routingNumber || '').trim() || null) : null,
        isDefault: true,
        verified: false,
        addedAt: new Date().toISOString(),
      };

      const completeFormData = {
        ...formData,
        payoutMethods: [defaultPayoutMethod],
      };

      setSubmittingStepText('3/4: Allocating sequential Reseller ID & locking shop name reservation...');

      // Finalize registration via Cloud Function / atomic Firestore transaction with unique reservation
      let finalizeResult: any;
      try {
        finalizeResult = await finalizeResellerRegistration({
          uid,
          email: cleanEmail,
          formData: completeFormData,
          termsVersion: formData.termsVersion || '1.0',
          password: formData.password,
        });
      } catch (finalizeErr: any) {
        // If shop name is already taken, safely delete half-created auth user and send back to Step 1
        if (finalizeErr.message?.includes('already taken') || finalizeErr.code === 'already-exists') {
          try {
            if (createdAuthUser) {
              await createdAuthUser.delete();
            }
          } catch (delErr) {
            console.warn('Could not delete half-created auth user:', delErr);
          }
          setShopNameCheck({
            status: 'taken',
            message: 'This shop name is already taken. Please choose a different name.',
            key: normalizeShopName(formData.shopName),
          });
          setCurrentStep(1);
          setStepError('This shop name is already taken. Please choose a different name.');
          triggerShake(['shopName']);
          setLoading(false);
          return;
        }
        throw finalizeErr;
      }

      setSubmittingStepText('4/4: Complete! Launching your reseller dashboard...');

      // Clear local draft upon successful registration
      try {
        localStorage.removeItem(DRAFT_STORAGE_KEY);
      } catch {
        // Ignore
      }

      triggerHaptic('heavy');
      setRegistrationSuccessData({
        resellerId: finalizeResult.resellerId,
        shopName: formData.shopName || formData.fullName,
      });
    } catch (err: any) {
      console.error('Registration submit error:', err);
      let msg = 'Failed to register account. Please check your details and try again.';
      if (err.code === 'auth/email-already-in-use') {
        msg = 'This email address is already in use. Please sign in or use a different email.';
      } else if (err.code === 'auth/invalid-email') {
        msg = 'Invalid email address format.';
      } else if (err.code === 'auth/weak-password') {
        msg = 'Password is too weak. Please use at least 8 characters with letters and numbers.';
      } else if (err.message) {
        msg = err.message;
      }
      setStepError(msg);
    } finally {
      setLoading(false);
      setSubmittingStepText('');
    }
  };

  const currentStepObj = WIZARD_STEPS.find((s) => s.id === currentStep) || WIZARD_STEPS[0];
  const StepIcon = currentStepObj.icon;

  // Last 4 digits of payout account for confirmation line
  const payoutLastFour = formData.accountNumber.trim().slice(-4) || '••••';

  return (
    <div className="relative min-h-[100dvh] w-full bg-gradient-to-b from-[#050B1A] via-[#071026] to-[#0B1630] flex flex-col justify-between items-center px-4 sm:px-6 py-6 sm:py-10 overflow-x-hidden selection:bg-cyan-500/30 selection:text-white">
      {/* 1. Fluid Ambient Blobs matching Login Screen */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-16 -left-16 w-[360px] h-[360px] sm:w-[520px] sm:h-[520px] bg-[#04203F]/60 rounded-full blur-[70px] sm:blur-[90px] will-change-transform animate-blob-morph-1 mix-blend-screen" />
        <div className="absolute top-1/3 -right-24 w-[340px] h-[340px] sm:w-[480px] sm:h-[480px] bg-[#0E9AA7]/35 rounded-full blur-[65px] sm:blur-[85px] will-change-transform animate-blob-morph-2 mix-blend-screen" />
        <div className="absolute -bottom-20 left-1/5 w-[320px] h-[320px] sm:w-[440px] sm:h-[440px] bg-[#3DD055]/25 rounded-full blur-[70px] sm:blur-[90px] will-change-transform animate-blob-morph-3 mix-blend-screen" />
        <div className="absolute top-1/4 left-1/3 w-[260px] h-[260px] sm:w-[360px] sm:h-[360px] bg-[#0E9AA7]/20 rounded-full blur-[60px] will-change-transform animate-blob-morph-4 mix-blend-screen" />
        <div className="absolute inset-0 opacity-[0.035] pointer-events-none bg-[radial-gradient(#ffffff_1px,transparent_1.5px)] [background-size:16px_16px]" />
      </div>

      {/* 2. Top Header with ReSellBD Logo & Lightning Flash Accent */}
      <div className="relative z-10 w-full max-w-lg mx-auto flex flex-col items-center mb-4 sm:mb-6">
        {/* Animated Lightning Bolt Accent Behind Header */}
        <div className="absolute -top-4 inset-x-0 flex justify-center pointer-events-none opacity-40">
          <svg className="w-48 h-16 text-[#0E9AA7] animate-pulse" viewBox="0 0 100 40" fill="none">
            <path
              d="M0 20 L40 20 L35 38 L65 14 L50 14 L75 0 L100 20"
              stroke="url(#lightningGrad)"
              strokeWidth="1.5"
              strokeDasharray="4 2"
              className="animate-shimmer-sweep"
            />
            <defs>
              <linearGradient id="lightningGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#0E9AA7" stopOpacity="0.2" />
                <stop offset="50%" stopColor="#3DD055" stopOpacity="1" />
                <stop offset="100%" stopColor="#0E9AA7" stopOpacity="0.2" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        {/* Brand Logo & Title */}
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 p-1 flex items-center justify-center shadow-lg shadow-[#0E9AA7]/20">
            <img src={resellbdLogo || '/resellbd-logo.png'} alt="ReSellBD" className="w-full h-full object-contain" />
          </div>
          <div className="text-left">
            <h1 className="text-lg sm:text-xl font-black text-white tracking-tight flex items-center gap-1.5 leading-none">
              <span>ReSellBD</span>
              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-gradient-to-r from-[#0E9AA7]/40 to-[#3DD055]/30 border border-[#3DD055]/40 text-[#3DD055] tracking-wider">
                Reseller Wizard
              </span>
            </h1>
            <p className="text-[11px] text-slate-300 font-medium mt-0.5">
              Wholesale Reseller Onboarding
            </p>
          </div>
        </div>

        {/* Profile Completeness Ring & Encouraging Text */}
        <div className="w-full flex items-center justify-between px-2 pt-2 text-xs">
          <span className="text-slate-300 font-semibold flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#3DD055]" />
            <span className="text-[#3DD055] font-bold">{currentStepObj.encouragement}</span>
          </span>
          <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/15">
            <span className="text-[10px] font-bold text-slate-300">Profile:</span>
            <span className="text-[11px] font-black text-[#3DD055] tabular-nums">{completeness}%</span>
          </div>
        </div>

        {/* Electric Progress Bar with Leading Spark */}
        <div className="relative w-full h-2 rounded-full bg-white/[0.08] overflow-hidden mt-2.5 border border-white/10">
          <motion.div
            className="h-full bg-gradient-to-r from-[#0E9AA7] via-[#3DD055] to-[#0E9AA7] relative rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${(currentStep / WIZARD_STEPS.length) * 100}%` }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          >
            {/* Leading Electric Spark */}
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-[0_0_12px_#3DD055,0_0_20px_#0E9AA7] animate-ping opacity-80" />
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-white rounded-full shadow-[0_0_8px_#3DD055]" />
          </motion.div>
        </div>

        {/* Scrollable Step Dots / Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full py-2 px-1 scrollbar-none [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden mt-1">
          {WIZARD_STEPS.map((s) => {
            const isCompleted = s.id < currentStep;
            const isCurrent = s.id === currentStep;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  if (s.id < currentStep) {
                    setCurrentStep(s.id);
                  }
                }}
                disabled={s.id > currentStep}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap transition-all select-none ${
                  isCurrent
                    ? 'bg-gradient-to-r from-[#0E9AA7] to-[#3DD055] text-white shadow-[0_0_15px_rgba(61,208,85,0.4)] ring-1 ring-white/40'
                    : isCompleted
                    ? 'bg-white/15 text-[#3DD055] hover:bg-white/20 cursor-pointer'
                    : 'bg-white/[0.05] text-slate-500 opacity-60 cursor-not-allowed'
                }`}
              >
                <span>{s.id}.</span>
                <span>{s.shortTitle}</span>
                {isCompleted && <Check className="w-2.5 h-2.5 text-[#3DD055]" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Main Frosted Glass Card Container */}
      <div className="relative z-10 w-full max-w-lg mx-auto flex-1 flex flex-col justify-center">
        <div
          className="relative w-full rounded-[24px] border border-white/20 bg-white/[0.08] backdrop-blur-[24px] saturate-[140%] p-5 sm:p-7 shadow-[0_20px_50px_rgba(14,154,167,0.18),0_0_25px_rgba(61,208,85,0.1)] flex flex-col"
          style={{ WebkitBackdropFilter: 'blur(24px) saturate(140%)' }}
        >
          {/* Step Header */}
          <div className="flex items-center gap-3 mb-5 pb-3 border-b border-white/10">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#0E9AA7] to-[#3DD055] text-white flex items-center justify-center shadow-md shadow-[#0E9AA7]/30 shrink-0">
              <StepIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider font-extrabold text-[#0E9AA7]">
                Step {currentStep} of {WIZARD_STEPS.length}
              </span>
              <h2 className="text-base sm:text-lg font-black text-white leading-tight">
                {currentStepObj.title}
              </h2>
            </div>
          </div>

          {/* Error Banner */}
          <AnimatePresence>
            {stepError && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="mb-4 p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-200 text-xs font-semibold flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{stepError}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Form Step Content with Animated Slide */}
          <form onSubmit={currentStep === 8 ? handleSubmit : (e) => { e.preventDefault(); handleNext(); }}>
            <AnimatePresence mode="wait">
              {/* ================= STEP 1: BASIC DETAILS ================= */}
              {currentStep === 1 && (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.22 }}
                  className="space-y-4"
                >
                  <div className={`space-y-1.5 ${shakeFields.has('fullName') ? 'animate-shake' : ''}`}>
                    <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-[#0E9AA7]" /> Full Name <span className="text-[#3DD055]">*</span>
                      </span>
                      {formData.fullName.trim().length >= 3 && (
                        <span className="text-[10px] text-[#3DD055] font-bold flex items-center gap-0.5">
                          <Check className="w-3 h-3" /> Valid
                        </span>
                      )}
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Mohammad Sahadat Hossain"
                      value={formData.fullName}
                      onFocus={handleInputFocus}
                      onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                      className="w-full min-h-[50px] px-4 py-3 bg-white/[0.08] backdrop-blur-[24px] border border-white/20 rounded-2xl text-white placeholder-slate-400 text-sm font-semibold outline-none focus:border-[#3DD055] focus:ring-2 focus:ring-[#0E9AA7]/60 focus:shadow-[0_0_15px_rgba(14,154,167,0.35)] transition-all"
                    />
                  </div>

                  <div className={`space-y-1.5 ${shakeFields.has('shopName') ? 'animate-shake' : ''}`}>
                    <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Store className="w-3.5 h-3.5 text-[#0E9AA7]" /> Shop Name / Store Name <span className="text-[#3DD055]">*</span>
                      </span>
                      {shopNameCheck.status === 'available' && (
                        <span className="text-[10px] text-[#3DD055] font-bold flex items-center gap-0.5">
                          <Check className="w-3 h-3" /> Available
                        </span>
                      )}
                      {shopNameCheck.status === 'taken' && (
                        <span className="text-[10px] text-red-400 font-bold flex items-center gap-0.5">
                          <AlertCircle className="w-3 h-3" /> Taken
                        </span>
                      )}
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. GadgetZu or Sky Tech Store"
                      value={formData.shopName}
                      onFocus={handleInputFocus}
                      onChange={(e) => setFormData({ ...formData, shopName: e.target.value })}
                      className={`w-full min-h-[50px] px-4 py-3 bg-white/[0.08] backdrop-blur-[24px] border rounded-2xl text-white placeholder-slate-400 text-sm font-semibold outline-none transition-all ${
                        shopNameCheck.status === 'taken'
                          ? 'border-red-500/80 focus:border-red-500 focus:ring-2 focus:ring-red-500/40'
                          : shopNameCheck.status === 'available'
                          ? 'border-[#3DD055]/80 focus:border-[#3DD055] focus:ring-2 focus:ring-[#3DD055]/40'
                          : 'border-white/20 focus:border-[#3DD055] focus:ring-2 focus:ring-[#0E9AA7]/60'
                      }`}
                    />
                    {/* Live status indicators below field */}
                    {shopNameCheck.status === 'checking' && (
                      <p className="text-xs text-amber-300 flex items-center gap-1.5 font-medium mt-1">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-300 shrink-0" />
                        Checking...
                      </p>
                    )}
                    {shopNameCheck.status === 'available' && (
                      <p className="text-xs text-[#3DD055] flex items-center gap-1.5 font-semibold mt-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#3DD055] shrink-0" />
                        Shop name is available
                      </p>
                    )}
                    {shopNameCheck.status === 'taken' && (
                      <p className="text-xs text-rose-400 flex items-center gap-1.5 font-semibold mt-1">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        This shop name is already taken. Please choose a different name.
                      </p>
                    )}
                    {shopNameCheck.status === 'error' && (
                      <p className="text-xs text-amber-300/90 flex items-center gap-1.5 font-medium mt-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                        Could not verify the name, will be checked again on submit
                      </p>
                    )}
                  </div>

                  <div className={`space-y-1.5 ${shakeFields.has('dob') ? 'animate-shake' : ''}`}>
                    <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-[#0E9AA7]" /> Date of Birth (Must be 18+) <span className="text-[#3DD055]">*</span>
                      </span>
                      {formData.dob && calculateAge(formData.dob) >= 18 && (
                        <span className="text-[10px] text-[#3DD055] font-bold flex items-center gap-0.5">
                          <Check className="w-3 h-3" /> Age: {calculateAge(formData.dob)} yrs
                        </span>
                      )}
                    </label>
                    <input
                      type="date"
                      required
                      value={formData.dob}
                      onFocus={handleInputFocus}
                      max={new Date(new Date().setFullYear(new Date().getFullYear() - 18)).toISOString().split('T')[0]}
                      onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
                      className="w-full min-h-[50px] px-4 py-3 bg-white/[0.08] backdrop-blur-[24px] border border-white/20 rounded-2xl text-white placeholder-slate-400 text-sm font-semibold outline-none focus:border-[#3DD055] focus:ring-2 focus:ring-[#0E9AA7]/60 focus:shadow-[0_0_15px_rgba(14,154,167,0.35)] transition-all [color-scheme:dark]"
                    />
                    {formData.dob && calculateAge(formData.dob) < 18 && (
                      <p className="text-[11px] text-rose-400 font-semibold">
                        ⚠ You must be at least 18 years old to register as a reseller.
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-[#0E9AA7]" /> Gender <span className="text-[#3DD055]">*</span>
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 'male', label: 'Male' },
                        { id: 'female', label: 'Female' },
                        { id: 'transgender', label: 'Transgender' },
                      ].map((item) => {
                        const isSelected = formData.gender === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              triggerHaptic('light');
                              setFormData({ ...formData, gender: item.id as any });
                            }}
                            className={`min-h-[46px] rounded-2xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer border select-none ${
                              isSelected
                                ? 'bg-gradient-to-r from-[#0E9AA7] to-[#3DD055] text-white border-white/30 shadow-[0_0_15px_rgba(61,208,85,0.3)]'
                                : 'bg-white/[0.06] text-slate-300 border-white/15 hover:bg-white/[0.1]'
                            }`}
                          >
                            <span>{item.label}</span>
                            {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ================= STEP 2: CONTACT INFORMATION ================= */}
              {currentStep === 2 && (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.22 }}
                  className="space-y-4"
                >
                  <div className={`space-y-1.5 ${shakeFields.has('email') ? 'animate-shake' : ''}`}>
                    <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-[#0E9AA7]" /> Email Address <span className="text-[#3DD055]">*</span>
                      </span>
                      {isResubmit ? (
                        <span className="text-[10px] text-amber-300 font-bold flex items-center gap-1 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                          <Lock className="w-3 h-3" /> Account Email (Cannot be changed)
                        </span>
                      ) : formData.emailVerified ? (
                        <span className="text-[10px] text-[#3DD055] font-bold flex items-center gap-0.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#3DD055]" /> Verified
                        </span>
                      ) : null}
                    </label>
                    <input
                      type="email"
                      required
                      disabled={isResubmit}
                      placeholder="e.g. reseller@gmail.com"
                      value={formData.email}
                      onFocus={handleInputFocus}
                      onChange={(e) => {
                        if (isResubmit) return;
                        const newEmail = e.target.value;
                        setFormData({ 
                          ...formData, 
                          email: newEmail,
                          emailVerified: false 
                        });
                      }}
                      className={`w-full min-h-[50px] px-4 py-3 backdrop-blur-[24px] border rounded-2xl text-white placeholder-slate-400 text-sm font-semibold outline-none transition-all ${
                        isResubmit 
                          ? 'bg-white/[0.04] border-white/10 opacity-75 cursor-not-allowed text-slate-300' 
                          : 'bg-white/[0.08] border-white/20 focus:border-[#3DD055] focus:ring-2 focus:ring-[#0E9AA7]/60 focus:shadow-[0_0_15px_rgba(14,154,167,0.35)]'
                      }`}
                    />
                  </div>

                  {!isResubmit && (
                    <div className={`space-y-2 p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 ${shakeFields.has('emailOtp') ? 'animate-shake' : ''}`}>
                      <OtpVerificationInput
                        email={formData.email}
                        isVerified={formData.emailVerified}
                        onVerifiedChange={(verified) => {
                          setFormData((prev) => ({ ...prev, emailVerified: verified }));
                        }}
                      />
                    </div>
                  )}

                  <div className={`space-y-1.5 ${shakeFields.has('mobile') ? 'animate-shake' : ''}`}>
                    <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-[#0E9AA7]" /> Mobile Number (01[3-9]XXXXXXXX) <span className="text-[#3DD055]">*</span>
                      </span>
                      {validateBdPhone(formData.mobile) && (
                        <span className="text-[10px] text-[#3DD055] font-bold flex items-center gap-0.5">
                          <Check className="w-3 h-3" /> Valid
                        </span>
                      )}
                    </label>
                    <input
                      type="tel"
                      inputMode="numeric"
                      required
                      placeholder="e.g. 01712345678"
                      value={formData.mobile}
                      onFocus={handleInputFocus}
                      onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                      className="w-full min-h-[50px] px-4 py-3 bg-white/[0.08] backdrop-blur-[24px] border border-white/20 rounded-2xl text-white placeholder-slate-400 text-sm font-semibold outline-none focus:border-[#3DD055] focus:ring-2 focus:ring-[#0E9AA7]/60 focus:shadow-[0_0_15px_rgba(14,154,167,0.35)] transition-all tabular-nums"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5 text-[#3DD055]" /> WhatsApp Number <span className="text-[#3DD055]">*</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer select-none text-xs text-slate-300">
                        <input
                          type="checkbox"
                          checked={formData.sameAsMobile}
                          onChange={(e) => {
                            setFormData({
                              ...formData,
                              sameAsMobile: e.target.checked,
                              whatsappNumber: e.target.checked ? formData.mobile : formData.whatsappNumber,
                            });
                          }}
                          className="w-4 h-4 rounded text-[#3DD055] accent-[#3DD055]"
                        />
                        <span className="text-[11px] font-medium">Same as mobile</span>
                      </label>
                    </div>

                    {!formData.sameAsMobile && (
                      <div className={`relative ${shakeFields.has('whatsappNumber') ? 'animate-shake' : ''}`}>
                        <input
                          type="tel"
                          inputMode="numeric"
                          required
                          placeholder="e.g. 01812345678"
                          value={formData.whatsappNumber}
                          onFocus={handleInputFocus}
                          onChange={(e) => setFormData({ ...formData, whatsappNumber: e.target.value })}
                          className="w-full min-h-[50px] px-4 py-3 bg-white/[0.08] backdrop-blur-[24px] border border-white/20 rounded-2xl text-white placeholder-slate-400 text-sm font-semibold outline-none focus:border-[#3DD055] focus:ring-2 focus:ring-[#0E9AA7]/60 focus:shadow-[0_0_15px_rgba(14,154,167,0.35)] transition-all tabular-nums"
                        />
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {/* ================= STEP 3: SHOP ADDRESS ================= */}
              {currentStep === 3 && (
                <motion.div
                  key="step3"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.22 }}
                  className="space-y-4"
                >
                  <p className="text-xs text-slate-300 bg-white/[0.04] p-2.5 rounded-xl border border-white/10">
                    Select your shop address from Bangladesh's complete administrative dataset.
                  </p>

                  <SearchableSelect
                    label="Division (বিভাগ)"
                    required
                    placeholder="Select Division..."
                    options={divisionsList.map((d) => ({ id: d.id, name: d.name, bn_name: d.bn_name }))}
                    value={formData.division}
                    customValue={formData.customDivision}
                    onCustomChange={(val) => setFormData({ ...formData, customDivision: val, division: val })}
                    onChange={(opt, customText) => {
                      if (opt) {
                        setFormData({
                          ...formData,
                          division: opt.name,
                          divisionId: opt.id,
                          customDivision: '',
                          district: '',
                          districtId: '',
                          upazila: '',
                          upazilaId: '',
                          union: '',
                          unionId: '',
                        });
                      } else if (customText !== undefined) {
                        setFormData({ ...formData, customDivision: customText, division: customText });
                      }
                    }}
                  />

                  <SearchableSelect
                    label="District (জেলা)"
                    required
                    disabled={!formData.division && !formData.customDivision}
                    placeholder={formData.division ? "Select District..." : "Select Division first..."}
                    options={districtsList.map((d) => ({ id: d.id, name: d.name, bn_name: d.bn_name }))}
                    value={formData.district}
                    customValue={formData.customDistrict}
                    onCustomChange={(val) => setFormData({ ...formData, customDistrict: val, district: val })}
                    onChange={(opt, customText) => {
                      if (opt) {
                        setFormData({
                          ...formData,
                          district: opt.name,
                          districtId: opt.id,
                          customDistrict: '',
                          upazila: '',
                          upazilaId: '',
                          union: '',
                          unionId: '',
                        });
                      } else if (customText !== undefined) {
                        setFormData({ ...formData, customDistrict: customText, district: customText });
                      }
                    }}
                  />

                  <SearchableSelect
                    label="Upazila / Thana (উপজেলা / থানা)"
                    required
                    disabled={!formData.district && !formData.customDistrict}
                    placeholder={formData.district ? "Select Upazila / Thana..." : "Select District first..."}
                    options={upazilasList.map((u) => ({ id: u.id, name: u.name, bn_name: u.bn_name }))}
                    value={formData.upazila}
                    customValue={formData.customUpazila}
                    onCustomChange={(val) => setFormData({ ...formData, customUpazila: val, upazila: val })}
                    onChange={(opt, customText) => {
                      if (opt) {
                        setFormData({
                          ...formData,
                          upazila: opt.name,
                          upazilaId: opt.id,
                          customUpazila: '',
                          union: '',
                          unionId: '',
                        });
                      } else if (customText !== undefined) {
                        setFormData({ ...formData, customUpazila: customText, upazila: customText });
                      }
                    }}
                  />

                  <SearchableSelect
                    label="Union / Ward (ইউনিয়ন / ওয়ার্ড)"
                    disabled={!formData.upazila && !formData.customUpazila}
                    placeholder={formData.upazila ? "Select Union (Optional)..." : "Select Upazila first..."}
                    options={unionsList.map((u) => ({ id: u.id, name: u.name, bn_name: u.bn_name }))}
                    value={formData.union}
                    customValue={formData.customUnion}
                    onCustomChange={(val) => setFormData({ ...formData, customUnion: val, union: val })}
                    onChange={(opt, customText) => {
                      if (opt) {
                        setFormData({
                          ...formData,
                          union: opt.name,
                          unionId: opt.id,
                          customUnion: '',
                        });
                      } else if (customText !== undefined) {
                        setFormData({ ...formData, customUnion: customText, union: customText });
                      }
                    }}
                  />

                  {formData.union && (
                    <div className="space-y-1.5 animate-in fade-in">
                      <label className="text-xs font-bold text-slate-200">
                        Ward No. (Optional: 1 - 9)
                      </label>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((wNum) => {
                          const isWSelected = formData.ward === wNum;
                          return (
                            <button
                              key={wNum}
                              type="button"
                              onClick={() => {
                                triggerHaptic('light');
                                setFormData({ ...formData, ward: isWSelected ? '' : wNum });
                              }}
                              className={`w-9 h-9 rounded-xl font-bold text-xs flex items-center justify-center transition-all cursor-pointer border ${
                                isWSelected
                                  ? 'bg-[#3DD055] text-slate-950 border-[#3DD055] font-black'
                                  : 'bg-white/[0.06] text-slate-300 border-white/15 hover:bg-white/[0.12]'
                              }`}
                            >
                              {wNum}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className={`space-y-1.5 ${shakeFields.has('postalCode') ? 'animate-shake' : ''}`}>
                    <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                      <span>Postal Code (4 Digits) <span className="text-[#3DD055]">*</span></span>
                      {/^\d{4}$/.test(formData.postalCode.trim()) && (
                        <span className="text-[10px] text-[#3DD055] font-bold flex items-center gap-0.5">
                          <Check className="w-3 h-3" /> Valid
                        </span>
                      )}
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={4}
                      required
                      placeholder="e.g. 1205"
                      value={formData.postalCode}
                      onFocus={handleInputFocus}
                      onChange={(e) => setFormData({ ...formData, postalCode: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                      className="w-full min-h-[50px] px-4 py-3 bg-white/[0.08] backdrop-blur-[24px] border border-white/20 rounded-2xl text-white placeholder-slate-400 text-sm font-semibold outline-none focus:border-[#3DD055] focus:ring-2 focus:ring-[#0E9AA7]/60 focus:shadow-[0_0_15px_rgba(14,154,167,0.35)] transition-all tabular-nums"
                    />
                  </div>

                  <div className={`space-y-1.5 ${shakeFields.has('address') ? 'animate-shake' : ''}`}>
                    <label className="text-xs font-bold text-slate-200">
                      Full Address (House, Road, Village, Landmark) <span className="text-[#3DD055]">*</span>
                    </label>
                    <textarea
                      rows={3}
                      required
                      placeholder="e.g. Holding 45, Road 03, Block B, Dhanmondi, near LabAid Hospital"
                      value={formData.address}
                      onFocus={handleInputFocus}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      className="w-full px-4 py-3 bg-white/[0.08] backdrop-blur-[24px] border border-white/20 rounded-2xl text-white placeholder-slate-400 text-sm font-semibold outline-none focus:border-[#3DD055] focus:ring-2 focus:ring-[#0E9AA7]/60 focus:shadow-[0_0_15px_rgba(14,154,167,0.35)] transition-all resize-none"
                    />
                  </div>
                </motion.div>
              )}

              {/* ================= STEP 4: PAYOUT INFORMATION ================= */}
              {currentStep === 4 && (
                <motion.div
                  key="step4"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.22 }}
                  className="space-y-4"
                >
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                      <span>Select Payout Method <span className="text-[#3DD055]">*</span></span>
                      <span className="text-[10px] text-slate-400 font-medium">Weekly automatic profit payout</span>
                    </label>
                    <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
                      {[
                        { id: 'bkash', label: 'bKash', color: 'from-pink-500/30 to-rose-600/30' },
                        { id: 'nagad', label: 'Nagad', color: 'from-orange-500/30 to-amber-600/30' },
                        { id: 'rocket', label: 'Rocket', color: 'from-purple-500/30 to-indigo-600/30' },
                        { id: 'upay', label: 'Upay', color: 'from-blue-500/30 to-cyan-600/30' },
                        { id: 'bank', label: 'Bank', color: 'from-emerald-500/30 to-teal-600/30' },
                      ].map((item) => {
                        const isSelected = formData.payoutMethod === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              triggerHaptic('light');
                              setFormData({ ...formData, payoutMethod: item.id as any });
                            }}
                            className={`min-h-[48px] rounded-2xl font-black text-xs flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer border select-none ${
                              isSelected
                                ? 'bg-gradient-to-r from-[#0E9AA7] to-[#3DD055] text-white border-white/40 shadow-[0_0_18px_rgba(61,208,85,0.35)] scale-102 ring-1 ring-white/50'
                                : 'bg-white/[0.06] text-slate-300 border-white/15 hover:bg-white/[0.11]'
                            }`}
                          >
                            <span>{item.label}</span>
                            {isSelected && <Check className="w-3 h-3 text-white" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Form fields based on selected method */}
                  {formData.payoutMethod !== 'bank' ? (
                    <div className="space-y-3.5 p-3.5 rounded-2xl bg-white/[0.04] border border-white/10">
                      {/* Account Holder Name */}
                      <div className={`space-y-1.5 ${shakeFields.has('accountHolderName') ? 'animate-shake' : ''}`}>
                        <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                          <span>Account Holder Name <span className="text-[#3DD055]">*</span></span>
                          {formData.accountHolderName.trim() && (
                            <span className="text-[10px] text-[#3DD055] font-bold">✓ Filled</span>
                          )}
                        </label>
                        <input
                          type="text"
                          required
                          placeholder={formData.fullName || "Enter Account Holder Name"}
                          value={formData.accountHolderName}
                          onFocus={handleInputFocus}
                          onChange={(e) => setFormData({ ...formData, accountHolderName: e.target.value })}
                          className="w-full min-h-[50px] px-4 py-3 bg-white/[0.08] backdrop-blur-[24px] border border-white/20 rounded-2xl text-white placeholder-slate-400 text-sm font-semibold outline-none focus:border-[#3DD055] focus:ring-2 focus:ring-[#0E9AA7]/60"
                        />
                      </div>

                      {/* Account Number with Quick Fill button */}
                      <div className={`space-y-1.5 ${shakeFields.has('accountNumber') ? 'animate-shake' : ''}`}>
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-slate-200">
                            {formData.payoutMethod.toUpperCase()} Number (01XXXXXXXXX) <span className="text-[#3DD055]">*</span>
                          </label>
                          {formData.mobile && (
                            <button
                              type="button"
                              onClick={() => {
                                triggerHaptic('light');
                                setFormData({
                                  ...formData,
                                  accountNumber: formData.mobile,
                                  accountHolderName: formData.accountHolderName || formData.fullName,
                                });
                              }}
                              className="text-[10px] font-bold text-[#3DD055] bg-[#3DD055]/15 px-2 py-0.5 rounded-lg border border-[#3DD055]/30 hover:bg-[#3DD055]/25 transition-colors cursor-pointer"
                            >
                              Same as my mobile
                            </button>
                          )}
                        </div>
                        <input
                          type="tel"
                          inputMode="numeric"
                          required
                          placeholder="e.g. 01712345678"
                          value={formData.accountNumber}
                          onFocus={handleInputFocus}
                          onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                          className="w-full min-h-[50px] px-4 py-3 bg-white/[0.08] backdrop-blur-[24px] border border-white/20 rounded-2xl text-white placeholder-slate-400 text-sm font-semibold outline-none focus:border-[#3DD055] focus:ring-2 focus:ring-[#0E9AA7]/60 tabular-nums"
                        />
                      </div>
                    </div>
                  ) : (
                    /* Bank Payout Fields */
                    <div className="space-y-3.5 p-3.5 rounded-2xl bg-white/[0.04] border border-white/10">
                      {/* Bank Name Searchable Select */}
                      <SearchableSelect
                        label="Bank Name"
                        required
                        placeholder="Search operating banks in Bangladesh..."
                        options={BANGLADESH_BANKS.map((b) => ({ id: b.name, name: b.name }))}
                        value={formData.bankName}
                        customValue={formData.customBankName}
                        onCustomChange={(val) => setFormData({ ...formData, customBankName: val, bankName: val })}
                        onChange={(opt, customText) => {
                          if (opt) {
                            setFormData({ ...formData, bankName: opt.name, customBankName: '' });
                          } else if (customText !== undefined) {
                            setFormData({ ...formData, customBankName: customText, bankName: customText });
                          }
                        }}
                      />

                      {/* Account Holder Name */}
                      <div className={`space-y-1.5 ${shakeFields.has('accountHolderName') ? 'animate-shake' : ''}`}>
                        <label className="text-xs font-bold text-slate-200">
                          Account Holder Name <span className="text-[#3DD055]">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          placeholder={formData.fullName || "Exact name on bank account"}
                          value={formData.accountHolderName}
                          onFocus={handleInputFocus}
                          onChange={(e) => setFormData({ ...formData, accountHolderName: e.target.value })}
                          className="w-full min-h-[50px] px-4 py-3 bg-white/[0.08] border border-white/20 rounded-2xl text-white placeholder-slate-400 text-sm font-semibold outline-none focus:border-[#3DD055] focus:ring-2 focus:ring-[#0E9AA7]/60"
                        />
                      </div>

                      {/* Branch Name */}
                      <div className={`space-y-1.5 ${shakeFields.has('branchName') ? 'animate-shake' : ''}`}>
                        <label className="text-xs font-bold text-slate-200">
                          Branch Name <span className="text-[#3DD055]">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Dhanmondi Branch, Dhaka"
                          value={formData.branchName}
                          onFocus={handleInputFocus}
                          onChange={(e) => setFormData({ ...formData, branchName: e.target.value })}
                          className="w-full min-h-[50px] px-4 py-3 bg-white/[0.08] border border-white/20 rounded-2xl text-white placeholder-slate-400 text-sm font-semibold outline-none focus:border-[#3DD055] focus:ring-2 focus:ring-[#0E9AA7]/60"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Routing Number (9 Digits) */}
                        <div className={`space-y-1.5 ${shakeFields.has('routingNumber') ? 'animate-shake' : ''}`}>
                          <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                            <span>Routing No. (9 Digits) <span className="text-[#3DD055]">*</span></span>
                            {/^\d{9}$/.test(formData.routingNumber.trim()) && (
                              <span className="text-[10px] text-[#3DD055] font-bold">✓ Valid</span>
                            )}
                          </label>
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength={9}
                            required
                            placeholder="e.g. 090271234"
                            value={formData.routingNumber}
                            onFocus={handleInputFocus}
                            onChange={(e) => setFormData({ ...formData, routingNumber: e.target.value.replace(/\D/g, '').slice(0, 9) })}
                            className="w-full min-h-[50px] px-4 py-3 bg-white/[0.08] border border-white/20 rounded-2xl text-white placeholder-slate-400 text-sm font-semibold outline-none focus:border-[#3DD055] focus:ring-2 focus:ring-[#0E9AA7]/60 tabular-nums"
                          />
                        </div>

                        {/* Account Number (8-20 Digits) */}
                        <div className={`space-y-1.5 ${shakeFields.has('accountNumber') ? 'animate-shake' : ''}`}>
                          <label className="text-xs font-bold text-slate-200">
                            Account Number (8-20 Digits) <span className="text-[#3DD055]">*</span>
                          </label>
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength={20}
                            required
                            placeholder="e.g. 15112034567890"
                            value={formData.accountNumber}
                            onFocus={handleInputFocus}
                            onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value.replace(/\D/g, '').slice(0, 20) })}
                            className="w-full min-h-[50px] px-4 py-3 bg-white/[0.08] border border-white/20 rounded-2xl text-white placeholder-slate-400 text-sm font-semibold outline-none focus:border-[#3DD055] focus:ring-2 focus:ring-[#0E9AA7]/60 tabular-nums"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Reassurance Confirm Line */}
                  <div className="p-3 rounded-2xl bg-gradient-to-r from-[#0E9AA7]/15 to-[#3DD055]/15 border border-[#3DD055]/30 flex items-center justify-between text-xs">
                    <span className="text-slate-300 font-medium">Money will be sent to:</span>
                    <strong className="text-[#3DD055] font-black uppercase tracking-wider">
                      {formData.payoutMethod.toUpperCase()} — •••• {payoutLastFour}
                    </strong>
                  </div>

                  {/* Reseller Note */}
                  <p className="text-[11px] text-slate-400 italic">
                    ℹ Note: You can add and manage more payout accounts anytime from Settings → Payout Settings.
                  </p>
                </motion.div>
              )}

              {/* ================= STEP 5: BUSINESS INFORMATION ================= */}
              {currentStep === 5 && (
                <motion.div
                  key="step5"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.22 }}
                  className="space-y-4"
                >
                  <p className="text-xs text-slate-300 bg-white/[0.04] p-2.5 rounded-xl border border-white/10">
                    Connect your active selling channels. Facebook Page is required for verification.
                  </p>

                  {/* 1. Facebook Page Link (Required) */}
                  <div className={`space-y-1.5 ${shakeFields.has('facebookPage') ? 'animate-shake' : ''}`}>
                    <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-blue-400" /> Facebook Page Link <span className="text-[#3DD055]">*</span>
                      </span>
                      {isValidFacebookUrl(formData.facebookPage) && (
                        <span className="text-[10px] text-[#3DD055] font-bold flex items-center gap-0.5">
                          <Check className="w-3 h-3" /> Valid Link
                        </span>
                      )}
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="url"
                        required
                        placeholder="https://facebook.com/yourshop"
                        value={formData.facebookPage}
                        onFocus={handleInputFocus}
                        onChange={(e) => setFormData({ ...formData, facebookPage: e.target.value })}
                        className="w-full min-h-[50px] px-4 pr-11 py-3 bg-white/[0.08] backdrop-blur-[24px] border border-white/20 rounded-2xl text-white placeholder-slate-400 text-sm font-semibold outline-none focus:border-[#3DD055] focus:ring-2 focus:ring-[#0E9AA7]/60"
                      />
                      {formData.facebookPage && (
                        <button
                          type="button"
                          onClick={() => handleOpenLink(formData.facebookPage)}
                          title="Open and test link"
                          className="absolute right-3 p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-colors cursor-pointer"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 2. TikTok Profile Link (Optional) */}
                  <div className={`space-y-1.5 ${shakeFields.has('tiktokUrl') ? 'animate-shake' : ''}`}>
                    <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-rose-400" /> TikTok Profile Link (Optional)
                      </span>
                      {formData.tiktokUrl && isValidTikTokUrl(formData.tiktokUrl) && (
                        <span className="text-[10px] text-[#3DD055] font-bold flex items-center gap-0.5">
                          <Check className="w-3 h-3" /> Valid
                        </span>
                      )}
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="url"
                        placeholder="https://tiktok.com/@yourshop"
                        value={formData.tiktokUrl}
                        onFocus={handleInputFocus}
                        onChange={(e) => setFormData({ ...formData, tiktokUrl: e.target.value })}
                        className="w-full min-h-[50px] px-4 pr-11 py-3 bg-white/[0.08] border border-white/20 rounded-2xl text-white placeholder-slate-400 text-sm font-semibold outline-none focus:border-[#3DD055] focus:ring-2 focus:ring-[#0E9AA7]/60"
                      />
                      {formData.tiktokUrl && (
                        <button
                          type="button"
                          onClick={() => handleOpenLink(formData.tiktokUrl)}
                          title="Open and test link"
                          className="absolute right-3 p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-colors cursor-pointer"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 3. Instagram Profile Link (Optional) */}
                  <div className={`space-y-1.5 ${shakeFields.has('instagramUrl') ? 'animate-shake' : ''}`}>
                    <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-pink-400" /> Instagram Profile Link (Optional)
                      </span>
                      {formData.instagramUrl && isValidInstagramUrl(formData.instagramUrl) && (
                        <span className="text-[10px] text-[#3DD055] font-bold flex items-center gap-0.5">
                          <Check className="w-3 h-3" /> Valid
                        </span>
                      )}
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="url"
                        placeholder="https://instagram.com/yourshop"
                        value={formData.instagramUrl}
                        onFocus={handleInputFocus}
                        onChange={(e) => setFormData({ ...formData, instagramUrl: e.target.value })}
                        className="w-full min-h-[50px] px-4 pr-11 py-3 bg-white/[0.08] border border-white/20 rounded-2xl text-white placeholder-slate-400 text-sm font-semibold outline-none focus:border-[#3DD055] focus:ring-2 focus:ring-[#0E9AA7]/60"
                      />
                      {formData.instagramUrl && (
                        <button
                          type="button"
                          onClick={() => handleOpenLink(formData.instagramUrl)}
                          title="Open and test link"
                          className="absolute right-3 p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-colors cursor-pointer"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 4. YouTube Channel Link (Optional) */}
                  <div className={`space-y-1.5 ${shakeFields.has('youtubeUrl') ? 'animate-shake' : ''}`}>
                    <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-red-500" /> YouTube Channel Link (Optional)
                      </span>
                      {formData.youtubeUrl && isValidYouTubeUrl(formData.youtubeUrl) && (
                        <span className="text-[10px] text-[#3DD055] font-bold flex items-center gap-0.5">
                          <Check className="w-3 h-3" /> Valid
                        </span>
                      )}
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="url"
                        placeholder="https://youtube.com/@yourchannel"
                        value={formData.youtubeUrl}
                        onFocus={handleInputFocus}
                        onChange={(e) => setFormData({ ...formData, youtubeUrl: e.target.value })}
                        className="w-full min-h-[50px] px-4 pr-11 py-3 bg-white/[0.08] border border-white/20 rounded-2xl text-white placeholder-slate-400 text-sm font-semibold outline-none focus:border-[#3DD055] focus:ring-2 focus:ring-[#0E9AA7]/60"
                      />
                      {formData.youtubeUrl && (
                        <button
                          type="button"
                          onClick={() => handleOpenLink(formData.youtubeUrl)}
                          title="Open and test link"
                          className="absolute right-3 p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-colors cursor-pointer"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ================= STEP 6: PHOTOGRAPHY & DOCUMENTS ================= */}
              {currentStep === 6 && (
                <motion.div
                  key="step6"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.22 }}
                  className="space-y-4"
                >
                  {/* Shop Logo Section (Square 1:1 Required) */}
                  <div className={`space-y-2 p-3.5 rounded-2xl bg-white/[0.04] border border-white/15 ${shakeFields.has('shopLogoUrl') ? 'animate-shake' : ''}`}>
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                        <Store className="w-4 h-4 text-[#3DD055]" /> Shop Logo (1:1 Square) <span className="text-[#3DD055]">*</span>
                      </label>
                      <span className="text-[10px] text-slate-400">Min 500x500 px (Max 5MB)</span>
                    </div>

                    {formData.shopLogoUrl ? (
                      <div className="flex items-center gap-4 pt-1">
                        {/* Dual Preview: Circular & Square */}
                        <div className="flex items-center gap-3">
                          <div className="flex flex-col items-center gap-1">
                            <div className="w-14 h-14 rounded-full border-2 border-[#3DD055] overflow-hidden bg-black/40 shadow-md">
                              <img src={formData.shopLogoUrl} alt="Logo Circular" className="w-full h-full object-cover" />
                            </div>
                            <span className="text-[9px] text-slate-400 font-semibold">Circle</span>
                          </div>

                          <div className="flex flex-col items-center gap-1">
                            <div className="w-14 h-14 rounded-2xl border-2 border-[#0E9AA7] overflow-hidden bg-black/40 shadow-md">
                              <img src={formData.shopLogoUrl} alt="Logo Square" className="w-full h-full object-cover" />
                            </div>
                            <span className="text-[9px] text-slate-400 font-semibold">Square</span>
                          </div>
                        </div>

                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-1 text-[11px] font-bold text-[#3DD055]">
                            <CheckCircle2 className="w-3.5 h-3.5" /> 1:1 Square Verified
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 text-xs font-bold transition-colors cursor-pointer border border-white/20">
                              <span>Change Logo</span>
                              <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                            </label>
                            <button
                              type="button"
                              onClick={() => setFormData({ ...formData, shopLogoUrl: '', profilePhotoUrl: '', shopPhotoUrl: '' })}
                              className="p-1.5 rounded-xl bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <label className="w-full min-h-[90px] rounded-2xl border-2 border-dashed border-white/25 hover:border-[#3DD055] bg-white/[0.03] hover:bg-white/[0.06] flex flex-col items-center justify-center gap-1.5 text-xs text-slate-300 transition-all cursor-pointer p-4 group">
                          <Upload className="w-6 h-6 text-[#0E9AA7] group-hover:scale-110 transition-transform" />
                          <span className="font-bold">Upload Shop Logo (Square 1:1)</span>
                          <span className="text-[10px] text-slate-400">Non-square images open built-in cropper</span>
                          <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleLogoUpload} />
                        </label>
                        {uploadProgress.shopLogo ? (
                          <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                            <div className="bg-[#3DD055] h-full transition-all duration-200" style={{ width: `${uploadProgress.shopLogo}%` }} />
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>

                  {/* Document Type Selector */}
                  <div className="space-y-2 pt-1">
                    <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <FileCheck className="w-4 h-4 text-[#0E9AA7]" /> Document Type <span className="text-[#3DD055]">*</span>
                      </span>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { id: 'nid', label: 'National ID (NID)' },
                        { id: 'birth_certificate', label: 'Birth Certificate' },
                      ].map((item) => {
                        const isDocSelected = formData.documentType === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              triggerHaptic('light');
                              setFormData({ ...formData, documentType: item.id as any });
                            }}
                            className={`min-h-[46px] rounded-2xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all border cursor-pointer select-none ${
                              isDocSelected
                                ? 'bg-gradient-to-r from-[#0E9AA7] to-[#3DD055] text-white border-white/30 shadow-[0_0_15px_rgba(61,208,85,0.3)]'
                                : 'bg-white/[0.06] text-slate-300 border-white/15 hover:bg-white/[0.1]'
                            }`}
                          >
                            <span>{item.label}</span>
                            {isDocSelected && <Check className="w-3.5 h-3.5 text-white" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Document Upload Section based on chosen Document Type */}
                  {formData.documentType === 'nid' ? (
                    <div className="space-y-3 p-3.5 rounded-2xl bg-white/[0.04] border border-white/10">
                      <p className="text-[11px] text-slate-300 leading-relaxed">
                        ℹ Providing both NID front & back photos speeds up admin verification & approval.
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* NID Front */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                            <span>NID Front Side</span>
                            {formData.nidFrontUrl && <span className="text-[10px] text-[#3DD055] font-bold">✓ Uploaded</span>}
                          </label>
                          {formData.nidFrontUrl ? (
                            <div className="relative rounded-xl overflow-hidden border border-[#3DD055] aspect-[16/10] bg-black/40">
                              <img src={formData.nidFrontUrl} alt="NID Front" className="w-full h-full object-cover" />
                              <button
                                type="button"
                                onClick={() => setFormData({ ...formData, nidFrontUrl: '' })}
                                className="absolute top-2 right-2 p-1 rounded-lg bg-black/60 text-rose-300 hover:text-white"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <label className="rounded-xl border border-dashed border-white/25 hover:border-[#0E9AA7] bg-white/[0.03] flex flex-col items-center justify-center p-3 text-xs text-slate-300 cursor-pointer aspect-[16/10] transition-colors">
                              <Camera className="w-5 h-5 text-slate-400 mb-1" />
                              <span className="font-semibold text-[11px]">Upload NID Front</span>
                              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleDocumentUpload(e, 'nidFrontUrl')} />
                            </label>
                          )}
                        </div>

                        {/* NID Back */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                            <span>NID Back Side</span>
                            {formData.nidBackUrl && <span className="text-[10px] text-[#3DD055] font-bold">✓ Uploaded</span>}
                          </label>
                          {formData.nidBackUrl ? (
                            <div className="relative rounded-xl overflow-hidden border border-[#3DD055] aspect-[16/10] bg-black/40">
                              <img src={formData.nidBackUrl} alt="NID Back" className="w-full h-full object-cover" />
                              <button
                                type="button"
                                onClick={() => setFormData({ ...formData, nidBackUrl: '' })}
                                className="absolute top-2 right-2 p-1 rounded-lg bg-black/60 text-rose-300 hover:text-white"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <label className="rounded-xl border border-dashed border-white/25 hover:border-[#0E9AA7] bg-white/[0.03] flex flex-col items-center justify-center p-3 text-xs text-slate-300 cursor-pointer aspect-[16/10] transition-colors">
                              <Camera className="w-5 h-5 text-slate-400 mb-1" />
                              <span className="font-semibold text-[11px]">Upload NID Back</span>
                              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleDocumentUpload(e, 'nidBackUrl')} />
                            </label>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Birth Certificate */
                    <div className={`space-y-2 p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 ${shakeFields.has('birthCertificateUrl') ? 'animate-shake' : ''}`}>
                      <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                        <span>Birth Certificate Photo <span className="text-[#3DD055]">*</span></span>
                        {formData.birthCertificateUrl && <span className="text-[10px] text-[#3DD055] font-bold">✓ Uploaded</span>}
                      </label>

                      {formData.birthCertificateUrl ? (
                        <div className="relative rounded-xl overflow-hidden border border-[#3DD055] aspect-[16/10] bg-black/40 max-h-48">
                          <img src={formData.birthCertificateUrl} alt="Birth Certificate" className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, birthCertificateUrl: '' })}
                            className="absolute top-2 right-2 p-1 rounded-lg bg-black/60 text-rose-300 hover:text-white"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <label className="rounded-xl border-2 border-dashed border-white/25 hover:border-[#3DD055] bg-white/[0.03] flex flex-col items-center justify-center p-6 text-xs text-slate-300 cursor-pointer transition-colors">
                          <FileText className="w-6 h-6 text-[#0E9AA7] mb-1.5" />
                          <span className="font-bold">Upload Clear Photo of Birth Certificate</span>
                          <span className="text-[10px] text-slate-400">JPG, PNG or WEBP (Max 5MB)</span>
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => handleDocumentUpload(e, 'birthCertificateUrl')} />
                        </label>
                      )}
                    </div>
                  )}
                </motion.div>
              )}

              {/* ================= STEP 7: ACCOUNT SECURITY & TERMS ================= */}
              {currentStep === 7 && (
                <motion.div
                  key="step7"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.22 }}
                  className="space-y-4"
                >
                  {/* System Reseller ID Notice */}
                  <div className="p-3.5 rounded-2xl bg-gradient-to-r from-[#0E9AA7]/15 to-[#3DD055]/15 border border-[#3DD055]/30 flex items-start gap-3 text-xs">
                    <Sparkles className="w-5 h-5 text-[#3DD055] shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <span className="font-bold text-white block">
                        {isResubmit ? 'Reseller ID & Credentials Preserved' : 'System-Assigned Unique Reseller ID'}
                      </span>
                      <p className="text-slate-300 text-[11px] leading-relaxed">
                        {isResubmit ? (
                          <>
                            Your Reseller ID <span className="font-mono font-bold text-[#3DD055]">({initialProfile?.resellerId || 'Assigned'})</span> and existing account password remain secure and active.
                          </>
                        ) : (
                          <>
                            Your official Reseller ID (e.g. <span className="font-mono font-bold text-[#3DD055]">RSB-000001</span>) will be generated on the server during submission. You can use it as your username to sign in.
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  {isResubmit ? (
                    <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center gap-3">
                      <ShieldCheck className="w-6 h-6 text-[#3DD055] shrink-0" />
                      <div className="text-xs">
                        <p className="font-bold text-white">Security & Password Verified</p>
                        <p className="text-slate-300 text-[11px]">Your login credentials are secure. You may proceed to review and resubmit your updated information.</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Password Input with Show/Hide Toggle */}
                      <div className={`space-y-1.5 ${shakeFields.has('password') ? 'animate-shake' : ''}`}>
                        <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <Lock className="w-3.5 h-3.5 text-[#0E9AA7]" /> Create Password <span className="text-[#3DD055]">*</span>
                          </span>
                          {evaluatePassword(formData.password).isAcceptable && (
                            <span className="text-[10px] text-[#3DD055] font-bold flex items-center gap-0.5">
                              <Check className="w-3 h-3" /> Minimum Strength Met
                            </span>
                          )}
                        </label>
                        <div className="relative">
                          <input
                            type={showPassword ? 'text' : 'password'}
                            required
                            placeholder="••••••••"
                            value={formData.password}
                            onFocus={handleInputFocus}
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                            className="w-full min-h-[50px] px-4 py-3 bg-white/[0.08] backdrop-blur-[24px] border border-white/20 rounded-2xl text-white placeholder-slate-400 text-sm font-semibold outline-none focus:border-[#3DD055] focus:ring-2 focus:ring-[#0E9AA7]/60 pr-11"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 cursor-pointer"
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>

                        {/* Password Strength Indicator with Checklist */}
                        <PasswordStrengthIndicator password={formData.password} />
                      </div>

                      {/* Confirm Password Input */}
                      <div className={`space-y-1.5 ${shakeFields.has('confirmPassword') ? 'animate-shake' : ''}`}>
                        <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <Lock className="w-3.5 h-3.5 text-[#3DD055]" /> Confirm Password <span className="text-[#3DD055]">*</span>
                          </span>
                          {formData.confirmPassword && formData.password === formData.confirmPassword && (
                            <span className="text-[10px] text-[#3DD055] font-bold flex items-center gap-0.5">
                              <Check className="w-3 h-3" /> Passwords Match
                            </span>
                          )}
                        </label>
                        <div className="relative">
                          <input
                            type={showConfirmPassword ? 'text' : 'password'}
                            required
                            placeholder="••••••••"
                            value={formData.confirmPassword}
                            onFocus={handleInputFocus}
                            onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                            className="w-full min-h-[50px] px-4 py-3 bg-white/[0.08] backdrop-blur-[24px] border border-white/20 rounded-2xl text-white placeholder-slate-400 text-sm font-semibold outline-none focus:border-[#3DD055] focus:ring-2 focus:ring-[#0E9AA7]/60 pr-11"
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 cursor-pointer"
                          >
                            {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Separate Terms & Conditions and Privacy Checkboxes */}
                  <div className="space-y-3 pt-2">
                    {/* 1. Terms & Conditions Checkbox */}
                    <div className={`p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 space-y-2 ${shakeFields.has('agreeToTerms') ? 'animate-shake' : ''}`}>
                      <div className="flex items-start justify-between gap-3">
                        <label className={`flex items-start gap-2.5 text-xs text-slate-300 ${!formData.hasScrolledTerms ? 'opacity-80 cursor-not-allowed' : 'cursor-pointer'}`}>
                          <input
                            type="checkbox"
                            disabled={!formData.hasScrolledTerms}
                            checked={formData.agreeToTerms}
                            onChange={(e) => setFormData({ ...formData, agreeToTerms: e.target.checked })}
                            className="w-4 h-4 mt-0.5 rounded text-[#3DD055] accent-[#3DD055] shrink-0 cursor-pointer disabled:cursor-not-allowed"
                          />
                          <span className="leading-relaxed">
                            I agree to the <strong className="text-white">ReSellBD Reseller Terms & Conditions (v1.0)</strong>, Wholesale Commission Rules, and Payout Guidelines.
                          </span>
                        </label>

                        <button
                          type="button"
                          onClick={() => setActivePolicyModal(DEFAULT_TERMS_POLICY)}
                          className="px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/20 text-[#38BDF8] text-[11px] font-bold shrink-0 transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <BookOpen className="w-3.5 h-3.5" />
                          <span>Review Terms</span>
                        </button>
                      </div>

                      {!formData.hasScrolledTerms && (
                        <div className="text-[10px] text-amber-300 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20 flex items-center gap-1.5">
                          <span>ℹ Please click "Review Terms" and scroll through the document once to enable this agreement.</span>
                        </div>
                      )}
                    </div>

                    {/* 2. Privacy Policy Consent Checkbox */}
                    <div className={`p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 space-y-2 ${shakeFields.has('agreeToPrivacy') ? 'animate-shake' : ''}`}>
                      <div className="flex items-start justify-between gap-3">
                        <label className={`flex items-start gap-2.5 text-xs text-slate-300 ${!formData.hasScrolledPrivacy ? 'opacity-80 cursor-not-allowed' : 'cursor-pointer'}`}>
                          <input
                            type="checkbox"
                            disabled={!formData.hasScrolledPrivacy}
                            checked={formData.agreeToPrivacy}
                            onChange={(e) => setFormData({ ...formData, agreeToPrivacy: e.target.checked })}
                            className="w-4 h-4 mt-0.5 rounded text-[#3DD055] accent-[#3DD055] shrink-0 cursor-pointer disabled:cursor-not-allowed"
                          />
                          <span className="leading-relaxed">
                            I consent to the collection and compliance verification of my <strong className="text-white">National ID / Birth Certificate & Shop Details</strong> under the ReSellBD Privacy Policy.
                          </span>
                        </label>

                        <button
                          type="button"
                          onClick={() => setActivePolicyModal(DEFAULT_PRIVACY_POLICY)}
                          className="px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/20 text-[#3DD055] text-[11px] font-bold shrink-0 transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>Review Privacy</span>
                        </button>
                      </div>

                      {!formData.hasScrolledPrivacy && (
                        <div className="text-[10px] text-amber-300 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20 flex items-center gap-1.5">
                          <span>ℹ Please click "Review Privacy" and scroll through the document once to enable consent.</span>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ================= STEP 8: REVIEW & SUBMIT ================= */}
              {currentStep === 8 && (
                <motion.div
                  key="step8"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.22 }}
                  className="space-y-3.5 text-xs"
                >
                  <p className="text-xs text-slate-300 bg-white/[0.04] p-3 rounded-2xl border border-white/10 flex items-center justify-between">
                    <span>Review your details carefully before final submission. Tap "Edit" to modify any section.</span>
                    <span className="text-[10px] text-[#3DD055] font-bold">7 of 7 Sections Ready</span>
                  </p>

                  {/* 1. Basic Details Card */}
                  <div className="rounded-2xl bg-white/[0.05] border border-white/10 overflow-hidden">
                    <div className="p-3.5 flex items-center justify-between border-b border-white/10 bg-white/[0.02]">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-[#0E9AA7]" />
                        <span className="font-bold text-white text-xs">1. Basic Details</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setCurrentStep(1)}
                          className="text-[11px] text-[#38BDF8] font-bold hover:underline cursor-pointer"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setCollapsedCards((prev) => ({ ...prev, basic: !prev.basic }))}
                          className="p-1 text-slate-400 hover:text-white"
                        >
                          {collapsedCards.basic ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    {!collapsedCards.basic && (
                      <div className="p-3.5 grid grid-cols-2 gap-2 text-slate-300">
                        <div>
                          <span className="text-slate-400 text-[10px] block">Shop Name:</span>
                          <strong className="text-[#3DD055]">{formData.shopName || '—'}</strong>
                        </div>
                        <div>
                          <span className="text-slate-400 text-[10px] block">Owner Name:</span>
                          <strong className="text-white">{formData.fullName || '—'}</strong>
                        </div>
                        <div>
                          <span className="text-slate-400 text-[10px] block">Date of Birth:</span>
                          <span>{formData.dob || '—'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 text-[10px] block">Gender:</span>
                          <span className="capitalize">{formData.gender || '—'}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 2. Contact Information Card */}
                  <div className="rounded-2xl bg-white/[0.05] border border-white/10 overflow-hidden">
                    <div className="p-3.5 flex items-center justify-between border-b border-white/10 bg-white/[0.02]">
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-[#3DD055]" />
                        <span className="font-bold text-white text-xs">2. Contact Information</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setCurrentStep(2)}
                          className="text-[11px] text-[#38BDF8] font-bold hover:underline cursor-pointer"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setCollapsedCards((prev) => ({ ...prev, contact: !prev.contact }))}
                          className="p-1 text-slate-400 hover:text-white"
                        >
                          {collapsedCards.contact ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    {!collapsedCards.contact && (
                      <div className="p-3.5 space-y-1.5 text-slate-300">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Email Address:</span>
                          <span className="text-white font-mono flex items-center gap-1">
                            {formData.email} <span className="text-[#3DD055] font-bold text-[10px]">✓ Verified</span>
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Mobile Number:</span>
                          <span className="text-white font-mono">{formData.mobile || '—'}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">WhatsApp Number:</span>
                          <span className="text-white font-mono">
                            {formData.sameAsMobile ? formData.mobile : formData.whatsappNumber || '—'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 3. Shop Address Card */}
                  <div className="rounded-2xl bg-white/[0.05] border border-white/10 overflow-hidden">
                    <div className="p-3.5 flex items-center justify-between border-b border-white/10 bg-white/[0.02]">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-cyan-400" />
                        <span className="font-bold text-white text-xs">3. Shop Address</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setCurrentStep(3)}
                          className="text-[11px] text-[#38BDF8] font-bold hover:underline cursor-pointer"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setCollapsedCards((prev) => ({ ...prev, address: !prev.address }))}
                          className="p-1 text-slate-400 hover:text-white"
                        >
                          {collapsedCards.address ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    {!collapsedCards.address && (
                      <div className="p-3.5 space-y-1 text-slate-300">
                        <div>
                          <span className="text-slate-400">Region:</span>{' '}
                          <strong className="text-white">
                            {formData.upazila || formData.customUpazila}, {formData.district || formData.customDistrict}, {formData.division || formData.customDivision}
                          </strong>
                        </div>
                        <div>
                          <span className="text-slate-400">Union / Ward:</span>{' '}
                          <span>{formData.union || formData.customUnion || '—'} {formData.ward ? `(Ward ${formData.ward})` : ''}</span>
                        </div>
                        <div>
                          <span className="text-slate-400">Postal Code:</span>{' '}
                          <span className="font-mono">{formData.postalCode || '—'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400">Street Address:</span>{' '}
                          <span className="text-white">{formData.address || '—'}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 4. Payout Information Card (Masked) */}
                  <div className="rounded-2xl bg-white/[0.05] border border-white/10 overflow-hidden">
                    <div className="p-3.5 flex items-center justify-between border-b border-white/10 bg-white/[0.02]">
                      <div className="flex items-center gap-2">
                        <Landmark className="w-4 h-4 text-amber-400" />
                        <span className="font-bold text-white text-xs">4. Payout Information</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setCurrentStep(4)}
                          className="text-[11px] text-[#38BDF8] font-bold hover:underline cursor-pointer"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setCollapsedCards((prev) => ({ ...prev, payout: !prev.payout }))}
                          className="p-1 text-slate-400 hover:text-white"
                        >
                          {collapsedCards.payout ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    {!collapsedCards.payout && (
                      <div className="p-3.5 space-y-1.5 text-slate-300">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Payout Method:</span>
                          <span className="px-2 py-0.5 rounded-lg bg-gradient-to-r from-[#0E9AA7]/20 to-[#3DD055]/20 border border-[#3DD055]/40 text-[#3DD055] font-extrabold uppercase">
                            {formData.payoutMethod}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Account Holder:</span>
                          <strong className="text-white">{formData.accountHolderName || formData.fullName}</strong>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Account Number:</span>
                          <span className="font-mono text-white">
                            {formData.accountNumber ? `${formData.accountNumber.slice(0, 3)}•••••${formData.accountNumber.slice(-3)}` : '••••'}
                          </span>
                        </div>
                        {formData.payoutMethod === 'bank' && (
                          <>
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400">Bank & Branch:</span>
                              <span className="text-white">{formData.bankName || formData.customBankName} — {formData.branchName}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400">Routing Number:</span>
                              <span className="font-mono text-white">{formData.routingNumber}</span>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 5. Business Information Card */}
                  <div className="rounded-2xl bg-white/[0.05] border border-white/10 overflow-hidden">
                    <div className="p-3.5 flex items-center justify-between border-b border-white/10 bg-white/[0.02]">
                      <div className="flex items-center gap-2">
                        <Briefcase className="w-4 h-4 text-purple-400" />
                        <span className="font-bold text-white text-xs">5. Business Channels</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setCurrentStep(5)}
                          className="text-[11px] text-[#38BDF8] font-bold hover:underline cursor-pointer"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setCollapsedCards((prev) => ({ ...prev, business: !prev.business }))}
                          className="p-1 text-slate-400 hover:text-white"
                        >
                          {collapsedCards.business ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    {!collapsedCards.business && (
                      <div className="p-3.5 space-y-1 text-slate-300">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Facebook Page:</span>
                          <span className="text-[#38BDF8] truncate max-w-[200px]">{formData.facebookPage}</span>
                        </div>
                        {formData.tiktokUrl && (
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">TikTok:</span>
                            <span className="text-rose-400 truncate max-w-[200px]">{formData.tiktokUrl}</span>
                          </div>
                        )}
                        {formData.instagramUrl && (
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">Instagram:</span>
                            <span className="text-pink-400 truncate max-w-[200px]">{formData.instagramUrl}</span>
                          </div>
                        )}
                        {formData.youtubeUrl && (
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">YouTube:</span>
                            <span className="text-red-400 truncate max-w-[200px]">{formData.youtubeUrl}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 6. Photography & Documents Card */}
                  <div className="rounded-2xl bg-white/[0.05] border border-white/10 overflow-hidden">
                    <div className="p-3.5 flex items-center justify-between border-b border-white/10 bg-white/[0.02]">
                      <div className="flex items-center gap-2">
                        <Camera className="w-4 h-4 text-emerald-400" />
                        <span className="font-bold text-white text-xs">6. Photography & Documents</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setCurrentStep(6)}
                          className="text-[11px] text-[#38BDF8] font-bold hover:underline cursor-pointer"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setCollapsedCards((prev) => ({ ...prev, photos: !prev.photos }))}
                          className="p-1 text-slate-400 hover:text-white"
                        >
                          {collapsedCards.photos ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    {!collapsedCards.photos && (
                      <div className="p-3.5 flex items-center gap-3">
                        {formData.shopLogoUrl && (
                          <div className="w-14 h-14 rounded-2xl overflow-hidden border-2 border-[#3DD055] shrink-0 bg-black/40 shadow-md">
                            <img src={formData.shopLogoUrl} alt="Logo" className="w-full h-full object-cover" />
                          </div>
                        )}
                        <div className="space-y-1 text-slate-300 flex-1">
                          <div>
                            <span className="text-slate-400">Document Type:</span>{' '}
                            <strong className="text-white uppercase">{formData.documentType}</strong>
                          </div>
                          <div className="text-[11px] text-[#3DD055] font-bold flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>
                              {formData.documentType === 'nid'
                                ? `NID Front & Back Attached`
                                : 'Birth Certificate Photo Attached'}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 7. Security & Policy Consents Card */}
                  <div className="rounded-2xl bg-white/[0.05] border border-white/10 overflow-hidden">
                    <div className="p-3.5 flex items-center justify-between border-b border-white/10 bg-white/[0.02]">
                      <div className="flex items-center gap-2">
                        <Lock className="w-4 h-4 text-[#0E9AA7]" />
                        <span className="font-bold text-white text-xs">7. Security & Consents</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setCurrentStep(7)}
                          className="text-[11px] text-[#38BDF8] font-bold hover:underline cursor-pointer"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setCollapsedCards((prev) => ({ ...prev, security: !prev.security }))}
                          className="p-1 text-slate-400 hover:text-white"
                        >
                          {collapsedCards.security ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    {!collapsedCards.security && (
                      <div className="p-3.5 space-y-1.5 text-slate-300">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Password:</span>
                          <span className="font-mono text-white">••••••••••••</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Terms & Conditions:</span>
                          <span className="text-[#3DD055] font-bold flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" /> Version 1.0 Accepted
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Privacy & KYC Consent:</span>
                          <span className="text-[#3DD055] font-bold flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" /> Consent Granted
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Final Reassurance Box */}
                  <div className="p-3.5 rounded-2xl bg-[#3DD055]/10 border border-[#3DD055]/20 flex items-center gap-2.5">
                    <ShieldCheck className="w-5 h-5 text-[#3DD055] shrink-0" />
                    <p className="text-slate-300 text-[11px] leading-tight">
                      By submitting, your application enters the admin verification pipeline. Upon KYC approval, your Reseller ID will activate with full wholesale catalog privileges!
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submitting Multi-stage Progress Feedback */}
            {loading && submittingStepText && (
              <div className="mt-4 p-3 rounded-2xl bg-white/[0.08] border border-[#0E9AA7]/50 flex items-center gap-2.5 text-xs text-cyan-300 animate-pulse">
                <Sparkles className="w-4 h-4 text-[#3DD055] shrink-0" />
                <span className="font-semibold">{submittingStepText}</span>
              </div>
            )}

            {/* 4. Sticky Bottom Controls (Back, Next, Submit) */}
            <div className="mt-6 pt-4 border-t border-white/10 flex items-center gap-3">
              {currentStep > 1 && (
                <button
                  type="button"
                  onClick={handleBack}
                  disabled={loading}
                  className="min-h-[50px] px-5 rounded-2xl bg-white/[0.08] hover:bg-white/[0.12] border border-white/20 text-slate-200 font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95 select-none"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>
              )}

              {currentStep < 8 ? (
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={currentStep === 1 && (shopNameCheck.status === 'checking' || shopNameCheck.status === 'taken')}
                  className={`flex-1 min-h-[50px] px-6 rounded-2xl bg-gradient-to-r from-[#0E9AA7] via-[#3DD055] to-[#0E9AA7] hover:brightness-110 active:scale-98 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-[0_10px_25px_-5px_rgba(61,208,85,0.4)] border border-white/30 transition-all select-none relative overflow-hidden group ${
                    currentStep === 1 && (shopNameCheck.status === 'checking' || shopNameCheck.status === 'taken')
                      ? 'opacity-40 cursor-not-allowed'
                      : 'cursor-pointer'
                  }`}
                >
                  <div className="absolute inset-0 pointer-events-none overflow-hidden">
                    <div className="absolute -inset-[100%] bg-gradient-to-tr from-transparent via-white/30 to-transparent group-hover:animate-shimmer-sweep" />
                  </div>
                  <span>Continue to Step {currentStep + 1}</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 min-h-[50px] px-6 rounded-2xl bg-gradient-to-r from-[#0E9AA7] via-[#3DD055] to-[#0E9AA7] hover:brightness-110 active:scale-98 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-[0_12px_30px_-5px_rgba(61,208,85,0.5)] border border-white/30 transition-all cursor-pointer select-none relative overflow-hidden group disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <div className="absolute inset-0 pointer-events-none overflow-hidden">
                    <div className="absolute -inset-[100%] bg-gradient-to-tr from-transparent via-white/30 to-transparent group-hover:animate-shimmer-sweep" />
                  </div>
                  {loading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>{submittingStepText || 'Submitting Registration...'}</span>
                    </div>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-white" />
                      <span>{isResubmit ? 'Resubmit Application for Approval' : 'Submit Reseller Registration'}</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </form>
        </div>

        {/* 5. Bottom Login Link */}
        <div className="mt-6 text-center text-xs text-slate-400">
          Already have a reseller account?{' '}
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onSwitchToLogin();
            }}
            className="text-[#3DD055] hover:text-[#3DD055]/80 font-bold hover:underline transition-colors cursor-pointer"
          >
            Sign In Here
          </button>
        </div>
      </div>

      {/* Built-in Square 1:1 Image Cropper Modal */}
      <SquareCropModal
        isOpen={cropModalOpen}
        imageSrc={rawImageForCrop}
        onCancel={() => {
          setCropModalOpen(false);
          setRawImageForCrop('');
        }}
        onCropComplete={(croppedDataUrl) => {
          setFormData((prev) => ({
            ...prev,
            shopLogoUrl: croppedDataUrl,
            profilePhotoUrl: croppedDataUrl,
            shopPhotoUrl: croppedDataUrl,
          }));
          setCropModalOpen(false);
          setRawImageForCrop('');
          triggerHaptic('medium');
        }}
      />

      {/* Policy Modal (Terms & Privacy with Bangla/English and Scroll Detection) */}
      <PolicyModal
        isOpen={!!activePolicyModal}
        policy={activePolicyModal}
        alreadyScrolled={activePolicyModal?.key === 'terms' ? formData.hasScrolledTerms : formData.hasScrolledPrivacy}
        onClose={() => setActivePolicyModal(null)}
        onScrolledToBottom={() => {
          if (activePolicyModal?.key === 'terms') {
            setFormData((prev) => ({ ...prev, hasScrolledTerms: true, agreeToTerms: true }));
          } else if (activePolicyModal?.key === 'privacy') {
            setFormData((prev) => ({ ...prev, hasScrolledPrivacy: true, agreeToPrivacy: true }));
          }
          triggerHaptic('medium');
        }}
      />
    </div>
  );
};
