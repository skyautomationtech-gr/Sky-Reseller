import React, { useState, useEffect } from 'react';
import bcrypt from 'bcryptjs';
import { updatePassword, updateEmail, reauthenticateWithCredential, EmailAuthProvider, sendPasswordResetEmail } from 'firebase/auth';
import { doc, getDoc, updateDoc, collection, query, where, getDocs, orderBy, limit, serverTimestamp, arrayRemove } from 'firebase/firestore';
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
import { NotificationSettingsSection } from './NotificationSettingsSection';
import { AppPreferencesSection } from './AppPreferencesSection';
import { AppVersionSection } from './AppVersionSection';
import { AccountInfoSection } from './AccountInfoSection';
import { HelpSupportSection } from './HelpSupportSection';
import { PrivacyDataSection } from './PrivacyDataSection';
import { SectionPlaceholder } from './SectionPlaceholder';
import { triggerHaptic } from '../../lib/nativeFeedback';
import { PageHeader } from '../common/PageHeader';

export interface ResellerSettingsProps {
  user: UserProfile;
  onLogout: () => void;
  canAccessFullApp?: boolean;
  onOpenLockedModal?: (featureName?: string) => void;
  initialSection?: 'menu' | 'account' | 'payout' | 'security' | 'notifications' | 'preferences' | 'version' | 'info' | 'support' | 'privacy';
  onNavigateTab?: (tab: string) => void;
  hideHeader?: boolean;
  onSectionChange?: (section: string) => void;
}

export const ResellerSettings: React.FC<ResellerSettingsProps> = ({ 
  user, 
  onLogout,
  canAccessFullApp = true,
  onOpenLockedModal,
  initialSection = 'menu',
  onNavigateTab,
  hideHeader = false,
  onSectionChange,
}) => {
  const [activeSection, setActiveSection] = useState<'menu' | 'account' | 'payout' | 'security' | 'notifications' | 'preferences' | 'version' | 'info' | 'support' | 'privacy' | 'actions'>(initialSection);
  const [selectedPolicyKey, setSelectedPolicyKey] = useState<string | null>(null);

  // Instantly reset scroll to top before paint on any sub-page or root settings change
  useScrollToTop([activeSection, selectedPolicyKey]);

  useEffect(() => {
    if (onSectionChange) {
      onSectionChange(activeSection);
    }
  }, [activeSection, onSectionChange]);

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

      {/* Sticky Header Bar for Drill-Down Sections (Only when not embedded in parent container) */}
      {activeSection !== 'menu' && !hideHeader && (
        <PageHeader
          title={
            activeSection === 'account' ? 'Account & Profile' :
            activeSection === 'payout' ? 'Payout Settings' :
            activeSection === 'security' ? 'Security' :
            activeSection === 'notifications' ? 'Notifications' :
            activeSection === 'preferences' ? 'App Preferences' :
            activeSection === 'version' ? 'App & Version' :
            activeSection === 'info' ? (selectedPolicyKey ? 'Policy Document' : 'Account Information') :
            activeSection === 'support' ? (supportView !== 'menu' ? 'Helpdesk Tickets' : 'Help & Support') :
            activeSection === 'privacy' ? 'Privacy & Data' :
            activeSection === 'actions' ? 'Account Actions' : 'Reseller Settings'
          }
          subtitle={
            activeSection === 'account' ? 'Personal information, shop profile & contact details' :
            activeSection === 'payout' ? 'bKash, Nagad, and Bank payout methods' :
            activeSection === 'security' ? 'Password, PIN lock & active sessions' :
            activeSection === 'notifications' ? 'Order alerts, sound & push preferences' :
            activeSection === 'preferences' ? 'Display density, language & appearance' :
            activeSection === 'version' ? 'Release updates, system build & changelog' :
            activeSection === 'info' ? 'Terms of service, reseller rules & policies' :
            activeSection === 'support' ? 'Live chat, helpdesk tickets & FAQs' :
            activeSection === 'privacy' ? 'Data storage, permissions & session logs' :
            activeSection === 'actions' ? 'Session sign out & account lifecycle' : 'Preferences, notifications & version'
          }
          onBack={() => {
            if (activeSection === 'info' && selectedPolicyKey !== null) {
              setSelectedPolicyKey(null);
            } else if (activeSection === 'support' && supportView !== 'menu') {
              setSupportView('menu');
            } else {
              setActiveSection('menu');
            }
          }}
          className="-mx-1 sm:mx-0 sm:rounded-2xl mb-3.5"
        />
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
                    helper: `v${appVersionInfo?.version || '1.0.8'} • Check for updates & App Tour`,
                    keywords: ['version', 'update', 'changelog', 'release notes', 'build', 'app', 'tour', 'onboarding', 'intro'],
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
          hideHeader={hideHeader}
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
          hideHeader={hideHeader}
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
      {activeSection === "notifications" && (
        <NotificationSettingsSection
          user={profile}
          canAccessFullApp={canAccessFullApp}
          onOpenLockedModal={onOpenLockedModal}
          onRefreshUser={async () => {
            try {
              const snap = await getDoc(doc(db, "users", user.uid));
              if (snap.exists()) {
                setProfile({ uid: snap.id, ...snap.data() } as UserProfile);
              }
            } catch (err) {
              console.warn("Error refreshing profile:", err);
            }
          }}
          onBack={() => setActiveSection("menu")}
        />
      )}

      {/* ==========================================
          SECTION 5: APP PREFERENCES
         ========================================== */}
      {activeSection === "preferences" && (
        <AppPreferencesSection
          user={profile}
          canAccessFullApp={canAccessFullApp}
          onOpenLockedModal={onOpenLockedModal}
          onRefreshUser={async () => {
            try {
              const snap = await getDoc(doc(db, "users", user.uid));
              if (snap.exists()) {
                setProfile({ uid: snap.id, ...snap.data() } as UserProfile);
              }
            } catch (err) {
              console.warn("Error refreshing profile:", err);
            }
          }}
          onBack={() => setActiveSection("menu")}
        />
      )}

      {/* ==========================================
          SECTION 6: APP & VERSION
         ========================================== */}
      {activeSection === "version" && (
        <AppVersionSection
          user={profile}
          canAccessFullApp={canAccessFullApp}
          onRefreshUser={async () => {
            try {
              const snap = await getDoc(doc(db, "users", user.uid));
              if (snap.exists()) {
                setProfile({ uid: snap.id, ...snap.data() } as UserProfile);
              }
            } catch (err) {
              console.warn("Error refreshing profile:", err);
            }
          }}
          onBack={() => setActiveSection("menu")}
        />
      )}

      {/* ==========================================
          SECTION 7: ACCOUNT INFORMATION (POLICIES & FAQ)
         ========================================== */}
      {activeSection === "info" && (
        <AccountInfoSection
          user={profile}
          canAccessFullApp={canAccessFullApp}
          initialPolicyKey={selectedPolicyKey}
          onRefreshUser={async () => {
            try {
              const snap = await getDoc(doc(db, "users", user.uid));
              if (snap.exists()) {
                setProfile({ uid: snap.id, ...snap.data() } as UserProfile);
              }
            } catch (err) {
              console.warn("Error refreshing profile:", err);
            }
          }}
          onBack={() => {
            setSelectedPolicyKey(null);
            setActiveSection("menu");
          }}
        />
      )}

      {/* ==========================================
          SECTION 8: HELP & SUPPORT
         ========================================== */}
      {activeSection === "support" && (
        <HelpSupportSection
          user={profile}
          canAccessFullApp={canAccessFullApp}
          onOpenLockedModal={onOpenLockedModal}
          onRefreshUser={async () => {
            try {
              const snap = await getDoc(doc(db, "users", user.uid));
              if (snap.exists()) {
                setProfile({ uid: snap.id, ...snap.data() } as UserProfile);
              }
            } catch (err) {
              console.warn("Error refreshing profile:", err);
            }
          }}
          onBack={() => setActiveSection("menu")}
        />
      )}

      {/* ==========================================
          SECTION 9: PRIVACY & DATA
         ========================================== */}
      {activeSection === "privacy" && (
        <PrivacyDataSection
          user={profile}
          canAccessFullApp={canAccessFullApp}
          onNavigateSection={(sec) => setActiveSection(sec as any)}
          onOpenPolicy={(policyKey) => {
            setSelectedPolicyKey(policyKey);
            setActiveSection("info");
          }}
          onRefreshUser={async () => {
            try {
              const snap = await getDoc(doc(db, "users", user.uid));
              if (snap.exists()) {
                setProfile({ uid: snap.id, ...snap.data() } as UserProfile);
              }
            } catch (err) {
              console.warn("Error refreshing profile:", err);
            }
          }}
          onBack={() => setActiveSection("menu")}
        />
      )}

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
                onClick={async () => {
                  try {
                    // Deregister device FCM token if available
                    const storedFcm = localStorage.getItem('fcm_token');
                    if (storedFcm && user.uid) {
                      await updateDoc(doc(db, 'users', user.uid), {
                        fcmTokens: arrayRemove(storedFcm)
                      });
                    }
                  } catch (_) {}

                  try {
                    // Clear temporary session drafts and in-memory caches
                    const draftKeys = [
                      'reseller_recent_searches', 'product_filter_state', 'cart_temp_draft',
                      'custom_order_draft', 'payout_form_draft', 'category_cache'
                    ];
                    draftKeys.forEach(k => localStorage.removeItem(k));
                    sessionStorage.clear();
                  } catch (_) {}

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
