import React, { useState, useEffect } from 'react';
import bcrypt from 'bcryptjs';
import { updatePassword, updateEmail, reauthenticateWithCredential, EmailAuthProvider, sendPasswordResetEmail } from 'firebase/auth';
import { doc, getDoc, updateDoc, collection, query, where, getDocs, orderBy, limit, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { UserProfile, PayoutMethod, NotificationPreferences, AppVersionConfig, ChangelogEntry, DEFAULT_DEMO_PRODUCT } from '../../types';
import { logAuditAction } from '../../lib/auditLogger';
import { formatResellerId } from '../../lib/resellerIdHelper';
import { getCurrentAppVersion, getChangelogs, updateUserLastSeenVersion } from '../../lib/versionService';
import { requestAndRegisterPushNotifications, checkPushNotificationPermission } from '../../lib/pushNotifications';
import { WhatsNewModal } from '../version/WhatsNewModal';
import { ChangelogModal } from '../version/ChangelogModal';
import { SupportTicketForm } from '../support/SupportTicketForm';
import { SupportSystem } from '../support/SupportSystem';
import { FeedbackForm } from '../feedback/FeedbackForm';
import { AIMarketingModal } from '../marketing/AIMarketingModal';
import { SocialShareModal } from '../inventory/SocialShareModal';
import { NeumorphicPinKeypad } from '../common/NeumorphicPinKeypad';
import { 
  User, CreditCard, Shield, Lock, Bell, Palette, Smartphone, FileText, 
  HelpCircle, LogOut, ChevronRight, ArrowLeft, Key, Mail, Phone, MapPin,
  CheckCircle2, AlertCircle, Loader2, Plus, Trash2, Edit3, Check, RefreshCw,
  SmartphoneNfc, Laptop, Eye, EyeOff, ShieldCheck, Copy, Sparkles, Building,
  Volume2, VolumeX, Moon, Sun, Globe, DollarSign, Tag, Calendar, History,
  Megaphone, Info, CheckSquare, PhoneCall, MessageCircle, Users, ChevronDown,
  ChevronUp, Bug, UserX, ShieldAlert, MessageSquare, Bot, Search, X, CheckCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { DENSITY_TOKENS as DT } from '../../utils/densityTokens';
import { AccountProfileSection } from './AccountProfileSection';
import { PayoutSettingsSection } from './PayoutSettingsSection';
import { SecuritySection } from './SecuritySection';
import { SectionPlaceholder } from './SectionPlaceholder';
import { triggerHaptic } from '../../lib/nativeFeedback';

export interface ResellerSettingsProps {
  user: UserProfile;
  onLogout: () => void;
  canAccessFullApp?: boolean;
  onOpenLockedModal?: (featureName?: string) => void;
  initialSection?: 'menu' | 'account' | 'payout' | 'security' | 'notifications' | 'preferences' | 'version' | 'info' | 'support' | 'privacy';
  onNavigateTab?: (tab: string) => void;
}

export const ResellerSettings: React.FC<ResellerSettingsProps> = ({ 
  user, 
  onLogout,
  canAccessFullApp = true,
  onOpenLockedModal,
  initialSection = 'menu',
  onNavigateTab,
}) => {
  const [activeSection, setActiveSection] = useState<'menu' | 'account' | 'payout' | 'security' | 'notifications' | 'preferences' | 'version' | 'info' | 'support' | 'privacy' | 'actions'>(initialSection);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedResellerId, setCopiedResellerId] = useState(false);

  // Logout Modal
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  // User Profile Document State (fresh copy from Firestore)
  const [profile, setProfile] = useState<UserProfile>(user);
  const [loadingProfile, setLoadingProfile] = useState(false);

  // AI Marketing & Smart Assist State
  const [showAiModal, setShowAiModal] = useState(false);
  const [showPosterModal, setShowPosterModal] = useState(false);
  const [selectedPosterProduct, setSelectedPosterProduct] = useState<any>(null);
  const [allProductsList, setAllProductsList] = useState<any[]>([]);

  useEffect(() => {
    const loadProducts = async () => {
      try {
        const snap = await getDocs(collection(db, 'products'));
        const prods = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setAllProductsList(prods);
        if (prods.length > 0) {
          setSelectedPosterProduct(prods[0]);
        }
      } catch (err) {
        console.error('Error fetching products for AI tools in settings:', err);
      }
    };
    loadProducts();
  }, []);

  // ==========================================
  // SECTION 1: ACCOUNT & PROFILE STATE
  // ==========================================
  const [fullName, setFullName] = useState(user.fullName || '');
  const [mobile, setMobile] = useState(user.mobile || '');
  const [email, setEmail] = useState(user.email || '');
  const [address, setAddress] = useState(user.address || '');
  const [profilePhotoUrl, setProfilePhotoUrl] = useState(user.profilePhotoUrl || '');
  const [savingAccount, setSavingAccount] = useState(false);

  // ==========================================
  // SECTION 2: PAYOUT SETTINGS STATE
  // ==========================================
  const [payoutMethods, setPayoutMethods] = useState<PayoutMethod[]>(user.payoutMethods || []);
  const [isPayoutModalOpen, setIsPayoutModalOpen] = useState(false);
  const [editingPayoutId, setEditingPayoutId] = useState<string | null>(null);
  const [payoutType, setPayoutType] = useState<'bKash' | 'Nagad' | 'Bank'>('bKash');
  const [payoutAccountNum, setPayoutAccountNum] = useState('');
  const [payoutHolderName, setPayoutHolderName] = useState('');
  const [payoutBankName, setPayoutBankName] = useState('');
  const [savingPayout, setSavingPayout] = useState(false);

  // ==========================================
  // SECTION 3: SECURITY STATE
  // ==========================================
  // Password Change
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // Email Change
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);

  // Phone Change
  const [newPhone, setNewPhone] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);

  // Login History
  const [loginHistory, setLoginHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // PIN Lock State
  const [pinEnabled, setPinEnabled] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinStep, setPinStep] = useState<1 | 2>(1);
  const [inputPin, setInputPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState('');

  // ==========================================
  // SECTION 4: NOTIFICATION PREFERENCES STATE
  // ==========================================
  const defaultNotifPrefs: NotificationPreferences = {
    newOrder: true,
    payout: true,
    commission: true,
    importantNotice: true,
    appUpdate: true,
    promotional: false,
    sound: true,
    vibration: true,
  };

  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences>(
    user.notificationPreferences || defaultNotifPrefs
  );

  const [pushPermStatus, setPushPermStatus] = useState<'granted' | 'denied' | 'prompt'>('prompt');
  const [loadingPushRegister, setLoadingPushRegister] = useState(false);

  useEffect(() => {
    checkPushNotificationPermission().then(status => setPushPermStatus(status));
  }, []);

  const handleRegisterPush = async () => {
    setLoadingPushRegister(true);
    const success = await requestAndRegisterPushNotifications(user.uid);
    const updatedStatus = await checkPushNotificationPermission();
    setPushPermStatus(updatedStatus);
    setLoadingPushRegister(false);

    if (success) {
      showToast('Push Notifications enabled! FCM Token registered on device.', 'success');
    } else {
      showToast('Notification permission not granted. Enable notifications in your phone settings to receive alerts.', 'error');
    }
  };

  // ==========================================
  // SECTION 6: APP & VERSION STATE
  // ==========================================
  const [appVersionInfo, setAppVersionInfo] = useState<AppVersionConfig | null>(null);
  const [latestChangelog, setLatestChangelog] = useState<ChangelogEntry | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [showWhatsNewModal, setShowWhatsNewModal] = useState(false);
  const [showChangelogModal, setShowChangelogModal] = useState(false);

  // ==========================================
  // SECTION 7: ACCOUNT INFORMATION STATE & HELPERS
  // ==========================================
  const [selectedPolicyKey, setSelectedPolicyKey] = useState<string | null>(null);
  const [policyContent, setPolicyContent] = useState<{ title: string; lastUpdated: string; body: string } | null>(null);
  const [policyLoading, setPolicyLoading] = useState(false);

  const POLICY_PAGES_LIST = [
    { key: 'terms', title: 'Terms & Conditions', desc: 'Reseller platform terms of service and usage guidelines.' },
    { key: 'privacy', title: 'Privacy Policy', desc: 'Data collection, storage practices, and reseller privacy rights.' },
    { key: 'rules', title: 'Reseller Rules', desc: 'Code of conduct, performance standards, and fair pricing rules.' },
    { key: 'payoutPolicy', title: 'Payout Policy', desc: 'Commission withdrawal schedules, limits, and processing SLA.' },
    { key: 'commissionPolicy', title: 'Commission Policy', desc: 'Tier structures, bonus payouts, and wallet settlement rules.' },
  ];

  const fetchPolicyContent = async (key: string) => {
    setPolicyLoading(true);
    setSelectedPolicyKey(key);
    const defaultTitleMap: Record<string, string> = {
      terms: 'Terms & Conditions',
      privacy: 'Privacy Policy',
      rules: 'Reseller Rules',
      payoutPolicy: 'Payout Policy',
      commissionPolicy: 'Commission Policy',
    };
    const title = defaultTitleMap[key] || 'Policy Document';
    const defaultBody = `This section is currently being finalized by Sky Automation Tech. Please contact support if you have questions about ${title}.`;

    try {
      const pDoc = await getDoc(doc(db, 'policyPages', key));
      if (pDoc.exists()) {
        const data = pDoc.data();
        setPolicyContent({
          title: data.title || title,
          lastUpdated: data.lastUpdated || 'August 2026',
          body: data.body || defaultBody,
        });
      } else {
        setPolicyContent({
          title,
          lastUpdated: 'August 2026',
          body: defaultBody,
        });
      }
    } catch (err) {
      console.error('Error fetching policy page:', err);
      setPolicyContent({
        title,
        lastUpdated: 'August 2026',
        body: defaultBody,
      });
    } finally {
      setPolicyLoading(false);
    }
  };

  // ==========================================
  // SECTION 8: HELP & SUPPORT STATE & DATA
  // ==========================================
  const [supportView, setSupportView] = useState<'menu' | 'ticket' | 'faq' | 'bug' | 'history'>('menu');
  const [expandedFaqId, setExpandedFaqId] = useState<string | null>(null);

  const FAQ_ITEMS = [
    {
      id: 'faq-1',
      question: 'How do I place an order?',
      answer: 'Navigate to the Products or Catalog section in your reseller portal, select the desired product, enter customer name and shipping address, set selling price, and tap "Submit Order".'
    },
    {
      id: 'faq-2',
      question: 'When will I receive my commission?',
      answer: 'Commissions are automatically calculated and credited to your Sky Wallet once the courier updates the order status to "Delivered" and payment is reconciled by our logistics team.'
    },
    {
      id: 'faq-3',
      question: 'How do I withdraw my earnings?',
      answer: 'First, add your bKash, Nagad, or Bank details in "Payout Settings". Then go to your Wallet page, click "Request Payout", and enter your desired withdrawal amount.'
    },
    {
      id: 'faq-4',
      question: 'What payment methods are supported for payout?',
      answer: 'We support bKash Personal/Merchant, Nagad, Rocket, and Direct Bank Transfer (BEFTN/NPSB) across all major banks in Bangladesh.'
    },
    {
      id: 'faq-5',
      question: 'How do I track my order status?',
      answer: 'Go to the "Orders" page in your reseller dashboard. You can view real-time status steps (Processing, Shipped, In Transit, Delivered) and parcel tracking links.'
    },
    {
      id: 'faq-6',
      question: 'What if a customer wants to return a product?',
      answer: 'If a customer receives a damaged or defective item, submit a ticket under "Product Quality Issue" within 7 days of delivery for a replacement or return approval.'
    },
    {
      id: 'faq-7',
      question: 'How do I contact support?',
      answer: 'You can reach us instantly via WhatsApp (+8801722063777), direct phone call (01722063777), or by opening a Support Ticket in this portal.'
    }
  ];

  // Auto-clear Toast
  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Fetch latest user document on load
  useEffect(() => {
    fetchLatestProfile();
    checkPinStatus();
    loadVersionData();
  }, [user.uid]);

  const fetchLatestProfile = async () => {
    setLoadingProfile(true);
    try {
      const uRef = doc(db, 'users', user.uid);
      const uSnap = await getDoc(uRef);
      if (uSnap.exists()) {
        const data = uSnap.data() as UserProfile;
        setProfile(data);
        setFullName(data.fullName || '');
        setMobile(data.mobile || '');
        setEmail(data.email || '');
        setAddress(data.address || '');
        setProfilePhotoUrl(data.profilePhotoUrl || '');
        setPayoutMethods(data.payoutMethods || []);
        if (data.notificationPreferences) {
          setNotifPrefs(data.notificationPreferences);
        }
      }
    } catch (err) {
      console.error('Error fetching user profile in settings:', err);
    } finally {
      setLoadingProfile(false);
    }
  };

  const loadVersionData = async () => {
    try {
      const vInfo = await getCurrentAppVersion();
      setAppVersionInfo(vInfo);
      const logs = await getChangelogs();
      if (logs.length > 0) {
        setLatestChangelog(logs[0]);
      }
    } catch (err) {
      console.error('Error loading app version data:', err);
    }
  };

  const checkPinStatus = () => {
    const isEnabled = localStorage.getItem(`sky_app_pin_enabled_${user.uid}`) === 'true';
    setPinEnabled(isEnabled);
  };

  // Fetch Login History (last 20 logins)
  const fetchLoginHistory = async () => {
    setLoadingHistory(true);
    try {
      const historyCol = collection(db, 'users', user.uid, 'loginHistory');
      const q = query(historyCol, orderBy('timestamp', 'desc'), limit(20));
      const snap = await getDocs(q);
      const logs: any[] = [];
      snap.forEach((d) => logs.push({ id: d.id, ...d.data() }));
      setLoginHistory(logs);
    } catch (err) {
      console.error('Error fetching login history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (activeSection === 'security') {
      fetchLoginHistory();
    }
  }, [activeSection]);

  // ==========================================
  // HANDLERS FOR SECTION 1: ACCOUNT & PROFILE
  // ==========================================
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        showToast('Profile photo size must be under 2MB', 'error');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfilePhotoUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveAccountProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !mobile.trim() || !email.trim()) {
      showToast('Please fill in all required profile fields.', 'error');
      return;
    }

    setSavingAccount(true);
    try {
      const uRef = doc(db, 'users', user.uid);
      await updateDoc(uRef, {
        fullName: fullName.trim(),
        mobile: mobile.trim(),
        email: email.trim(),
        address: address.trim(),
        profilePhotoUrl: profilePhotoUrl || '',
        updatedAt: serverTimestamp(),
      });

      await logAuditAction(
        user.uid,
        user.fullName,
        user.role,
        'UPDATE_ACCOUNT_SETTINGS',
        user.uid,
        `Updated account profile settings for ${fullName}`
      );

      setProfile((prev) => ({
        ...prev,
        fullName,
        mobile,
        email,
        address,
        profilePhotoUrl,
      }));

      showToast('✓ Account profile updated successfully!', 'success');
    } catch (err: any) {
      console.error('Error updating account profile:', err);
      showToast(err.message || 'Failed to update account profile.', 'error');
    } finally {
      setSavingAccount(false);
    }
  };

  // ==========================================
  // HANDLERS FOR SECTION 2: PAYOUT SETTINGS
  // ==========================================
  const handleOpenAddPayout = () => {
    setEditingPayoutId(null);
    setPayoutType('bKash');
    setPayoutAccountNum('');
    setPayoutHolderName('');
    setPayoutBankName('');
    setIsPayoutModalOpen(true);
  };

  const handleOpenEditPayout = (method: PayoutMethod) => {
    setEditingPayoutId(method.id);
    setPayoutType(method.type);
    setPayoutAccountNum(method.accountNumber);
    setPayoutHolderName(method.accountHolderName || '');
    setPayoutBankName(method.bankName || '');
    setIsPayoutModalOpen(true);
  };

  const handleSavePayoutMethod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payoutAccountNum.trim()) {
      showToast('Account / Mobile number is required.', 'error');
      return;
    }
    if (payoutType === 'Bank' && (!payoutHolderName.trim() || !payoutBankName.trim())) {
      showToast('Bank Name and Account Holder Name are required for bank accounts.', 'error');
      return;
    }

    setSavingPayout(true);
    try {
      let updatedList = [...payoutMethods];

      if (editingPayoutId) {
        // Edit existing
        updatedList = updatedList.map((p) => {
          if (p.id === editingPayoutId) {
            return {
              ...p,
              type: payoutType,
              accountNumber: payoutAccountNum.trim(),
              accountHolderName: payoutType === 'Bank' ? payoutHolderName.trim() : null,
              bankName: payoutType === 'Bank' ? payoutBankName.trim() : null,
            };
          }
          return p;
        });
      } else {
        // Add new
        const newMethod: PayoutMethod = {
          id: 'payout_' + Date.now(),
          type: payoutType,
          accountNumber: payoutAccountNum.trim(),
          accountHolderName: payoutType === 'Bank' ? payoutHolderName.trim() : null,
          bankName: payoutType === 'Bank' ? payoutBankName.trim() : null,
          isDefault: payoutMethods.length === 0, // First added is default
          verified: false,
          addedAt: new Date().toISOString(),
        };
        updatedList.push(newMethod);
      }

      const uRef = doc(db, 'users', user.uid);
      await updateDoc(uRef, { payoutMethods: updatedList });

      setPayoutMethods(updatedList);
      setIsPayoutModalOpen(false);
      showToast('✓ Payout method saved successfully!', 'success');
    } catch (err: any) {
      console.error('Error saving payout method:', err);
      showToast(err.message || 'Failed to save payout method.', 'error');
    } finally {
      setSavingPayout(false);
    }
  };

  const handleSetDefaultPayout = async (payoutId: string) => {
    try {
      const updatedList = payoutMethods.map((p) => ({
        ...p,
        isDefault: p.id === payoutId,
      }));

      const uRef = doc(db, 'users', user.uid);
      await updateDoc(uRef, { payoutMethods: updatedList });

      setPayoutMethods(updatedList);
      showToast('✓ Default payout method updated.', 'success');
    } catch (err) {
      console.error('Error setting default payout method:', err);
      showToast('Failed to set default payout method.', 'error');
    }
  };

  const handleDeletePayout = async (payoutId: string) => {
    if (!window.confirm('Are you sure you want to remove this payout method?')) return;

    try {
      let updatedList = payoutMethods.filter((p) => p.id !== payoutId);
      // If deleted item was default, make first remaining item default
      if (updatedList.length > 0 && !updatedList.some((p) => p.isDefault)) {
        updatedList[0].isDefault = true;
      }

      const uRef = doc(db, 'users', user.uid);
      await updateDoc(uRef, { payoutMethods: updatedList });

      setPayoutMethods(updatedList);
      showToast('✓ Payout method removed.', 'success');
    } catch (err) {
      console.error('Error deleting payout method:', err);
      showToast('Failed to delete payout method.', 'error');
    }
  };

  // Helper to mask account number e.g. "01712345678" -> "0171 **** 678"
  const maskAccountNumber = (accNum: string) => {
    if (!accNum || accNum.length < 6) return accNum;
    const start = accNum.slice(0, 4);
    const end = accNum.slice(-3);
    return `${start} **** ${end}`;
  };

  // ==========================================
  // HANDLERS FOR SECTION 3: SECURITY
  // ==========================================
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      showToast('Please enter your current password.', 'error');
      return;
    }
    if (newPassword.length < 6) {
      showToast('New password must be at least 6 characters.', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('New password and confirm password do not match.', 'error');
      return;
    }

    setSavingPassword(true);
    try {
      if (!auth.currentUser || !auth.currentUser.email) {
        throw new Error('Authentication session invalid.');
      }

      // First re-authenticate user with current password
      const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);

      // Now update password
      await updatePassword(auth.currentUser, newPassword);

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showToast('✓ Password updated successfully!', 'success');
    } catch (err: any) {
      console.error('Error changing password:', err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        showToast('Current password is incorrect.', 'error');
      } else if (err.code === 'auth/requires-recent-login') {
        showToast('Session expired. Please log out and re-login before changing password.', 'error');
      } else {
        showToast(err.message || 'Failed to update password.', 'error');
      }
    } finally {
      setSavingPassword(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!user.email) {
      showToast('No registered email found.', 'error');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, user.email);
      showToast(`✓ Password reset link sent to ${user.email}`, 'success');
    } catch (err: any) {
      console.error('Error sending password reset email:', err);
      showToast('Failed to send password reset email.', 'error');
    }
  };

  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim() || !emailPassword) {
      showToast('Please enter new email and current password.', 'error');
      return;
    }

    setSavingEmail(true);
    try {
      if (!auth.currentUser || !auth.currentUser.email) {
        throw new Error('User session invalid.');
      }

      const credential = EmailAuthProvider.credential(auth.currentUser.email, emailPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updateEmail(auth.currentUser, newEmail.trim());

      // Update Firestore user document
      const uRef = doc(db, 'users', user.uid);
      await updateDoc(uRef, { email: newEmail.trim() });

      setEmail(newEmail.trim());
      setNewEmail('');
      setEmailPassword('');
      showToast('✓ Email updated successfully!', 'success');
    } catch (err: any) {
      console.error('Error changing email:', err);
      showToast(err.message || 'Failed to update email.', 'error');
    } finally {
      setSavingEmail(false);
    }
  };

  const handleChangePhone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPhone.trim()) {
      showToast('Please enter new phone number.', 'error');
      return;
    }

    setSavingPhone(true);
    try {
      const uRef = doc(db, 'users', user.uid);
      await updateDoc(uRef, { mobile: newPhone.trim() });

      setMobile(newPhone.trim());
      setNewPhone('');
      showToast('✓ Phone number updated successfully!', 'success');
    } catch (err: any) {
      console.error('Error changing phone number:', err);
      showToast('Failed to update phone number.', 'error');
    } finally {
      setSavingPhone(false);
    }
  };

  // PIN Setup Handlers
  const handleTogglePin = async () => {
    if (pinEnabled) {
      // Disable PIN
      localStorage.removeItem(`sky_app_pin_enabled_${user.uid}`);
      localStorage.removeItem(`sky_app_pin_hash_${user.uid}`);
      localStorage.removeItem(`sky_app_pin_length_${user.uid}`);
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          appLockEnabled: false,
          appLockPinHash: null,
          appLockPinLength: null,
        });
      } catch (err) {
        console.warn('Could not sync PIN disable to Firestore:', err);
      }
      setPinEnabled(false);
      showToast('✓ App Lock PIN disabled.', 'info');
    } else {
      // Open setup modal
      setPinStep(1);
      setInputPin('');
      setConfirmPin('');
      setPinError('');
      setShowPinModal(true);
    }
  };

  const handleSavePin = async () => {
    if (pinStep === 1) {
      if (inputPin.length < 4 || inputPin.length > 6) {
        setPinError('PIN must be 4 to 6 digits.');
        return;
      }
      setPinError('');
      setPinStep(2);
    } else {
      if (inputPin !== confirmPin) {
        setPinError('PINs do not match. Please try again.');
        return;
      }
      // bcrypt hash
      const hashedPin = bcrypt.hashSync(inputPin, 10);
      const pinLen = inputPin.length;
      localStorage.setItem(`sky_app_pin_enabled_${user.uid}`, 'true');
      localStorage.setItem(`sky_app_pin_hash_${user.uid}`, hashedPin);
      localStorage.setItem(`sky_app_pin_length_${user.uid}`, pinLen.toString());
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          appLockEnabled: true,
          appLockPinHash: hashedPin,
          appLockPinLength: pinLen,
        });
      } catch (err) {
        console.warn('Could not sync PIN hash to Firestore:', err);
      }
      setPinEnabled(true);
      setShowPinModal(false);
      showToast('✓ App Lock PIN created successfully!', 'success');
    }
  };

  // ==========================================
  // HANDLERS FOR SECTION 4: NOTIFICATION SETTINGS
  // ==========================================
  const handleToggleNotif = async (key: keyof NotificationPreferences) => {
    const updated = {
      ...notifPrefs,
      [key]: !notifPrefs[key],
    };
    setNotifPrefs(updated);

    try {
      const uRef = doc(db, 'users', user.uid);
      await updateDoc(uRef, { notificationPreferences: updated });
      showToast('✓ Preference saved', 'success');
    } catch (err: any) {
      console.error('Error updating notification preferences:', err);
      showToast('Failed to update notification setting.', 'error');
    }
  };

  // ==========================================
  // HANDLERS FOR SECTION 6: APP & VERSION
  // ==========================================
  const handleCheckForUpdate = async () => {
    setCheckingUpdate(true);
    try {
      const vInfo = await getCurrentAppVersion();
      setAppVersionInfo(vInfo);
      const currentVer = vInfo.version;
      const userSeenVer = profile.lastSeenVersion || '1.0.0';

      if (currentVer !== userSeenVer) {
        showToast(`✨ New version available: v${currentVer}! Tap "What's New" for details.`, 'info');
      } else {
        showToast(`✓ You are on the latest version (v${currentVer}).`, 'success');
      }
    } catch (err) {
      console.error('Error checking update:', err);
      showToast('Failed to check for updates.', 'error');
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleOpenWhatsNewModal = async () => {
    setShowWhatsNewModal(true);
    if (appVersionInfo?.version && profile.lastSeenVersion !== appVersionInfo.version) {
      await updateUserLastSeenVersion(user.uid, appVersionInfo.version);
      setProfile((prev) => ({ ...prev, lastSeenVersion: appVersionInfo.version }));
    }
  };

  // ==========================================
  // SECTION LIST CONFIGURATION (10 SECTIONS)
  // ==========================================
  const sectionsList = [
    {
      id: 'account',
      title: 'Account & Profile',
      subtitle: 'Personal info, phone, address & profile photo',
      icon: User,
      color: 'bg-blue-50 text-blue-600 border-blue-200',
      isReady: true,
    },
    {
      id: 'aimarketing',
      title: 'AI Marketing & Smart Tools',
      subtitle: 'Bengali captions, Facebook/TikTok posts & poster creator',
      icon: Sparkles,
      color: 'bg-indigo-50 text-indigo-600 border-indigo-200',
      isReady: true,
    },
    {
      id: 'payout',
      title: 'Payout Settings',
      subtitle: 'Manage bKash, Nagad, and Bank accounts',
      icon: CreditCard,
      color: 'bg-emerald-50 text-emerald-600 border-emerald-200',
      isReady: true,
    },
    {
      id: 'security',
      title: 'Security',
      subtitle: 'Password, PIN lock, login history & active devices',
      icon: Shield,
      color: 'bg-purple-50 text-purple-600 border-purple-200',
      isReady: true,
    },
    {
      id: 'notifications',
      title: 'Notification Settings',
      subtitle: 'Order updates, notice alerts & sound preferences',
      icon: Bell,
      color: 'bg-amber-50 text-amber-600 border-amber-200',
      isReady: true,
    },
    {
      id: 'preferences',
      title: 'App Preferences',
      subtitle: 'Language, theme mode & font display',
      icon: Palette,
      color: 'bg-pink-50 text-pink-600 border-pink-200',
      isReady: false,
    },
    {
      id: 'version',
      title: 'App & Version',
      subtitle: 'Check updates, release notes & system build',
      icon: Smartphone,
      color: 'bg-sky-50 text-sky-600 border-sky-200',
      isReady: true,
    },
    {
      id: 'info',
      title: 'Account Information',
      subtitle: 'Terms & conditions, reseller rules & policies',
      icon: FileText,
      color: 'bg-indigo-50 text-indigo-600 border-indigo-200',
      isReady: true,
    },
    {
      id: 'support',
      title: 'Help & Support',
      subtitle: 'Contact support, tickets, FAQs & problem reporting',
      icon: HelpCircle,
      color: 'bg-teal-50 text-teal-600 border-teal-200',
      isReady: true,
    },
    {
      id: 'privacy',
      title: 'Privacy',
      subtitle: 'Data usage, permissions & privacy controls',
      icon: ShieldCheck,
      color: 'bg-rose-50 text-rose-600 border-rose-200',
      isReady: false,
    },
    {
      id: 'actions',
      title: 'Account Actions',
      subtitle: 'Session management, logout & account state',
      icon: LogOut,
      color: 'bg-slate-100 text-slate-700 border-slate-200',
      isReady: true,
    },
  ];

  const formatDate = (dateVal: any) => {
    if (!dateVal) return 'N/A';
    try {
      const d = dateVal.toDate ? dateVal.toDate() : new Date(dateVal);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch (_) {
      return 'Jan 15, 2026';
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Toast Popup Notification */}
      {toastMessage && (
        <div className={`fixed bottom-20 right-4 z-50 px-4 py-3 rounded-2xl shadow-xl border text-xs font-bold flex items-center gap-2 transition-all animate-bounce ${
          toastMessage.type === 'success' ? 'bg-emerald-600 text-white border-emerald-500' :
          toastMessage.type === 'error' ? 'bg-rose-600 text-white border-rose-500' :
          'bg-slate-900 text-white border-slate-700'
        }`}>
          {toastMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
          {toastMessage.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0" />}
          {toastMessage.type === 'info' && <Sparkles className="w-4 h-4 shrink-0" />}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Sticky Header Bar for Drill-Down Sections */}
      {activeSection !== 'menu' && (
        <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-white/80 px-3 py-2.5 flex items-center gap-2.5 shadow-2xs -mx-1 sm:mx-0 sm:rounded-2xl mb-3.5">
          <button
            onClick={() => {
              triggerHaptic('light');
              if (activeSection === 'info' && selectedPolicyKey !== null) {
                setSelectedPolicyKey(null);
              } else if (activeSection === 'support' && supportView !== 'menu') {
                setSupportView('menu');
              } else {
                setActiveSection('menu');
              }
            }}
            className="w-9 h-9 rounded-xl bg-white hover:bg-slate-50 text-[#04203F] border border-slate-200/80 shadow-2xs flex items-center justify-center transition-all cursor-pointer active:scale-95 shrink-0 min-h-[36px]"
            title="Back to Settings"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] font-bold text-[#04203F] leading-tight truncate">
              {activeSection === 'account' && 'Account & Profile'}
              {activeSection === 'payout' && 'Payout Settings'}
              {activeSection === 'security' && 'Security'}
              {activeSection === 'notifications' && 'Notifications'}
              {activeSection === 'preferences' && 'App Preferences'}
              {activeSection === 'version' && 'App & Version'}
              {activeSection === 'info' && 'Account Information'}
              {activeSection === 'support' && 'Help & Support'}
              {activeSection === 'privacy' && 'Privacy & Data'}
              {activeSection === 'actions' && 'Account Actions'}
            </h2>
            <p className="text-[11px] font-medium text-slate-500 truncate leading-tight mt-0.5">
              {activeSection === 'account' && 'Personal information, shop profile, and contact details'}
              {activeSection === 'payout' && 'bKash, Nagad, and Bank payout methods'}
              {activeSection === 'security' && 'Login password, 4-digit PIN lock, and security history'}
              {activeSection === 'notifications' && 'Order alerts, announcements, sound, and push preferences'}
              {activeSection === 'preferences' && 'UI language, dark/light appearance, and display'}
              {activeSection === 'version' && 'Release updates, system build, and changelog'}
              {activeSection === 'info' && 'Terms of service, reseller code of conduct, and policies'}
              {activeSection === 'support' && 'Live chat, helpdesk tickets, and FAQs'}
              {activeSection === 'privacy' && 'Data storage, privacy permissions, and session logs'}
              {activeSection === 'actions' && 'Session sign out and account lifecycle'}
            </p>
          </div>
        </div>
      )}

      {/* ==========================================
          SETTINGS HOME (THE ROOT SCREEN)
         ========================================== */}
      {activeSection === 'menu' && (
        <div className="space-y-3">
          {/* 1. Top Profile Strip (~72px) */}
          <div className="bg-white/70 backdrop-blur-xl border border-white/80 rounded-[14px] p-3 shadow-[0_2px_12px_rgba(4,32,63,0.03)] flex items-center justify-between gap-3 min-h-[72px]">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              {/* Shop Logo (44px, rounded 12px) */}
              <div className="w-[44px] h-[44px] rounded-[12px] bg-[#04203F] text-white flex items-center justify-center font-bold text-base overflow-hidden border border-slate-200/80 shadow-2xs shrink-0">
                {profile.shopPhotoUrl || profile.shopLogoUrl || profile.profilePhotoUrl ? (
                  <img
                    src={profile.shopPhotoUrl || profile.shopLogoUrl || profile.profilePhotoUrl}
                    alt={profile.shopName || profile.fullName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span>{(profile.shopName || profile.fullName || 'R').charAt(0).toUpperCase()}</span>
                )}
              </div>

              {/* Shop Name & Owner Name */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-[14px] font-bold text-[#04203F] truncate leading-tight">
                    {profile.shopName || profile.fullName || 'Reseller Shop'}
                  </h3>
                </div>
                <p className="text-[11px] font-medium text-slate-500 truncate leading-tight mt-0.5">
                  {profile.fullName || 'Shop Owner'}
                </p>

                {/* Reseller ID Chip with copy button */}
                <div className="flex items-center gap-1.5 mt-1">
                  <button
                    onClick={() => {
                      triggerHaptic('light');
                      const idText = formatResellerId(profile);
                      navigator.clipboard?.writeText(idText);
                      setCopiedResellerId(true);
                      setTimeout(() => setCopiedResellerId(false), 2000);
                      showToast(`Copied Reseller ID: ${idText}`, 'info');
                    }}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-[#04203F] text-[10px] font-mono font-bold transition-colors cursor-pointer select-none"
                    title="Copy Reseller ID"
                  >
                    <span>{formatResellerId(profile)}</span>
                    {copiedResellerId ? (
                      <CheckCheck className="w-2.5 h-2.5 text-[#3DD055]" />
                    ) : (
                      <Copy className="w-2.5 h-2.5 text-slate-400" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Account Status Chip */}
            <div className="shrink-0 self-center">
              {profile.status === 'approved' ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#3DD055]" />
                  Active
                </span>
              ) : profile.status === 'pending' ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-amber-50 text-amber-700 border border-amber-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  Pending
                </span>
              ) : profile.status === 'suspended' ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  Suspended
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-slate-100 text-slate-700 border border-slate-200">
                  {profile.status || 'Registered'}
                </span>
              )}
            </div>
          </div>

          {/* 2. Account Completion Strip (Shows ONLY if < 100%) */}
          {(() => {
            const hasPayout = payoutMethods.length > 0;
            const hasEmailVerified = Boolean(profile.emailVerified);
            const hasDocs = Boolean(profile.nidFrontUrl || profile.birthCertificateUrl || profile.documentsSubmitted);
            const hasLogo = Boolean(profile.shopPhotoUrl || profile.shopLogoUrl || profile.profilePhotoUrl);

            const checks = [
              { key: 'payout', label: 'Add a payout method', section: 'payout' as const, done: hasPayout },
              { key: 'logo', label: 'Upload shop logo', section: 'account' as const, done: hasLogo },
              { key: 'docs', label: 'Submit documents', section: 'account' as const, done: hasDocs },
              { key: 'email', label: 'Verify your email', section: 'account' as const, done: hasEmailVerified },
            ];

            const completed = checks.filter(c => c.done).length;
            const pct = Math.round((completed / checks.length) * 100);
            const nextAction = checks.find(c => !c.done);

            if (pct >= 100 || !nextAction) return null;

            return (
              <div className="bg-white/70 backdrop-blur-xl border border-white/80 rounded-[14px] p-3 shadow-[0_2px_12px_rgba(4,32,63,0.03)] space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-[#04203F]">Profile completion: {pct}%</span>
                  <button
                    onClick={() => {
                      triggerHaptic('light');
                      if (nextAction.section === 'payout' && (!canAccessFullApp || profile.status === 'pending')) {
                        onOpenLockedModal?.('Payout Settings');
                        return;
                      }
                      setActiveSection(nextAction.section);
                    }}
                    className="text-[11px] font-bold text-[#0E9AA7] hover:underline cursor-pointer flex items-center gap-0.5"
                  >
                    <span>{nextAction.label}</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
                {/* Thin 4px progress line */}
                <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#0E9AA7] to-[#3DD055] rounded-full transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })()}

          {/* 3. Search Field "Search settings" (36px high glass input) */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search settings (e.g. bkash, password, rules)..."
              className="w-full h-[36px] pl-9 pr-9 text-[12px] font-medium bg-white/70 backdrop-blur-xl border border-white/80 rounded-xl outline-none focus:border-[#0E9AA7] focus:bg-white text-[#04203F] placeholder:text-slate-400 shadow-[0_2px_8px_rgba(4,32,63,0.02)] transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center hover:bg-slate-300 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Search Results Filter View */}
          {searchQuery.trim() !== '' ? (
            <div className="space-y-1.5">
              <span className={DT.settingsGroupLabel}>Search Results</span>
              {(() => {
                const q = searchQuery.toLowerCase().trim();
                const searchItems = [
                  {
                    id: 'account' as const,
                    title: 'Account & Profile',
                    helper: 'Personal info, shop name & address',
                    keywords: ['profile', 'name', 'phone', 'mobile', 'address', 'nid', 'photo', 'logo', 'facebook', 'social', 'email', 'division', 'district', 'shop'],
                    icon: User,
                    iconBg: 'bg-blue-50 text-blue-600 border-blue-200/60',
                    isLocked: false,
                  },
                  {
                    id: 'payout' as const,
                    title: 'Payout Settings',
                    helper: 'bKash, Nagad, and Bank accounts',
                    keywords: ['payout', 'bkash', 'nagad', 'rocket', 'bank', 'withdraw', 'account number', 'payment', 'money'],
                    icon: CreditCard,
                    iconBg: 'bg-emerald-50 text-emerald-600 border-emerald-200/60',
                    isLocked: !canAccessFullApp || profile.status === 'pending',
                  },
                  {
                    id: 'security' as const,
                    title: 'Security',
                    helper: 'Password, PIN lock & login history',
                    keywords: ['security', 'password', 'pin', 'lock', 'login history', 'devices', 'auth', 'passcode'],
                    icon: Shield,
                    iconBg: 'bg-purple-50 text-purple-600 border-purple-200/60',
                    isLocked: !canAccessFullApp || profile.status === 'pending',
                  },
                  {
                    id: 'privacy' as const,
                    title: 'Privacy & Data',
                    helper: 'Data controls & account state',
                    keywords: ['privacy', 'data', 'delete', 'deactivate', 'visibility', 'permissions'],
                    icon: ShieldCheck,
                    iconBg: 'bg-rose-50 text-rose-600 border-rose-200/60',
                    isLocked: !canAccessFullApp || profile.status === 'pending',
                  },
                  {
                    id: 'notifications' as const,
                    title: 'Notifications',
                    helper: 'Order alerts & push preferences',
                    keywords: ['notifications', 'alerts', 'sound', 'push', 'vibration', 'order update', 'bell', 'messages'],
                    icon: Bell,
                    iconBg: 'bg-amber-50 text-amber-600 border-amber-200/60',
                    isLocked: !canAccessFullApp || profile.status === 'pending',
                  },
                  {
                    id: 'preferences' as const,
                    title: 'App Preferences',
                    helper: 'Language & display settings',
                    keywords: ['preferences', 'language', 'theme', 'dark mode', 'light', 'font', 'display'],
                    icon: Palette,
                    iconBg: 'bg-pink-50 text-pink-600 border-pink-200/60',
                    isLocked: !canAccessFullApp || profile.status === 'pending',
                  },
                  {
                    id: 'version' as const,
                    title: 'App & Version',
                    helper: `v${appVersionInfo?.version || '1.0.8'} • Check for updates`,
                    keywords: ['version', 'update', 'changelog', 'release notes', 'build', 'app'],
                    icon: Smartphone,
                    iconBg: 'bg-sky-50 text-sky-600 border-sky-200/60',
                    isLocked: false,
                  },
                  {
                    id: 'info' as const,
                    title: 'Account Information',
                    helper: 'Terms, rules & policies',
                    keywords: ['terms', 'conditions', 'policy', 'rules', 'commission policy', 'faq', 'information', 'about'],
                    icon: FileText,
                    iconBg: 'bg-indigo-50 text-indigo-600 border-indigo-200/60',
                    isLocked: !canAccessFullApp || profile.status === 'pending',
                  },
                  {
                    id: 'support' as const,
                    title: 'Help & Support',
                    helper: 'Live chat, tickets & direct contacts',
                    keywords: ['help', 'support', 'ticket', 'faq', 'contact', 'call', 'whatsapp', 'problem', 'bug'],
                    icon: HelpCircle,
                    iconBg: 'bg-teal-50 text-teal-600 border-teal-200/60',
                    isLocked: false,
                  },
                ];

                const matches = searchItems.filter(item => 
                  item.title.toLowerCase().includes(q) ||
                  item.helper.toLowerCase().includes(q) ||
                  item.keywords.some(k => k.toLowerCase().includes(q))
                );

                if (matches.length === 0) {
                  return (
                    <div className="bg-white/70 backdrop-blur-xl border border-white/80 rounded-[14px] p-6 text-center space-y-2">
                      <p className="text-[12px] font-semibold text-slate-600">No settings found matching &quot;{searchQuery}&quot;</p>
                      <button
                        onClick={() => setSearchQuery('')}
                        className="text-[11px] font-bold text-[#0E9AA7] hover:underline"
                      >
                        Clear search
                      </button>
                    </div>
                  );
                }

                return (
                  <div className={DT.settingsGroupCard}>
                    {matches.map((item) => {
                      const IconComp = item.icon;
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            triggerHaptic('light');
                            if (item.isLocked) {
                              onOpenLockedModal?.(item.title);
                              return;
                            }
                            setActiveSection(item.id);
                          }}
                          className={DT.settingsRow}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className={`${DT.iconTile} ${item.iconBg}`}>
                              <IconComp className={DT.iconSize} />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className={DT.settingsRowTitle}>{item.title}</span>
                                {item.isLocked && <Lock className="w-3 h-3 text-amber-500 shrink-0" />}
                              </div>
                              <p className={DT.settingsRowHelper}>{item.helper}</p>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          ) : (
            /* 4. Grouped List (iOS/fintech system-settings style) */
            <div className="space-y-3">
              {/* GROUP: ACCOUNT */}
              <div className="space-y-1">
                <span className={DT.settingsGroupLabel}>ACCOUNT</span>
                <div className={DT.settingsGroupCard}>
                  {/* Account & Profile (Section 1) */}
                  <button
                    onClick={() => {
                      triggerHaptic('light');
                      setActiveSection('account');
                    }}
                    className={DT.settingsRow}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`${DT.iconTile} bg-blue-50 text-blue-600 border-blue-200/60`}>
                        <User className={DT.iconSize} />
                      </div>
                      <div className="min-w-0">
                        <span className={DT.settingsRowTitle}>Account & Profile</span>
                        <p className={DT.settingsRowHelper}>Personal info, shop profile & address</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <span className={`${DT.settingsRowValue} max-w-[120px]`}>
                        {profile.fullName || 'View profile'}
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                    </div>
                  </button>

                  {/* Payout Settings */}
                  <button
                    onClick={() => {
                      triggerHaptic('light');
                      if (!canAccessFullApp || profile.status === 'pending') {
                        onOpenLockedModal?.('Payout Settings');
                        return;
                      }
                      setActiveSection('payout');
                    }}
                    className={DT.settingsRow}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`${DT.iconTile} bg-emerald-50 text-emerald-600 border-emerald-200/60`}>
                        <CreditCard className={DT.iconSize} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={DT.settingsRowTitle}>Payout Settings</span>
                          {(!canAccessFullApp || profile.status === 'pending') && (
                            <Lock className="w-3 h-3 text-amber-500 shrink-0" />
                          )}
                        </div>
                        <p className={DT.settingsRowHelper}>Manage bKash, Nagad, and Bank accounts</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <span className={DT.settingsRowValue}>
                        {payoutMethods.length > 0
                          ? `${payoutMethods[0].type} • ${payoutMethods[0].accountNumber.slice(-4)}`
                          : 'Not added'}
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                    </div>
                  </button>
                </div>
              </div>

              {/* GROUP: SECURITY & PRIVACY */}
              <div className="space-y-1">
                <span className={DT.settingsGroupLabel}>SECURITY & PRIVACY</span>
                <div className={DT.settingsGroupCard}>
                  {/* Security */}
                  <button
                    onClick={() => {
                      triggerHaptic('light');
                      if (!canAccessFullApp || profile.status === 'pending') {
                        onOpenLockedModal?.('Security Settings');
                        return;
                      }
                      setActiveSection('security');
                    }}
                    className={DT.settingsRow}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`${DT.iconTile} bg-purple-50 text-purple-600 border-purple-200/60`}>
                        <Shield className={DT.iconSize} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={DT.settingsRowTitle}>Security</span>
                          {(!canAccessFullApp || profile.status === 'pending') && (
                            <Lock className="w-3 h-3 text-amber-500 shrink-0" />
                          )}
                        </div>
                        <p className={DT.settingsRowHelper}>Password, PIN lock & login history</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <span className={DT.settingsRowValue}>
                        {pinEnabled ? 'PIN enabled' : 'Password set'}
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                    </div>
                  </button>

                  {/* Privacy & Data */}
                  <button
                    onClick={() => {
                      triggerHaptic('light');
                      if (!canAccessFullApp || profile.status === 'pending') {
                        onOpenLockedModal?.('Privacy & Data');
                        return;
                      }
                      setActiveSection('privacy');
                    }}
                    className={DT.settingsRow}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`${DT.iconTile} bg-rose-50 text-rose-600 border-rose-200/60`}>
                        <ShieldCheck className={DT.iconSize} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={DT.settingsRowTitle}>Privacy & Data</span>
                          {(!canAccessFullApp || profile.status === 'pending') && (
                            <Lock className="w-3 h-3 text-amber-500 shrink-0" />
                          )}
                        </div>
                        <p className={DT.settingsRowHelper}>Data controls & account permissions</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <span className={DT.settingsRowValue}>Standard</span>
                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                    </div>
                  </button>
                </div>
              </div>

              {/* GROUP: PREFERENCES */}
              <div className="space-y-1">
                <span className={DT.settingsGroupLabel}>PREFERENCES</span>
                <div className={DT.settingsGroupCard}>
                  {/* Notifications */}
                  <button
                    onClick={() => {
                      triggerHaptic('light');
                      if (!canAccessFullApp || profile.status === 'pending') {
                        onOpenLockedModal?.('Notification Settings');
                        return;
                      }
                      setActiveSection('notifications');
                    }}
                    className={DT.settingsRow}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`${DT.iconTile} bg-amber-50 text-amber-600 border-amber-200/60`}>
                        <Bell className={DT.iconSize} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={DT.settingsRowTitle}>Notifications</span>
                          {(!canAccessFullApp || profile.status === 'pending') && (
                            <Lock className="w-3 h-3 text-amber-500 shrink-0" />
                          )}
                        </div>
                        <p className={DT.settingsRowHelper}>Order alerts & push preferences</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <span className={DT.settingsRowValue}>
                        {notifPrefs.newOrder && notifPrefs.payout ? 'All on' : 'Orders only'}
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                    </div>
                  </button>

                  {/* App Preferences */}
                  <button
                    onClick={() => {
                      triggerHaptic('light');
                      if (!canAccessFullApp || profile.status === 'pending') {
                        onOpenLockedModal?.('App Preferences');
                        return;
                      }
                      setActiveSection('preferences');
                    }}
                    className={DT.settingsRow}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`${DT.iconTile} bg-pink-50 text-pink-600 border-pink-200/60`}>
                        <Palette className={DT.iconSize} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={DT.settingsRowTitle}>App Preferences</span>
                          {(!canAccessFullApp || profile.status === 'pending') && (
                            <Lock className="w-3 h-3 text-amber-500 shrink-0" />
                          )}
                        </div>
                        <p className={DT.settingsRowHelper}>Language & interface theme</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <span className={DT.settingsRowValue}>English • Auto</span>
                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                    </div>
                  </button>
                </div>
              </div>

              {/* GROUP: ABOUT */}
              <div className="space-y-1">
                <span className={DT.settingsGroupLabel}>ABOUT</span>
                <div className={DT.settingsGroupCard}>
                  {/* App & Version (Always open, even for pending) */}
                  <button
                    onClick={() => {
                      triggerHaptic('light');
                      setActiveSection('version');
                    }}
                    className={DT.settingsRow}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`${DT.iconTile} bg-sky-50 text-sky-600 border-sky-200/60`}>
                        <Smartphone className={DT.iconSize} />
                      </div>
                      <div className="min-w-0">
                        <span className={DT.settingsRowTitle}>App & Version</span>
                        <p className={DT.settingsRowHelper}>Check updates & release changelog</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <span className={DT.settingsRowValue}>
                        v{appVersionInfo?.version || '1.0.8'} • Up to date
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                    </div>
                  </button>

                  {/* Account Information (Policies & FAQ) */}
                  <button
                    onClick={() => {
                      triggerHaptic('light');
                      if (!canAccessFullApp || profile.status === 'pending') {
                        onOpenLockedModal?.('Account Policies & FAQ');
                        return;
                      }
                      setSelectedPolicyKey(null);
                      setActiveSection('info');
                    }}
                    className={DT.settingsRow}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`${DT.iconTile} bg-indigo-50 text-indigo-600 border-indigo-200/60`}>
                        <FileText className={DT.iconSize} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={DT.settingsRowTitle}>Account Information</span>
                          {(!canAccessFullApp || profile.status === 'pending') && (
                            <Lock className="w-3 h-3 text-amber-500 shrink-0" />
                          )}
                        </div>
                        <p className={DT.settingsRowHelper}>Terms of service & reseller rules</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <span className={DT.settingsRowValue}>Policies & FAQ</span>
                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                    </div>
                  </button>
                </div>
              </div>

              {/* GROUP: HELP */}
              <div className="space-y-1">
                <span className={DT.settingsGroupLabel}>HELP</span>
                <div className={DT.settingsGroupCard}>
                  {/* Help & Support (Always open, contact buttons work) */}
                  <button
                    onClick={() => {
                      triggerHaptic('light');
                      setSupportView('menu');
                      setActiveSection('support');
                    }}
                    className={DT.settingsRow}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`${DT.iconTile} bg-teal-50 text-teal-600 border-teal-200/60`}>
                        <HelpCircle className={DT.iconSize} />
                      </div>
                      <div className="min-w-0">
                        <span className={DT.settingsRowTitle}>Help & Support</span>
                        <p className={DT.settingsRowHelper}>Live chat, support tickets & contacts</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <span className={DT.settingsRowValue}>Live chat & tickets</span>
                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                    </div>
                  </button>
                </div>
              </div>

              {/* Full-width "Log out" row at bottom */}
              <div className="pt-1">
                <button
                  onClick={() => {
                    triggerHaptic('light');
                    setShowLogoutModal(true);
                  }}
                  className="w-full min-h-[48px] px-3.5 py-2.5 rounded-[14px] bg-white/70 backdrop-blur-xl border border-white/80 hover:bg-rose-50/60 active:bg-rose-100/60 text-[#E11D48] transition-colors flex items-center justify-between cursor-pointer select-none shadow-[0_2px_12px_rgba(4,32,63,0.03)]"
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`${DT.iconTile} bg-rose-50 text-[#E11D48] border-rose-200/60`}>
                      <LogOut className={DT.iconSize} />
                    </div>
                    <span className="text-[13px] font-bold text-[#E11D48]">Log out</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-rose-300" />
                </button>
              </div>

              {/* 5. Footer: "ReSellBD v<version>" and company name */}
              <div className="text-center pt-2 pb-6">
                <p className="text-[10px] font-semibold text-slate-400">
                  ReSellBD v{appVersionInfo?.version || '1.0.8'}
                </p>
                <p className="text-[10px] font-medium text-slate-400 mt-0.5">
                  Sky Automation Technologies Ltd.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==========================================
          SECTION 1: ACCOUNT & PROFILE (FULLY BUILT NOW)
         ========================================== */}
      {activeSection === 'account' && (
        <AccountProfileSection
          user={profile}
          canAccessFullApp={canAccessFullApp}
          onOpenLockedModal={onOpenLockedModal}
          onRefreshUser={async () => {
            try {
              const snap = await getDoc(doc(db, 'users', user.uid));
              if (snap.exists()) {
                setProfile({ uid: snap.id, ...snap.data() } as UserProfile);
              }
            } catch (err) {
              console.warn('Error refreshing profile:', err);
            }
          }}
        />
      )}

      {/* ==========================================
          SECTION 2: PAYOUT SETTINGS
         ========================================== */}
      {activeSection === 'payout' && (
        <PayoutSettingsSection
          user={profile}
          canAccessFullApp={canAccessFullApp}
          onOpenLockedModal={onOpenLockedModal}
          onRefreshUser={async () => {
            try {
              const snap = await getDoc(doc(db, 'users', user.uid));
              if (snap.exists()) {
                setProfile({ uid: snap.id, ...snap.data() } as UserProfile);
              }
            } catch (err) {
              console.warn('Error refreshing profile:', err);
            }
          }}
          onBack={() => setActiveSection('menu')}
        />
      )}

      {/* ==========================================
          SECTION 3: SECURITY
         ========================================== */}
      {activeSection === 'security' && (
        <SecuritySection
          user={profile}
          canAccessFullApp={canAccessFullApp}
          onOpenLockedModal={onOpenLockedModal}
          onRefreshUser={async () => {
            try {
              const snap = await getDoc(doc(db, 'users', user.uid));
              if (snap.exists()) {
                setProfile({ uid: snap.id, ...snap.data() } as UserProfile);
              }
            } catch (err) {
              console.warn('Error refreshing profile:', err);
            }
          }}
          onLogout={onLogout}
          onBack={() => setActiveSection('menu')}
        />
      )}

      {/* ==========================================
          SECTION 4: NOTIFICATION SETTINGS
         ========================================== */}
      {activeSection === 'notifications' && (
        <SectionPlaceholder
          title="Notification Settings"
          description="Control real-time push alerts, order sound chimes, and system broadcast notices."
          icon={Bell}
          existingComponent={
            <div className="space-y-6">
          <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
            <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                <Bell className="w-5 h-5 text-amber-600" />
                <span>Notification Preferences</span>
              </h3>
              <span className="text-xs text-slate-400 font-medium">Saves automatically on change</span>
            </div>

            {/* Notification Types Group */}
            <div className="space-y-3">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 px-1">
                Notification Types
              </h4>

              <div className="bg-slate-50/70 border border-slate-200 rounded-2xl divide-y divide-slate-200/80 overflow-hidden">
                {/* New Order */}
                <div
                  onClick={() => handleToggleNotif('newOrder')}
                  className="p-4 flex items-center justify-between gap-4 hover:bg-slate-100/60 transition-colors cursor-pointer min-h-[56px]"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                      <Bell className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-xs text-slate-900 block">New Order Notifications</span>
                      <p className="text-[11px] text-slate-500">Alerts when customers or downlines place new orders.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`w-12 h-6 rounded-full transition-colors relative shrink-0 cursor-pointer ${
                      notifPrefs.newOrder ? 'bg-amber-500' : 'bg-slate-300'
                    }`}
                  >
                    <span className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform shadow-xs ${
                      notifPrefs.newOrder ? 'left-6' : 'left-0.5'
                    }`} />
                  </button>
                </div>

                {/* Payout */}
                <div
                  onClick={() => handleToggleNotif('payout')}
                  className="p-4 flex items-center justify-between gap-4 hover:bg-slate-100/60 transition-colors cursor-pointer min-h-[56px]"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                      <CreditCard className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-xs text-slate-900 block">Payout Notifications</span>
                      <p className="text-[11px] text-slate-500">Updates regarding payout approvals and wallet disbursements.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`w-12 h-6 rounded-full transition-colors relative shrink-0 cursor-pointer ${
                      notifPrefs.payout ? 'bg-amber-500' : 'bg-slate-300'
                    }`}
                  >
                    <span className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform shadow-xs ${
                      notifPrefs.payout ? 'left-6' : 'left-0.5'
                    }`} />
                  </button>
                </div>

                {/* Commission */}
                <div
                  onClick={() => handleToggleNotif('commission')}
                  className="p-4 flex items-center justify-between gap-4 hover:bg-slate-100/60 transition-colors cursor-pointer min-h-[56px]"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-xs text-slate-900 block">Commission Earnings</span>
                      <p className="text-[11px] text-slate-500">Instant alerts when new commissions are credited to your wallet.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`w-12 h-6 rounded-full transition-colors relative shrink-0 cursor-pointer ${
                      notifPrefs.commission ? 'bg-amber-500' : 'bg-slate-300'
                    }`}
                  >
                    <span className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform shadow-xs ${
                      notifPrefs.commission ? 'left-6' : 'left-0.5'
                    }`} />
                  </button>
                </div>

                {/* Important Notice */}
                <div
                  onClick={() => handleToggleNotif('importantNotice')}
                  className="p-4 flex items-center justify-between gap-4 hover:bg-slate-100/60 transition-colors cursor-pointer min-h-[56px]"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                      <Megaphone className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-xs text-slate-900 block">Important Notices</span>
                      <p className="text-[11px] text-slate-500">System broadcasts and urgent administrative announcements.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`w-12 h-6 rounded-full transition-colors relative shrink-0 cursor-pointer ${
                      notifPrefs.importantNotice ? 'bg-amber-500' : 'bg-slate-300'
                    }`}
                  >
                    <span className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform shadow-xs ${
                      notifPrefs.importantNotice ? 'left-6' : 'left-0.5'
                    }`} />
                  </button>
                </div>

                {/* App Update */}
                <div
                  onClick={() => handleToggleNotif('appUpdate')}
                  className="p-4 flex items-center justify-between gap-4 hover:bg-slate-100/60 transition-colors cursor-pointer min-h-[56px]"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
                      <Smartphone className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-xs text-slate-900 block">App Updates & Patches</span>
                      <p className="text-[11px] text-slate-500">Notifications when new feature releases or updates are ready.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`w-12 h-6 rounded-full transition-colors relative shrink-0 cursor-pointer ${
                      notifPrefs.appUpdate ? 'bg-amber-500' : 'bg-slate-300'
                    }`}
                  >
                    <span className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform shadow-xs ${
                      notifPrefs.appUpdate ? 'left-6' : 'left-0.5'
                    }`} />
                  </button>
                </div>

                {/* Promotional */}
                <div
                  onClick={() => handleToggleNotif('promotional')}
                  className="p-4 flex items-center justify-between gap-4 hover:bg-slate-100/60 transition-colors cursor-pointer min-h-[56px]"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                      <Tag className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-xs text-slate-900 block">Promotional Offers</span>
                      <p className="text-[11px] text-slate-500">Marketing campaigns, seasonal product deals, and bonus offers.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`w-12 h-6 rounded-full transition-colors relative shrink-0 cursor-pointer ${
                      notifPrefs.promotional ? 'bg-amber-500' : 'bg-slate-300'
                    }`}
                  >
                    <span className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform shadow-xs ${
                      notifPrefs.promotional ? 'left-6' : 'left-0.5'
                    }`} />
                  </button>
                </div>
              </div>
            </div>

            {/* Sound & Vibration Group */}
            <div className="space-y-3 pt-2">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 px-1">
                Sound & Feedback
              </h4>

              <div className="bg-slate-50/70 border border-slate-200 rounded-2xl divide-y divide-slate-200/80 overflow-hidden">
                {/* Sound */}
                <div
                  onClick={() => handleToggleNotif('sound')}
                  className="p-4 flex items-center justify-between gap-4 hover:bg-slate-100/60 transition-colors cursor-pointer min-h-[56px]"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                      {notifPrefs.sound ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                    </div>
                    <div>
                      <span className="font-bold text-xs text-slate-900 block">In-App Notification Sounds</span>
                      <p className="text-[11px] text-slate-500">Play chime audio when receiving in-app notifications.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`w-12 h-6 rounded-full transition-colors relative shrink-0 cursor-pointer ${
                      notifPrefs.sound ? 'bg-amber-500' : 'bg-slate-300'
                    }`}
                  >
                    <span className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform shadow-xs ${
                      notifPrefs.sound ? 'left-6' : 'left-0.5'
                    }`} />
                  </button>
                </div>

                {/* Vibration */}
                <div
                  onClick={() => handleToggleNotif('vibration')}
                  className="p-4 flex items-center justify-between gap-4 hover:bg-slate-100/60 transition-colors cursor-pointer min-h-[56px]"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center shrink-0">
                      <SmartphoneNfc className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-xs text-slate-900 block">Haptic Vibration</span>
                      <p className="text-[11px] text-slate-500">Vibrate mobile device on incoming priority events.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`w-12 h-6 rounded-full transition-colors relative shrink-0 cursor-pointer ${
                      notifPrefs.vibration ? 'bg-amber-500' : 'bg-slate-300'
                    }`}
                  >
                    <span className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform shadow-xs ${
                      notifPrefs.vibration ? 'left-6' : 'left-0.5'
                    }`} />
                  </button>
                </div>
              </div>
            </div>

            {/* FCM Push Notification System Group */}
            <div className="space-y-3 pt-2">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 px-1">
                Lock Screen & Push Alerts (FCM)
              </h4>

              <div className="bg-gradient-to-br from-indigo-900 to-slate-900 text-white rounded-2xl p-5 shadow-sm border border-indigo-700/50 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 flex items-center justify-center shrink-0">
                      <Bell className="w-5 h-5" />
                    </div>
                    <div>
                      <h5 className="font-bold text-sm text-white flex items-center gap-2">
                        <span>Push Notifications</span>
                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                          pushPermStatus === 'granted'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : pushPermStatus === 'denied'
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        }`}>
                          {pushPermStatus === 'granted' ? 'Active & Registered' : pushPermStatus === 'denied' ? 'Permission Denied' : 'Not Registered'}
                        </span>
                      </h5>
                      <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
                        Receive real-time alerts on your phone lock screen & tray for new orders, payouts, and urgent notices.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-800/80 rounded-xl p-3.5 border border-slate-700/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-[11px] font-semibold text-slate-300 block">Device FCM Tokens</span>
                    <p className="text-xs text-slate-400">
                      {user.fcmTokens?.length || 0} device token(s) registered on your profile.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleRegisterPush}
                    disabled={loadingPushRegister}
                    className="w-full sm:w-auto px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {loadingPushRegister ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Registering Device...</span>
                      </>
                    ) : (
                      <>
                        <Smartphone className="w-4 h-4" />
                        <span>{pushPermStatus === 'granted' ? 'Re-sync FCM Device Token' : 'Enable Push Notifications'}</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="flex items-center gap-2 text-[11px] text-amber-300 bg-amber-950/40 border border-amber-800/50 rounded-xl p-3">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Enable notifications in your phone settings to receive alerts.</span>
                </div>
              </div>
            </div>
          </div>
            </div>
          }
        />
      )}

      {/* ==========================================
          SECTION 5: APP PREFERENCES
         ========================================== */}
      {activeSection === 'preferences' && (
        <SectionPlaceholder
          title="App Preferences"
          description="Configure UI language, interface contrast theme, and default product catalog density."
          icon={Palette}
          existingComponent={
            <div className="space-y-6">
          <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
            <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                  <Palette className="w-5 h-5 text-pink-600" />
                  <span>Display & App Preferences</span>
                </h3>
                <span className="bg-pink-100 text-pink-700 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border border-pink-200 uppercase">
                  Coming Soon
                </span>
              </div>
              <span className="text-xs text-slate-400">Read-Only Preview</span>
            </div>

            <div className="space-y-3">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl divide-y divide-slate-200/80 overflow-hidden">
                {/* Light / Dark Mode */}
                <div
                  onClick={() => showToast('This feature is coming soon!', 'info')}
                  className="p-4 flex items-center justify-between gap-4 opacity-60 cursor-pointer hover:bg-slate-100/50 transition-colors min-h-[56px]"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center shrink-0">
                      <Sun className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-900">Color Theme (Light / Dark)</span>
                        <span className="bg-slate-200 text-slate-600 text-[9px] font-extrabold px-1.5 py-0.5 rounded">
                          Coming Soon
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">Switch between light mode and dark OLED slate palette.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-500">Light Mode</span>
                    <button disabled className="w-12 h-6 rounded-full bg-slate-300 relative cursor-not-allowed">
                      <span className="w-5 h-5 bg-white rounded-full absolute top-0.5 left-0.5 shadow-xs" />
                    </button>
                  </div>
                </div>

                {/* Language */}
                <div
                  onClick={() => showToast('This feature is coming soon!', 'info')}
                  className="p-4 flex items-center justify-between gap-4 opacity-60 cursor-pointer hover:bg-slate-100/50 transition-colors min-h-[56px]"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center shrink-0">
                      <Globe className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-900">App Language</span>
                        <span className="bg-slate-200 text-slate-600 text-[9px] font-extrabold px-1.5 py-0.5 rounded">
                          Coming Soon
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">Select portal language (English & Bangla localization).</p>
                    </div>
                  </div>
                  <select
                    disabled
                    value="en"
                    className="bg-white border border-slate-300 text-slate-600 text-xs font-bold rounded-xl px-3 py-1.5 cursor-not-allowed outline-none"
                  >
                    <option value="en">English (US)</option>
                    <option value="bn">বাংলা (Bengali)</option>
                  </select>
                </div>

                {/* Currency */}
                <div
                  onClick={() => showToast('This feature is coming soon!', 'info')}
                  className="p-4 flex items-center justify-between gap-4 opacity-60 cursor-pointer hover:bg-slate-100/50 transition-colors min-h-[56px]"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center shrink-0">
                      <DollarSign className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-900">Display Currency</span>
                        <span className="bg-slate-200 text-slate-600 text-[9px] font-extrabold px-1.5 py-0.5 rounded">
                          Coming Soon
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">Default pricing unit across product catalog and wallet.</p>
                    </div>
                  </div>
                  <select
                    disabled
                    value="BDT"
                    className="bg-white border border-slate-300 text-slate-600 text-xs font-bold rounded-xl px-3 py-1.5 cursor-not-allowed outline-none"
                  >
                    <option value="BDT">BDT (৳)</option>
                    <option value="USD">USD ($)</option>
                  </select>
                </div>

                {/* Notification Sound */}
                <div
                  onClick={() => showToast('This feature is coming soon!', 'info')}
                  className="p-4 flex items-center justify-between gap-4 opacity-60 cursor-pointer hover:bg-slate-100/50 transition-colors min-h-[56px]"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center shrink-0">
                      <Volume2 className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-900">Notification Alert Sound</span>
                        <span className="bg-slate-200 text-slate-600 text-[9px] font-extrabold px-1.5 py-0.5 rounded">
                          Coming Soon
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">Custom alert sound tone for high-priority order events.</p>
                    </div>
                  </div>
                  <select
                    disabled
                    value="default"
                    className="bg-white border border-slate-300 text-slate-600 text-xs font-bold rounded-xl px-3 py-1.5 cursor-not-allowed outline-none"
                  >
                    <option value="default">Default Sky Chime</option>
                    <option value="cash">Cash Register</option>
                  </select>
                </div>

                {/* Compact / Comfortable View */}
                <div
                  onClick={() => showToast('This feature is coming soon!', 'info')}
                  className="p-4 flex items-center justify-between gap-4 opacity-60 cursor-pointer hover:bg-slate-100/50 transition-colors min-h-[56px]"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center shrink-0">
                      <Smartphone className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-900">Compact Table Layout</span>
                        <span className="bg-slate-200 text-slate-600 text-[9px] font-extrabold px-1.5 py-0.5 rounded">
                          Coming Soon
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">Reduce card padding for high-density screen viewing.</p>
                    </div>
                  </div>
                  <button disabled className="w-12 h-6 rounded-full bg-slate-300 relative cursor-not-allowed">
                    <span className="w-5 h-5 bg-white rounded-full absolute top-0.5 left-0.5 shadow-xs" />
                  </button>
                </div>
              </div>
            </div>
          </div>
            </div>
          }
        />
      )}

      {/* ==========================================
          SECTION 6: APP & VERSION
         ========================================== */}
      {activeSection === 'version' && (
        <SectionPlaceholder
          title="App & Version"
          description="Check for new feature releases, system build details, and release notes."
          icon={Smartphone}
          existingComponent={
            <div className="space-y-6">
          <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
            <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-sky-600" />
                <span>System Build & Version Info</span>
              </h3>
              <button
                onClick={handleCheckForUpdate}
                disabled={checkingUpdate}
                className="px-3.5 py-1.5 bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer min-h-[38px]"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${checkingUpdate ? 'animate-spin' : ''}`} />
                <span>{checkingUpdate ? 'Checking...' : 'Check for Updates'}</span>
              </button>
            </div>

            {/* Current Version Banner */}
            <div className="bg-gradient-to-r from-sky-900 via-indigo-900 to-slate-900 p-6 rounded-2xl text-white shadow-md space-y-3 relative overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-mono font-extrabold text-sky-300">
                      v{appVersionInfo?.version || '1.0.0'}
                    </span>
                    {appVersionInfo?.version && profile.lastSeenVersion !== appVersionInfo.version ? (
                      <span className="bg-rose-500 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
                        <span className="w-2 h-2 rounded-full bg-white" />
                        UPDATE AVAILABLE
                      </span>
                    ) : (
                      <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        YOU'RE UP TO DATE
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-sky-200">
                    ReSellBD Enterprise Portal • Production Mobile Release
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={handleOpenWhatsNewModal}
                    className="px-4 py-2.5 bg-sky-500 hover:bg-sky-600 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-2 min-h-[44px] cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>What's New</span>
                  </button>
                  <button
                    onClick={() => setShowChangelogModal(true)}
                    className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl border border-white/20 transition-colors flex items-center gap-2 min-h-[44px] cursor-pointer"
                  >
                    <History className="w-4 h-4" />
                    <span>Changelog</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Version Detail Rows */}
            <div className="space-y-3">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 px-1">
                Version Details
              </h4>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl divide-y divide-slate-200/80 overflow-hidden text-xs">
                {/* Installed Version */}
                <div className="p-4 flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-700">Installed App Version</span>
                  <span className="font-mono font-bold text-slate-900 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                    v{appVersionInfo?.version || '1.0.0'}
                  </span>
                </div>

                {/* What's New Release Notes */}
                <div className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-700">Latest Release Notes</span>
                    <button
                      onClick={handleOpenWhatsNewModal}
                      className="text-sky-600 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <span>View Full Popup</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 text-slate-600 text-xs leading-relaxed">
                    {latestChangelog?.description || appVersionInfo?.releaseNotes || 'Initial release of ReSellBD portal.'}
                  </div>
                </div>

                {/* Release Date */}
                <div className="p-4 flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-700">Published Date</span>
                  <span className="font-medium text-slate-600">
                    {formatDate(appVersionInfo?.releasedAt)}
                  </span>
                </div>

                {/* Build Target */}
                <div className="p-4 flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-700">Build Environment</span>
                  <span className="font-mono text-slate-600 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                    Mobile Web (PWA/Cloud Run)
                  </span>
                </div>
              </div>
            </div>
          </div>
            </div>
          }
        />
      )}

      {/* Version Modals */}
      <WhatsNewModal
        isOpen={showWhatsNewModal}
        onClose={() => setShowWhatsNewModal(false)}
        changelog={latestChangelog}
        currentVersion={appVersionInfo?.version || '1.0.0'}
      />

      <ChangelogModal
        isOpen={showChangelogModal}
        onClose={() => setShowChangelogModal(false)}
        currentVersion={appVersionInfo?.version || '1.0.0'}
      />

      {/* ==========================================
          SECTION 7: ACCOUNT INFORMATION
         ========================================== */}
      {activeSection === 'info' && (
        <SectionPlaceholder
          title="Account Information & Policies"
          description="Read platform terms of service, reseller code of conduct, payout policies, and commission rules."
          icon={FileText}
          existingComponent={
            <div className="space-y-6">
          <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-xs space-y-6">
            <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600" />
                <span>{selectedPolicyKey ? 'Policy Document' : 'Account Information & Policies'}</span>
              </h3>
              {selectedPolicyKey && (
                <button
                  onClick={() => setSelectedPolicyKey(null)}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1 cursor-pointer min-h-[36px]"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to All Policies</span>
                </button>
              )}
            </div>

            {selectedPolicyKey === null ? (
              /* Policy List */
              <div className="space-y-3">
                <p className="text-xs text-slate-500 leading-relaxed">
                  Review official terms, policies, reseller guidelines, and payout rules governing your reseller account with Sky Automation Tech.
                </p>

                <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden">
                  {POLICY_PAGES_LIST.map((policy) => (
                    <button
                      key={policy.key}
                      onClick={() => fetchPolicyContent(policy.key)}
                      className="w-full p-4 flex items-center justify-between hover:bg-indigo-50/40 transition-colors text-left group cursor-pointer min-h-[60px]"
                    >
                      <div className="flex items-center gap-3.5">
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 border border-indigo-100 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-bold text-sm text-slate-900 group-hover:text-indigo-900">{policy.title}</h4>
                          <p className="text-xs text-slate-500 mt-0.5">{policy.desc}</p>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all" />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* Policy Document Detail */
              <div className="space-y-4">
                {policyLoading ? (
                  <div className="p-12 text-center text-slate-500 space-y-3">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto text-indigo-600" />
                    <p className="text-xs font-bold">Loading policy content...</p>
                  </div>
                ) : (
                  policyContent && (
                    <div className="space-y-5 animate-in fade-in duration-200">
                      <div className="bg-gradient-to-r from-indigo-900 to-slate-900 text-white p-5 rounded-2xl shadow-xs space-y-1">
                        <span className="bg-indigo-500/20 text-indigo-300 text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full border border-indigo-400/30">
                          Official Sky Automation Tech Document
                        </span>
                        <h3 className="text-lg font-extrabold text-white mt-1">{policyContent.title}</h3>
                        <p className="text-xs text-indigo-200">
                          Last updated: {policyContent.lastUpdated}
                        </p>
                      </div>

                      <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 text-sm text-slate-700 leading-relaxed whitespace-pre-line shadow-inner">
                        {policyContent.body}
                      </div>

                      <div className="bg-indigo-50/60 border border-indigo-200 p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2 text-indigo-900">
                          <HelpCircle className="w-4 h-4 shrink-0 text-indigo-600" />
                          <span>Have questions regarding {policyContent.title}? Contact our support team.</span>
                        </div>
                        <button
                          onClick={() => {
                            setSupportView('menu');
                            setActiveSection('support');
                          }}
                          className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors shrink-0 cursor-pointer"
                        >
                          Contact Support
                        </button>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </div>
            </div>
          }
        />
      )}

      {/* ==========================================
          SECTION 8: HELP & SUPPORT
         ========================================== */}
      {activeSection === 'support' && (
        <SectionPlaceholder
          title="Help & Support"
          description="Reach out to dedicated reseller support staff via live chat, submit inquiries, or view FAQs."
          icon={HelpCircle}
          existingComponent={
            <div className="space-y-6">
          <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-xs space-y-6">
            <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-teal-600" />
                <span>
                  {supportView === 'menu' && 'Help & Customer Support Center'}
                  {supportView === 'ticket' && 'Submit Support Ticket'}
                  {supportView === 'faq' && 'Frequently Asked Questions'}
                  {supportView === 'bug' && 'Report a Problem / Bug'}
                  {supportView === 'history' && 'My Support Tickets History'}
                </span>
              </h3>
              {supportView !== 'menu' && (
                <button
                  onClick={() => setSupportView('menu')}
                  className="text-xs font-bold text-teal-600 hover:text-teal-800 hover:underline flex items-center gap-1 cursor-pointer min-h-[36px]"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Support Menu</span>
                </button>
              )}
            </div>

            {/* View: MENU */}
            {supportView === 'menu' && (
              <div className="space-y-4">
                {/* Contact Support Row */}
                <div className="bg-gradient-to-r from-teal-900 via-emerald-950 to-slate-900 p-5 rounded-2xl text-white shadow-xs space-y-3">
                  <div>
                    <h4 className="font-extrabold text-sm text-white">Direct Customer Helpline</h4>
                    <p className="text-xs text-teal-200 mt-0.5">Reach Sky Automation Tech support agents for urgent assistance.</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <a
                      href="https://wa.me/8801722063777"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 p-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer min-h-[44px]"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span>WhatsApp (+8801722063777)</span>
                    </a>
                    <a
                      href="tel:01722063777"
                      className="flex items-center justify-center gap-2 p-3 bg-white/15 hover:bg-white/25 text-white border border-white/20 font-bold text-xs rounded-xl transition-colors cursor-pointer min-h-[44px]"
                    >
                      <PhoneCall className="w-4 h-4" />
                      <span>Call Support (01722063777)</span>
                    </a>
                  </div>
                </div>

                {/* Support Actions Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Submit Ticket */}
                  <button
                    onClick={() => setSupportView('ticket')}
                    className="p-4 bg-white border border-slate-200 rounded-2xl text-left hover:border-teal-300 hover:bg-teal-50/30 transition-all group cursor-pointer min-h-[72px] flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-11 h-11 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center border border-teal-100 group-hover:bg-teal-600 group-hover:text-white transition-colors">
                        <MessageSquare className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-slate-900 group-hover:text-teal-900">Submit a Ticket</h4>
                        <p className="text-xs text-slate-500 mt-0.5">Formal ticket for orders, payout, or commissions</p>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-teal-600 group-hover:translate-x-0.5 transition-all shrink-0" />
                  </button>

                  {/* FAQ */}
                  <button
                    onClick={() => setSupportView('faq')}
                    className="p-4 bg-white border border-slate-200 rounded-2xl text-left hover:border-teal-300 hover:bg-teal-50/30 transition-all group cursor-pointer min-h-[72px] flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-11 h-11 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center border border-sky-100 group-hover:bg-sky-600 group-hover:text-white transition-colors">
                        <HelpCircle className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-slate-900 group-hover:text-sky-900">FAQ</h4>
                        <p className="text-xs text-slate-500 mt-0.5">Quick answers to common reseller questions</p>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-sky-600 group-hover:translate-x-0.5 transition-all shrink-0" />
                  </button>

                  {/* Report Problem */}
                  <button
                    onClick={() => setSupportView('bug')}
                    className="p-4 bg-white border border-slate-200 rounded-2xl text-left hover:border-amber-300 hover:bg-amber-50/30 transition-all group cursor-pointer min-h-[72px] flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-11 h-11 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center border border-amber-200 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                        <Bug className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-slate-900 group-hover:text-amber-900">Report a Problem</h4>
                        <p className="text-xs text-slate-500 mt-0.5">Report bugs, glitches, or service feedback</p>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-amber-600 group-hover:translate-x-0.5 transition-all shrink-0" />
                  </button>

                  {/* WhatsApp Group */}
                  <a
                    href="https://wa.me/8801722063777"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-4 bg-white border border-slate-200 rounded-2xl text-left hover:border-emerald-300 hover:bg-emerald-50/30 transition-all group cursor-pointer min-h-[72px] flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                        <Users className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-slate-900 group-hover:text-emerald-900">WhatsApp / Support Group</h4>
                        <p className="text-xs text-slate-500 mt-0.5">Join official reseller community update group</p>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all shrink-0" />
                  </a>

                  {/* Support History */}
                  <button
                    onClick={() => setSupportView('history')}
                    className="p-4 bg-white border border-slate-200 rounded-2xl text-left hover:border-indigo-300 hover:bg-indigo-50/30 transition-all group cursor-pointer min-h-[72px] flex items-center justify-between sm:col-span-2"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-200 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                        <History className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-slate-900 group-hover:text-indigo-900">Support History</h4>
                        <p className="text-xs text-slate-500 mt-0.5">View your previously submitted tickets and track responses</p>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all shrink-0" />
                  </button>
                </div>
              </div>
            )}

            {/* View: SUBMIT TICKET FORM */}
            {supportView === 'ticket' && (
              <div className="animate-in fade-in duration-200">
                <SupportTicketForm
                  user={profile}
                  onSuccess={() => {
                    showToast('Support ticket submitted successfully!', 'success');
                    setSupportView('history');
                  }}
                  onCancel={() => setSupportView('menu')}
                />
              </div>
            )}

            {/* View: FAQ ACCORDION */}
            {supportView === 'faq' && (
              <div className="space-y-3 animate-in fade-in duration-200">
                <p className="text-xs text-slate-500 mb-2">Tap any question to expand detailed answers regarding orders, wallet, and payouts.</p>
                <div className="space-y-2.5">
                  {FAQ_ITEMS.map((faq) => {
                    const isOpen = expandedFaqId === faq.id;
                    return (
                      <div
                        key={faq.id}
                        className="border border-slate-200 rounded-2xl overflow-hidden transition-all bg-white"
                      >
                        <button
                          onClick={() => setExpandedFaqId(isOpen ? null : faq.id)}
                          className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50 transition-colors min-h-[56px] cursor-pointer"
                        >
                          <span className="font-bold text-xs sm:text-sm text-slate-900 pr-2">{faq.question}</span>
                          {isOpen ? (
                            <ChevronUp className="w-4 h-4 text-teal-600 shrink-0" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                          )}
                        </button>
                        {isOpen && (
                          <div className="px-4 pb-4 pt-1 border-t border-slate-100 text-xs text-slate-600 leading-relaxed bg-teal-50/20">
                            {faq.answer}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* View: REPORT A PROBLEM / BUG FORM */}
            {supportView === 'bug' && (
              <div className="animate-in fade-in duration-200">
                <FeedbackForm
                  user={profile}
                  initialType="Bug Report"
                  onSuccess={() => {
                    showToast('Problem report submitted successfully!', 'success');
                    setSupportView('menu');
                  }}
                  onCancel={() => setSupportView('menu')}
                />
              </div>
            )}

            {/* View: SUPPORT HISTORY */}
            {supportView === 'history' && (
              <div className="animate-in fade-in duration-200">
                <SupportSystem user={profile} />
              </div>
            )}
          </div>
            </div>
          }
        />
      )}

      {/* ==========================================
          SECTION 9: PRIVACY
         ========================================== */}
      {activeSection === 'privacy' && (
        <SectionPlaceholder
          title="Privacy & Data"
          description="Manage data sharing permissions, profile visibility, session audit records, and account lifecycle."
          icon={ShieldCheck}
          existingComponent={
            <div className="space-y-6">
          <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-xs space-y-6">
            <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-rose-600" />
                <span>Privacy & Data Control</span>
              </h3>
              <span className="bg-slate-100 text-slate-600 text-[10px] font-extrabold px-2.5 py-1 rounded-full border border-slate-200">
                Coming Soon
              </span>
            </div>

            <p className="text-xs text-slate-500">
              Enhanced privacy management and account data preferences will be released in the upcoming update.
            </p>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl divide-y divide-slate-200 overflow-hidden">
              {/* Data & Privacy */}
              <div
                onClick={() => showToast('This feature is coming soon!', 'info')}
                className="p-4 flex items-center justify-between gap-4 opacity-60 cursor-pointer hover:bg-slate-100/60 transition-colors min-h-[60px]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-slate-900">Data & Privacy</span>
                      <span className="bg-slate-200 text-slate-600 text-[9px] font-extrabold px-1.5 py-0.5 rounded">
                        Coming Soon
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">Manage data sharing preferences and analytics collection.</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </div>

              {/* Login Activity */}
              <div
                onClick={() => showToast('This feature is coming soon!', 'info')}
                className="p-4 flex items-center justify-between gap-4 opacity-60 cursor-pointer hover:bg-slate-100/60 transition-colors min-h-[60px]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center shrink-0">
                    <History className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-slate-900">Login Activity</span>
                      <span className="bg-slate-200 text-slate-600 text-[9px] font-extrabold px-1.5 py-0.5 rounded">
                        Coming Soon
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">Detailed historical audit logs and IP geographic access reports.</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </div>

              {/* Account Visibility */}
              <div
                onClick={() => showToast('This feature is coming soon!', 'info')}
                className="p-4 flex items-center justify-between gap-4 opacity-60 cursor-pointer hover:bg-slate-100/60 transition-colors min-h-[60px]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center shrink-0">
                    <Eye className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-slate-900">Account Visibility</span>
                      <span className="bg-slate-200 text-slate-600 text-[9px] font-extrabold px-1.5 py-0.5 rounded">
                        Coming Soon
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">Control leaderboard display and public profile visibility.</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </div>

              {/* Delete / Deactivate */}
              <div
                onClick={() => showToast('This feature is coming soon!', 'info')}
                className="p-4 flex items-center justify-between gap-4 opacity-60 cursor-pointer hover:bg-slate-100/60 transition-colors min-h-[60px]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center shrink-0">
                    <UserX className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-slate-900">Delete / Deactivate Account</span>
                      <span className="bg-slate-200 text-slate-600 text-[9px] font-extrabold px-1.5 py-0.5 rounded">
                        Coming Soon
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">Self-service account suspension or permanent data purging.</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </div>
            </div>
          </div>
            </div>
          }
        />
      )}

      {/* ==========================================
          SECTION 10: ACCOUNT ACTIONS
         ========================================== */}
      {activeSection === 'actions' && (
        <SectionPlaceholder
          title="Account Actions"
          description="Manage active session devices, account deactivation, and sign out controls."
          icon={LogOut}
          existingComponent={
            <div className="space-y-6">
          <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-xs space-y-6">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                <LogOut className="w-5 h-5 text-slate-700" />
                <span>Account Actions & Session Management</span>
              </h3>
            </div>

            <div className="space-y-3">
              {/* Logout (Functional) */}
              <div className="bg-rose-50/70 border border-rose-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 bg-rose-100 text-rose-700 rounded-2xl flex items-center justify-center shrink-0 border border-rose-200">
                    <LogOut className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-sm text-rose-950">Logout from Account</h4>
                    <p className="text-xs text-rose-700 mt-0.5">Safely end your current session and return to the login screen.</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowLogoutModal(true)}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors shrink-0 cursor-pointer min-h-[44px]"
                >
                  Sign Out Now
                </button>
              </div>

              {/* Deactivate Account (Coming Soon) */}
              <div
                onClick={() => showToast('This feature is coming soon!', 'info')}
                className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 opacity-60 cursor-pointer hover:bg-slate-100/80 transition-colors"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 bg-amber-50 text-amber-800 rounded-2xl flex items-center justify-center shrink-0 border border-amber-200">
                    <UserX className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-extrabold text-sm text-slate-900">Deactivate Account</h4>
                      <span className="bg-slate-200 text-slate-600 text-[9px] font-extrabold px-1.5 py-0.5 rounded">
                        Coming Soon
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">Temporarily pause your reseller store catalog, links, and payout processing.</p>
                  </div>
                </div>
                <button
                  disabled
                  className="px-4 py-2 bg-slate-200 text-slate-500 font-bold text-xs rounded-xl shrink-0 cursor-not-allowed min-h-[40px]"
                >
                  Deactivate
                </button>
              </div>

              {/* Delete Account (Coming Soon) */}
              <div
                onClick={() => showToast('This feature is coming soon!', 'info')}
                className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 opacity-60 cursor-pointer hover:bg-slate-100/80 transition-colors"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 bg-rose-50 text-rose-700 rounded-2xl flex items-center justify-center shrink-0 border border-rose-200">
                    <Trash2 className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-extrabold text-sm text-slate-900">Delete Account</h4>
                      <span className="bg-slate-200 text-slate-600 text-[9px] font-extrabold px-1.5 py-0.5 rounded">
                        Coming Soon
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">Permanently delete your reseller profile, wallet history, and stored data.</p>
                  </div>
                </div>
                <button
                  disabled
                  className="px-4 py-2 bg-slate-200 text-slate-500 font-bold text-xs rounded-xl shrink-0 cursor-not-allowed min-h-[40px]"
                >
                  Delete Account
                </button>
              </div>
            </div>
          </div>
            </div>
          }
        />
      )}

      <ChangelogModal
        isOpen={showChangelogModal}
        onClose={() => setShowChangelogModal(false)}
        currentVersion={appVersionInfo?.version || '1.0.0'}
      />

      {/* AI Marketing & Smart Assist Modal */}
      <AIMarketingModal
        isOpen={showAiModal}
        onClose={() => setShowAiModal(false)}
        user={user}
        allProducts={allProductsList}
        onOpenSocialShare={(prod) => {
          setSelectedPosterProduct(prod || DEFAULT_DEMO_PRODUCT);
          setShowPosterModal(true);
        }}
      />

      {/* Social Share / Poster Studio Modal */}
      {showPosterModal && (
        <SocialShareModal
          isOpen={showPosterModal}
          onClose={() => setShowPosterModal(false)}
          product={selectedPosterProduct || (allProductsList.length > 0 ? allProductsList[0] : DEFAULT_DEMO_PRODUCT)}
          user={user}
        />
      )}

      {/* ==========================================
          LOGOUT CONFIRMATION MODAL
         ========================================== */}
      {showLogoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-sm w-full p-6 space-y-4 text-center animate-in fade-in zoom-in duration-200">
            <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto border border-rose-100">
              <LogOut className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900">Sign Out of ReSellBD</h3>
              <p className="text-xs text-slate-500 mt-1">
                Are you sure you want to logout? You will need to enter your email and password again to log back in.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setShowLogoutModal(false)}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer min-h-[44px]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowLogoutModal(false);
                  onLogout();
                }}
                className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-md transition-colors cursor-pointer min-h-[44px]"
              >
                Yes, Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
