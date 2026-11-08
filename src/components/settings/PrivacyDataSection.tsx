import React, { useState, useEffect } from 'react';
import { 
  collection, query, where, getDocs, addDoc, updateDoc, doc, serverTimestamp 
} from 'firebase/firestore';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../../lib/firebase';
import { UserProfile, Wallet } from '../../types';
import { triggerHaptic } from '../../lib/nativeFeedback';
import { DENSITY_TOKENS as DT } from '../../utils/densityTokens';
import { 
  Shield, Eye, Lock, Download, History, UserX, Trash2, 
  AlertTriangle, CheckCircle2, ChevronRight, X, AlertCircle, 
  ExternalLink, Key, Clock, ShieldCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface PrivacyDataSectionProps {
  user: UserProfile;
  canAccessFullApp?: boolean;
  onNavigateSection?: (section: string) => void;
  onOpenPolicy?: (policyKey: string) => void;
  onRefreshUser?: () => void;
  onBack?: () => void;
}

interface AccountRequest {
  id: string;
  type: 'deactivation' | 'deletion';
  reason: string;
  note?: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  adminNote?: string;
  createdAt: any;
}

export const PrivacyDataSection: React.FC<PrivacyDataSectionProps> = ({
  user,
  canAccessFullApp = true,
  onNavigateSection,
  onOpenPolicy,
  onRefreshUser,
  onBack,
}) => {
  const isAdminUser = user.role === 'admin' || user.role === 'super_admin';

  // Active Requests from user
  const [existingRequests, setExistingRequests] = useState<AccountRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number>(0);

  // Deactivation Modal State
  const [isDeactivateModalOpen, setIsDeactivateModalOpen] = useState(false);
  const [deactivateReason, setDeactivateReason] = useState('Taking a temporary break');
  const [deactivateNote, setDeactivateNote] = useState('');
  const [deactivatePassword, setDeactivatePassword] = useState('');
  const [isSubmittingDeactivation, setIsSubmittingDeactivation] = useState(false);
  const [deactivateError, setDeactivateError] = useState('');

  // Deletion Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState('No longer reselling products');
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [isSubmittingDeletion, setIsSubmittingDeletion] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Admin Account Requests Review Modal State
  const [isAdminReviewModalOpen, setIsAdminReviewModalOpen] = useState(false);
  const [allPendingRequests, setAllPendingRequests] = useState<any[]>([]);
  const [loadingAdminRequests, setLoadingAdminRequests] = useState(false);
  const [adminActionNote, setAdminActionNote] = useState('');

  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3200);
  };

  // Fetch Wallet Balance
  useEffect(() => {
    const fetchWallet = async () => {
      try {
        const wSnap = await getDocs(query(collection(db, 'wallets'), where('resellerId', '==', user.uid)));
        if (!wSnap.empty) {
          const wData = wSnap.docs[0].data() as Wallet;
          setWalletBalance(wData.balance || 0);
        }
      } catch (_) {}
    };
    fetchWallet();
  }, [user.uid]);

  // Fetch user's existing deactivation & deletion requests
  const fetchMyRequests = async () => {
    setLoadingRequests(true);
    try {
      const deactSnap = await getDocs(
        query(collection(db, 'deactivationRequests'), where('resellerId', '==', user.uid))
      );
      const delSnap = await getDocs(
        query(collection(db, 'deletionRequests'), where('resellerId', '==', user.uid))
      );

      const list: AccountRequest[] = [];
      deactSnap.forEach((d) => {
        list.push({ id: d.id, type: 'deactivation', ...d.data() } as AccountRequest);
      });
      delSnap.forEach((d) => {
        list.push({ id: d.id, type: 'deletion', ...d.data() } as AccountRequest);
      });

      list.sort((a, b) => {
        const tA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const tB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return tB - tA;
      });

      setExistingRequests(list);
    } catch (err) {
      console.warn('Error fetching account requests:', err);
    } finally {
      setLoadingRequests(false);
    }
  };

  useEffect(() => {
    fetchMyRequests();
  }, [user.uid]);

  // Fetch all pending requests for Admin Review
  const fetchAdminRequests = async () => {
    if (!isAdminUser) return;
    setLoadingAdminRequests(true);
    try {
      const deactSnap = await getDocs(
        query(collection(db, 'deactivationRequests'), where('status', '==', 'pending'))
      );
      const delSnap = await getDocs(
        query(collection(db, 'deletionRequests'), where('status', '==', 'pending'))
      );

      const list: any[] = [];
      deactSnap.forEach((d) => list.push({ id: d.id, collectionName: 'deactivationRequests', type: 'Deactivation', ...d.data() }));
      delSnap.forEach((d) => list.push({ id: d.id, collectionName: 'deletionRequests', type: 'Deletion', ...d.data() }));
      setAllPendingRequests(list);
    } catch (err) {
      console.warn('Error fetching admin requests:', err);
    } finally {
      setLoadingAdminRequests(false);
    }
  };

  // Submit Deactivation Request
  const handleSubmitDeactivation = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeactivateError('');

    if (!deactivatePassword) {
      setDeactivateError('Please enter your account password to confirm.');
      return;
    }

    setIsSubmittingDeactivation(true);
    triggerHaptic('medium');

    try {
      // Verify password
      if (auth.currentUser && user.email) {
        await signInWithEmailAndPassword(auth, user.email, deactivatePassword);
      }

      await addDoc(collection(db, 'deactivationRequests'), {
        resellerId: user.uid,
        resellerName: user.fullName || 'Reseller',
        shopName: user.shopName || '',
        mobile: user.mobile || '',
        reason: deactivateReason,
        note: deactivateNote.trim() || null,
        status: 'pending',
        createdAt: serverTimestamp(),
      });

      setIsDeactivateModalOpen(false);
      setDeactivatePassword('');
      setDeactivateNote('');
      showToast('Deactivation request submitted for review.', 'info');
      fetchMyRequests();
    } catch (err: any) {
      console.error('Deactivation error:', err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setDeactivateError('Incorrect password. Please verify and try again.');
      } else {
        setDeactivateError(err.message || 'Failed to submit request.');
      }
    } finally {
      setIsSubmittingDeactivation(false);
    }
  };

  // Submit Deletion Request
  const handleSubmitDeletion = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteError('');

    if (deleteConfirmationText.trim() !== 'DELETE') {
      setDeleteError('Please type "DELETE" in capital letters to confirm.');
      return;
    }

    if (!deletePassword) {
      setDeleteError('Please enter your account password.');
      return;
    }

    setIsSubmittingDeletion(true);
    triggerHaptic('medium');

    try {
      // Verify password
      if (auth.currentUser && user.email) {
        await signInWithEmailAndPassword(auth, user.email, deletePassword);
      }

      await addDoc(collection(db, 'deletionRequests'), {
        resellerId: user.uid,
        resellerName: user.fullName || 'Reseller',
        shopName: user.shopName || '',
        mobile: user.mobile || '',
        walletBalance: walletBalance,
        reason: deleteReason,
        status: 'pending',
        createdAt: serverTimestamp(),
      });

      setIsDeleteModalOpen(false);
      setDeletePassword('');
      setDeleteConfirmationText('');
      showToast('Deletion request submitted for administrative review.', 'info');
      fetchMyRequests();
    } catch (err: any) {
      console.error('Deletion error:', err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setDeleteError('Incorrect password. Please verify and try again.');
      } else {
        setDeleteError(err.message || 'Failed to submit request.');
      }
    } finally {
      setIsSubmittingDeletion(false);
    }
  };

  // Cancel Pending Request
  const handleCancelRequest = async (request: AccountRequest) => {
    if (!confirm('Cancel this pending request?')) return;
    triggerHaptic('light');

    try {
      const colName = request.type === 'deactivation' ? 'deactivationRequests' : 'deletionRequests';
      await updateDoc(doc(db, colName, request.id), {
        status: 'cancelled',
        cancelledAt: serverTimestamp(),
      });
      showToast('Request cancelled');
      fetchMyRequests();
    } catch (err) {
      console.error('Error cancelling request:', err);
      showToast('Could not cancel request', 'error');
    }
  };

  // Admin Approve / Reject
  const handleAdminDecision = async (reqItem: any, decision: 'approved' | 'rejected') => {
    try {
      await updateDoc(doc(db, reqItem.collectionName, reqItem.id), {
        status: decision,
        adminNote: adminActionNote.trim() || null,
        resolvedAt: serverTimestamp(),
      });
      showToast(`Request ${decision}`);
      setAdminActionNote('');
      fetchAdminRequests();
    } catch (err) {
      console.error('Error updating request status:', err);
      showToast('Update failed', 'error');
    }
  };

  const hasPendingDeactivation = existingRequests.some((r) => r.type === 'deactivation' && r.status === 'pending');
  const hasPendingDeletion = existingRequests.some((r) => r.type === 'deletion' && r.status === 'pending');

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
            {toastMessage.type === 'error' ? (
              <AlertCircle className="w-3.5 h-3.5 text-rose-200" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 text-[#3DD055]" />
            )}
            <span>{toastMessage.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 1. DATA OVERVIEW & PRIVACY CARD */}
      <div className={`${DT.settingsGroupCard} p-3.5 space-y-2.5`}>
        <div className="flex items-start gap-2.5">
          <div className="w-[32px] h-[32px] rounded-[10px] flex items-center justify-center shrink-0 border bg-teal-50 text-[#0E9AA7] border-teal-200/80">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-[13px] font-bold text-[#04203F] leading-tight">
              Data Storage & Access Transparency
            </h3>
            <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
              We store your reseller profile, trade name, registered address, verified payout accounts, delivery waybills, and login security timestamps. This data is accessible strictly to you, administrative auditors, and authorized courier logistics partners.
            </p>
          </div>
        </div>

        <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
          <span className="text-[11px] font-medium text-slate-500">
            For detailed clauses, review our full policy
          </span>
          <button
            onClick={() => {
              triggerHaptic('light');
              if (onOpenPolicy) onOpenPolicy('privacy');
            }}
            className="text-[11px] font-bold text-[#0E9AA7] hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>Privacy Policy</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. CONSENT & ACTIVITY SHORTCUTS */}
      <div className="space-y-1.5">
        <div className={DT.settingsGroupLabel}>Consent & Security Records</div>
        <div className={DT.settingsGroupCard}>
          {/* Consent Record */}
          <div className="w-full min-h-[48px] px-3.5 py-2.5 flex items-center justify-between text-left select-none">
            <div className="flex items-center gap-2.5 min-w-0 pr-3">
              <div className="w-[28px] h-[28px] rounded-[8px] flex items-center justify-center shrink-0 border bg-blue-50 text-blue-700 border-blue-200/60">
                <Shield className="w-[18px] h-[18px]" />
              </div>
              <div className="min-w-0">
                <span className={DT.settingsRowTitle}>Consent record</span>
                <p className={DT.settingsRowHelper}>Terms v1.2 & Privacy Policy v1.1 accepted</p>
              </div>
            </div>
            <span className="text-[10.5px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/70 px-2 py-0.5 rounded-full">
              Recorded
            </span>
          </div>

          {/* Login Activity Shortcut (Routes to Security > Login Activity) */}
          <div
            onClick={() => {
              triggerHaptic('light');
              if (onNavigateSection) onNavigateSection('security');
            }}
            className={DT.settingsRow}
          >
            <div className="flex items-center gap-2.5 min-w-0 pr-3">
              <div className="w-[28px] h-[28px] rounded-[8px] flex items-center justify-center shrink-0 border bg-teal-50 text-[#0E9AA7] border-teal-200/60">
                <History className="w-[18px] h-[18px]" />
              </div>
              <div className="min-w-0">
                <span className={DT.settingsRowTitle}>Login activity & active devices</span>
                <p className={DT.settingsRowHelper}>Review active sessions in Security</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
          </div>

          {/* Account Visibility (Coming soon disabled row) */}
          <div className="w-full min-h-[48px] px-3.5 py-2.5 flex items-center justify-between text-left select-none bg-slate-50/40">
            <div className="flex items-center gap-2.5 min-w-0 pr-3 opacity-60">
              <div className="w-[28px] h-[28px] rounded-[8px] flex items-center justify-center shrink-0 border bg-slate-100 text-slate-600 border-slate-200">
                <Eye className="w-[18px] h-[18px]" />
              </div>
              <div className="min-w-0">
                <span className={DT.settingsRowTitle}>Account visibility</span>
                <p className={DT.settingsRowHelper}>Reseller marketplace directory presence</p>
              </div>
            </div>
            <span className="text-[10px] font-bold text-slate-400 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
              Coming soon
            </span>
          </div>

          {/* Download My Data (Coming soon disabled row) */}
          <div className="w-full min-h-[48px] px-3.5 py-2.5 flex items-center justify-between text-left select-none bg-slate-50/40">
            <div className="flex items-center gap-2.5 min-w-0 pr-3 opacity-60">
              <div className="w-[28px] h-[28px] rounded-[8px] flex items-center justify-center shrink-0 border bg-slate-100 text-slate-600 border-slate-200">
                <Download className="w-[18px] h-[18px]" />
              </div>
              <div className="min-w-0">
                <span className={DT.settingsRowTitle}>Download my data</span>
                <p className={DT.settingsRowHelper}>Export order receipts and wallet ledger</p>
              </div>
            </div>
            <span className="text-[10px] font-bold text-slate-400 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
              Coming soon
            </span>
          </div>
        </div>
      </div>

      {/* 3. ACTIVE ACCOUNT REQUESTS STATUS CARD (if user submitted any) */}
      {existingRequests.length > 0 && (
        <div className="space-y-1.5">
          <div className={DT.settingsGroupLabel}>My Account Requests</div>
          <div className={DT.settingsGroupCard}>
            {existingRequests.map((req) => (
              <div
                key={req.id}
                className="p-3.5 space-y-1.5 border-b border-slate-100 last:border-b-0"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-bold text-[#04203F] capitalize">
                    {req.type} Request
                  </span>
                  <span
                    className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                      req.status === 'pending'
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : req.status === 'approved'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-rose-50 text-rose-800 border-rose-200'
                    }`}
                  >
                    {req.status === 'pending' ? 'Pending Review' : req.status}
                  </span>
                </div>

                <p className="text-[11px] text-slate-500">
                  Reason: <strong>{req.reason}</strong>
                </p>

                {req.adminNote && (
                  <p className="text-[11px] text-amber-800 bg-amber-50/60 p-2 rounded-lg border border-amber-200/60">
                    Admin feedback: {req.adminNote}
                  </p>
                )}

                {req.status === 'pending' && (
                  <div className="pt-1 flex justify-end">
                    <button
                      onClick={() => handleCancelRequest(req)}
                      className="text-[11px] font-bold text-rose-600 hover:underline cursor-pointer"
                    >
                      Cancel Request
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. ACCOUNT LIFECYCLE REQUESTS */}
      <div className="space-y-1.5">
        <div className={DT.settingsGroupLabel}>Account Lifecycle</div>
        <div className={DT.settingsGroupCard}>
          {/* Deactivate Account Row */}
          <div
            onClick={() => {
              if (hasPendingDeactivation) {
                showToast('A deactivation request is already pending review.', 'info');
                return;
              }
              triggerHaptic('light');
              setIsDeactivateModalOpen(true);
            }}
            className={DT.settingsRow}
          >
            <div className="flex items-center gap-2.5 min-w-0 pr-3">
              <div className="w-[28px] h-[28px] rounded-[8px] flex items-center justify-center shrink-0 border bg-amber-50 text-amber-700 border-amber-200/60">
                <UserX className="w-[18px] h-[18px]" />
              </div>
              <div className="min-w-0">
                <span className={DT.settingsRowTitle}>Deactivate account</span>
                <p className={DT.settingsRowHelper}>Temporarily pause store catalog and reselling</p>
              </div>
            </div>

            <span className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-lg shrink-0">
              {hasPendingDeactivation ? 'Pending' : 'Request'}
            </span>
          </div>

          {/* Delete Account Row */}
          <div
            onClick={() => {
              if (hasPendingDeletion) {
                showToast('A deletion request is already pending review.', 'info');
                return;
              }
              triggerHaptic('light');
              setIsDeleteModalOpen(true);
            }}
            className={DT.settingsRow}
          >
            <div className="flex items-center gap-2.5 min-w-0 pr-3">
              <div className="w-[28px] h-[28px] rounded-[8px] flex items-center justify-center shrink-0 border bg-rose-50 text-rose-700 border-rose-200/60">
                <Trash2 className="w-[18px] h-[18px]" />
              </div>
              <div className="min-w-0">
                <span className={DT.settingsRowTitle}>Delete account</span>
                <p className={DT.settingsRowHelper}>Permanent account closure request</p>
              </div>
            </div>

            <span className="text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200/80 px-2 py-0.5 rounded-lg shrink-0">
              {hasPendingDeletion ? 'Pending' : 'Request'}
            </span>
          </div>
        </div>
      </div>

      {/* ADMIN REVIEW BUTTON (Visible only to Admin / Super Admin) */}
      {isAdminUser && (
        <div className="pt-2">
          <button
            onClick={() => {
              fetchAdminRequests();
              setIsAdminReviewModalOpen(true);
            }}
            className="w-full h-[36px] rounded-xl bg-slate-100 hover:bg-slate-200 text-[#04203F] text-[11px] font-bold border border-slate-200 flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <Clock className="w-3.5 h-3.5 text-[#0E9AA7]" />
            <span>Admin: Review Pending Account Requests</span>
          </button>
        </div>
      )}

      {/* DEACTIVATE ACCOUNT MODAL */}
      <AnimatePresence>
        {isDeactivateModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-sm w-full p-4 border border-slate-200 shadow-2xl space-y-3.5 my-auto"
            >
              <div className="flex items-start justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                    <UserX className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-[14px] font-bold text-[#04203F]">Deactivate Account</h3>
                    <p className="text-[11px] text-slate-500">Submit request to admin</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsDeactivateModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSubmitDeactivation} className="space-y-3">
                <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 leading-relaxed">
                  Deactivating pauses your reseller storefront, links, and customer order processing. Your earnings and account data are saved, and you can request reactivation at any time.
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Reason for deactivation
                  </label>
                  <select
                    value={deactivateReason}
                    onChange={(e) => setDeactivateReason(e.target.value)}
                    className="w-full h-[36px] px-2 text-[12px] bg-slate-50 border border-slate-200 rounded-xl outline-none"
                  >
                    <option value="Taking a temporary break">Taking a temporary break</option>
                    <option value="Switching to physical retail store">Switching to physical retail store</option>
                    <option value="Personal reasons">Personal reasons</option>
                    <option value="Dissatisfied with deliveries">Dissatisfied with deliveries</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Optional Note
                  </label>
                  <textarea
                    rows={2}
                    value={deactivateNote}
                    onChange={(e) => setDeactivateNote(e.target.value)}
                    placeholder="Provide any additional feedback..."
                    className="w-full p-2 text-[11px] bg-slate-50 border border-slate-200 rounded-xl outline-none resize-none"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Confirm Account Password
                  </label>
                  <input
                    type="password"
                    required
                    value={deactivatePassword}
                    onChange={(e) => setDeactivatePassword(e.target.value)}
                    placeholder="Enter your login password"
                    className="w-full h-[36px] px-3 text-[12px] bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-[#0E9AA7]"
                  />
                </div>

                {deactivateError && (
                  <p className="text-[11px] text-rose-600 font-medium">{deactivateError}</p>
                )}

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsDeactivateModalOpen(false)}
                    className="h-[32px] px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingDeactivation}
                    className="h-[32px] px-3.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold cursor-pointer transition-all shadow-xs disabled:opacity-50"
                  >
                    {isSubmittingDeactivation ? 'Submitting...' : 'Submit Request'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* DELETE ACCOUNT MODAL */}
      <AnimatePresence>
        {isDeleteModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-sm w-full p-4 border border-slate-200 shadow-2xl space-y-3.5 my-auto"
            >
              <div className="flex items-start justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center">
                    <Trash2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-[14px] font-bold text-rose-950">Delete Account Request</h3>
                    <p className="text-[11px] text-slate-500">Requires administrative clearance</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSubmitDeletion} className="space-y-3">
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-[11px] text-rose-900 leading-relaxed">
                  <strong>Warning:</strong> Account deletion is permanent. In accordance with tax & accounting regulations in Bangladesh, delivered order waybills and wallet ledger history may be retained for compliance.
                </div>

                {walletBalance > 0 && (
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900">
                    Your wallet balance is <strong>৳{walletBalance.toLocaleString()}</strong>. Please withdraw all funds before your account can be deleted.
                  </div>
                )}

                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Reason for leaving
                  </label>
                  <select
                    value={deleteReason}
                    onChange={(e) => setDeleteReason(e.target.value)}
                    className="w-full h-[36px] px-2 text-[12px] bg-slate-50 border border-slate-200 rounded-xl outline-none"
                  >
                    <option value="No longer reselling products">No longer reselling products</option>
                    <option value="Moving to another platform">Moving to another platform</option>
                    <option value="Closing business">Closing business</option>
                    <option value="Privacy concerns">Privacy concerns</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Type "DELETE" to confirm
                  </label>
                  <input
                    type="text"
                    required
                    value={deleteConfirmationText}
                    onChange={(e) => setDeleteConfirmationText(e.target.value)}
                    placeholder="DELETE"
                    className="w-full h-[36px] px-3 font-mono text-[12px] uppercase font-bold bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-rose-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Confirm Account Password
                  </label>
                  <input
                    type="password"
                    required
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    placeholder="Enter your login password"
                    className="w-full h-[36px] px-3 text-[12px] bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-rose-500"
                  />
                </div>

                {deleteError && (
                  <p className="text-[11px] text-rose-600 font-medium">{deleteError}</p>
                )}

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsDeleteModalOpen(false)}
                    className="h-[32px] px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingDeletion}
                    className="h-[32px] px-3.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold cursor-pointer transition-all shadow-xs disabled:opacity-50"
                  >
                    {isSubmittingDeletion ? 'Submitting...' : 'Request Deletion'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ADMIN ACCOUNT REQUESTS REVIEW MODAL */}
      <AnimatePresence>
        {isAdminReviewModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-4 border border-slate-200 shadow-2xl space-y-3.5 my-auto"
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h3 className="text-[14px] font-bold text-[#04203F]">
                  Admin: Pending Account Requests ({allPendingRequests.length})
                </h3>
                <button
                  onClick={() => setIsAdminReviewModalOpen(false)}
                  className="text-slate-400 hover:text-slate-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {loadingAdminRequests ? (
                <div className="py-8 text-center text-slate-400 text-xs">Loading requests...</div>
              ) : allPendingRequests.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs">
                  No pending deactivation or deletion requests found.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {allPendingRequests.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900">
                          {item.type}: {item.resellerName} ({item.shopName})
                        </span>
                        <span className="font-mono text-slate-500">{item.mobile}</span>
                      </div>

                      <p className="text-slate-600">
                        Reason: <strong>{item.reason}</strong>
                      </p>

                      {item.walletBalance !== undefined && (
                        <p className="text-amber-800 font-semibold">
                          Current Wallet Balance: ৳{item.walletBalance}
                        </p>
                      )}

                      <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200/80">
                        <button
                          onClick={() => handleAdminDecision(item, 'rejected')}
                          className="h-[28px] px-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-bold rounded-lg border border-rose-200 cursor-pointer"
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => handleAdminDecision(item, 'approved')}
                          className="h-[28px] px-2.5 bg-[#04203F] hover:bg-[#0E9AA7] text-white text-[11px] font-bold rounded-lg cursor-pointer"
                        >
                          Approve Request
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
