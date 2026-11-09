import React, { useState, useEffect } from 'react';
import bcrypt from 'bcryptjs';
import { 
  updatePassword, 
  reauthenticateWithCredential, 
  EmailAuthProvider, 
  sendPasswordResetEmail,
  verifyBeforeUpdateEmail
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  limit, 
  addDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { UserProfile } from '../../types';
import { logAuditAction } from '../../lib/auditLogger';
import { triggerHaptic } from '../../lib/nativeFeedback';
import { DENSITY_TOKENS as DT } from '../../utils/densityTokens';
import { 
  fetchUserLoginHistory, 
  fetchUserDevices,
  signOutSingleDevice,
  signOutAllDevices,
  getOrCreateDeviceId, 
  LoginHistoryItem,
  DeviceItem
} from '../../lib/deviceSecurity';
import { NeumorphicPinKeypad } from '../common/NeumorphicPinKeypad';
import { 
  Shield, Key, Mail, Phone, Lock, Smartphone, Laptop, Tablet,
  CheckCircle2, AlertCircle, Eye, EyeOff, ChevronRight, ChevronDown, ChevronUp,
  X, Loader2, Check, ArrowLeft, RefreshCw, AlertTriangle, 
  ShieldCheck, Fingerprint, Clock, Send, ShieldAlert, Info, LogOut
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useScrollToTop } from '../../utils/scrollToTop';

interface SecuritySectionProps {
  user: UserProfile;
  canAccessFullApp?: boolean;
  onOpenLockedModal?: (featureName?: string) => void;
  onRefreshUser?: () => void;
  onLogout: () => void;
  onBack?: () => void;
}

type SecurityModalType = 
  | null 
  | 'changePassword' 
  | 'changeEmail' 
  | 'requestPhoneChange' 
  | 'verifyCurrentPinForAction'
  | 'pinSetup'
  | 'lockTiming'
  | 'logoutAllConfirm'
  | 'signOutDeviceConfirm';

type PinAction = 'change' | 'disable' | 'enable';

export const SecuritySection: React.FC<SecuritySectionProps> = ({
  user,
  canAccessFullApp = true,
  onOpenLockedModal,
  onRefreshUser,
  onLogout,
  onBack,
}) => {
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [activeModal, setActiveModal] = useState<SecurityModalType>(null);

  // Instantly reset scroll to top on mount
  useScrollToTop([]);

  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState('');

  // 1. Password State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);

  // Forgot password cooldown (60 seconds)
  const [resetEmailCooldown, setResetEmailCooldown] = useState(0);

  // 2. Email State
  const [newEmail, setNewEmail] = useState('');
  const [emailAuthPassword, setEmailAuthPassword] = useState('');
  const [emailVerificationSent, setEmailVerificationSent] = useState(false);

  // 3. Phone Change Request State
  const [newPhoneNumber, setNewPhoneNumber] = useState('');
  const [phoneChangeReason, setPhoneChangeReason] = useState('');
  const [recentPhoneRequests, setRecentPhoneRequests] = useState<any[]>([]);
  const [loadingPhoneRequests, setLoadingPhoneRequests] = useState(false);

  // 4. Devices & Sessions State
  const [activeDevices, setActiveDevices] = useState<DeviceItem[]>([]);
  const [previousDevices, setPreviousDevices] = useState<DeviceItem[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [showPreviousDevices, setShowPreviousDevices] = useState(false);
  const [selectedDeviceToSignOut, setSelectedDeviceToSignOut] = useState<DeviceItem | null>(null);
  const [isSigningOutSingle, setIsSigningOutSingle] = useState(false);

  // 4b. Recent Login History State
  const [loginHistory, setLoginHistory] = useState<LoginHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [currentDeviceId, setCurrentDeviceId] = useState('');

  // 5. App Lock / PIN State
  const [pinEnabled, setPinEnabled] = useState<boolean>(() => {
    return localStorage.getItem(`sky_app_pin_enabled_${user.uid}`) === 'true' || Boolean(user.appLockEnabled);
  });
  const [pinStep, setPinStep] = useState<1 | 2>(1); // 1 = input, 2 = confirm
  const [inputPin, setInputPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [verifyPinInput, setVerifyPinInput] = useState('');
  const [pendingPinAction, setPendingPinAction] = useState<PinAction>('enable');

  // Lock Timing
  const [lockTimeout, setLockTimeout] = useState<number>(() => {
    const saved = localStorage.getItem(`sky_app_lock_timeout_${user.uid}`);
    return saved ? parseInt(saved, 10) : 10000; // default 10s
  });

  // Biometrics
  const [biometricAvailable, setBiometricAvailable] = useState<boolean>(false);
  const [biometricEnabled, setBiometricEnabled] = useState<boolean>(() => {
    return localStorage.getItem(`sky_app_biometric_enabled_${user.uid}`) === 'true';
  });

  const isRestricted = !canAccessFullApp || user.status === 'pending';

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Cooldown timer effect
  useEffect(() => {
    if (resetEmailCooldown <= 0) return;
    const timer = setInterval(() => {
      setResetEmailCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resetEmailCooldown]);

  // Initial load: device ID, sessions, biometrics check, phone requests
  useEffect(() => {
    const devId = getOrCreateDeviceId();
    setCurrentDeviceId(devId);
    loadDevicesAndHistory();
    loadPhoneRequests();
    checkBiometrics();
  }, [user.uid]);

  const loadDevicesAndHistory = async () => {
    setLoadingDevices(true);
    setLoadingHistory(true);
    try {
      const [devResult, historyItems] = await Promise.all([
        fetchUserDevices(user.uid),
        fetchUserLoginHistory(user.uid),
      ]);
      setActiveDevices(devResult.activeDevices);
      setPreviousDevices(devResult.previousDevices);
      setCurrentDeviceId(devResult.currentDeviceId);
      setLoginHistory(historyItems);
    } catch (err) {
      console.warn('Error loading devices and history:', err);
    } finally {
      setLoadingDevices(false);
      setLoadingHistory(false);
    }
  };

  const loadPhoneRequests = async () => {
    setLoadingPhoneRequests(true);
    try {
      const q = query(
        collection(db, 'phone_change_requests'),
        where('userId', '==', user.uid),
        orderBy('createdAt', 'desc'),
        limit(5)
      );
      const snap = await getDocs(q);
      const reqs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setRecentPhoneRequests(reqs);
    } catch (err) {
      // Collection may not have index or documents yet
      console.warn('Error fetching phone change requests:', err);
    } finally {
      setLoadingPhoneRequests(false);
    }
  };

  const checkBiometrics = async () => {
    try {
      if (typeof window !== 'undefined' && window.PublicKeyCredential) {
        const available = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        setBiometricAvailable(available);
      } else {
        setBiometricAvailable(false);
      }
    } catch {
      setBiometricAvailable(false);
    }
  };

  // Password strength calculation
  const getPasswordStrength = (pass: string): { score: number; label: string; color: string; bg: string } => {
    if (!pass) return { score: 0, label: 'None', color: 'text-slate-400', bg: 'bg-slate-200' };
    let score = 0;
    if (pass.length >= 6) score += 1;
    if (pass.length >= 9) score += 1;
    if (/[A-Z]/.test(pass) && /[a-z]/.test(pass)) score += 1;
    if (/\d/.test(pass)) score += 1;
    if (/[^A-Za-z0-9]/.test(pass)) score += 1;

    if (score <= 1) return { score: 1, label: 'Weak', color: 'text-rose-600', bg: 'bg-rose-500' };
    if (score === 2) return { score: 2, label: 'Fair', color: 'text-amber-600', bg: 'bg-amber-500' };
    if (score === 3 || score === 4) return { score: 3, label: 'Good', color: 'text-blue-600', bg: 'bg-blue-500' };
    return { score: 4, label: 'Strong', color: 'text-emerald-600', bg: 'bg-emerald-500' };
  };

  // ==========================================
  // SIGN-IN HANDLERS
  // ==========================================
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');

    if (newPassword.length < 6) {
      setModalError('New password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setModalError('New passwords do not match.');
      return;
    }

    setModalLoading(true);
    triggerHaptic('medium');

    try {
      const currentUser = auth.currentUser;
      if (!currentUser || !currentUser.email) {
        throw new Error('No authenticated user session found.');
      }

      // Re-authenticate
      const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
      await reauthenticateWithCredential(currentUser, credential);

      // Update Password
      await updatePassword(currentUser, newPassword);

      // Audit Log
      await logAuditAction(
        user.uid,
        user.fullName || 'Reseller',
        user.role || 'reseller',
        'UPDATE_PASSWORD',
        { timestamp: new Date().toISOString() }
      );

      triggerHaptic('success');
      showToast('Password updated successfully! Keep it safe.', 'success');
      setActiveModal(null);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      console.error('Password change error:', err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setModalError('Current password is incorrect. Please try again.');
      } else if (err.code === 'auth/weak-password') {
        setModalError('The new password is too weak. Please use letters, numbers, and symbols.');
      } else {
        setModalError(err.message || 'Failed to update password.');
      }
      triggerHaptic('error');
    } finally {
      setModalLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (resetEmailCooldown > 0) return;
    triggerHaptic('light');

    try {
      if (!user.email) throw new Error('No registered email found for this account.');
      await sendPasswordResetEmail(auth, user.email);
      setResetEmailCooldown(60);
      showToast(`Password reset link sent to ${user.email}. Check inbox & spam.`, 'success');
    } catch (err: any) {
      console.error('Password reset email error:', err);
      showToast(err.message || 'Could not send reset email.', 'error');
    }
  };

  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');

    const clean = newEmail.trim().toLowerCase();
    if (!clean || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      setModalError('Please enter a valid email address.');
      return;
    }
    if (clean === user.email?.toLowerCase()) {
      setModalError('New email is identical to your current email.');
      return;
    }

    setModalLoading(true);
    triggerHaptic('medium');

    try {
      const currentUser = auth.currentUser;
      if (!currentUser || !currentUser.email) {
        throw new Error('User is not currently authenticated.');
      }

      // Re-authenticate
      const credential = EmailAuthProvider.credential(currentUser.email, emailAuthPassword);
      await reauthenticateWithCredential(currentUser, credential);

      // Send verification link to new email
      await verifyBeforeUpdateEmail(currentUser, clean);
      setEmailVerificationSent(true);

      // Audit Log
      await logAuditAction(
        user.uid,
        user.fullName || 'Reseller',
        user.role || 'reseller',
        'REQUEST_EMAIL_CHANGE',
        { oldEmail: user.email, newEmail: clean }
      );

      triggerHaptic('success');
      showToast('Verification link sent to new email! Click it to complete update.', 'success');
    } catch (err: any) {
      console.error('Email change error:', err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setModalError('Current password is incorrect.');
      } else if (err.code === 'auth/email-already-in-use') {
        setModalError('This email address is already registered to another account.');
      } else {
        setModalError(err.message || 'Could not send email update verification.');
      }
      triggerHaptic('error');
    } finally {
      setModalLoading(false);
    }
  };

  const handleRequestPhoneChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');

    const cleanPhone = newPhoneNumber.trim();
    if (!/^01[3-9]\d{8}$/.test(cleanPhone)) {
      setModalError('Please enter a valid 11-digit Bangladeshi mobile number (01XXXXXXXXX).');
      return;
    }
    if (cleanPhone === user.mobile) {
      setModalError('New number is identical to your current registered number.');
      return;
    }
    if (!phoneChangeReason.trim()) {
      setModalError('Please provide a reason for the phone number change.');
      return;
    }

    setModalLoading(true);
    triggerHaptic('medium');

    try {
      await addDoc(collection(db, 'phone_change_requests'), {
        userId: user.uid,
        resellerName: user.fullName || user.shopName || 'Reseller',
        resellerId: user.resellerId || user.uid.slice(0, 8),
        oldPhone: user.mobile,
        newPhone: cleanPhone,
        reason: phoneChangeReason.trim(),
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Audit Log
      await logAuditAction(
        user.uid,
        user.fullName || 'Reseller',
        user.role || 'reseller',
        'SUBMIT_PHONE_CHANGE_REQUEST',
        { oldPhone: user.mobile, newPhone: cleanPhone }
      );

      triggerHaptic('success');
      showToast('Phone number change request submitted! Admin will review shortly.', 'success');
      setActiveModal(null);
      setNewPhoneNumber('');
      setPhoneChangeReason('');
      loadPhoneRequests();
    } catch (err: any) {
      console.error('Phone change request error:', err);
      setModalError(err.message || 'Failed to submit request.');
      triggerHaptic('error');
    } finally {
      setModalLoading(false);
    }
  };

  // ==========================================
  // APP LOCK & PIN HANDLERS
  // ==========================================
  const handleOpenPinModal = (action: PinAction) => {
    triggerHaptic('light');
    setPendingPinAction(action);
    setModalError('');

    if (pinEnabled && (action === 'change' || action === 'disable')) {
      // Require current PIN verification first
      setVerifyPinInput('');
      setActiveModal('verifyCurrentPinForAction');
    } else {
      // Setup fresh PIN
      setPinStep(1);
      setInputPin('');
      setConfirmPin('');
      setActiveModal('pinSetup');
    }
  };

  const handleVerifyCurrentPin = () => {
    const storedHash = localStorage.getItem(`sky_app_pin_hash_${user.uid}`) || user.appLockPinHash;
    if (!storedHash) {
      // No stored hash, bypass to step
      if (pendingPinAction === 'change') {
        setPinStep(1);
        setInputPin('');
        setConfirmPin('');
        setActiveModal('pinSetup');
      } else {
        disablePin();
      }
      return;
    }

    const matches = bcrypt.compareSync(verifyPinInput, storedHash);
    if (!matches) {
      triggerHaptic('error');
      setModalError('Incorrect PIN. Please enter your current passcode.');
      setVerifyPinInput('');
      return;
    }

    triggerHaptic('light');
    if (pendingPinAction === 'disable') {
      disablePin();
    } else {
      setPinStep(1);
      setInputPin('');
      setConfirmPin('');
      setModalError('');
      setActiveModal('pinSetup');
    }
  };

  const disablePin = async () => {
    try {
      localStorage.removeItem(`sky_app_pin_enabled_${user.uid}`);
      localStorage.removeItem(`sky_app_pin_hash_${user.uid}`);
      localStorage.removeItem(`sky_app_pin_length_${user.uid}`);
      await updateDoc(doc(db, 'users', user.uid), {
        appLockEnabled: false,
        appLockPinHash: null,
        appLockPinLength: null,
      });
      setPinEnabled(false);
      setActiveModal(null);
      showToast('App Lock PIN turned off.', 'success');
      onRefreshUser?.();
    } catch (err) {
      console.warn('Could not disable PIN on server:', err);
      setPinEnabled(false);
      setActiveModal(null);
      showToast('App Lock PIN turned off locally.', 'success');
    }
  };

  const handleSaveNewPin = async (finalPin: string) => {
    try {
      const hashed = bcrypt.hashSync(finalPin, 10);
      const len = finalPin.length;
      localStorage.setItem(`sky_app_pin_enabled_${user.uid}`, 'true');
      localStorage.setItem(`sky_app_pin_hash_${user.uid}`, hashed);
      localStorage.setItem(`sky_app_pin_length_${user.uid}`, len.toString());

      await updateDoc(doc(db, 'users', user.uid), {
        appLockEnabled: true,
        appLockPinHash: hashed,
        appLockPinLength: len,
      });

      setPinEnabled(true);
      setActiveModal(null);
      showToast('✓ App Lock PIN activated successfully!', 'success');
      onRefreshUser?.();
    } catch (err) {
      console.warn('Error saving PIN to firestore:', err);
      setPinEnabled(true);
      setActiveModal(null);
      showToast('✓ App Lock PIN activated!', 'success');
    }
  };

  const handleToggleBiometrics = (enabled: boolean) => {
    if (!biometricAvailable) {
      showToast('Biometrics not enrolled or supported on this device.', 'error');
      return;
    }
    triggerHaptic('medium');
    setBiometricEnabled(enabled);
    localStorage.setItem(`sky_app_biometric_enabled_${user.uid}`, enabled ? 'true' : 'false');
    showToast(enabled ? 'Biometric authentication enabled' : 'Biometric authentication disabled', 'success');
  };

  const handleSelectLockTimeout = (ms: number) => {
    triggerHaptic('light');
    setLockTimeout(ms);
    localStorage.setItem(`sky_app_lock_timeout_${user.uid}`, ms.toString());
    setActiveModal(null);
    showToast('Lock timeout updated', 'success');
  };

  // ==========================================
  // LOGOUT ALL SESSIONS HANDLER
  // ==========================================
  const handleLogoutAllSessions = async () => {
    setModalLoading(true);
    triggerHaptic('medium');

    try {
      // 1. Revoke refresh tokens, clear FCM tokens, and mark EVERY device as signed_out
      await signOutAllDevices(user.uid);

      // 2. Audit Log
      await logAuditAction(
        user.uid,
        user.fullName || 'Reseller',
        user.role || 'reseller',
        'LOGOUT_ALL_DEVICES',
        { timestamp: new Date().toISOString() }
      );

      triggerHaptic('success');
      showToast('Signed out from all devices', 'success');

      // 3. Clear local states & sign out
      setTimeout(() => {
        onLogout();
      }, 800);
    } catch (err: any) {
      console.error('Logout all sessions error:', err);
      showToast(err.message || 'Failed to logout from all devices. Please retry.', 'error');
    } finally {
      setModalLoading(false);
      setActiveModal(null);
    }
  };

  // ==========================================
  // SIGN OUT SINGLE DEVICE HANDLER
  // ==========================================
  const handleSignOutSingleDevice = async () => {
    if (!selectedDeviceToSignOut) return;
    setIsSigningOutSingle(true);
    triggerHaptic('medium');

    try {
      await signOutSingleDevice(user.uid, selectedDeviceToSignOut.deviceId);
      await logAuditAction(
        user.uid,
        user.fullName || 'Reseller',
        user.role || 'reseller',
        'LOGOUT_SINGLE_DEVICE',
        { deviceId: selectedDeviceToSignOut.deviceId, deviceName: selectedDeviceToSignOut.deviceName }
      );
      triggerHaptic('success');
      showToast(`${selectedDeviceToSignOut.deviceName} signed out.`, 'success');
      await loadDevicesAndHistory();
    } catch (err: any) {
      console.error('Error signing out device:', err);
      showToast('Failed to sign out device. Please retry.', 'error');
    } finally {
      setIsSigningOutSingle(false);
      setSelectedDeviceToSignOut(null);
      setActiveModal(null);
    }
  };

  const getLockTimeoutLabel = (ms: number): string => {
    if (ms <= 0) return 'Immediately';
    if (ms === 10000) return '10 seconds';
    if (ms === 30000) return '30 seconds';
    if (ms === 60000) return '1 minute';
    return `${Math.round(ms / 1000)}s`;
  };

  return (
    <div className="space-y-3 pb-8">
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className={`fixed top-4 left-4 right-4 z-[9999] max-w-sm mx-auto p-3 rounded-2xl shadow-lg border text-xs font-bold flex items-center gap-2 ${
              toastMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200 shadow-emerald-500/10'
                : 'bg-rose-50 text-rose-800 border-rose-200 shadow-rose-500/10'
            }`}
          >
            {toastMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span className="truncate flex-1">{toastMessage.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 1. Header with Breadcrumb Back */}
      <div className="flex items-center gap-2 pt-1">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="w-8 h-8 rounded-xl bg-white/80 border border-white/80 text-slate-700 flex items-center justify-center hover:bg-slate-100 transition-colors cursor-pointer"
            title="Back to Settings"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
        <div>
          <h2 className={DT.pageTitle}>Security & Access</h2>
          <p className={DT.pageSubtitle}>Credentials, app lock, active sessions & devices</p>
        </div>
      </div>

      {/* ========================================================
          GROUP 1: SIGN-IN
         ======================================================== */}
      <div className="space-y-1">
        <span className={DT.settingsGroupLabel}>SIGN-IN</span>
        <div className={DT.settingsGroupCard}>
          {/* Change Password */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setModalError('');
              setCurrentPassword('');
              setNewPassword('');
              setConfirmPassword('');
              setActiveModal('changePassword');
            }}
            className={DT.settingsRow}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`${DT.iconTile} bg-purple-50 text-purple-600 border-purple-200/60`}>
                <Key className={DT.iconSize} />
              </div>
              <div className="min-w-0">
                <span className={DT.settingsRowTitle}>Change Password</span>
                <p className={DT.settingsRowHelper}>Update login account password</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
          </button>

          {/* Forgot Password Link */}
          <div className="px-3.5 py-2.5 flex items-center justify-between text-xs border-t border-slate-100/80">
            <span className="text-[11px] text-slate-500 font-medium">Forgot current password?</span>
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={resetEmailCooldown > 0}
              className="text-[11px] font-bold text-[#0E9AA7] hover:underline disabled:opacity-50 disabled:no-underline cursor-pointer"
            >
              {resetEmailCooldown > 0 ? `Resend link in ${resetEmailCooldown}s` : 'Send reset link to email'}
            </button>
          </div>

          {/* Change Email */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setModalError('');
              setNewEmail('');
              setEmailAuthPassword('');
              setEmailVerificationSent(false);
              setActiveModal('changeEmail');
            }}
            className={DT.settingsRow}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`${DT.iconTile} bg-blue-50 text-blue-600 border-blue-200/60`}>
                <Mail className={DT.iconSize} />
              </div>
              <div className="min-w-0">
                <span className={DT.settingsRowTitle}>Change Email</span>
                <p className={DT.settingsRowHelper}>Registered: {user.email || 'None'}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 ml-2">
              <span className={DT.settingsRowValue}>Verify link</span>
              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
            </div>
          </button>

          {/* Change Phone Number / WhatsApp */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setModalError('');
              setNewPhoneNumber('');
              setPhoneChangeReason('');
              setActiveModal('requestPhoneChange');
            }}
            className={DT.settingsRow}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`${DT.iconTile} bg-emerald-50 text-emerald-600 border-emerald-200/60`}>
                <Phone className={DT.iconSize} />
              </div>
              <div className="min-w-0">
                <span className={DT.settingsRowTitle}>Phone Number / WhatsApp</span>
                <p className={DT.settingsRowHelper}>{user.mobile || 'Not set'}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 ml-2">
              <span className="text-[10px] font-bold text-[#0E9AA7] bg-teal-50 px-2 py-0.5 rounded border border-teal-200/60">
                Request Change
              </span>
              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
            </div>
          </button>
        </div>
      </div>

      {/* ========================================================
          GROUP 2: SESSIONS & DEVICES
         ======================================================== */}
      <div className="space-y-1">
        <div className="flex items-center justify-between px-1">
          <span className={`${DT.settingsGroupLabel} truncate mr-2`}>SESSIONS & ACTIVE DEVICES</span>
          <button
            type="button"
            onClick={loadDevicesAndHistory}
            className="text-[11px] text-slate-500 font-bold hover:text-slate-700 flex items-center gap-1.5 shrink-0 cursor-pointer px-2 py-0.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <RefreshCw className={`w-3 h-3 ${loadingDevices || loadingHistory ? 'animate-spin text-[#0E9AA7]' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        <div className={DT.settingsGroupCard}>
          {/* Active Devices (Only Active Sessions) */}
          <div className="p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Active Devices ({activeDevices.length})
              </span>
              <span className="text-[10px] text-slate-400">Real-time sessions</span>
            </div>

            <div className="space-y-2">
              {loadingDevices ? (
                <div className="py-4 text-center text-xs text-slate-400 flex items-center justify-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0E9AA7]" />
                  <span>Loading device sessions...</span>
                </div>
              ) : activeDevices.length === 0 ? (
                // Current device fallback if empty
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200/60 text-xs">
                  <div className="flex items-center gap-2">
                    <Laptop className="w-4 h-4 text-blue-600" />
                    <div>
                      <p className="font-bold text-slate-800 text-[12px]">Current Session</p>
                      <p className="text-[10px] text-slate-400 font-mono">Web / Mobile Browser</p>
                    </div>
                  </div>
                  <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-emerald-600 text-white">
                    This Device
                  </span>
                </div>
              ) : (
                activeDevices.map((dev) => {
                  const isCurrent = dev.isCurrent || dev.deviceId === currentDeviceId;
                  const ts = dev.lastActive?.toDate ? dev.lastActive.toDate() : (dev.lastActive ? new Date(dev.lastActive) : new Date());
                  return (
                    <div
                      key={dev.deviceId}
                      className={`flex items-center justify-between p-2.5 rounded-xl border text-xs transition-colors ${
                        isCurrent
                          ? 'bg-blue-50/50 border-blue-200/80 shadow-2xs'
                          : 'bg-slate-50/70 border-slate-200/60'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {dev.deviceType === 'tablet' ? (
                          <Tablet className="w-4 h-4 text-purple-600 shrink-0" />
                        ) : dev.deviceType === 'phone' || dev.platform === 'android' || dev.platform === 'ios' ? (
                          <Smartphone className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : (
                          <Laptop className="w-4 h-4 text-blue-600 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="font-bold text-slate-900 text-[12px] truncate">
                              {dev.deviceName}
                            </p>
                            {dev.platform === 'android' ? (
                              <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-1.5 py-0.2 rounded">
                                Android App
                              </span>
                            ) : dev.platform === 'ios' ? (
                              <span className="text-[9px] font-bold text-slate-700 bg-slate-100 border border-slate-200/80 px-1.5 py-0.2 rounded">
                                iOS App
                              </span>
                            ) : (
                              <span className="text-[9px] font-bold text-blue-700 bg-blue-50 border border-blue-200/80 px-1.5 py-0.2 rounded">
                                Web
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                            {dev.os} {dev.osVersion} • v{dev.appVersion || '2.4.0'} • Last active {ts.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        {isCurrent ? (
                          <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded bg-[#04203F] text-white">
                            This Device
                          </span>
                        ) : (
                          <>
                            <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100/80 px-1.5 py-0.5 rounded">
                              Active
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedDeviceToSignOut(dev);
                                setActiveModal('signOutDeviceConfirm');
                              }}
                              className="text-[10px] font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2 py-1 rounded border border-rose-200 transition-colors cursor-pointer"
                              title="Sign out this device"
                            >
                              Log out
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Collapsed Previous Devices (Signed-out and Inactive Devices) */}
            {previousDevices.length > 0 && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowPreviousDevices(!showPreviousDevices)}
                  className="w-full flex items-center justify-between p-2 rounded-xl bg-slate-100/70 hover:bg-slate-100 border border-slate-200/60 text-slate-600 text-xs font-bold transition-colors cursor-pointer"
                >
                  <span className="text-[11px]">Previous devices ({previousDevices.length})</span>
                  {showPreviousDevices ? (
                    <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  )}
                </button>

                <AnimatePresence>
                  {showPreviousDevices && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-1.5 pt-2 overflow-hidden"
                    >
                      {previousDevices.map((dev) => {
                        const ts = dev.lastActive?.toDate ? dev.lastActive.toDate() : (dev.lastActive ? new Date(dev.lastActive) : new Date());
                        return (
                          <div
                            key={dev.deviceId}
                            className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200/50 text-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {dev.deviceType === 'tablet' ? (
                                <Tablet className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              ) : dev.deviceType === 'phone' || dev.platform === 'android' || dev.platform === 'ios' ? (
                                <Smartphone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              ) : (
                                <Laptop className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              )}
                              <div className="min-w-0">
                                <p className="font-bold text-slate-700 text-[11px] truncate">
                                  {dev.deviceName}
                                </p>
                                <p className="text-[9px] text-slate-400">
                                  {dev.os} • Last active {ts.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                                </p>
                              </div>
                            </div>

                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                              dev.status === 'signed_out'
                                ? 'bg-slate-200 text-slate-600'
                                : 'bg-amber-100 text-amber-700'
                            }`}>
                              {dev.status === 'signed_out' ? 'Signed out' : 'Inactive'}
                            </span>
                          </div>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* Login Activity (Last 20 Logins Accordion / Preview) */}
          <div className="border-t border-slate-100/80 p-3.5 space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
              Recent Login History (Last 20)
            </span>

            {loadingHistory ? (
              <div className="py-4 text-center text-xs text-slate-400 flex items-center justify-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0E9AA7]" />
                <span>Loading sign-ins...</span>
              </div>
            ) : loginHistory.length === 0 ? (
              <p className="text-[11px] text-slate-400 text-center py-2 bg-slate-50 rounded-xl">
                Current sign-in session active.
              </p>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
                {loginHistory.map((lh, idx) => {
                  const ts = lh.timestamp?.toDate ? lh.timestamp.toDate() : new Date(lh.timestamp);
                  const isCur = lh.deviceId === currentDeviceId;
                  return (
                    <div
                      key={lh.id || idx}
                      className="flex items-center justify-between p-2 rounded-lg bg-slate-50/60 border border-slate-100 text-[11px]"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-slate-800 truncate">
                            {lh.deviceName || lh.deviceModel || 'Web Client'}
                          </span>
                          {isCur && (
                            <span className="text-[8px] font-black uppercase px-1 py-0.2 bg-emerald-100 text-emerald-800 rounded">
                              This Device
                            </span>
                          )}
                          {lh.isNewDevice && !isCur && (
                            <span className="text-[8px] font-black uppercase px-1 py-0.2 bg-amber-100 text-amber-800 rounded">
                              New Device
                            </span>
                          )}
                        </div>
                        <p className="text-[9px] text-slate-400 font-mono mt-0.5">
                          {ts.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} • {ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <span className="text-[9px] font-semibold text-slate-500 capitalize shrink-0 ml-2">
                        {lh.platform || 'web'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Log out from all devices row */}
          <div className="p-3 border-t border-slate-100/80 bg-rose-50/30">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                setActiveModal('logoutAllConfirm');
              }}
              className="w-full h-[38px] rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <ShieldAlert className="w-4 h-4 text-rose-600" />
              <span>Log Out From All Devices</span>
            </button>
            <p className="text-[10px] text-slate-400 text-center mt-1.5">
              Revokes refresh tokens on all devices and signs out of this session.
            </p>
          </div>
        </div>
      </div>

      {/* ========================================================
          GROUP 3: APP PROTECTION
         ======================================================== */}
      <div className="space-y-1">
        <span className={DT.settingsGroupLabel}>APP PROTECTION</span>
        <div className={DT.settingsGroupCard}>
          {/* App Lock / PIN */}
          <div className={DT.settingsRow}>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`${DT.iconTile} bg-indigo-50 text-indigo-600 border-indigo-200/60`}>
                <Lock className={DT.iconSize} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={DT.settingsRowTitle}>App Lock / PIN</span>
                  {pinEnabled && (
                    <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-emerald-600 text-white">
                      Active
                    </span>
                  )}
                </div>
                <p className={DT.settingsRowHelper}>
                  {pinEnabled ? 'Passcode required on app return' : 'Secure portal with 4-6 digit passcode'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 ml-2">
              {pinEnabled ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleOpenPinModal('change')}
                    className="text-[11px] font-bold text-[#0E9AA7] px-2 py-1 rounded-lg hover:bg-teal-50 transition-colors"
                  >
                    Change
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenPinModal('disable')}
                    className="text-[11px] font-bold text-rose-600 px-2 py-1 rounded-lg hover:bg-rose-50 transition-colors"
                  >
                    Turn Off
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => handleOpenPinModal('enable')}
                  className={`${DT.smallButton} bg-[#04203F] text-white hover:bg-[#0E9AA7]`}
                >
                  Set PIN
                </button>
              )}
            </div>
          </div>

          {/* Biometric Login */}
          <div className={DT.settingsRow}>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`${DT.iconTile} bg-teal-50 text-[#0E9AA7] border-teal-200/60`}>
                <Fingerprint className={DT.iconSize} />
              </div>
              <div className="min-w-0">
                <span className={DT.settingsRowTitle}>Biometric Login</span>
                <p className={DT.settingsRowHelper}>
                  {biometricAvailable
                    ? 'Fingerprint / Face ID authentication'
                    : 'Not supported or enrolled on this device'}
                </p>
              </div>
            </div>

            <div className="shrink-0 ml-2">
              <button
                type="button"
                disabled={!biometricAvailable}
                onClick={() => handleToggleBiometrics(!biometricEnabled)}
                className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  biometricEnabled && biometricAvailable ? 'bg-[#0E9AA7]' : 'bg-slate-300'
                }`}
                title={!biometricAvailable ? 'Biometrics unavailable' : 'Toggle biometrics'}
              >
                <span
                  className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform shadow-xs ${
                    biometricEnabled && biometricAvailable ? 'left-5.5' : 'left-0.5'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Lock Timing */}
          <button
            type="button"
            disabled={!pinEnabled}
            onClick={() => {
              triggerHaptic('light');
              setActiveModal('lockTiming');
            }}
            className={`${DT.settingsRow} disabled:opacity-40`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`${DT.iconTile} bg-amber-50 text-amber-600 border-amber-200/60`}>
                <Clock className={DT.iconSize} />
              </div>
              <div className="min-w-0">
                <span className={DT.settingsRowTitle}>Lock Timing</span>
                <p className={DT.settingsRowHelper}>Require PIN after inactive background delay</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 ml-2">
              <span className={DT.settingsRowValue}>{getLockTimeoutLabel(lockTimeout)}</span>
              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
            </div>
          </button>
        </div>
      </div>

      {/* ========================================================
          GROUP 4: EXTRA PROTECTION
         ======================================================== */}
      <div className="space-y-1">
        <span className={DT.settingsGroupLabel}>EXTRA PROTECTION</span>
        <div className={DT.settingsGroupCard}>
          {/* Two-Step Verification (Coming Soon) */}
          <div className={`${DT.settingsRow} opacity-75`}>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`${DT.iconTile} bg-slate-100 text-slate-500 border-slate-200`}>
                <ShieldCheck className={DT.iconSize} />
              </div>
              <div className="min-w-0">
                <span className={DT.settingsRowTitle}>Two-Step Verification</span>
                <p className={DT.settingsRowHelper}>Hardware keys & authenticator apps</p>
              </div>
            </div>
            <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded bg-slate-200 text-slate-600 tracking-wider">
              Coming Soon
            </span>
          </div>
        </div>
      </div>

      {/* Security Tips Card */}
      <div className="p-3.5 rounded-[14px] bg-white/70 backdrop-blur-xl border border-white/80 space-y-2 text-xs text-slate-600 shadow-2xs">
        <div className="flex items-center gap-1.5 font-bold text-[#04203F] text-[12px]">
          <Shield className="w-3.5 h-3.5 text-[#0E9AA7]" />
          <span>Security Best Practices</span>
        </div>
        <ul className="space-y-1.5 text-[11px] text-slate-500 list-disc list-inside">
          <li>Never share your password, PIN, or OTP with anyone, including support staff.</li>
          <li>Use a unique, strong password containing uppercase, numbers, and symbols.</li>
          <li>Always lock the app or log out when accessing your account on shared devices.</li>
        </ul>
      </div>

      {/* ========================================================
          MODAL 1: CHANGE PASSWORD
         ======================================================== */}
      <AnimatePresence>
        {activeModal === 'changePassword' && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0"
              onClick={() => !modalLoading && setActiveModal(null)}
            />

            <motion.div
              initial={{ opacity: 0, y: 70 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 70 }}
              transition={{ type: 'spring', damping: 25, stiffness: 320 }}
              className="relative w-full max-w-sm bg-white/95 backdrop-blur-2xl border border-white/80 rounded-t-[24px] sm:rounded-[20px] p-5 shadow-2xl z-10 space-y-3.5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl bg-purple-50 text-purple-700 border border-purple-200 flex items-center justify-center">
                    <Key className="w-4 h-4" />
                  </div>
                  <h3 className="text-[13px] font-bold text-[#04203F]">Change Password</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  disabled={modalLoading}
                  className="w-6 h-6 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {modalError && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-[11px] font-semibold text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              <form onSubmit={handleChangePassword} className="space-y-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                    Current Password *
                  </label>
                  <div className="relative">
                    <input
                      type={showCurrentPass ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password"
                      className="w-full h-[38px] px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 outline-none pr-9 focus:border-[#0E9AA7] focus:bg-white"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPass(!showCurrentPass)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showCurrentPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                    New Password *
                  </label>
                  <div className="relative">
                    <input
                      type={showNewPass ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      className="w-full h-[38px] px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 outline-none pr-9 focus:border-[#0E9AA7] focus:bg-white"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPass(!showNewPass)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showNewPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  {/* Password Strength Indicator */}
                  {newPassword && (
                    <div className="mt-1.5 flex items-center justify-between text-[10px]">
                      <div className="flex gap-1 flex-1 max-w-[120px]">
                        {[1, 2, 3, 4].map((step) => {
                          const strength = getPasswordStrength(newPassword);
                          const active = step <= strength.score;
                          return (
                            <div
                              key={step}
                              className={`h-1 flex-1 rounded-full ${
                                active ? strength.bg : 'bg-slate-200'
                              }`}
                            />
                          );
                        })}
                      </div>
                      <span className={`font-bold ${getPasswordStrength(newPassword).color}`}>
                        {getPasswordStrength(newPassword).label}
                      </span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                    Confirm New Password *
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-type new password"
                    className="w-full h-[38px] px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 outline-none focus:border-[#0E9AA7] focus:bg-white"
                    required
                  />
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setActiveModal(null)}
                    disabled={modalLoading}
                    className="flex-1 h-[38px] rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={modalLoading}
                    className="flex-1 h-[38px] rounded-xl bg-[#04203F] hover:bg-[#031830] text-white text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
                  >
                    {modalLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 text-[#3DD055]" />}
                    <span>Update</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================
          MODAL 2: CHANGE EMAIL
         ======================================================== */}
      <AnimatePresence>
        {activeModal === 'changeEmail' && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0"
              onClick={() => !modalLoading && setActiveModal(null)}
            />

            <motion.div
              initial={{ opacity: 0, y: 70 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 70 }}
              transition={{ type: 'spring', damping: 25, stiffness: 320 }}
              className="relative w-full max-w-sm bg-white/95 backdrop-blur-2xl border border-white/80 rounded-t-[24px] sm:rounded-[20px] p-5 shadow-2xl z-10 space-y-3.5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 flex items-center justify-center">
                    <Mail className="w-4 h-4" />
                  </div>
                  <h3 className="text-[13px] font-bold text-[#04203F]">Change Registered Email</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  disabled={modalLoading}
                  className="w-6 h-6 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {emailVerificationSent ? (
                <div className="py-4 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-teal-50 text-[#0E9AA7] border border-teal-200 flex items-center justify-center mx-auto">
                    <Send className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-[13px] font-bold text-[#04203F]">Verification Link Sent</h4>
                    <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                      We sent a verification link to <strong className="text-slate-800">{newEmail}</strong>. Please check your inbox and click the link to confirm your new email.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveModal(null)}
                    className="w-full h-[38px] rounded-xl bg-[#04203F] text-white text-xs font-bold"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <>
                  {modalError && (
                    <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-[11px] font-semibold text-rose-700 flex items-center gap-2">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{modalError}</span>
                    </div>
                  )}

                  <form onSubmit={handleChangeEmail} className="space-y-3">
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                        New Email Address *
                      </label>
                      <input
                        type="email"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="newaddress@example.com"
                        className="w-full h-[38px] px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 outline-none focus:border-[#0E9AA7] focus:bg-white"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                        Current Account Password *
                      </label>
                      <input
                        type="password"
                        value={emailAuthPassword}
                        onChange={(e) => setEmailAuthPassword(e.target.value)}
                        placeholder="Enter password to authenticate"
                        className="w-full h-[38px] px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 outline-none focus:border-[#0E9AA7] focus:bg-white"
                        required
                      />
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setActiveModal(null)}
                        disabled={modalLoading}
                        className="flex-1 h-[38px] rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={modalLoading}
                        className="flex-1 h-[38px] rounded-xl bg-[#04203F] hover:bg-[#031830] text-white text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
                      >
                        {modalLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5 text-[#3DD055]" />}
                        <span>Send Link</span>
                      </button>
                    </div>
                  </form>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================
          MODAL 3: REQUEST PHONE CHANGE
         ======================================================== */}
      <AnimatePresence>
        {activeModal === 'requestPhoneChange' && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0"
              onClick={() => !modalLoading && setActiveModal(null)}
            />

            <motion.div
              initial={{ opacity: 0, y: 70 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 70 }}
              transition={{ type: 'spring', damping: 25, stiffness: 320 }}
              className="relative w-full max-w-sm max-h-[88vh] overflow-y-auto bg-white/95 backdrop-blur-2xl border border-white/80 rounded-t-[24px] sm:rounded-[20px] p-5 shadow-2xl z-10 space-y-3.5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center">
                    <Phone className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-[13px] font-bold text-[#04203F]">Request Phone Change</h3>
                    <p className="text-[10px] text-slate-500">Requires Admin review and approval</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  disabled={modalLoading}
                  className="w-6 h-6 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {modalError && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-[11px] font-semibold text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              <form onSubmit={handleRequestPhoneChange} className="space-y-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                    Current Number
                  </label>
                  <input
                    type="text"
                    value={user.mobile || 'Not registered'}
                    disabled
                    className="w-full h-[38px] px-3 bg-slate-100 border border-slate-200 rounded-xl text-xs font-mono text-slate-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                    New Phone Number *
                  </label>
                  <input
                    type="text"
                    value={newPhoneNumber}
                    onChange={(e) => setNewPhoneNumber(e.target.value)}
                    placeholder="01XXXXXXXXX"
                    className="w-full h-[38px] px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-semibold text-slate-900 outline-none focus:border-[#0E9AA7] focus:bg-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                    Reason for Change *
                  </label>
                  <textarea
                    value={phoneChangeReason}
                    onChange={(e) => setPhoneChangeReason(e.target.value)}
                    placeholder="e.g. Lost previous SIM card / switched to new official shop mobile number"
                    rows={2}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 outline-none focus:border-[#0E9AA7] focus:bg-white resize-none"
                    required
                  />
                </div>

                {/* Recent requests list if any */}
                {recentPhoneRequests.length > 0 && (
                  <div className="pt-1 border-t border-slate-100 space-y-1.5">
                    <span className="text-[10px] font-bold uppercase text-slate-400">Previous Requests</span>
                    <div className="space-y-1">
                      {recentPhoneRequests.map((req) => (
                        <div key={req.id} className="p-2 rounded-lg bg-slate-50 border border-slate-100 text-[10px] flex items-center justify-between">
                          <span className="font-mono text-slate-700">{req.newPhone}</span>
                          <span className={`px-1.5 py-0.2 rounded font-bold uppercase text-[9px] ${
                            req.status === 'approved' ? 'bg-emerald-100 text-emerald-800' :
                            req.status === 'rejected' ? 'bg-rose-100 text-rose-800' :
                            'bg-amber-100 text-amber-800'
                          }`}>
                            {req.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setActiveModal(null)}
                    disabled={modalLoading}
                    className="flex-1 h-[38px] rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={modalLoading}
                    className="flex-1 h-[38px] rounded-xl bg-[#04203F] hover:bg-[#031830] text-white text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
                  >
                    {modalLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5 text-[#3DD055]" />}
                    <span>Submit Request</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================
          MODAL 4: VERIFY CURRENT PIN BEFORE DISABLE / CHANGE
         ======================================================== */}
      <AnimatePresence>
        {activeModal === 'verifyCurrentPinForAction' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs select-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#EEF2F7] rounded-[28px] max-w-xs w-full p-5 shadow-2xl border border-white/60 text-center space-y-3"
            >
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200/80 flex items-center justify-center mx-auto">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-[13px] font-bold text-[#04203F]">Enter Current PIN</h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Confirm your passcode to {pendingPinAction === 'disable' ? 'turn off' : 'change'} App Lock.
                </p>
              </div>

              {/* Masked PIN display */}
              <div className="flex justify-center gap-2 py-1">
                {[0, 1, 2, 3].map((idx) => (
                  <div
                    key={idx}
                    className="w-7 h-7 rounded-full bg-slate-200/80 border border-slate-300 flex items-center justify-center"
                  >
                    {idx < verifyPinInput.length && (
                      <span className="w-2.5 h-2.5 rounded-full bg-[#0E9AA7]" />
                    )}
                  </div>
                ))}
              </div>

              {modalError && (
                <p className="text-[10px] font-bold text-rose-600 bg-rose-50 py-1 px-2 rounded-lg">
                  {modalError}
                </p>
              )}

              {/* Keypad */}
              <NeumorphicPinKeypad
                pin={verifyPinInput}
                maxPinLength={6}
                onDigitPress={(d) => {
                  setModalError('');
                  if (verifyPinInput.length < 6) {
                    const next = verifyPinInput + d;
                    setVerifyPinInput(next);
                  }
                }}
                onBackspace={() => {
                  setModalError('');
                  setVerifyPinInput((prev) => prev.slice(0, -1));
                }}
              />

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="flex-1 h-[36px] rounded-xl bg-slate-200 text-slate-700 text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={verifyPinInput.length < 4}
                  onClick={handleVerifyCurrentPin}
                  className="flex-1 h-[36px] rounded-xl bg-[#04203F] text-white text-xs font-bold disabled:opacity-40"
                >
                  Confirm
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================
          MODAL 5: PIN SETUP / CONFIRM (NEUMORPHIC SHEET)
         ======================================================== */}
      <AnimatePresence>
        {activeModal === 'pinSetup' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs select-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#EEF2F7] rounded-[28px] max-w-xs w-full p-5 shadow-2xl border border-white/60 text-center space-y-3"
            >
              <div className="w-10 h-10 rounded-xl bg-teal-50 text-[#0E9AA7] border border-teal-200/80 flex items-center justify-center mx-auto">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-[13px] font-bold text-[#04203F]">
                  {pinStep === 1 ? 'Create 4-6 Digit PIN' : 'Confirm Your PIN'}
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {pinStep === 1 ? 'Choose a new security passcode' : 'Re-enter your passcode to verify'}
                </p>
              </div>

              {/* Dots */}
              <div className="flex justify-center gap-2 py-1">
                {Array.from({ length: pinStep === 1 ? Math.max(4, inputPin.length) : inputPin.length || 4 }).map((_, idx) => {
                  const cur = pinStep === 1 ? inputPin : confirmPin;
                  return (
                    <div
                      key={idx}
                      className="w-7 h-7 rounded-full bg-slate-200/80 border border-slate-300 flex items-center justify-center"
                    >
                      {idx < cur.length && (
                        <span className="w-2.5 h-2.5 rounded-full bg-[#0E9AA7]" />
                      )}
                    </div>
                  );
                })}
              </div>

              {modalError && (
                <p className="text-[10px] font-bold text-rose-600 bg-rose-50 py-1 px-2 rounded-lg">
                  {modalError}
                </p>
              )}

              {/* Keypad */}
              <NeumorphicPinKeypad
                pin={pinStep === 1 ? inputPin : confirmPin}
                maxPinLength={pinStep === 1 ? 6 : inputPin.length || 6}
                onDigitPress={(digit) => {
                  setModalError('');
                  if (pinStep === 1) {
                    if (inputPin.length < 6) setInputPin(inputPin + digit);
                  } else {
                    if (confirmPin.length < inputPin.length) {
                      const next = confirmPin + digit;
                      setConfirmPin(next);
                      if (next.length === inputPin.length) {
                        if (next === inputPin) {
                          handleSaveNewPin(next);
                        } else {
                          triggerHaptic('error');
                          setModalError('PINs do not match. Please try again.');
                          setTimeout(() => setConfirmPin(''), 500);
                        }
                      }
                    }
                  }
                }}
                onBackspace={() => {
                  setModalError('');
                  if (pinStep === 1) setInputPin((prev) => prev.slice(0, -1));
                  else setConfirmPin((prev) => prev.slice(0, -1));
                }}
              />

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    if (pinStep === 2) {
                      setPinStep(1);
                      setConfirmPin('');
                    } else {
                      setActiveModal(null);
                    }
                  }}
                  className="flex-1 h-[36px] rounded-xl bg-slate-200 text-slate-700 text-xs font-bold"
                >
                  {pinStep === 2 ? 'Back' : 'Cancel'}
                </button>
                {pinStep === 1 && (
                  <button
                    type="button"
                    disabled={inputPin.length < 4}
                    onClick={() => {
                      setPinStep(2);
                      setConfirmPin('');
                    }}
                    className="flex-1 h-[36px] rounded-xl bg-[#04203F] text-white text-xs font-bold disabled:opacity-40"
                  >
                    Next
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================
          MODAL 6: LOCK TIMING SELECTOR
         ======================================================== */}
      <AnimatePresence>
        {activeModal === 'lockTiming' && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0"
              onClick={() => setActiveModal(null)}
            />

            <motion.div
              initial={{ opacity: 0, y: 70 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 70 }}
              transition={{ type: 'spring', damping: 25, stiffness: 320 }}
              className="relative w-full max-w-sm bg-white/95 backdrop-blur-2xl border border-white/80 rounded-t-[24px] sm:rounded-[20px] p-5 shadow-2xl z-10 space-y-3"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <h3 className="text-[13px] font-bold text-[#04203F]">Lock Timeout Delay</h3>
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="w-6 h-6 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-1">
                {[
                  { label: 'Immediately', ms: 0 },
                  { label: '10 seconds (Recommended)', ms: 10000 },
                  { label: '30 seconds', ms: 30000 },
                  { label: '1 minute', ms: 60000 },
                ].map((opt) => (
                  <button
                    key={opt.ms}
                    type="button"
                    onClick={() => handleSelectLockTimeout(opt.ms)}
                    className={`w-full h-[40px] px-3.5 rounded-xl text-xs font-semibold flex items-center justify-between transition-colors ${
                      lockTimeout === opt.ms
                        ? 'bg-[#04203F] text-white shadow-xs'
                        : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {lockTimeout === opt.ms && <Check className="w-4 h-4 text-[#3DD055]" />}
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================
          MODAL 7: LOGOUT ALL SESSIONS CONFIRM
         ======================================================== */}
      <AnimatePresence>
        {activeModal === 'logoutAllConfirm' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[20px] max-w-xs w-full p-5 space-y-3 shadow-2xl border border-slate-100 text-center"
            >
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 border border-rose-200/80 flex items-center justify-center mx-auto">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-[14px] font-bold text-[#04203F]">Log Out All Devices?</h4>
                <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                  This will revoke all active sign-in tokens across other phones, tablets, and computers. You will need to log back in.
                </p>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  disabled={modalLoading}
                  className="flex-1 h-[36px] rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleLogoutAllSessions}
                  disabled={modalLoading}
                  className="flex-1 h-[36px] rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                >
                  {modalLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>Log Out All</span>}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================
          MODAL 8: SIGN OUT SINGLE DEVICE CONFIRM
         ======================================================== */}
      <AnimatePresence>
        {activeModal === 'signOutDeviceConfirm' && selectedDeviceToSignOut && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[20px] max-w-xs w-full p-5 space-y-3 shadow-2xl border border-slate-100 text-center"
            >
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 border border-rose-200/80 flex items-center justify-center mx-auto">
                <LogOut className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-[14px] font-bold text-[#04203F]">Sign Out Device?</h4>
                <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                  Are you sure you want to sign out <strong className="text-slate-700">{selectedDeviceToSignOut.deviceName}</strong>? This session will be terminated and push notifications removed.
                </p>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setActiveModal(null);
                    setSelectedDeviceToSignOut(null);
                  }}
                  disabled={isSigningOutSingle}
                  className="flex-1 h-[36px] rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSignOutSingleDevice}
                  disabled={isSigningOutSingle}
                  className="flex-1 h-[36px] rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {isSigningOutSingle ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>Sign Out</span>}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

