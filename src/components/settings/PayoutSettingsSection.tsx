import React, { useState, useEffect } from 'react';
import { doc, updateDoc, collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserProfile, PayoutMethod } from '../../types';
import { BANGLADESH_BANKS } from '../../data/bangladeshBanks';
import { logAuditAction } from '../../lib/auditLogger';
import { triggerHaptic } from '../../lib/nativeFeedback';
import { DENSITY_TOKENS as DT } from '../../utils/densityTokens';
import { 
  CreditCard, Plus, CheckCircle2, AlertCircle, Clock, Trash2, Edit3, 
  Eye, EyeOff, ShieldCheck, ChevronRight, X, Loader2, Check, 
  HelpCircle, AlertTriangle, ArrowLeft, Building2, Smartphone
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PageHeader } from '../common/PageHeader';

interface PayoutSettingsSectionProps {
  user: UserProfile;
  canAccessFullApp?: boolean;
  onOpenLockedModal?: (featureName?: string) => void;
  onRefreshUser?: () => void;
  onBack?: () => void;
  hideHeader?: boolean;
}

type PayoutType = 'bKash' | 'Nagad' | 'Rocket' | 'Upay' | 'Bank';

// Simple text-initial tiles for payout methods (no copyrighted logos)
const METHOD_CONFIG: Record<PayoutType, { initial: string; bg: string; text: string; border: string; label: string }> = {
  bKash: { initial: 'bK', bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200/80', label: 'bKash Wallet' },
  Nagad: { initial: 'NG', bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200/80', label: 'Nagad Wallet' },
  Rocket: { initial: 'RK', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200/80', label: 'Rocket Wallet' },
  Upay: { initial: 'UP', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200/80', label: 'Upay Wallet' },
  Bank: { initial: 'BK', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200/80', label: 'Bank Account' },
};

export const PayoutSettingsSection: React.FC<PayoutSettingsSectionProps> = ({
  user,
  canAccessFullApp = true,
  onOpenLockedModal,
  onRefreshUser,
  onBack,
  hideHeader = false,
}) => {
  const [payoutMethods, setPayoutMethods] = useState<PayoutMethod[]>(user.payoutMethods || []);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Instantly reset scroll to top on mount
  useScrollToTop([]);

  // Unmask eye state for each account (number visible for 5 seconds)
  const [revealedIds, setRevealedIds] = useState<Record<string, boolean>>({});

  // Bottom Sheet: Actions Modal for a selected method
  const [selectedMethod, setSelectedMethod] = useState<PayoutMethod | null>(null);

  // Bottom Sheet: Add / Edit Form Modal
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingMethodId, setEditingMethodId] = useState<string | null>(null);

  // Form Fields
  const [formType, setFormType] = useState<PayoutType>('bKash');
  const [formAccountNum, setFormAccountNum] = useState('');
  const [formHolderName, setFormHolderName] = useState(user.fullName || '');
  const [formBankName, setFormBankName] = useState('');
  const [formBranchName, setFormBranchName] = useState('');
  const [formRoutingNumber, setFormRoutingNumber] = useState('');
  const [formIsDefault, setFormIsDefault] = useState(false);
  const [bankSearchQuery, setBankSearchQuery] = useState('');

  // Delete Confirm Dialog
  const [deleteConfirmMethod, setDeleteConfirmMethod] = useState<PayoutMethod | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const isRestricted = !canAccessFullApp || user.status === 'pending';

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Masking helper: •••• •••• 1234
  const maskAccountNumber = (num: string): string => {
    if (!num) return '••••';
    const clean = num.replace(/\s+/g, '');
    if (clean.length <= 4) return clean;
    const last4 = clean.slice(-4);
    return `•••• •••• ${last4}`;
  };

  // Reveal account number for 5 seconds
  const handleToggleReveal = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    triggerHaptic('light');

    if (revealedIds[id]) {
      setRevealedIds((prev) => ({ ...prev, [id]: false }));
      return;
    }

    setRevealedIds((prev) => ({ ...prev, [id]: true }));
    setTimeout(() => {
      setRevealedIds((prev) => ({ ...prev, [id]: false }));
    }, 5000);
  };

  const handleOpenAdd = () => {
    triggerHaptic('light');
    if (isRestricted) {
      if (onOpenLockedModal) onOpenLockedModal('Payout Methods');
      else showToast('Payout accounts require approved reseller status', 'error');
      return;
    }

    setEditingMethodId(null);
    setFormType('bKash');
    setFormAccountNum('');
    setFormHolderName(user.fullName || '');
    setFormBankName('');
    setFormBranchName('');
    setFormRoutingNumber('');
    setFormIsDefault(payoutMethods.length === 0);
    setFormError('');
    setBankSearchQuery('');
    setIsFormModalOpen(true);
  };

  const handleOpenEdit = (pm: PayoutMethod) => {
    triggerHaptic('light');
    setSelectedMethod(null);
    setEditingMethodId(pm.id);
    setFormType(pm.type);
    setFormAccountNum(pm.accountNumber);
    setFormHolderName(pm.accountHolderName || user.fullName || '');
    setFormBankName(pm.bankName || '');
    setFormBranchName(pm.branchName || '');
    setFormRoutingNumber(pm.routingNumber || '');
    setFormIsDefault(pm.isDefault);
    setFormError('');
    setBankSearchQuery('');
    setIsFormModalOpen(true);
  };

  // Set method as default
  const handleSetDefault = async (methodId: string) => {
    triggerHaptic('medium');
    setSelectedMethod(null);
    try {
      const updated = payoutMethods.map((pm) => ({
        ...pm,
        isDefault: pm.id === methodId,
      }));

      await updateDoc(doc(db, 'users', user.uid), {
        payoutMethods: updated,
        updatedAt: serverTimestamp(),
      });

      setPayoutMethods(updated);
      showToast('✓ Set as primary payout account', 'success');
      onRefreshUser?.();
    } catch (err: any) {
      console.error('Error setting default payout method:', err);
      showToast(err.message || 'Failed to update default account', 'error');
    }
  };

  // Check if pending withdrawal requests exist for this method before deleting
  const handleDeleteRequest = async (pm: PayoutMethod) => {
    setSelectedMethod(null);

    // Rule 1: The default method cannot be deleted while it is the only one
    if (payoutMethods.length === 1 && pm.isDefault) {
      showToast('Cannot delete your only registered payout account.', 'error');
      return;
    }

    // Rule 2: Block deletion if a pending withdrawal request uses this method
    try {
      const q = query(
        collection(db, 'withdrawalRequests'),
        where('userId', '==', user.uid),
        where('status', '==', 'pending')
      );
      const snap = await getDocs(q);
      const activeMatch = snap.docs.some((d) => {
        const reqData = d.data();
        return (
          reqData.accountDetails === pm.accountNumber ||
          reqData.paymentMethod === pm.type ||
          reqData.payoutMethodId === pm.id
        );
      });

      if (activeMatch) {
        showToast('Cannot delete account while a pending withdrawal is in progress.', 'error');
        return;
      }
    } catch (err) {
      console.warn('Could not check pending withdrawals:', err);
    }

    setDeleteConfirmMethod(pm);
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmMethod) return;
    setIsDeleting(true);
    triggerHaptic('medium');

    try {
      let updated = payoutMethods.filter((pm) => pm.id !== deleteConfirmMethod.id);
      
      // If deleted method was default and others remain, make first one default
      if (deleteConfirmMethod.isDefault && updated.length > 0) {
        updated[0].isDefault = true;
      }

      await updateDoc(doc(db, 'users', user.uid), {
        payoutMethods: updated,
        updatedAt: serverTimestamp(),
      });

      // Audit Log
      await logAuditAction(
        user.uid,
        user.fullName || 'Reseller',
        user.role || 'reseller',
        'DELETE_PAYOUT_METHOD',
        { methodId: deleteConfirmMethod.id, type: deleteConfirmMethod.type }
      );

      setPayoutMethods(updated);
      setDeleteConfirmMethod(null);
      showToast('Payout account deleted successfully', 'success');
      onRefreshUser?.();
    } catch (err: any) {
      console.error('Error deleting payout method:', err);
      showToast(err.message || 'Failed to delete payout method', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Form submission: Add or Edit
  const handleSaveMethod = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    triggerHaptic('medium');

    const cleanNum = formAccountNum.trim();
    if (!cleanNum) {
      setFormError('Account number or wallet phone number is required.');
      return;
    }

    // BD mobile validation for wallets
    if (formType !== 'Bank') {
      const bdMobileRegex = /^01[3-9]\d{8}$/;
      if (!bdMobileRegex.test(cleanNum)) {
        setFormError('Please enter a valid 11-digit Bangladeshi mobile number (e.g. 01712345678).');
        return;
      }
    } else {
      if (cleanNum.length < 8 || cleanNum.length > 30) {
        setFormError('Please enter a valid bank account number (8–30 characters).');
        return;
      }
      if (!formBankName.trim()) {
        setFormError('Please select or enter the bank name.');
        return;
      }
      if (formRoutingNumber.trim() && !/^\d{9}$/.test(formRoutingNumber.trim())) {
        setFormError('Bank routing number must be exactly 9 digits.');
        return;
      }
    }

    if (!formHolderName.trim()) {
      setFormError('Account holder name is required.');
      return;
    }

    setIsSaving(true);
    try {
      const isFirst = payoutMethods.length === 0;
      const shouldBeDefault = formIsDefault || isFirst;

      let updatedList: PayoutMethod[] = [];

      if (editingMethodId) {
        // Edit existing
        updatedList = payoutMethods.map((pm) => {
          if (pm.id === editingMethodId) {
            return {
              ...pm,
              type: formType,
              accountNumber: cleanNum,
              accountHolderName: formHolderName.trim(),
              bankName: formType === 'Bank' ? formBankName.trim() : null,
              branchName: formType === 'Bank' ? formBranchName.trim() || null : null,
              routingNumber: formType === 'Bank' ? formRoutingNumber.trim() || null : null,
              isDefault: shouldBeDefault ? true : pm.isDefault,
              // Changing account sets verification back to pending review
              verified: false,
              payoutVerified: 'pending' as const,
            };
          }
          return shouldBeDefault ? { ...pm, isDefault: false } : pm;
        });
      } else {
        // Add new
        const newMethod: PayoutMethod = {
          id: 'pm_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6),
          type: formType,
          accountNumber: cleanNum,
          accountHolderName: formHolderName.trim(),
          bankName: formType === 'Bank' ? formBankName.trim() : null,
          branchName: formType === 'Bank' ? formBranchName.trim() || null : null,
          routingNumber: formType === 'Bank' ? formRoutingNumber.trim() || null : null,
          isDefault: shouldBeDefault,
          verified: false,
          payoutVerified: 'pending',
          addedAt: new Date().toISOString(),
        };

        updatedList = shouldBeDefault 
          ? [...payoutMethods.map((pm) => ({ ...pm, isDefault: false })), newMethod]
          : [...payoutMethods, newMethod];
      }

      await updateDoc(doc(db, 'users', user.uid), {
        payoutMethods: updatedList,
        updatedAt: serverTimestamp(),
      });

      // Notify Admin in 'notices' or 'admin_notifications'
      try {
        await addDoc(collection(db, 'notices'), {
          type: 'payout_verification',
          title: `Payout Verification: ${user.shopName || user.fullName}`,
          message: `${user.fullName} (${user.shopName || 'Reseller'}) registered a ${formType} payout account ending in ${cleanNum.slice(-4)}. Review and verify.`,
          userId: user.uid,
          targetRole: 'admin',
          createdAt: serverTimestamp(),
          isRead: false,
        });
      } catch (noticeErr) {
        console.warn('Could not dispatch admin notice for payout verification:', noticeErr);
      }

      // Audit Log
      await logAuditAction(
        user.uid,
        user.fullName || 'Reseller',
        user.role || 'reseller',
        editingMethodId ? 'EDIT_PAYOUT_METHOD' : 'ADD_PAYOUT_METHOD',
        { type: formType, last4: cleanNum.slice(-4) }
      );

      setPayoutMethods(updatedList);
      setIsFormModalOpen(false);
      showToast(editingMethodId ? 'Payout account updated and submitted for review.' : 'New payout account added! Awaiting Admin verification.', 'success');
      onRefreshUser?.();
    } catch (err: any) {
      console.error('Error saving payout method:', err);
      setFormError(err.message || 'Failed to save payout method.');
    } finally {
      setIsSaving(false);
    }
  };

  // Filtered Bangladesh banks for searchable select
  const filteredBanks = BANGLADESH_BANKS.filter((b) => 
    b.name.toLowerCase().includes(bankSearchQuery.toLowerCase())
  );

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

      {/* 1. Header with Breadcrumb Back (Shown only when not embedded in a parent with a header) */}
      {!hideHeader ? (
        <PageHeader
          title="Payout Settings"
          subtitle="Registered bank & mobile banking accounts"
          onBack={onBack}
          rightAction={
            <button
              type="button"
              onClick={handleOpenAdd}
              className={`${DT.smallButton} bg-[#04203F] text-white hover:bg-[#0E9AA7]`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Account</span>
            </button>
          }
        />
      ) : (
        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={handleOpenAdd}
            className={`${DT.smallButton} bg-[#04203F] text-white hover:bg-[#0E9AA7]`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Account</span>
          </button>
        </div>
      )}

      {/* Verification Notice Banner */}
      <div className="p-3 rounded-[14px] bg-teal-50/70 border border-teal-200/80 text-[11px] text-[#04203F] flex items-start gap-2 shadow-2xs">
        <ShieldCheck className="w-4 h-4 text-[#0E9AA7] shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong className="text-[#0E9AA7]">Verification Policy:</strong> New and edited payout accounts are reviewed by Administrators to protect your commission earnings. You can still withdraw via previously verified accounts.
        </p>
      </div>

      {/* 2. Registered Accounts Grouped Card */}
      <div className="space-y-1">
        <div className="flex items-center justify-between px-1">
          <span className={DT.settingsGroupLabel}>REGISTERED ACCOUNTS ({payoutMethods.length})</span>
          <span className="text-[10px] text-slate-400 font-medium">Tap row for actions</span>
        </div>

        {payoutMethods.length === 0 ? (
          /* Empty State */
          <div className="bg-white/70 backdrop-blur-xl border border-white/80 rounded-[14px] p-6 text-center space-y-3 shadow-2xs">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200/60 flex items-center justify-center mx-auto">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-[13px] font-bold text-[#04203F]">No Payout Methods Registered</h4>
              <p className="text-[11px] text-slate-500 mt-1 max-w-xs mx-auto leading-tight">
                Add your bKash, Nagad, Rocket, Upay, or Bank account details to receive your commission withdrawals.
              </p>
            </div>
            <button
              type="button"
              onClick={handleOpenAdd}
              className={`${DT.primaryButton} max-w-xs mx-auto`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add First Payout Method</span>
            </button>
          </div>
        ) : (
          <div className={DT.settingsGroupCard}>
            {payoutMethods.map((pm) => {
              const cfg = METHOD_CONFIG[pm.type] || METHOD_CONFIG.Bank;
              const isRevealed = Boolean(revealedIds[pm.id]);
              const verificationState = pm.payoutVerified || (pm.verified ? 'verified' : 'pending');

              return (
                <div
                  key={pm.id}
                  onClick={() => {
                    triggerHaptic('light');
                    setSelectedMethod(pm);
                  }}
                  className={`${DT.settingsRow} cursor-pointer group`}
                >
                  {/* Left: Text-Initial Method Tile */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-8 h-8 rounded-xl font-black text-xs flex items-center justify-center shrink-0 border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                      {cfg.initial}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={DT.settingsRowTitle}>{cfg.label}</span>
                        {pm.isDefault && (
                          <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-emerald-600 text-white tracking-wider">
                            Default
                          </span>
                        )}
                        {/* Verification Status Chip */}
                        {verificationState === 'verified' ? (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                            <span>Verified</span>
                          </span>
                        ) : verificationState === 'rejected' ? (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1">
                            <AlertCircle className="w-2.5 h-2.5 text-rose-600" />
                            <span>Rejected</span>
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5 text-amber-600" />
                            <span>Pending Review</span>
                          </span>
                        )}
                      </div>

                      {/* Number row with tap-to-reveal eye */}
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="font-mono text-[11px] font-bold text-slate-700 tabular-nums">
                          {isRevealed ? pm.accountNumber : maskAccountNumber(pm.accountNumber)}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => handleToggleReveal(pm.id, e)}
                          className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
                          title={isRevealed ? 'Hide number' : 'Show full number for 5s'}
                        >
                          {isRevealed ? <EyeOff className="w-3 h-3 text-[#0E9AA7]" /> : <Eye className="w-3 h-3" />}
                        </button>
                      </div>

                      {/* Bank Details / Holder Name */}
                      <p className="text-[10px] text-slate-400 truncate mt-0.2">
                        {pm.type === 'Bank' && pm.bankName ? `${pm.bankName} • ` : ''}
                        {pm.accountHolderName || user.fullName || 'Account Holder'}
                      </p>
                    </div>
                  </div>

                  {/* Right side chevron */}
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. Payout Rules & Threshold Info Card */}
      <div className="space-y-1 pt-1">
        <span className={DT.settingsGroupLabel}>WITHDRAWAL & PROCESSING RULES</span>
        <div className="bg-white/70 backdrop-blur-xl border border-white/80 rounded-[14px] p-3.5 space-y-2.5 text-xs text-slate-600 shadow-2xs">
          <div className="flex items-center justify-between border-b border-slate-100/80 pb-2">
            <span className="font-semibold text-slate-500 text-[11px]">Minimum Withdrawal</span>
            <span className="font-mono font-bold text-[#04203F] text-[12px]">৳500 BDT</span>
          </div>
          <div className="flex items-center justify-between border-b border-slate-100/80 pb-2">
            <span className="font-semibold text-slate-500 text-[11px]">Processing Turnaround</span>
            <span className="font-bold text-emerald-700 text-[11px]">24 – 48 Hours</span>
          </div>
          <div className="flex items-center justify-between border-b border-slate-100/80 pb-2">
            <span className="font-semibold text-slate-500 text-[11px]">Automated Batch Disbursal</span>
            <span className="font-bold text-[#0E9AA7] text-[11px]">bKash, Nagad, Rocket</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-500 text-[11px]">Bank Wire Method</span>
            <span className="font-medium text-slate-700 text-[11px]">BEFTN / NPSB Routing</span>
          </div>
        </div>
      </div>

      {/* ========================================================
          MODAL A: METHOD ACTIONS BOTTOM SHEET
         ======================================================== */}
      <AnimatePresence>
        {selectedMethod && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0"
              onClick={() => setSelectedMethod(null)}
            />

            <motion.div
              initial={{ opacity: 0, y: 70 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 70 }}
              transition={{ type: 'spring', damping: 25, stiffness: 320 }}
              className="relative w-full max-w-sm bg-white/95 backdrop-blur-2xl border border-white/80 rounded-t-[24px] sm:rounded-[20px] p-5 shadow-2xl z-10 space-y-3"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-lg text-xs font-black flex items-center justify-center border ${METHOD_CONFIG[selectedMethod.type]?.bg} ${METHOD_CONFIG[selectedMethod.type]?.text} ${METHOD_CONFIG[selectedMethod.type]?.border}`}>
                    {METHOD_CONFIG[selectedMethod.type]?.initial}
                  </div>
                  <div>
                    <h3 className="text-[13px] font-bold text-[#04203F] leading-tight">
                      {METHOD_CONFIG[selectedMethod.type]?.label}
                    </h3>
                    <p className="text-[10px] font-mono text-slate-500">
                      {selectedMethod.accountNumber}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedMethod(null)}
                  className="w-6 h-6 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Action Rows */}
              <div className="space-y-1.5 pt-1">
                {!selectedMethod.isDefault && (
                  <button
                    type="button"
                    onClick={() => handleSetDefault(selectedMethod.id)}
                    className="w-full h-[40px] px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center gap-2.5 transition-colors"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Set as Default Payout Method</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleOpenEdit(selectedMethod)}
                  className="w-full h-[40px] px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#04203F] text-xs font-bold flex items-center gap-2.5 transition-colors"
                >
                  <Edit3 className="w-4 h-4 text-[#0E9AA7]" />
                  <span>Edit Account Details</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleDeleteRequest(selectedMethod)}
                  className="w-full h-[40px] px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold flex items-center gap-2.5 transition-colors"
                >
                  <Trash2 className="w-4 h-4 text-rose-600" />
                  <span>Delete Account</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================
          MODAL B: ADD / EDIT PAYOUT METHOD BOTTOM SHEET
         ======================================================== */}
      <AnimatePresence>
        {isFormModalOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0"
              onClick={() => !isSaving && setIsFormModalOpen(false)}
            />

            <motion.div
              initial={{ opacity: 0, y: 70 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 70 }}
              transition={{ type: 'spring', damping: 25, stiffness: 320 }}
              className="relative w-full max-w-sm max-h-[88vh] overflow-y-auto bg-white/95 backdrop-blur-2xl border border-white/80 rounded-t-[24px] sm:rounded-[20px] p-5 shadow-2xl z-10 space-y-3.5"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center">
                    <CreditCard className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-[13px] font-bold text-[#04203F] leading-tight">
                      {editingMethodId ? 'Edit Payout Account' : 'Add Payout Method'}
                    </h3>
                    <p className="text-[10px] text-slate-500">
                      Enter official registered account information
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsFormModalOpen(false)}
                  disabled={isSaving}
                  className="w-6 h-6 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center disabled:opacity-50"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Error Banner */}
              {formError && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-[11px] font-semibold text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <form onSubmit={handleSaveMethod} className="space-y-3">
                {/* Method Type Selector */}
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1.5">
                    Account Type *
                  </label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {(['bKash', 'Nagad', 'Rocket', 'Upay', 'Bank'] as const).map((t) => {
                      const cfg = METHOD_CONFIG[t];
                      const isSel = formType === t;
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => {
                            triggerHaptic('light');
                            setFormType(t);
                          }}
                          className={`h-11 rounded-xl font-bold text-xs flex flex-col items-center justify-center transition-all border ${
                            isSel
                              ? 'bg-[#04203F] text-white border-[#04203F] shadow-xs'
                              : 'bg-slate-50 text-slate-700 border-slate-200/80 hover:bg-slate-100'
                          }`}
                        >
                          <span className="text-[11px] font-extrabold">{cfg.initial}</span>
                          <span className="text-[9px] opacity-80">{t}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Account Number / Wallet Phone */}
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                    {formType === 'Bank' ? 'Bank Account Number *' : `${formType} Phone Number *`}
                  </label>
                  <input
                    type="text"
                    value={formAccountNum}
                    onChange={(e) => setFormAccountNum(e.target.value)}
                    placeholder={formType === 'Bank' ? 'e.g. 1502201984001' : '01XXXXXXXXX'}
                    className="w-full h-[38px] px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-semibold text-slate-900 outline-none focus:border-[#0E9AA7] focus:bg-white"
                    required
                  />
                  <p className="text-[9px] text-slate-400 mt-0.5">
                    {formType === 'Bank' ? 'Official account number from cheque book' : '11-digit Personal or Merchant wallet number'}
                  </p>
                </div>

                {/* Account Holder Name */}
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                    Account Holder Legal Name *
                  </label>
                  <input
                    type="text"
                    value={formHolderName}
                    onChange={(e) => setFormHolderName(e.target.value)}
                    placeholder="e.g. Md. Ashraful Islam"
                    className="w-full h-[38px] px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 outline-none focus:border-[#0E9AA7] focus:bg-white"
                    required
                  />
                </div>

                {/* Additional fields for Bank */}
                {formType === 'Bank' && (
                  <>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                        Bank Name *
                      </label>
                      <select
                        value={formBankName}
                        onChange={(e) => setFormBankName(e.target.value)}
                        className="w-full h-[38px] px-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 outline-none focus:border-[#0E9AA7] focus:bg-white"
                        required
                      >
                        <option value="">Select Scheduled Bank</option>
                        {BANGLADESH_BANKS.map((b) => (
                          <option key={b.id} value={b.name}>{b.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                          Branch Name
                        </label>
                        <input
                          type="text"
                          value={formBranchName}
                          onChange={(e) => setFormBranchName(e.target.value)}
                          placeholder="e.g. Dhanmondi"
                          className="w-full h-[38px] px-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 outline-none focus:border-[#0E9AA7] focus:bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                          Routing No. (9 Digits)
                        </label>
                        <input
                          type="text"
                          maxLength={9}
                          value={formRoutingNumber}
                          onChange={(e) => setFormRoutingNumber(e.target.value.replace(/\D/g, ''))}
                          placeholder="e.g. 090271234"
                          className="w-full h-[38px] px-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-semibold text-slate-900 outline-none focus:border-[#0E9AA7] focus:bg-white"
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* Set as Default Checkbox */}
                <label className="flex items-center gap-2 pt-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formIsDefault}
                    onChange={(e) => setFormIsDefault(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-[11px] font-bold text-slate-700">Set as primary default payout method</span>
                </label>

                {/* Verification Notice */}
                <div className="p-2 rounded-xl bg-slate-50 border border-slate-200/60 text-[10px] text-slate-500 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                  <span>Submitting places this account in &apos;Pending Review&apos; for Admin verification.</span>
                </div>

                {/* Submit Buttons */}
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsFormModalOpen(false)}
                    disabled={isSaving}
                    className="flex-1 h-[38px] rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="flex-1 h-[38px] rounded-xl bg-[#04203F] hover:bg-[#031830] text-white text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5 text-[#3DD055]" />
                        <span>{editingMethodId ? 'Save Changes' : 'Add Account'}</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================
          MODAL C: DELETE CONFIRMATION DIALOG
         ======================================================== */}
      <AnimatePresence>
        {deleteConfirmMethod && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[20px] max-w-xs w-full p-5 space-y-3 shadow-2xl border border-slate-100 text-center"
            >
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 border border-rose-200/80 flex items-center justify-center mx-auto">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-[14px] font-bold text-[#04203F]">Delete Payout Account?</h4>
                <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                  Are you sure you want to remove this {deleteConfirmMethod.type} account ending in <strong className="font-mono">{deleteConfirmMethod.accountNumber.slice(-4)}</strong>?
                </p>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmMethod(null)}
                  disabled={isDeleting}
                  className="flex-1 h-[36px] rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={isDeleting}
                  className="flex-1 h-[36px] rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors flex items-center justify-center gap-1"
                >
                  {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>Delete</span>}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
