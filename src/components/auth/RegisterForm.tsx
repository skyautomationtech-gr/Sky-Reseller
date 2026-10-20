import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { SkyLogo } from '../common/SkyLogo';
import { useNetwork } from '../../context/NetworkContext';
import { generateRandomResellerSuffix } from '../../lib/resellerIdHelper';
import { triggerHaptic } from '../../lib/nativeFeedback';
import { 
  User, Store, Calendar, Users, Mail, Phone, MessageSquare, 
  MapPin, Landmark, Briefcase, Camera, Lock, CheckCircle2, 
  ChevronRight, ChevronLeft, AlertCircle, Sparkles, ShieldCheck, 
  Eye, EyeOff, Upload, FileText, Check 
} from 'lucide-react';
import { OtpVerificationInput } from './register/OtpVerificationInput';
import { SearchableSelect, SelectOption } from './register/SearchableSelect';
import { 
  getDivisions, getDistricts, getUpazilas, getUnions,
  BdDivision, BdDistrict, BdUpazila, BdUnion 
} from '../../data/bd/geocodeService';

interface RegisterFormProps {
  onSwitchToLogin: () => void;
  onRegistered: () => void;
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
  { id: 4, key: 'payout', title: 'Payout Information', shortTitle: 'Payout', encouragement: 'Where you receive your weekly commissions.', icon: Landmark },
  { id: 5, key: 'business', title: 'Business Information', shortTitle: 'Business', encouragement: 'Tell us a bit about your store presence.', icon: Briefcase },
  { id: 6, key: 'photos', title: 'Photography & Documents', shortTitle: 'Photos', encouragement: 'Help us verify your shop credibility.', icon: Camera },
  { id: 7, key: 'security', title: 'Account Security & Terms', shortTitle: 'Security', encouragement: 'Almost done! Set your secure password.', icon: Lock },
  { id: 8, key: 'review', title: 'Review & Submit', shortTitle: 'Review', encouragement: 'Double-check everything and launch your account.', icon: CheckCircle2 },
];

const DRAFT_STORAGE_KEY = 'resellbd_reseller_registration_draft_v2';

// Utility to compress images to canvas data URL (~30-60KB) to prevent Firestore 1MB doc size error
const compressImage = (file: File, maxWidth = 600, maxHeight = 600, quality = 0.65): Promise<string> => {
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

export const RegisterForm: React.FC<RegisterFormProps> = ({ onSwitchToLogin, onRegistered }) => {
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

    // Step 4: Payout
    payoutMethod: 'bkash' as 'bkash' | 'nagad' | 'rocket' | 'bank',
    bkashNumber: '',
    nagadNumber: '',
    rocketNumber: '',
    bankName: '',
    accountNumber: '',
    accountHolderName: '',
    branchName: '',

    // Step 5: Business Info
    businessType: 'online_shop',
    nidNumber: '',
    tradeLicenseNo: '',

    // Step 6: Photos & Docs (data URLs stored on client)
    profilePhotoUrl: '',
    shopPhotoUrl: '',
    nidUrl: '',

    // Step 7: Security & Terms
    password: '',
    confirmPassword: '',
    agreeToTerms: false,
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stepError, setStepError] = useState('');
  const [shakeFields, setShakeFields] = useState<Set<string>>(new Set());

  // Bangladesh Administrative Geocode Lists
  const [divisionsList, setDivisionsList] = useState<BdDivision[]>([]);
  const [districtsList, setDistrictsList] = useState<BdDistrict[]>([]);
  const [upazilasList, setUpazilasList] = useState<BdUpazila[]>([]);
  const [unionsList, setUnionsList] = useState<BdUnion[]>([]);

  // Auto-scroll input into view on focus so mobile keyboard doesn't hide it
  const handleInputFocus = (e: React.FocusEvent<HTMLElement>) => {
    e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // Restore Draft from LocalStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Exclude passwords and binary previews
        delete parsed.password;
        delete parsed.confirmPassword;
        setFormData((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // Ignore
    }
  }, []);

  // Auto-save draft on form change (excluding passwords & file blobs)
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

  // Handle phone format normalization: 01[3-9]XXXXXXXX
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

  // Calculate Age (must be 18+)
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

  // Profile Completeness Percentage
  const completeness = useMemo(() => {
    let score = 0;
    const maxScore = 15;

    if (formData.fullName.trim().length >= 3) score += 1;
    if (formData.shopName.trim().length >= 2) score += 1;
    if (formData.dob && calculateAge(formData.dob) >= 18) score += 1;
    if (formData.gender) score += 1;
    if (formData.email && formData.emailVerified) score += 2;
    if (validateBdPhone(formData.mobile)) score += 1;
    if (validateBdPhone(formData.sameAsMobile ? formData.mobile : formData.whatsappNumber)) score += 1;
    if (formData.division) score += 1;
    if (formData.district) score += 1;
    if (formData.upazila) score += 1;
    if (formData.postalCode.length === 4) score += 1;
    if (formData.address.trim().length >= 5) score += 1;
    if (formData.profilePhotoUrl && formData.shopPhotoUrl) score += 1;
    if (formData.password.length >= 6 && formData.password === formData.confirmPassword) score += 1;

    return Math.min(100, Math.round((score / maxScore) * 100));
  }, [formData]);

  // Shake animation trigger for validation failure
  const triggerShake = (fieldKeys: string[]) => {
    setShakeFields(new Set(fieldKeys));
    triggerHaptic('medium');
    setTimeout(() => {
      setShakeFields(new Set());
    }, 600);
  };

  // Validate Step Before Advancing
  const validateCurrentStep = (): boolean => {
    setStepError('');

    if (currentStep === 1) {
      const invalidFields: string[] = [];
      if (formData.fullName.trim().length < 3) invalidFields.push('fullName');
      if (formData.shopName.trim().length < 2) invalidFields.push('shopName');
      if (!formData.dob || calculateAge(formData.dob) < 18) invalidFields.push('dob');
      if (!formData.gender) invalidFields.push('gender');

      if (invalidFields.length > 0) {
        triggerShake(invalidFields);
        if (invalidFields.includes('dob') && formData.dob) {
          setStepError('You must be at least 18 years old to register as a reseller.');
        } else {
          setStepError('Please complete all required fields correctly (Full Name, Shop Name, DOB 18+, Gender).');
        }
        return false;
      }
      return true;
    }

    if (currentStep === 2) {
      const invalidFields: string[] = [];
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!formData.email || !emailRegex.test(formData.email)) {
        invalidFields.push('email');
      }
      if (!formData.emailVerified) {
        invalidFields.push('emailOtp');
      }
      if (!validateBdPhone(formData.mobile)) {
        invalidFields.push('mobile');
      }
      const actualWa = formData.sameAsMobile ? formData.mobile : formData.whatsappNumber;
      if (!validateBdPhone(actualWa)) {
        invalidFields.push('whatsappNumber');
      }

      if (invalidFields.length > 0) {
        triggerShake(invalidFields);
        if (invalidFields.includes('emailOtp')) {
          setStepError('Please verify your email address with the 6-digit OTP code before proceeding.');
        } else if (invalidFields.includes('mobile') || invalidFields.includes('whatsappNumber')) {
          setStepError('Please enter valid 11-digit Bangladesh phone numbers (e.g. 017XXXXXXXX).');
        } else {
          setStepError('Please check your contact details.');
        }
        return false;
      }
      return true;
    }

    if (currentStep === 3) {
      const invalidFields: string[] = [];
      const effectiveDiv = formData.division || formData.customDivision;
      const effectiveDist = formData.district || formData.customDistrict;
      const effectiveUpa = formData.upazila || formData.customUpazila;

      if (!effectiveDiv) invalidFields.push('division');
      if (!effectiveDist) invalidFields.push('district');
      if (!effectiveUpa) invalidFields.push('upazila');
      if (!/^\d{4}$/.test(formData.postalCode.trim())) invalidFields.push('postalCode');
      if (formData.address.trim().length < 5) invalidFields.push('address');

      if (invalidFields.length > 0) {
        triggerShake(invalidFields);
        if (invalidFields.includes('postalCode')) {
          setStepError('Please enter a valid 4-digit postal code (e.g. 1205).');
        } else if (invalidFields.includes('address')) {
          setStepError('Please provide a detailed shop address (min 5 characters).');
        } else {
          setStepError('Please select your complete Division, District, and Upazila.');
        }
        return false;
      }
      return true;
    }

    if (currentStep === 4) {
      // Payout validation (bKash/Nagad/Rocket/Bank)
      if (formData.payoutMethod === 'bkash' && !validateBdPhone(formData.bkashNumber || formData.mobile)) {
        triggerShake(['bkashNumber']);
        setStepError('Please provide a valid bKash number.');
        return false;
      }
      if (formData.payoutMethod === 'nagad' && !validateBdPhone(formData.nagadNumber || formData.mobile)) {
        triggerShake(['nagadNumber']);
        setStepError('Please provide a valid Nagad number.');
        return false;
      }
      if (formData.payoutMethod === 'rocket' && !formData.rocketNumber) {
        triggerShake(['rocketNumber']);
        setStepError('Please provide a valid Rocket number.');
        return false;
      }
      if (formData.payoutMethod === 'bank' && (!formData.bankName || !formData.accountNumber)) {
        triggerShake(['bankName', 'accountNumber']);
        setStepError('Please enter Bank Name and Account Number.');
        return false;
      }
      return true;
    }

    if (currentStep === 6) {
      // Photo validation
      if (!formData.profilePhotoUrl || !formData.shopPhotoUrl) {
        triggerShake(['photos']);
        setStepError('Please upload both your Profile Photo and Shop Photo.');
        return false;
      }
      return true;
    }

    if (currentStep === 7) {
      // Password validation
      if (formData.password.length < 6) {
        triggerShake(['password']);
        setStepError('Password must be at least 6 characters long.');
        return false;
      }
      if (formData.password !== formData.confirmPassword) {
        triggerShake(['confirmPassword']);
        setStepError('Passwords do not match.');
        return false;
      }
      if (!formData.agreeToTerms) {
        triggerShake(['agreeToTerms']);
        setStepError('Please accept the Reseller Terms of Service & Policies.');
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

  // Handle Photo Upload
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: 'profilePhotoUrl' | 'shopPhotoUrl' | 'nidUrl') => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressedDataUrl = await compressImage(file, 600, 600, 0.65);
      setFormData((prev) => ({ ...prev, [field]: compressedDataUrl }));
      triggerHaptic('light');
    } catch (err) {
      console.error('Image compression error:', err);
    }
  };

  // Final Registration Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOnline) {
      setStepError('You are offline. An active internet connection is required to register.');
      return;
    }

    if (!validateCurrentStep()) return;

    setLoading(true);
    setStepError('');
    triggerHaptic('medium');

    try {
      const cleanEmail = formData.email.trim().toLowerCase();
      const cleanMobile = normalizeBdPhone(formData.mobile);
      const cleanWhatsApp = normalizeBdPhone(formData.sameAsMobile ? formData.mobile : formData.whatsappNumber);

      let uid = '';
      try {
        const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, formData.password);
        uid = userCredential.user.uid;
      } catch (authErr: any) {
        if (authErr.code === 'auth/email-already-in-use') {
          try {
            const loginRes = await signInWithEmailAndPassword(auth, cleanEmail, formData.password);
            uid = loginRes.user.uid;
          } catch (loginErr) {
            throw authErr;
          }
        } else {
          throw authErr;
        }
      }

      // Generate unique SGR Reseller Code (e.g. SGR-ERTY)
      const randomSuffix = generateRandomResellerSuffix();
      const resellerCode = `SGR-${randomSuffix}`;

      // Write to Firestore users collection keeping all existing fields + new fields
      await setDoc(doc(db, 'users', uid), {
        uid,
        resellerCode,
        fullName: formData.fullName.trim(),
        shopName: formData.shopName.trim(),
        mobile: cleanMobile,
        whatsappNumber: cleanWhatsApp,
        whatsapp: cleanWhatsApp,
        email: cleanEmail,
        emailVerified: formData.emailVerified,
        dob: formData.dob,
        gender: formData.gender,
        division: formData.division || formData.customDivision,
        divisionId: formData.divisionId || '',
        district: formData.district || formData.customDistrict,
        districtId: formData.districtId || '',
        upazila: formData.upazila || formData.customUpazila,
        upazilaId: formData.upazilaId || '',
        union: formData.union || formData.customUnion || '',
        unionId: formData.unionId || '',
        ward: formData.ward || '',
        postalCode: formData.postalCode.trim(),
        address: formData.address.trim(),
        payoutMethod: formData.payoutMethod,
        bkashNumber: (formData.bkashNumber || cleanMobile).trim(),
        nagadNumber: (formData.nagadNumber || cleanMobile).trim(),
        rocketNumber: formData.rocketNumber.trim(),
        bankName: formData.bankName.trim(),
        accountNumber: formData.accountNumber.trim(),
        accountHolderName: formData.accountHolderName.trim(),
        branchName: formData.branchName.trim(),
        profilePhotoUrl: formData.profilePhotoUrl,
        shopPhotoUrl: formData.shopPhotoUrl,
        nidUrl: formData.nidUrl || '',
        nidNumber: formData.nidNumber || '',
        role: 'reseller',
        status: 'pending',
        rejectReason: null,
        plainPassword: formData.password,
        createdAt: serverTimestamp(),
      });

      // Clear local draft upon successful registration
      try {
        localStorage.removeItem(DRAFT_STORAGE_KEY);
      } catch {
        // Ignore
      }

      triggerHaptic('heavy');
      onRegistered();
    } catch (err: any) {
      console.error('Registration submit error:', err);
      let msg = 'Failed to register account. Please check your details and try again.';
      if (err.code === 'auth/email-already-in-use') {
        msg = 'This email address is already in use. Please sign in or use a different email.';
      } else if (err.code === 'auth/invalid-email') {
        msg = 'Invalid email address format.';
      } else if (err.code === 'auth/weak-password') {
        msg = 'Password is too weak. Please use at least 6 characters.';
      } else if (err.message) {
        msg = err.message;
      }
      setStepError(msg);
    } finally {
      setLoading(false);
    }
  };

  const currentStepObj = WIZARD_STEPS.find((s) => s.id === currentStep) || WIZARD_STEPS[0];
  const StepIcon = currentStepObj.icon;

  return (
    <div className="relative min-h-[100dvh] w-full bg-gradient-to-b from-[#050B1A] via-[#071026] to-[#0B1630] flex flex-col justify-between items-center px-4 sm:px-6 py-6 sm:py-10 overflow-x-hidden selection:bg-cyan-500/30 selection:text-white">
      {/* 1. Fluid Ambient Blobs matching Login Screen (teal #0E9AA7, green #3DD055, blue #04203F) */}
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
            <img src="/resellbd-logo.png" alt="ReSellBD" className="w-full h-full object-contain" />
          </div>
          <div className="text-left">
            <h1 className="text-lg sm:text-xl font-black text-white tracking-tight flex items-center gap-1.5 leading-none">
              <span>ReSellBD</span>
              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-gradient-to-r from-[#0E9AA7]/40 to-[#3DD055]/30 border border-[#3DD055]/40 text-[#3DD055] tracking-wider">
                Registration Wizard
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
                  {/* Full Name */}
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
                    <div className="relative">
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
                  </div>

                  {/* Shop Name */}
                  <div className={`space-y-1.5 ${shakeFields.has('shopName') ? 'animate-shake' : ''}`}>
                    <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Store className="w-3.5 h-3.5 text-[#0E9AA7]" /> Shop Name / Store Name <span className="text-[#3DD055]">*</span>
                      </span>
                      {formData.shopName.trim().length >= 2 && (
                        <span className="text-[10px] text-[#3DD055] font-bold flex items-center gap-0.5">
                          <Check className="w-3 h-3" /> Valid
                        </span>
                      )}
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        required
                        placeholder="e.g. GadgetZu or Sky Tech Store"
                        value={formData.shopName}
                        onFocus={handleInputFocus}
                        onChange={(e) => setFormData({ ...formData, shopName: e.target.value })}
                        className="w-full min-h-[50px] px-4 py-3 bg-white/[0.08] backdrop-blur-[24px] border border-white/20 rounded-2xl text-white placeholder-slate-400 text-sm font-semibold outline-none focus:border-[#3DD055] focus:ring-2 focus:ring-[#0E9AA7]/60 focus:shadow-[0_0_15px_rgba(14,154,167,0.35)] transition-all"
                      />
                    </div>
                  </div>

                  {/* Date of Birth (18+ Requirement) */}
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
                    <div className="relative">
                      <input
                        type="date"
                        required
                        value={formData.dob}
                        onFocus={handleInputFocus}
                        max={new Date(new Date().setFullYear(new Date().getFullYear() - 18)).toISOString().split('T')[0]}
                        onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
                        className="w-full min-h-[50px] px-4 py-3 bg-white/[0.08] backdrop-blur-[24px] border border-white/20 rounded-2xl text-white placeholder-slate-400 text-sm font-semibold outline-none focus:border-[#3DD055] focus:ring-2 focus:ring-[#0E9AA7]/60 focus:shadow-[0_0_15px_rgba(14,154,167,0.35)] transition-all [color-scheme:dark]"
                      />
                    </div>
                    {formData.dob && calculateAge(formData.dob) < 18 && (
                      <p className="text-[11px] text-rose-400 font-semibold">
                        ⚠ You must be at least 18 years old to register as a reseller.
                      </p>
                    )}
                  </div>

                  {/* Gender Selector */}
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
                  {/* Email Address */}
                  <div className={`space-y-1.5 ${shakeFields.has('email') ? 'animate-shake' : ''}`}>
                    <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-[#0E9AA7]" /> Email Address <span className="text-[#3DD055]">*</span>
                      </span>
                      {formData.emailVerified && (
                        <span className="text-[10px] text-[#3DD055] font-bold flex items-center gap-0.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#3DD055]" /> Verified
                        </span>
                      )}
                    </label>
                    <div className="relative">
                      <input
                        type="email"
                        required
                        placeholder="e.g. reseller@gmail.com"
                        value={formData.email}
                        onFocus={handleInputFocus}
                        onChange={(e) => {
                          const newEmail = e.target.value;
                          setFormData({ 
                            ...formData, 
                            email: newEmail,
                            // If user edits email after verification, reset verified state!
                            emailVerified: false 
                          });
                        }}
                        className="w-full min-h-[50px] px-4 py-3 bg-white/[0.08] backdrop-blur-[24px] border border-white/20 rounded-2xl text-white placeholder-slate-400 text-sm font-semibold outline-none focus:border-[#3DD055] focus:ring-2 focus:ring-[#0E9AA7]/60 focus:shadow-[0_0_15px_rgba(14,154,167,0.35)] transition-all"
                      />
                    </div>
                  </div>

                  {/* Email OTP Verification Section */}
                  <div className={`space-y-2 p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 ${shakeFields.has('emailOtp') ? 'animate-shake' : ''}`}>
                    <OtpVerificationInput
                      email={formData.email}
                      isVerified={formData.emailVerified}
                      onVerifiedChange={(verified) => {
                        setFormData((prev) => ({ ...prev, emailVerified: verified }));
                      }}
                    />
                  </div>

                  {/* Mobile Number */}
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
                    <div className="relative">
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
                  </div>

                  {/* WhatsApp Number & "Same as Mobile" Toggle */}
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
                    Select your shop address using Bangladesh's full administrative geocode data.
                  </p>

                  {/* 1. Division */}
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

                  {/* 2. District */}
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

                  {/* 3. Upazila / Thana */}
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

                  {/* 4. Union / Ward (Optional but detailed) */}
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

                  {/* Ward Number Selector (1-9) */}
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

                  {/* Postal Code (4 Digits) */}
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

                  {/* Full Detailed Address */}
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
                  <label className="text-xs font-bold text-slate-200">
                    Preferred Payout Method <span className="text-[#3DD055]">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      { id: 'bkash', label: 'bKash' },
                      { id: 'nagad', label: 'Nagad' },
                      { id: 'rocket', label: 'Rocket' },
                      { id: 'bank', label: 'Bank' },
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          setFormData({ ...formData, payoutMethod: item.id as any });
                        }}
                        className={`min-h-[46px] rounded-2xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all border cursor-pointer ${
                          formData.payoutMethod === item.id
                            ? 'bg-gradient-to-r from-[#0E9AA7] to-[#3DD055] text-white border-white/30 shadow-[0_0_15px_rgba(61,208,85,0.3)]'
                            : 'bg-white/[0.06] text-slate-300 border-white/15 hover:bg-white/[0.1]'
                        }`}
                      >
                        <span>{item.label}</span>
                        {formData.payoutMethod === item.id && <Check className="w-3.5 h-3.5 text-white" />}
                      </button>
                    ))}
                  </div>

                  {formData.payoutMethod === 'bkash' && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-200">bKash Personal Number</label>
                      <input
                        type="tel"
                        inputMode="numeric"
                        placeholder={formData.mobile || 'e.g. 01712345678'}
                        value={formData.bkashNumber}
                        onFocus={handleInputFocus}
                        onChange={(e) => setFormData({ ...formData, bkashNumber: e.target.value })}
                        className="w-full min-h-[50px] px-4 py-3 bg-white/[0.08] backdrop-blur-[24px] border border-white/20 rounded-2xl text-white placeholder-slate-400 text-sm font-semibold outline-none focus:border-[#3DD055] focus:ring-2 focus:ring-[#0E9AA7]/60"
                      />
                    </div>
                  )}

                  {formData.payoutMethod === 'nagad' && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-200">Nagad Personal Number</label>
                      <input
                        type="tel"
                        inputMode="numeric"
                        placeholder={formData.mobile || 'e.g. 01812345678'}
                        value={formData.nagadNumber}
                        onFocus={handleInputFocus}
                        onChange={(e) => setFormData({ ...formData, nagadNumber: e.target.value })}
                        className="w-full min-h-[50px] px-4 py-3 bg-white/[0.08] backdrop-blur-[24px] border border-white/20 rounded-2xl text-white placeholder-slate-400 text-sm font-semibold outline-none focus:border-[#3DD055] focus:ring-2 focus:ring-[#0E9AA7]/60"
                      />
                    </div>
                  )}

                  {formData.payoutMethod === 'rocket' && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-200">Rocket Account Number (12 Digits)</label>
                      <input
                        type="tel"
                        inputMode="numeric"
                        placeholder="e.g. 019123456789"
                        value={formData.rocketNumber}
                        onFocus={handleInputFocus}
                        onChange={(e) => setFormData({ ...formData, rocketNumber: e.target.value })}
                        className="w-full min-h-[50px] px-4 py-3 bg-white/[0.08] backdrop-blur-[24px] border border-white/20 rounded-2xl text-white placeholder-slate-400 text-sm font-semibold outline-none focus:border-[#3DD055] focus:ring-2 focus:ring-[#0E9AA7]/60"
                      />
                    </div>
                  )}

                  {formData.payoutMethod === 'bank' && (
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-bold text-slate-200">Bank Name</label>
                        <input
                          type="text"
                          placeholder="e.g. Dutch-Bangla Bank Limited"
                          value={formData.bankName}
                          onFocus={handleInputFocus}
                          onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                          className="w-full min-h-[50px] px-4 py-3 bg-white/[0.08] border border-white/20 rounded-2xl text-white placeholder-slate-400 text-sm font-semibold outline-none focus:border-[#3DD055]"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-200">Account Holder Name</label>
                        <input
                          type="text"
                          placeholder={formData.fullName || "Account Name"}
                          value={formData.accountHolderName}
                          onFocus={handleInputFocus}
                          onChange={(e) => setFormData({ ...formData, accountHolderName: e.target.value })}
                          className="w-full min-h-[50px] px-4 py-3 bg-white/[0.08] border border-white/20 rounded-2xl text-white placeholder-slate-400 text-sm font-semibold outline-none focus:border-[#3DD055]"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-200">Account Number</label>
                        <input
                          type="text"
                          placeholder="Bank Account Number"
                          value={formData.accountNumber}
                          onFocus={handleInputFocus}
                          onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                          className="w-full min-h-[50px] px-4 py-3 bg-white/[0.08] border border-white/20 rounded-2xl text-white placeholder-slate-400 text-sm font-semibold outline-none focus:border-[#3DD055]"
                        />
                      </div>
                    </div>
                  )}
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
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-200">Business Model / Type</label>
                    <select
                      value={formData.businessType}
                      onChange={(e) => setFormData({ ...formData, businessType: e.target.value })}
                      className="w-full min-h-[50px] px-4 py-3 bg-white/[0.08] border border-white/20 rounded-2xl text-white text-sm font-semibold outline-none focus:border-[#3DD055] [color-scheme:dark]"
                    >
                      <option value="online_shop">Online Facebook Page / Website</option>
                      <option value="physical_retail">Physical Retail Shop</option>
                      <option value="hybrid">Both Physical & Online</option>
                      <option value="individual">Individual Reseller</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-200">NID / National ID Card Number (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. 19901234567890"
                      value={formData.nidNumber}
                      onFocus={handleInputFocus}
                      onChange={(e) => setFormData({ ...formData, nidNumber: e.target.value })}
                      className="w-full min-h-[50px] px-4 py-3 bg-white/[0.08] border border-white/20 rounded-2xl text-white placeholder-slate-400 text-sm font-semibold outline-none focus:border-[#3DD055]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-200">Trade License Number (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. TRAD/DNCC/12345/2026"
                      value={formData.tradeLicenseNo}
                      onFocus={handleInputFocus}
                      onChange={(e) => setFormData({ ...formData, tradeLicenseNo: e.target.value })}
                      className="w-full min-h-[50px] px-4 py-3 bg-white/[0.08] border border-white/20 rounded-2xl text-white placeholder-slate-400 text-sm font-semibold outline-none focus:border-[#3DD055]"
                    />
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
                  <p className="text-xs text-slate-300">
                    Upload photos of yourself and your store. Compressed automatically for instant upload.
                  </p>

                  {/* Profile Photo */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                      <span>Owner / Profile Photo <span className="text-[#3DD055]">*</span></span>
                      {formData.profilePhotoUrl && <span className="text-[10px] text-[#3DD055] font-bold">✓ Uploaded</span>}
                    </label>
                    <div className="flex items-center gap-3">
                      {formData.profilePhotoUrl ? (
                        <div className="w-14 h-14 rounded-2xl overflow-hidden border border-[#3DD055] shrink-0">
                          <img src={formData.profilePhotoUrl} alt="Profile" className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center shrink-0">
                          <User className="w-6 h-6 text-slate-400" />
                        </div>
                      )}
                      <label className="flex-1 min-h-[46px] rounded-xl border border-white/20 bg-white/[0.08] hover:bg-white/[0.12] flex items-center justify-center gap-2 text-xs font-bold text-slate-200 cursor-pointer transition-colors">
                        <Upload className="w-4 h-4 text-[#0E9AA7]" />
                        <span>{formData.profilePhotoUrl ? 'Change Profile Photo' : 'Upload Profile Photo'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handlePhotoUpload(e, 'profilePhotoUrl')}
                        />
                      </label>
                    </div>
                  </div>

                  {/* Shop Photo */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                      <span>Shop / Store Photo <span className="text-[#3DD055]">*</span></span>
                      {formData.shopPhotoUrl && <span className="text-[10px] text-[#3DD055] font-bold">✓ Uploaded</span>}
                    </label>
                    <div className="flex items-center gap-3">
                      {formData.shopPhotoUrl ? (
                        <div className="w-14 h-14 rounded-2xl overflow-hidden border border-[#3DD055] shrink-0">
                          <img src={formData.shopPhotoUrl} alt="Shop" className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center shrink-0">
                          <Store className="w-6 h-6 text-slate-400" />
                        </div>
                      )}
                      <label className="flex-1 min-h-[46px] rounded-xl border border-white/20 bg-white/[0.08] hover:bg-white/[0.12] flex items-center justify-center gap-2 text-xs font-bold text-slate-200 cursor-pointer transition-colors">
                        <Upload className="w-4 h-4 text-[#3DD055]" />
                        <span>{formData.shopPhotoUrl ? 'Change Shop Photo' : 'Upload Shop Photo'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handlePhotoUpload(e, 'shopPhotoUrl')}
                        />
                      </label>
                    </div>
                  </div>

                  {/* NID Document Photo (Optional) */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                      <span>NID Card Document (Optional)</span>
                      {formData.nidUrl && <span className="text-[10px] text-[#3DD055] font-bold">✓ Uploaded</span>}
                    </label>
                    <div className="flex items-center gap-3">
                      {formData.nidUrl ? (
                        <div className="w-14 h-14 rounded-2xl overflow-hidden border border-[#3DD055] shrink-0">
                          <img src={formData.nidUrl} alt="NID" className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center shrink-0">
                          <FileText className="w-6 h-6 text-slate-400" />
                        </div>
                      )}
                      <label className="flex-1 min-h-[46px] rounded-xl border border-white/20 bg-white/[0.08] hover:bg-white/[0.12] flex items-center justify-center gap-2 text-xs font-bold text-slate-200 cursor-pointer transition-colors">
                        <Upload className="w-4 h-4 text-slate-400" />
                        <span>{formData.nidUrl ? 'Change NID Photo' : 'Upload NID Card'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handlePhotoUpload(e, 'nidUrl')}
                        />
                      </label>
                    </div>
                  </div>
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
                  {/* Password */}
                  <div className={`space-y-1.5 ${shakeFields.has('password') ? 'animate-shake' : ''}`}>
                    <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-[#0E9AA7]" /> Create Password (Min 6 chars) <span className="text-[#3DD055]">*</span>
                      </span>
                      {formData.password.length >= 6 && (
                        <span className="text-[10px] text-[#3DD055] font-bold">✓ Strong</span>
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
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Confirm Password */}
                  <div className={`space-y-1.5 ${shakeFields.has('confirmPassword') ? 'animate-shake' : ''}`}>
                    <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-[#3DD055]" /> Confirm Password <span className="text-[#3DD055]">*</span>
                      </span>
                      {formData.confirmPassword && formData.password === formData.confirmPassword && (
                        <span className="text-[10px] text-[#3DD055] font-bold flex items-center gap-0.5">
                          <Check className="w-3 h-3" /> Matched
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
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Terms & Policies Checkbox */}
                  <div className={`pt-2 ${shakeFields.has('agreeToTerms') ? 'animate-shake' : ''}`}>
                    <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={formData.agreeToTerms}
                        onChange={(e) => setFormData({ ...formData, agreeToTerms: e.target.checked })}
                        className="w-4 h-4 mt-0.5 rounded text-[#3DD055] accent-[#3DD055] shrink-0"
                      />
                      <span className="leading-relaxed">
                        I agree to the <strong className="text-white">ReSellBD Reseller Terms of Service</strong>, Wholesale Pricing Rules, and Privacy Policy.
                      </span>
                    </label>
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
                  className="space-y-4 text-xs"
                >
                  <div className="p-4 rounded-2xl bg-white/[0.05] border border-white/10 space-y-3">
                    <div className="flex items-center justify-between border-b border-white/10 pb-2">
                      <span className="font-bold text-slate-400 uppercase text-[10px] tracking-wider">Owner & Shop</span>
                      <button type="button" onClick={() => setCurrentStep(1)} className="text-[11px] text-[#0E9AA7] font-bold hover:underline">Edit</button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-slate-200">
                      <div>
                        <span className="text-slate-400 block text-[10px]">Full Name:</span>
                        <strong className="text-white text-xs">{formData.fullName}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Shop Name:</span>
                        <strong className="text-[#3DD055] text-xs">{formData.shopName}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">DOB / Gender:</span>
                        <span>{formData.dob} ({formData.gender})</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-white/[0.05] border border-white/10 space-y-3">
                    <div className="flex items-center justify-between border-b border-white/10 pb-2">
                      <span className="font-bold text-slate-400 uppercase text-[10px] tracking-wider">Contact & Address</span>
                      <button type="button" onClick={() => setCurrentStep(2)} className="text-[11px] text-[#0E9AA7] font-bold hover:underline">Edit</button>
                    </div>
                    <div className="space-y-1.5 text-slate-200">
                      <div><span className="text-slate-400">Email:</span> <strong className="text-white">{formData.email}</strong> (Verified ✓)</div>
                      <div><span className="text-slate-400">Mobile:</span> <strong className="text-white">{formData.mobile}</strong></div>
                      <div><span className="text-slate-400">Location:</span> {formData.upazila}, {formData.district}, {formData.division}</div>
                      <div><span className="text-slate-400">Address:</span> {formData.address}</div>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-[#3DD055]/10 border border-[#3DD055]/20 flex items-center gap-2.5">
                    <ShieldCheck className="w-5 h-5 text-[#3DD055] shrink-0" />
                    <p className="text-slate-300 text-[11px] leading-tight">
                      Your account will be submitted for admin verification. Once reviewed, you can immediately begin ordering wholesale products!
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

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
                  className="flex-1 min-h-[50px] px-6 rounded-2xl bg-gradient-to-r from-[#0E9AA7] via-[#3DD055] to-[#0E9AA7] hover:brightness-110 active:scale-98 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-[0_10px_25px_-5px_rgba(61,208,85,0.4)] border border-white/30 transition-all cursor-pointer select-none relative overflow-hidden group"
                >
                  {/* Electric Shimmer Sweep Highlight */}
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
                  className="flex-1 min-h-[50px] px-6 rounded-2xl bg-gradient-to-r from-[#0E9AA7] via-[#3DD055] to-[#0E9AA7] hover:brightness-110 active:scale-98 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-[0_12px_30px_-5px_rgba(61,208,85,0.5)] border border-white/30 transition-all cursor-pointer select-none relative overflow-hidden group"
                >
                  {/* Electric Shimmer Sweep */}
                  <div className="absolute inset-0 pointer-events-none overflow-hidden">
                    <div className="absolute -inset-[100%] bg-gradient-to-tr from-transparent via-white/30 to-transparent group-hover:animate-shimmer-sweep" />
                  </div>
                  {loading ? (
                    <span>Registering Account...</span>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-white" />
                      <span>Submit Reseller Registration</span>
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
    </div>
  );
};
