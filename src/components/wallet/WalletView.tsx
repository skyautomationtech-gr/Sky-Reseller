import React, { useState, useEffect } from 'react';
import { 
  collection, query, where, getDocs, doc, runTransaction, serverTimestamp, setDoc, updateDoc, addDoc
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { PaymentMethod, UserProfile, Wallet, WalletTransaction, PayoutChangeRequest } from '../../types';
import { formatResellerId } from '../../lib/resellerIdHelper';
import { WithdrawalRequestForm } from './WithdrawalRequestForm';
import { AdminWithdrawalManager } from './AdminWithdrawalManager';
import { 
  Wallet as WalletIcon, ArrowUpRight, ArrowDownLeft, Clock, CheckCircle2, 
  XCircle, AlertCircle, Loader2, DollarSign, Building2, Smartphone, Plus,
  Users, Check, X, ShieldCheck, CreditCard, Edit3, RotateCw, Copy,
  ChevronRight, HelpCircle, FileText, Filter, Calendar
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AnimatedCounter } from '../common/AnimatedCounter';
import { triggerHaptic } from '../../lib/nativeFeedback';
import { usePageRefresh, useRefresh } from '../../context/RefreshContext';

interface WalletViewProps {
  user: UserProfile;
}

export const WalletView: React.FC<WalletViewProps> = ({ user }) => {
  const isAdminOrSuperAdmin = user.role === 'super_admin' || user.role === 'admin';

  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [allWallets, setAllWallets] = useState<(Wallet & { resellerName?: string; shopName?: string })[]>([]);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [pendingWithdrawals, setPendingWithdrawals] = useState<WalletTransaction[]>([]);
  const [pendingDeposits, setPendingDeposits] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  // Withdraw Modal State (Reseller)
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('bkash');
  const [accountNumber, setAccountNumber] = useState('');
  const [withdrawError, setWithdrawError] = useState('');
  const [submittingWithdraw, setSubmittingWithdraw] = useState(false);

  // Deposit Modal State (Reseller)
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState<string>('');
  const [depositPaymentMethod, setDepositPaymentMethod] = useState<PaymentMethod>('bkash');
  const [depositAccountNumber, setDepositAccountNumber] = useState('');
  const [depositTransactionId, setDepositTransactionId] = useState('');
  const [depositError, setDepositError] = useState('');
  const [submittingDeposit, setSubmittingDeposit] = useState(false);

  // Reject Modal State (Admin)
  const [selectedTxToReject, setSelectedTxToReject] = useState<WalletTransaction | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [processingTxId, setProcessingTxId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  // Payout Account Edit State (Reseller)
  const [pendingPayoutRequest, setPendingPayoutRequest] = useState<PayoutChangeRequest | null>(null);
  const [isPayoutModalOpen, setIsPayoutModalOpen] = useState(false);
  const [editPayoutMethod, setEditPayoutMethod] = useState<'bkash' | 'nagad' | 'rocket' | 'bank'>(user.payoutMethod || 'bkash');
  const [editBkash, setEditBkash] = useState(user.bkashNumber || '');
  const [editNagad, setEditNagad] = useState(user.nagadNumber || '');
  const [editRocket, setEditRocket] = useState(user.rocketNumber || '');
  const [editBankName, setEditBankName] = useState(user.bankName || '');
  const [editAccountHolder, setEditAccountHolder] = useState(user.accountHolderName || '');
  const [editAccountNumber, setEditAccountNumber] = useState(user.accountNumber || '');
  const [editBranchName, setEditBranchName] = useState(user.branchName || '');
  const [payoutModalError, setPayoutModalError] = useState('');
  const [submittingPayout, setSubmittingPayout] = useState(false);

  // Additional UX States for Redesigned Wallet
  const [selectedTxDetail, setSelectedTxDetail] = useState<WalletTransaction | null>(null);
  const [txFilter, setTxFilter] = useState<'all' | 'commission' | 'deposit' | 'withdrawal' | 'adjustment'>('all');
  const [copiedId, setCopiedId] = useState(false);
  const [copiedPayoutNum, setCopiedPayoutNum] = useState(false);

  const { isRefreshing, showToast, refreshCurrentPage } = useRefresh();

  const handleRefresh = async () => {
    await fetchWalletData(true);
  };

  usePageRefresh('wallet', handleRefresh);

  useEffect(() => {
    fetchWalletData();
  }, [user.uid, user.role]);

  const fetchWalletData = async (isManualRefresh = false) => {
    setLoading(true);
    setActionError('');
    try {
      if (isAdminOrSuperAdmin) {
        // Fetch all wallets & users
        const usersSnap = await getDocs(collection(db, 'users'));
        const usersMap: Record<string, { fullName: string; shopName: string }> = {};
        usersSnap.forEach((d) => {
          const uData = d.data();
          usersMap[d.id] = { fullName: uData.fullName || 'Reseller', shopName: uData.shopName || '' };
        });

        const walletSnap = await getDocs(collection(db, 'wallets'));
        const wList: (Wallet & { resellerName?: string; shopName?: string })[] = [];
        walletSnap.forEach((d) => {
          const w = d.data() as Wallet;
          const u = usersMap[w.resellerId] || { fullName: 'Reseller', shopName: '' };
          wList.push({ ...w, resellerName: u.fullName, shopName: u.shopName });
        });
        setAllWallets(wList);

        // Fetch pending withdrawal requests
        const txQuery = query(
          collection(db, 'transactions'),
          where('type', '==', 'withdrawal'),
          where('status', '==', 'pending')
        );
        const txSnap = await getDocs(txQuery);
        const pendingList: WalletTransaction[] = [];
        txSnap.forEach((d) => {
          pendingList.push(Object.assign({ id: d.id }, d.data()) as unknown as WalletTransaction);
        });
        setPendingWithdrawals(pendingList);

        // Fetch pending deposit requests
        const depQuery = query(
          collection(db, 'transactions'),
          where('type', '==', 'deposit'),
          where('status', '==', 'pending')
        );
        const depSnap = await getDocs(depQuery);
        const pendingDepList: WalletTransaction[] = [];
        depSnap.forEach((d) => {
          pendingDepList.push(Object.assign({ id: d.id }, d.data()) as unknown as WalletTransaction);
        });
        setPendingDeposits(pendingDepList);

        // Fetch recent transactions history across system
        const allTxSnap = await getDocs(collection(db, 'transactions'));
        const allTxList: WalletTransaction[] = [];
        allTxSnap.forEach((d) => {
          allTxList.push(Object.assign({ id: d.id }, d.data()) as unknown as WalletTransaction);
        });
        allTxList.sort((a, b) => {
          const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
          const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
          return timeB - timeA;
        });
        setTransactions(allTxList);

        if (isManualRefresh) {
          showToast('✓ Wallet dashboard refreshed successfully', 'success');
        }
      } else {
        // Fetch reseller wallet
        const wRef = doc(db, 'wallets', user.uid);
        const walletSnap = await getDocs(query(collection(db, 'wallets'), where('resellerId', '==', user.uid)));

        let freshBalance = 0;
        if (!walletSnap.empty) {
          const wData = walletSnap.docs[0].data() as Wallet;
          setWallet(wData);
          freshBalance = wData.balance || 0;
        } else {
          setWallet({ resellerId: user.uid, balance: 0, totalEarned: 0, totalWithdrawn: 0, updatedAt: new Date() });
        }

        if (isManualRefresh) {
          showToast(`✓ Balance updated to ৳${freshBalance.toLocaleString()}`, 'success');
        }

        // Fetch reseller transactions
        const txQuery = query(collection(db, 'transactions'), where('resellerId', '==', user.uid));
        const txSnap = await getDocs(txQuery);
        const list: WalletTransaction[] = [];
        txSnap.forEach((d) => {
          list.push(Object.assign({ id: d.id }, d.data()) as unknown as WalletTransaction);
        });
        list.sort((a, b) => {
          const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
          const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
          return timeB - timeA;
        });
        setTransactions(list);

        // Fetch pending payout change request
        try {
          const payoutQuery = query(
            collection(db, 'payoutChangeRequests'),
            where('resellerId', '==', user.uid),
            where('status', '==', 'pending')
          );
          const payoutSnap = await getDocs(payoutQuery);
          if (!payoutSnap.empty) {
            const pDoc = payoutSnap.docs[0];
            setPendingPayoutRequest({ id: pDoc.id, ...pDoc.data() } as PayoutChangeRequest);
          } else {
            setPendingPayoutRequest(null);
          }
        } catch (pErr) {
          console.warn('Payout change request fetch warning:', pErr);
        }
      }
    } catch (err: any) {
      console.error('Error fetching wallet data:', err);
      setActionError('Failed to load wallet dataset.');
      if (isManualRefresh) {
        showToast('✗ Failed to refresh wallet details', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  // Submit Withdrawal Request (Reseller)
  const handleRequestWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(withdrawAmount);
    const availableBalance = wallet?.balance || 0;

    if (isNaN(numAmount) || numAmount <= 0) {
      setWithdrawError('Enter a valid positive amount.');
      return;
    }

    if (numAmount > availableBalance) {
      setWithdrawError(`Requested amount exceeds your wallet balance (৳${availableBalance}).`);
      return;
    }

    if (!accountNumber.trim()) {
      setWithdrawError('Account / Mobile number is required.');
      return;
    }

    setSubmittingWithdraw(true);
    setWithdrawError('');

    try {
      const newTxRef = doc(collection(db, 'transactions'));
      await setDoc(newTxRef, {
        resellerId: user.uid,
        resellerName: user.fullName,
        resellerShopName: user.shopName || user.fullName,
        type: 'withdrawal',
        amount: numAmount,
        status: 'pending',
        paymentMethod,
        accountNumber: accountNumber.trim(),
        createdAt: serverTimestamp(),
      });

      setIsWithdrawModalOpen(false);
      setWithdrawAmount('');
      setAccountNumber('');
      fetchWalletData();
    } catch (err: any) {
      console.error('Withdrawal error:', err);
      setWithdrawError(err.message || 'Failed to submit withdrawal request.');
    } finally {
      setSubmittingWithdraw(false);
    }
  };

  // Submit Deposit Request (Reseller)
  const handleRequestDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(depositAmount);

    if (isNaN(numAmount) || numAmount <= 0) {
      setDepositError('Enter a valid positive amount.');
      return;
    }

    if (!depositAccountNumber.trim()) {
      setDepositError('Sender Account / Mobile number is required.');
      return;
    }

    if (!depositTransactionId.trim()) {
      setDepositError('Transaction ID (TxID) is required.');
      return;
    }

    setSubmittingDeposit(true);
    setDepositError('');

    try {
      const newTxRef = doc(collection(db, 'transactions'));
      await setDoc(newTxRef, {
        resellerId: user.uid,
        resellerName: user.fullName,
        resellerShopName: user.shopName || user.fullName,
        type: 'deposit',
        amount: numAmount,
        status: 'pending',
        paymentMethod: depositPaymentMethod,
        accountNumber: depositAccountNumber.trim(),
        transactionId: depositTransactionId.trim(),
        createdAt: serverTimestamp(),
      });

      setIsDepositOpenModal(false);
      setDepositAmount('');
      setDepositAccountNumber('');
      setDepositTransactionId('');
      fetchWalletData();
    } catch (err: any) {
      console.error('Deposit request error:', err);
      setDepositError(err.message || 'Failed to submit deposit request.');
    } finally {
      setSubmittingDeposit(false);
    }
  };

  // Request Payout Account Change (Reseller)
  const handleRequestPayoutChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingPayout(true);
    setPayoutModalError('');

    try {
      // Validate inputs depending on method
      if (editPayoutMethod === 'bkash' && !editBkash.trim()) {
        throw new Error('bKash number is required.');
      }
      if (editPayoutMethod === 'nagad' && !editNagad.trim()) {
        throw new Error('Nagad number is required.');
      }
      if (editPayoutMethod === 'rocket' && !editRocket.trim()) {
        throw new Error('Rocket number is required.');
      }
      if (editPayoutMethod === 'bank' && (!editBankName.trim() || !editAccountNumber.trim() || !editAccountHolder.trim())) {
        throw new Error('Bank name, account holder name, and account number are required.');
      }

      await addDoc(collection(db, 'payoutChangeRequests'), {
        userId: user.uid,
        resellerId: user.uid,
        resellerName: user.fullName,
        shopName: user.shopName || '',
        mobile: user.mobile,
        payoutMethod: editPayoutMethod,
        bkashNumber: editBkash.trim(),
        nagadNumber: editNagad.trim(),
        rocketNumber: editRocket.trim(),
        bankName: editBankName.trim(),
        accountNumber: editAccountNumber.trim(),
        accountHolderName: editAccountHolder.trim(),
        branchName: editBranchName.trim(),
        status: 'pending',
        createdAt: serverTimestamp(),
      });

      // Admin Notice
      await addDoc(collection(db, 'notices'), {
        title: 'New Payout Account Change Request',
        message: `Reseller ${user.fullName} (${user.shopName || ''}) requested a payout account change to ${editPayoutMethod.toUpperCase()}.`,
        type: 'system',
        targetRole: 'admin',
        createdAt: serverTimestamp(),
      });

      setIsPayoutModalOpen(false);
      fetchWalletData();
    } catch (err: any) {
      console.error('Payout change request error:', err);
      setPayoutModalError(err.message || 'Failed to submit payout update request.');
    } finally {
      setSubmittingPayout(false);
    }
  };

  // Helper because we used setIsDepositOpenModal by mistake or need to make sure we match the state name
  const setIsDepositOpenModal = (open: boolean) => {
    setIsDepositModalOpen(open);
  };

  // Approve Deposit Request (Admin / Super Admin)
  const handleApproveDeposit = async (tx: WalletTransaction) => {
    setProcessingTxId(tx.id);
    setActionError('');
    try {
      await runTransaction(db, async (transaction) => {
        const txRef = doc(db, 'transactions', tx.id);
        const walletRef = doc(db, 'wallets', tx.resellerId);

        const walletSnap = await transaction.get(walletRef);
        let balance = 0;
        let totalEarned = 0;
        let totalWithdrawn = 0;

        if (walletSnap.exists()) {
          const wData = walletSnap.data() as Wallet;
          balance = wData.balance || 0;
          totalEarned = wData.totalEarned || 0;
          totalWithdrawn = wData.totalWithdrawn || 0;
        }

        // Update/Create Wallet balance: add the deposit amount
        transaction.set(walletRef, {
          resellerId: tx.resellerId,
          balance: balance + tx.amount,
          totalEarned: totalEarned,
          totalWithdrawn: totalWithdrawn,
          updatedAt: serverTimestamp(),
        }, { merge: true });

        // Update tx status
        transaction.update(txRef, {
          status: 'approved',
          updatedAt: serverTimestamp(),
        });
      });

      fetchWalletData();
    } catch (err: any) {
      console.error('Deposit Approval error:', err);
      setActionError(err.message || 'Failed to approve deposit request.');
    } finally {
      setProcessingTxId(null);
    }
  };

  // Approve Withdrawal Request (Admin / Super Admin)
  const handleApproveWithdrawal = async (tx: WalletTransaction) => {
    setProcessingTxId(tx.id);
    setActionError('');
    try {
      await runTransaction(db, async (transaction) => {
        const txRef = doc(db, 'transactions', tx.id);
        const walletRef = doc(db, 'wallets', tx.resellerId);

        const walletSnap = await transaction.get(walletRef);
        if (!walletSnap.exists()) {
          throw new Error('Reseller wallet record not found.');
        }

        const wData = walletSnap.data() as Wallet;
        if ((wData.balance || 0) < tx.amount) {
          throw new Error(`Reseller has insufficient balance (৳${wData.balance}) for this withdrawal.`);
        }

        // Deduct from balance, increment totalWithdrawn
        transaction.update(walletRef, {
          balance: wData.balance - tx.amount,
          totalWithdrawn: (wData.totalWithdrawn || 0) + tx.amount,
          updatedAt: serverTimestamp(),
        });

        // Update tx status
        transaction.update(txRef, {
          status: 'approved',
          updatedAt: serverTimestamp(),
        });
      });

      fetchWalletData();
    } catch (err: any) {
      console.error('Approval error:', err);
      setActionError(err.message || 'Failed to approve withdrawal request.');
    } finally {
      setProcessingTxId(null);
    }
  };

  // Reject Withdrawal Request (Admin / Super Admin)
  const handleConfirmRejectWithdrawal = async () => {
    if (!selectedTxToReject) return;
    if (!rejectReason.trim()) {
      setActionError('Please specify a rejection reason.');
      return;
    }

    setProcessingTxId(selectedTxToReject.id);
    setActionError('');

    try {
      const txRef = doc(db, 'transactions', selectedTxToReject.id);
      await updateDoc(txRef, {
        status: 'rejected',
        rejectReason: rejectReason.trim(),
        updatedAt: serverTimestamp(),
      });

      setSelectedTxToReject(null);
      setRejectReason('');
      fetchWalletData();
    } catch (err: any) {
      console.error('Rejection error:', err);
      setActionError(err.message || 'Failed to reject withdrawal request.');
    } finally {
      setProcessingTxId(null);
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2 bg-white rounded-2xl border border-slate-200">
        <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
        <span>Loading wallet balances & transactions...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* (1) Page Header: Title 20px, Subtitle & Round Glass Refresh Button */}
      <div className="flex items-center justify-between gap-3 border-b border-white/60 pb-3.5">
        <div>
          <h2 className="text-[20px] font-black text-[#04203F] tracking-tight">Wallet & Payouts</h2>
          <p className="text-[12px] font-medium text-slate-500 mt-0.5">
            {isAdminOrSuperAdmin 
              ? 'Manage reseller deposits, withdrawals, and monitor global transaction ledgers'
              : 'Monitor your earnings, withdraw funds to mobile wallet, and track payouts'}
          </p>
        </div>

        {/* 36px Round Glass Refresh Button */}
        <button
          onClick={() => {
            triggerHaptic('medium');
            handleRefresh();
          }}
          disabled={isRefreshing || loading}
          className="w-9 h-9 rounded-full bg-white/75 hover:bg-white/95 backdrop-blur-md border border-white/80 shadow-xs flex items-center justify-center text-slate-600 hover:text-[#04203F] transition-all cursor-pointer active:scale-95 disabled:opacity-50 shrink-0"
          title="Refresh Wallet Data"
        >
          <RotateCw className={`w-4 h-4 text-slate-600 ${isRefreshing || loading ? 'animate-spin text-[#0E9AA7]' : ''}`} />
        </button>
      </div>

      {/* Reseller Glass Experience */}
      {!isAdminOrSuperAdmin && (
        <div className="space-y-4">
          {/* (2) HERO BALANCE CARD: Glass over navy-to-teal gradient (#04203F to #0E9AA7) */}
          <div 
            className="rounded-3xl p-5 sm:p-6 text-white shadow-xl border border-white/20 relative overflow-hidden transition-all select-none"
            style={{
              background: 'linear-gradient(135deg, #04203F 0%, #083358 50%, #0E9AA7 100%)',
              boxShadow: '0 16px 36px -8px rgba(4, 32, 63, 0.35), inset 0 1px 1px rgba(255, 255, 255, 0.25)',
            }}
          >
            {/* Ambient inner glass glow highlights */}
            <div className="absolute -top-16 -right-16 w-48 h-48 bg-white/10 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-[#3DD055]/15 rounded-full blur-2xl pointer-events-none" />

            <div className="relative z-10 flex flex-col justify-between h-full gap-4">
              {/* Top row: Label & Status Chip */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-teal-200 flex items-center gap-1.5">
                  <WalletIcon className="w-4 h-4 text-[#3DD055]" />
                  <span>Available Balance</span>
                </span>
                <span className="text-[11px] bg-emerald-500/20 text-emerald-300 font-extrabold px-3 py-1 rounded-full border border-emerald-500/30 backdrop-blur-md flex items-center gap-1.5 shadow-2xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#3DD055] animate-pulse" />
                  <span>Ready for Payout</span>
                </span>
              </div>

              {/* Amount Display with Animated Counter */}
              <div>
                <div className="text-3xl sm:text-4xl font-black tracking-tight text-white flex items-baseline gap-1">
                  <span className="text-2xl sm:text-3xl font-extrabold text-teal-200">৳</span>
                  <AnimatedCounter 
                    value={wallet?.balance || 0} 
                    className="tabular-nums" 
                  />
                </div>
              </div>

              {/* Bottom Row: Reseller ID & 3 Action Buttons */}
              <div className="pt-3 border-t border-white/15 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                {/* Reseller ID with Copy Button */}
                <div className="flex items-center gap-1.5 text-xs text-slate-300">
                  <span className="text-[11px] text-teal-100 font-medium">Reseller ID:</span>
                  <button
                    onClick={() => {
                      triggerHaptic('light');
                      const idText = formatResellerId(user);
                      navigator.clipboard.writeText(idText);
                      setCopiedId(true);
                      showToast('✓ Reseller ID copied', 'success');
                      setTimeout(() => setCopiedId(false), 2000);
                    }}
                    className="inline-flex items-center gap-1 bg-white/15 hover:bg-white/25 active:bg-white/30 text-white font-mono font-bold text-xs px-2.5 py-1 rounded-lg border border-white/20 transition-all cursor-pointer backdrop-blur-xs"
                    title="Click to copy Reseller ID"
                  >
                    <span>{formatResellerId(user)}</span>
                    {copiedId ? (
                      <Check className="w-3 h-3 text-[#3DD055]" />
                    ) : (
                      <Copy className="w-3 h-3 text-white/80" />
                    )}
                  </button>
                </div>

                {/* 3 Quick Action Buttons: Deposit, Withdraw, History */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Request Deposit */}
                  <button
                    onClick={() => {
                      triggerHaptic('light');
                      setDepositError('');
                      setIsDepositModalOpen(true);
                    }}
                    className="bg-white/15 hover:bg-white/25 active:scale-97 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition-all border border-white/25 backdrop-blur-md shadow-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#3DD055]" />
                    <span>Deposit</span>
                  </button>

                  {/* Request Withdraw (Dimmed if balance <= 0 or pending request exists) */}
                  {(() => {
                    const hasPendingWithdraw = transactions.some((t) => t.type === 'withdrawal' && t.status === 'pending');
                    const isWithdrawDisabled = (wallet?.balance || 0) <= 0 || hasPendingWithdraw;
                    const withdrawDisabledReason = (wallet?.balance || 0) <= 0 
                      ? 'Balance must be greater than ৳0 to withdraw' 
                      : hasPendingWithdraw 
                      ? 'You already have a withdrawal request pending approval' 
                      : '';

                    return (
                      <button
                        onClick={() => {
                          if (isWithdrawDisabled) {
                            showToast(withdrawDisabledReason, 'info');
                            return;
                          }
                          triggerHaptic('light');
                          setWithdrawError('');
                          setIsWithdrawModalOpen(true);
                        }}
                        disabled={isWithdrawDisabled}
                        title={withdrawDisabledReason || 'Request payout to your account'}
                        className={`font-bold text-xs px-3.5 py-2 rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer ${
                          isWithdrawDisabled 
                            ? 'bg-white/10 text-white/40 border border-white/10 cursor-not-allowed opacity-60' 
                            : 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-emerald-500/25 border border-emerald-400 active:scale-97'
                        }`}
                      >
                        <ArrowUpRight className="w-3.5 h-3.5" />
                        <span>Withdraw</span>
                      </button>
                    );
                  })()}

                  {/* History Scroll Button */}
                  <button
                    onClick={() => {
                      triggerHaptic('light');
                      document.getElementById('tx-history')?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="bg-white/10 hover:bg-white/20 active:scale-97 text-white font-medium text-xs px-3 py-2 rounded-xl transition-all border border-white/15 backdrop-blur-md flex items-center gap-1.5 cursor-pointer"
                    title="View Transaction History"
                  >
                    <Clock className="w-3.5 h-3.5 text-teal-200" />
                    <span>History</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* (3) STATS ROW: Two compact glass cards side-by-side */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {/* Total Lifetime Earned */}
            <div 
              className="p-4 rounded-2xl border transition-all select-none"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.72)',
                backdropFilter: 'blur(20px) saturate(160%)',
                WebkitBackdropFilter: 'blur(20px) saturate(160%)',
                borderColor: 'rgba(255, 255, 255, 0.8)',
                boxShadow: '0 8px 24px -4px rgba(4, 32, 63, 0.05)',
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Lifetime Earned
                </span>
                <div className="w-7 h-7 rounded-xl bg-emerald-500/15 text-emerald-600 flex items-center justify-center shrink-0">
                  <ArrowDownLeft className="w-4 h-4 text-[#3DD055]" />
                </div>
              </div>
              <div className="text-lg sm:text-xl font-black text-emerald-600 tracking-tight flex items-baseline gap-0.5">
                <span className="text-sm font-bold">৳</span>
                <AnimatedCounter value={wallet?.totalEarned || 0} />
              </div>
            </div>

            {/* Total Withdrawn */}
            <div 
              className="p-4 rounded-2xl border transition-all select-none"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.72)',
                backdropFilter: 'blur(20px) saturate(160%)',
                WebkitBackdropFilter: 'blur(20px) saturate(160%)',
                borderColor: 'rgba(255, 255, 255, 0.8)',
                boxShadow: '0 8px 24px -4px rgba(4, 32, 63, 0.05)',
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Total Withdrawn
                </span>
                <div className="w-7 h-7 rounded-xl bg-[#04203F]/10 text-[#04203F] flex items-center justify-center shrink-0">
                  <ArrowUpRight className="w-4 h-4 text-[#04203F]" />
                </div>
              </div>
              <div className="text-lg sm:text-xl font-black text-[#04203F] tracking-tight flex items-baseline gap-0.5">
                <span className="text-sm font-bold">৳</span>
                <AnimatedCounter value={wallet?.totalWithdrawn || 0} />
              </div>
            </div>
          </div>

          {/* (4) PENDING REQUESTS STRIP: Displays if any deposit or withdrawal is pending */}
          {(() => {
            const pendingList = transactions.filter((t) => t.status === 'pending');
            if (pendingList.length === 0) return null;

            return (
              <div className="space-y-2">
                {pendingList.map((tx) => (
                  <div
                    key={tx.id}
                    className="p-3.5 rounded-2xl border flex items-center justify-between gap-3 shadow-xs"
                    style={{
                      backgroundColor: tx.type === 'deposit' ? 'rgba(236, 253, 245, 0.8)' : 'rgba(254, 243, 199, 0.8)',
                      backdropFilter: 'blur(16px)',
                      borderColor: tx.type === 'deposit' ? 'rgba(167, 243, 208, 0.9)' : 'rgba(253, 230, 138, 0.9)',
                    }}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                        tx.type === 'deposit' ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'
                      }`}>
                        <Clock className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate">
                          Pending {tx.type === 'deposit' ? 'Deposit' : 'Withdrawal'}: ৳{tx.amount}
                        </p>
                        <p className="text-[11px] text-slate-600 truncate">
                          Via {tx.paymentMethod?.toUpperCase()} {tx.accountNumber ? `(${tx.accountNumber})` : ''} • Under Review
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-white/80 text-amber-800 border border-amber-300 shrink-0">
                      Pending
                    </span>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* (5) PAYOUT ACCOUNTS: Glass card with provider badge, masked number, default badge, edit button */}
          <div 
            className="rounded-2xl border p-4 sm:p-5 shadow-xs space-y-3"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.72)',
              backdropFilter: 'blur(20px) saturate(160%)',
              WebkitBackdropFilter: 'blur(20px) saturate(160%)',
              borderColor: 'rgba(255, 255, 255, 0.8)',
              boxShadow: '0 8px 24px -4px rgba(4, 32, 63, 0.05)',
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-[#04203F] flex items-center justify-center">
                  <CreditCard className="w-4 h-4 text-[#0E9AA7]" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#04203F]">Registered Payout Account</h3>
                  <p className="text-[11px] text-slate-500">Destination for your approved earnings</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setEditPayoutMethod(user.payoutMethod || 'bkash');
                  setEditBkash(user.bkashNumber || '');
                  setEditNagad(user.nagadNumber || '');
                  setEditRocket(user.rocketNumber || '');
                  setEditBankName(user.bankName || '');
                  setEditAccountHolder(user.accountHolderName || '');
                  setEditAccountNumber(user.accountNumber || '');
                  setEditBranchName(user.branchName || '');
                  setPayoutModalError('');
                  setIsPayoutModalOpen(true);
                }}
                className="bg-white/80 hover:bg-white text-[#04203F] border border-slate-200/80 font-bold text-xs px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer active:scale-95"
              >
                <Edit3 className="w-3.5 h-3.5 text-[#0E9AA7]" />
                <span>Edit Method</span>
              </button>
            </div>

            {/* Pending Payout Request Alert if any */}
            {pendingPayoutRequest && (
              <div className="bg-amber-500/10 border border-amber-300 text-amber-900 rounded-xl p-3 flex items-start gap-2.5 text-xs">
                <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Payout account change request pending review</span>
                  <p className="text-[11px] text-amber-800 mt-0.5">
                    Requested change to <span className="uppercase font-bold">{pendingPayoutRequest.payoutMethod}</span> is awaiting administrator approval.
                  </p>
                </div>
              </div>
            )}

            {/* Active Payout Details Card */}
            {(() => {
              const hasMethod = user.payoutMethod === 'bank' 
                ? (user.bankName && user.accountNumber) 
                : (user.bkashNumber || user.nagadNumber || user.rocketNumber);

              if (!hasMethod) {
                return (
                  <div className="p-4 rounded-xl border border-dashed border-slate-200 text-center space-y-2 bg-slate-50/50">
                    <p className="text-xs text-slate-500">No payout account linked yet.</p>
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setIsPayoutModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0E9AA7] hover:underline cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Payout Method</span>
                    </button>
                  </div>
                );
              }

              const method = user.payoutMethod || 'bkash';
              const rawNumber = method === 'bkash' 
                ? user.bkashNumber 
                : method === 'nagad' 
                ? user.nagadNumber 
                : method === 'rocket' 
                ? user.rocketNumber 
                : user.accountNumber;
              const masked = rawNumber && rawNumber.length > 4 
                ? `•••• •••• ${rawNumber.slice(-4)}` 
                : (rawNumber || 'Not configured');

              const providerColor = method === 'bkash' 
                ? 'bg-[#E2136E]/10 text-[#E2136E] border-[#E2136E]/30' 
                : method === 'nagad' 
                ? 'bg-[#F7941D]/10 text-[#F7941D] border-[#F7941D]/30' 
                : method === 'rocket' 
                ? 'bg-[#8C3494]/10 text-[#8C3494] border-[#8C3494]/30' 
                : 'bg-blue-500/10 text-blue-700 border-blue-500/30';

              return (
                <div className="bg-white/90 rounded-xl p-3.5 border border-slate-200/70 shadow-2xs space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] font-black uppercase px-2.5 py-0.5 rounded-lg border ${providerColor}`}>
                        {method}
                      </span>
                      <span className="text-xs font-bold text-slate-800">
                        {user.accountHolderName || user.fullName}
                      </span>
                    </div>
                    <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-emerald-600" />
                      <span>Default</span>
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-xs">
                    <span className="text-[11px] text-slate-500 font-medium">Account Number</span>
                    <button
                      onClick={() => {
                        if (rawNumber) {
                          triggerHaptic('light');
                          navigator.clipboard.writeText(rawNumber);
                          setCopiedPayoutNum(true);
                          showToast('✓ Account number copied', 'success');
                          setTimeout(() => setCopiedPayoutNum(false), 2000);
                        }
                      }}
                      className="font-mono font-bold text-slate-900 hover:text-[#0E9AA7] transition-colors flex items-center gap-1.5 cursor-pointer"
                      title="Click to copy account number"
                    >
                      <span>{masked}</span>
                      {copiedPayoutNum ? (
                        <Check className="w-3 h-3 text-emerald-600" />
                      ) : (
                        <Copy className="w-3 h-3 text-slate-400" />
                      )}
                    </button>
                  </div>

                  {method === 'bank' && (
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-[11px]">
                      <div>
                        <span className="text-slate-400 font-bold block">Bank</span>
                        <span className="font-semibold text-slate-800">{user.bankName || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-bold block">Branch</span>
                        <span className="font-semibold text-slate-800">{user.branchName || 'N/A'}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Admin View: Withdrawal Management */}
      {isAdminOrSuperAdmin && (
        <div className="space-y-6">
          <AdminWithdrawalManager user={user} />


          {/* Admin View: Pending Deposit Requests */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-emerald-500" />
                  <span>Pending Deposit Requests</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Approve or reject wallet balance top-up requests submitted by resellers
                </p>
              </div>
              <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-3 py-1 rounded-full">
                {pendingDeposits.length} Pending
              </span>
            </div>

            {pendingDeposits.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl">
                No pending deposit requests at this time.
              </div>
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200">
                        <th className="px-4 py-3">Reseller / Shop</th>
                        <th className="px-4 py-3">Method</th>
                        <th className="px-4 py-3">Sender Account</th>
                        <th className="px-4 py-3">Transaction ID (TxID)</th>
                        <th className="px-4 py-3 text-right">Amount</th>
                        <th className="px-4 py-3 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {pendingDeposits.map((tx) => {
                        const isProc = processingTxId === tx.id;
                        return (
                          <tr key={tx.id} className="hover:bg-emerald-50/40 transition-colors">
                            <td className="px-4 py-3">
                              <p className="font-bold text-slate-900">{tx.resellerShopName || 'Reseller'}</p>
                              <p className="text-[10px] text-slate-500">{tx.resellerName}</p>
                            </td>
                            <td className="px-4 py-3 uppercase font-bold text-emerald-600">
                              {tx.paymentMethod}
                            </td>
                            <td className="px-4 py-3 font-mono font-bold text-slate-800">
                              {tx.accountNumber}
                            </td>
                            <td className="px-4 py-3 font-mono font-bold text-blue-700">
                              {tx.transactionId || 'N/A'}
                            </td>
                            <td className="px-4 py-3 text-right font-extrabold text-emerald-600 text-sm">
                              ৳{tx.amount}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  onClick={() => handleApproveDeposit(tx)}
                                  disabled={isProc}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 shadow-xs disabled:opacity-50"
                                >
                                  {isProc ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                  <span>Approve</span>
                                </button>
                                <button
                                  onClick={() => {
                                    setSelectedTxToReject(tx);
                                    setRejectReason('');
                                  }}
                                  disabled={isProc}
                                  className="bg-rose-100 hover:bg-rose-200 text-rose-700 font-bold text-[11px] px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 disabled:opacity-50"
                                >
                                  <X className="w-3.5 h-3.5" />
                                  <span>Reject</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card Layout Fallback */}
                <div className="md:hidden space-y-4">
                  {pendingDeposits.map((tx) => {
                    const isProc = processingTxId === tx.id;
                    return (
                      <div key={tx.id} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                        <div className="flex justify-between items-start gap-2 border-b border-slate-200/60 pb-2">
                          <div>
                            <p className="font-bold text-slate-900 text-xs">{tx.resellerShopName || 'Reseller'}</p>
                            <p className="text-[10px] text-slate-500">{tx.resellerName}</p>
                          </div>
                          <span className="font-extrabold text-emerald-600 text-sm">৳{tx.amount}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[11px] font-medium text-slate-700 bg-white p-2.5 rounded-xl border border-slate-200/40">
                          <div>
                            <span className="text-[9px] text-slate-400 font-bold block uppercase">Method</span>
                            <span className="uppercase text-emerald-600 font-bold">{tx.paymentMethod}</span>
                          </div>
                          <div>
                            <span className="text-[9px] text-slate-400 font-bold block uppercase">Sender Account</span>
                            <span className="font-mono font-bold text-slate-800">{tx.accountNumber}</span>
                          </div>
                          <div className="col-span-2">
                            <span className="text-[9px] text-slate-400 font-bold block uppercase">Transaction ID</span>
                            <span className="font-mono font-bold text-blue-700">{tx.transactionId || 'N/A'}</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            onClick={() => handleApproveDeposit(tx)}
                            disabled={isProc}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] px-3.5 py-2 rounded-xl transition-colors flex items-center gap-1 shadow-xs disabled:opacity-50"
                          >
                            {isProc ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            <span>Approve</span>
                          </button>
                          <button
                            onClick={() => {
                              setSelectedTxToReject(tx);
                              setRejectReason('');
                            }}
                            disabled={isProc}
                            className="bg-rose-100 hover:bg-rose-200 text-rose-700 font-bold text-[11px] px-3.5 py-2 rounded-xl transition-colors flex items-center gap-1 disabled:opacity-50"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Reject</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Admin Table: All Resellers Wallets Summary */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              <span>Reseller Wallet Balances Directory</span>
            </h3>

            <>
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200">
                      <th className="px-4 py-3">Reseller & Shop</th>
                      <th className="px-4 py-3 text-right">Available Balance</th>
                      <th className="px-4 py-3 text-right">Total Lifetime Earned</th>
                      <th className="px-4 py-3 text-right">Total Withdrawn</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {allWallets.map((w) => (
                      <tr key={w.resellerId} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-bold text-slate-900">{w.shopName || 'Reseller Shop'}</p>
                          <p className="text-[10px] text-slate-500">{w.resellerName}</p>
                        </td>
                        <td className="px-4 py-3 text-right font-extrabold text-blue-600">
                          ৳{(w.balance || 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-emerald-600">
                          ৳{(w.totalEarned || 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-slate-700">
                          ৳{(w.totalWithdrawn || 0).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card Layout Fallback */}
              <div className="md:hidden space-y-3">
                {allWallets.map((w) => (
                  <div key={w.resellerId} className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
                    <div className="border-b border-slate-200/60 pb-1.5">
                      <p className="font-bold text-slate-950 text-xs">{w.shopName || 'Reseller Shop'}</p>
                      <p className="text-[10px] text-slate-500">{w.resellerName}</p>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                      <div>
                        <span className="text-[9px] text-slate-400 font-bold block uppercase">Balance</span>
                        <span className="font-bold text-blue-600">৳{(w.balance || 0).toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 font-bold block uppercase">Earned</span>
                        <span className="font-bold text-emerald-600">৳{(w.totalEarned || 0).toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 font-bold block uppercase">Withdrawn</span>
                        <span className="font-bold text-slate-700">৳{(w.totalWithdrawn || 0).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          </div>
        </div>
      )}

      {/* (6) TRANSACTION HISTORY SECTION */}
      {!isAdminOrSuperAdmin ? (
        <div 
          id="tx-history" 
          className="rounded-3xl border p-4 sm:p-5 shadow-xs space-y-4"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.72)',
            backdropFilter: 'blur(20px) saturate(160%)',
            WebkitBackdropFilter: 'blur(20px) saturate(160%)',
            borderColor: 'rgba(255, 255, 255, 0.8)',
            boxShadow: '0 8px 24px -4px rgba(4, 32, 63, 0.05)',
          }}
        >
          {/* Header with Results Count */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                <DollarSign className="w-4 h-4 text-[#3DD055]" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#04203F]">Transaction History</h3>
                <p className="text-[11px] text-slate-500">Earnings, withdrawals & deposits ledger</p>
              </div>
            </div>

            <span className="text-[11px] font-bold text-slate-600 bg-white/80 px-2.5 py-1 rounded-full border border-slate-200 shadow-2xs">
              {transactions.length} Records
            </span>
          </div>

          {/* Filter Chips: All / Earned / Deposit / Withdraw / Adjustment */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none select-none">
            {[
              { id: 'all', label: 'All' },
              { id: 'commission', label: 'Earned' },
              { id: 'deposit', label: 'Deposit' },
              { id: 'withdrawal', label: 'Withdraw' },
              { id: 'adjustment', label: 'Adjustment' },
            ].map((f) => {
              const isActive = txFilter === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => {
                    triggerHaptic('light');
                    setTxFilter(f.id as any);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                    isActive
                      ? 'bg-[#04203F] text-white shadow-xs'
                      : 'bg-white/80 hover:bg-white text-slate-600 border border-slate-200/70'
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          {/* Transactions Grouped by Date */}
          {(() => {
            const filtered = transactions.filter((tx) => {
              if (txFilter === 'all') return true;
              return tx.type === txFilter;
            });

            if (filtered.length === 0) {
              return (
                <div className="p-8 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-2xl bg-white/40 space-y-1">
                  <p className="font-semibold text-slate-600">No transactions found</p>
                  <p className="text-[11px]">There are no records matching the selected filter.</p>
                </div>
              );
            }

            // Group by date
            const grouped: { [key: string]: WalletTransaction[] } = {};
            filtered.forEach((tx) => {
              let groupKey = 'Past';
              if (tx.createdAt) {
                const d = tx.createdAt.toDate ? tx.createdAt.toDate() : new Date(tx.createdAt);
                const now = new Date();
                if (d.toDateString() === now.toDateString()) {
                  groupKey = 'Today';
                } else {
                  const y = new Date();
                  y.setDate(now.getDate() - 1);
                  if (d.toDateString() === y.toDateString()) {
                    groupKey = 'Yesterday';
                  } else {
                    groupKey = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
                  }
                }
              }
              if (!grouped[groupKey]) grouped[groupKey] = [];
              grouped[groupKey].push(tx);
            });

            return (
              <div className="space-y-4">
                {Object.entries(grouped).map(([dateLabel, items]) => (
                  <div key={dateLabel} className="space-y-1.5">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1">
                      {dateLabel}
                    </span>

                    <div className="space-y-1.5">
                      {items.map((tx) => {
                        const isCredit = tx.type === 'commission' || tx.type === 'deposit';
                        const timeStr = tx.createdAt?.toDate 
                          ? tx.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : '';

                        const title = tx.type === 'commission'
                          ? `Commission: Order ${tx.orderNumber || ''}`
                          : tx.type === 'deposit'
                          ? `Wallet Deposit (${tx.paymentMethod?.toUpperCase() || ''})`
                          : tx.type === 'withdrawal'
                          ? `Withdrawal to ${tx.paymentMethod?.toUpperCase() || 'Account'}`
                          : 'Wallet Adjustment';

                        const statusBg = tx.status === 'approved'
                          ? 'bg-emerald-500/15 text-emerald-700 border-emerald-300'
                          : tx.status === 'pending'
                          ? 'bg-amber-500/15 text-amber-800 border-amber-300'
                          : 'bg-rose-500/15 text-rose-700 border-rose-300';

                        return (
                          <div
                            key={tx.id}
                            onClick={() => {
                              triggerHaptic('light');
                              setSelectedTxDetail(tx);
                            }}
                            className="p-3 rounded-2xl bg-white/85 hover:bg-white border border-slate-200/70 shadow-2xs flex items-center justify-between gap-3 cursor-pointer transition-all active:scale-98 group"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                                isCredit 
                                  ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                                  : 'bg-slate-100 text-[#04203F] border-slate-200'
                              }`}>
                                {isCredit ? <ArrowDownLeft className="w-4 h-4 text-[#3DD055]" /> : <ArrowUpRight className="w-4 h-4 text-[#04203F]" />}
                              </div>

                              <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-900 truncate group-hover:text-[#0E9AA7] transition-colors">
                                  {title}
                                </p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  {timeStr && <span className="text-[11px] text-slate-400">{timeStr}</span>}
                                  <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded-md border ${statusBg}`}>
                                    {tx.status}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`text-sm font-black tabular-nums ${
                                isCredit ? 'text-emerald-600' : 'text-[#04203F]'
                              }`}>
                                {isCredit ? '+' : '-'}৳{tx.amount?.toLocaleString()}
                              </span>
                              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* (7) FOOTER HELP NOTE: Link to Support */}
          <div 
            className="rounded-2xl p-3.5 border flex items-center justify-between gap-3 mt-4"
            style={{
              backgroundColor: 'rgba(240, 249, 255, 0.75)',
              borderColor: 'rgba(186, 230, 253, 0.8)',
            }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <HelpCircle className="w-4 h-4 text-[#0E9AA7] shrink-0" />
              <p className="text-[11px] text-slate-600 truncate">
                Questions regarding payouts or transactions?
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                window.location.hash = '#support';
                showToast('Contact support from the Account tab', 'info');
              }}
              className="text-[11px] font-bold text-[#0E9AA7] hover:underline shrink-0 cursor-pointer"
            >
              Get Help
            </button>
          </div>
        </div>
      ) : (
        /* Admin View: Transaction History Table */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-emerald-600" />
            <span>Transaction History</span>
          </h3>

          {transactions.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl">
              No wallet transactions recorded yet.
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200">
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Reseller</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Details / Reference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {transactions.map((tx) => {
                      const isComm = tx.type === 'commission';
                      const isWith = tx.type === 'withdrawal';

                      return (
                        <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase border ${
                                isComm
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : isWith
                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                  : 'bg-slate-100 text-slate-700 border-slate-300'
                              }`}
                            >
                              {isComm ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                              <span>{tx.type}</span>
                            </span>
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-800">
                            {tx.resellerShopName || tx.resellerName || 'Reseller'}
                          </td>
                          <td
                            className={`px-4 py-3 text-right font-extrabold text-sm ${
                              isComm || tx.type === 'deposit' ? 'text-emerald-600' : 'text-slate-900'
                            }`}
                          >
                            {isComm || tx.type === 'deposit' ? '+' : '-'}৳{tx.amount}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${
                                tx.status === 'approved'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : tx.status === 'pending'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {tx.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-600 font-medium">
                            {tx.orderNumber && (
                              <span className="font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 mr-2">
                                Order {tx.orderNumber}
                              </span>
                            )}
                            {tx.paymentMethod && (
                              <span className="uppercase font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 mr-2">
                                {tx.paymentMethod} ({tx.accountNumber})
                              </span>
                            )}
                            {tx.transactionId && (
                              <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 mr-2">
                                TxID: {tx.transactionId}
                              </span>
                            )}
                            {tx.rejectReason && (
                              <p className="text-[10px] text-rose-600 font-medium mt-1">Reason: {tx.rejectReason}</p>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card Layout Fallback for Admin */}
              <div className="md:hidden space-y-3">
                {transactions.map((tx) => (
                  <div key={tx.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-800 uppercase">{tx.type}</span>
                      <span className="font-extrabold text-slate-900">৳{tx.amount}</span>
                    </div>
                    <p className="text-[11px] text-slate-500">{tx.resellerShopName || tx.resellerName}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Modal: Request Withdraw (Reseller) */}
      {isWithdrawModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-2xl my-auto">
            <WithdrawalRequestForm
              user={user}
              availableBalance={wallet?.balance || 0}
              onSuccess={() => {
                setIsWithdrawModalOpen(false);
                fetchWalletData();
              }}
              onCancel={() => setIsWithdrawModalOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Modal: Request Deposit (Reseller) */}
      {isDepositModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-slate-900/70 backdrop-blur-xs">
          <div className="fixed sm:relative inset-0 sm:inset-auto w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-md bg-white sm:rounded-2xl border-0 sm:border border-slate-200 shadow-2xl flex flex-col overflow-hidden animate-in fade-in sm:zoom-in-95 duration-150">
            {/* Sticky Header */}
            <div className="sticky top-0 z-20 flex items-center justify-between px-4 sm:px-6 py-4 bg-slate-900 text-white shrink-0 shadow-sm">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 bg-emerald-600 rounded-xl flex items-center justify-center text-white font-bold shadow-md shadow-emerald-600/30">
                  <WalletIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Wallet Recharge</h3>
                  <p className="text-[11px] text-slate-400">Add funds to your wallet balance</p>
                </div>
              </div>
              <button
                onClick={() => setIsDepositModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRequestDeposit} className="flex-1 flex flex-col overflow-hidden">
              {/* Scrollable Form Body */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
                {depositError && (
                  <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span className="font-medium">{depositError}</span>
                  </div>
                )}

                {/* 1. Deposit Amount */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Deposit Amount (BDT) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none font-bold text-slate-400 text-base">
                      ৳
                    </div>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={100}
                      placeholder="e.g. 1000"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      className="w-full h-12 sm:h-11 pl-9 pr-3.5 text-base sm:text-sm font-extrabold font-mono bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 outline-none"
                      required
                    />
                  </div>
                </div>

                {/* Quick Amount Chips */}
                <div className="flex items-center gap-2 flex-wrap">
                  {[500, 1000, 2000, 5000].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setDepositAmount(amt.toString())}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all min-h-[38px] flex items-center justify-center cursor-pointer ${
                        depositAmount === amt.toString()
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      ৳{amt}
                    </button>
                  ))}
                </div>

                {/* 2. Payment Method Cards */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Select Payment Method <span className="text-rose-500">*</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {[
                      { id: 'bkash', label: 'bKash', color: 'bg-pink-50 border-pink-300 text-pink-700', subText: 'Merchant Cash Out' },
                      { id: 'nagad', label: 'Nagad', color: 'bg-orange-50 border-orange-300 text-orange-700', subText: 'Send Money' },
                      { id: 'bank_transfer', label: 'Bank', color: 'bg-blue-50 border-blue-300 text-blue-700', subText: 'Online Bank Transfer' },
                    ].map((m) => {
                      const isSelected = depositPaymentMethod === m.id;
                      return (
                        <button
                          type="button"
                          key={m.id}
                          onClick={() => setDepositPaymentMethod(m.id as PaymentMethod)}
                          className={`p-3 min-h-[60px] rounded-xl border-2 text-left flex items-center justify-between transition-all cursor-pointer ${
                            isSelected
                              ? `${m.color} ring-2 ring-emerald-500/20 shadow-xs font-bold`
                              : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <div>
                            <span className="text-sm font-extrabold uppercase block">{m.label}</span>
                            <span className="text-[10px] opacity-75 font-medium block">{m.subText}</span>
                          </div>
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            isSelected ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300'
                          }`}>
                            {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Payment Instructions Card with Account Number & Copy */}
                <div className="p-4 bg-slate-900 text-slate-100 rounded-2xl space-y-2 shadow-inner">
                  <div className="flex items-center justify-between text-xs text-slate-400 font-bold uppercase tracking-wider">
                    <span>Deposit Instructions</span>
                    <span className="text-emerald-400 font-extrabold">{depositPaymentMethod === 'bank_transfer' ? 'Bank Transfer' : depositPaymentMethod.toUpperCase()}</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Send funds to our official merchant account below, then enter your transaction details:
                  </p>
                  
                  <div className="p-3 bg-slate-800 border border-slate-700 rounded-xl flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-[10px] text-slate-400 font-bold uppercase block">Official {depositPaymentMethod === 'bank_transfer' ? 'Bank A/C' : depositPaymentMethod} Number</span>
                      <span className="font-mono text-sm font-extrabold text-white tracking-wider truncate block">
                        {depositPaymentMethod === 'bkash' ? '01700-112233' : depositPaymentMethod === 'nagad' ? '01800-445566' : 'BRAC Bank: 1501203948571'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const num = depositPaymentMethod === 'bkash' ? '01700112233' : depositPaymentMethod === 'nagad' ? '01800445566' : '1501203948571';
                        navigator.clipboard.writeText(num);
                        alert('Account number copied to clipboard!');
                      }}
                      className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 shrink-0 min-h-[44px] cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </button>
                  </div>
                </div>

                {/* 4. Sender Account / Mobile Number */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Sender Account / Mobile Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    inputMode={depositPaymentMethod === 'bank_transfer' ? 'text' : 'numeric'}
                    placeholder="e.g. 01700000000 or Bank A/C Number"
                    value={depositAccountNumber}
                    onChange={(e) => setDepositAccountNumber(e.target.value)}
                    className="w-full h-11 px-4 text-base sm:text-xs font-mono font-bold bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 outline-none"
                    required
                  />
                </div>

                {/* 5. Transaction ID (TxID) / Ref */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Transaction ID (TxID) / Ref <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 9K27B6X19W"
                    value={depositTransactionId}
                    onChange={(e) => setDepositTransactionId(e.target.value)}
                    className="w-full h-11 px-4 text-base sm:text-xs font-mono font-bold bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 outline-none"
                    required
                  />
                </div>
              </div>

              {/* Sticky Footer */}
              <div className="sticky bottom-0 z-20 bg-slate-50 px-4 sm:px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsDepositModalOpen(false)}
                  className="px-5 py-3 sm:py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm sm:text-xs rounded-xl transition-colors min-h-[44px] sm:min-h-[38px] flex items-center justify-center cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingDeposit}
                  className="px-6 py-3 sm:py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-extrabold text-sm sm:text-xs rounded-xl shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 cursor-pointer active:scale-98 min-h-[44px] sm:min-h-[38px]"
                >
                  {submittingDeposit ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Submit Recharge Request</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Payout Account Request (Reseller) */}
      {isPayoutModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs">
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-blue-400" />
                <h3 className="text-base font-bold">Edit Payout Account</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsPayoutModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRequestPayoutChange} className="p-6 space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-900 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <p>
                  <strong>Approval Required:</strong> For financial security, any changes to your payout account must be approved by an Admin or Super Admin before taking effect.
                </p>
              </div>

              {payoutModalError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{payoutModalError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Select Payout Method
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'bkash', name: 'bKash', color: 'border-pink-500 bg-pink-50 text-pink-700' },
                    { id: 'nagad', name: 'Nagad', color: 'border-amber-500 bg-amber-50 text-amber-700' },
                    { id: 'rocket', name: 'Rocket', color: 'border-purple-500 bg-purple-50 text-purple-700' },
                    { id: 'bank', name: 'Bank Transfer', color: 'border-blue-500 bg-blue-50 text-blue-700' },
                  ].map((m) => (
                    <button
                      type="button"
                      key={m.id}
                      onClick={() => setEditPayoutMethod(m.id as any)}
                      className={`py-2 px-2.5 rounded-xl border text-xs font-bold transition-all text-center ${
                        editPayoutMethod === m.id
                          ? `${m.color} shadow-xs`
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dynamic Inputs per method */}
              {editPayoutMethod === 'bkash' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    bKash Personal / Agent Mobile Number *
                  </label>
                  <input
                    type="text"
                    required
                    value={editBkash}
                    onChange={(e) => setEditBkash(e.target.value)}
                    placeholder="017XXXXXXXX"
                    className="w-full px-3.5 py-2 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-pink-500 focus:bg-white outline-none"
                  />
                </div>
              )}

              {editPayoutMethod === 'nagad' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nagad Personal / Agent Mobile Number *
                  </label>
                  <input
                    type="text"
                    required
                    value={editNagad}
                    onChange={(e) => setEditNagad(e.target.value)}
                    placeholder="018XXXXXXXX"
                    className="w-full px-3.5 py-2 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:bg-white outline-none"
                  />
                </div>
              )}

              {editPayoutMethod === 'rocket' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Rocket Mobile Number *
                  </label>
                  <input
                    type="text"
                    required
                    value={editRocket}
                    onChange={(e) => setEditRocket(e.target.value)}
                    placeholder="019XXXXXXXX"
                    className="w-full px-3.5 py-2 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:bg-white outline-none"
                  />
                </div>
              )}

              {editPayoutMethod === 'bank' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Bank Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={editBankName}
                      onChange={(e) => setEditBankName(e.target.value)}
                      placeholder="e.g. Dutch Bangla Bank"
                      className="w-full px-3.5 py-2 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Account Holder Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={editAccountHolder}
                      onChange={(e) => setEditAccountHolder(e.target.value)}
                      placeholder="Full Name as in Bank"
                      className="w-full px-3.5 py-2 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Account Number *
                    </label>
                    <input
                      type="text"
                      required
                      value={editAccountNumber}
                      onChange={(e) => setEditAccountNumber(e.target.value)}
                      placeholder="Account Number"
                      className="w-full px-3.5 py-2 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Branch Name
                    </label>
                    <input
                      type="text"
                      value={editBranchName}
                      onChange={(e) => setEditBranchName(e.target.value)}
                      placeholder="Branch location"
                      className="w-full px-3.5 py-2 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none"
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsPayoutModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingPayout}
                  className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md flex items-center gap-1.5 disabled:opacity-50"
                >
                  {submittingPayout ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>Submit for Admin Approval</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Reject Reason Prompt (Admin) */}
      {selectedTxToReject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs">
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Reject {selectedTxToReject.type === 'deposit' ? 'Deposit' : 'Withdrawal'} Request
            </h3>
            <p className="text-xs text-slate-500">
              Specify reason for rejecting ৳{selectedTxToReject.amount} {selectedTxToReject.type === 'deposit' ? 'deposit' : 'payout'} request for {selectedTxToReject.resellerShopName}.
            </p>

            <textarea
              rows={3}
              placeholder="e.g. Invalid Transaction ID, mismatch sender details, or insufficient credentials."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full p-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none"
            />

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSelectedTxToReject(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRejectWithdrawal}
                className="px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl"
              >
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* (6.B) Glass Bottom Sheet Modal: Transaction Details on Tap */}
      <AnimatePresence>
        {selectedTxDetail && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs select-none">
            {/* Backdrop Dismiss */}
            <div 
              className="absolute inset-0"
              onClick={() => setSelectedTxDetail(null)}
            />

            <motion.div
              initial={{ opacity: 0, y: 80, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 80, scale: 0.98 }}
              transition={{ type: 'spring', damping: 26, stiffness: 320 }}
              className="relative w-full max-w-md rounded-t-3xl sm:rounded-3xl border border-white/80 shadow-2xl overflow-hidden z-10 flex flex-col max-h-[85vh]"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.92)',
                backdropFilter: 'blur(24px) saturate(160%)',
                WebkitBackdropFilter: 'blur(24px) saturate(160%)',
              }}
            >
              {/* Grab Bar on Mobile */}
              <div className="w-12 h-1.5 bg-slate-300 rounded-full mx-auto mt-3 sm:hidden" />

              {/* Header */}
              <div className="px-5 py-3.5 flex items-center justify-between border-b border-slate-200/60">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-[#04203F] flex items-center justify-center">
                    <FileText className="w-4 h-4 text-[#0E9AA7]" />
                  </div>
                  <h3 className="text-sm font-bold text-[#04203F]">Transaction Details</h3>
                </div>
                <button
                  onClick={() => setSelectedTxDetail(null)}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="p-5 space-y-4 overflow-y-auto">
                {/* Hero Amount & Status */}
                <div className="text-center p-4 rounded-2xl bg-white/80 border border-slate-200/60 space-y-1.5 shadow-2xs">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    {selectedTxDetail.type} Amount
                  </span>
                  <div className={`text-2xl sm:text-3xl font-black tabular-nums ${
                    selectedTxDetail.type === 'commission' || selectedTxDetail.type === 'deposit'
                      ? 'text-emerald-600'
                      : 'text-[#04203F]'
                  }`}>
                    {selectedTxDetail.type === 'commission' || selectedTxDetail.type === 'deposit' ? '+' : '-'}৳{selectedTxDetail.amount?.toLocaleString()}
                  </div>
                  <div>
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${
                      selectedTxDetail.status === 'approved'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                        : selectedTxDetail.status === 'pending'
                        ? 'bg-amber-50 text-amber-800 border-amber-300'
                        : 'bg-rose-50 text-rose-700 border-rose-300'
                    }`}>
                      {selectedTxDetail.status}
                    </span>
                  </div>
                </div>

                {/* Details Grid */}
                <div className="space-y-2.5 text-xs">
                  {/* Transaction ID */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200/60">
                    <span className="text-slate-500 font-medium">Transaction ID</span>
                    <button
                      onClick={() => {
                        const idStr = selectedTxDetail.transactionId || selectedTxDetail.id;
                        navigator.clipboard.writeText(idStr);
                        showToast('✓ Transaction ID copied', 'success');
                      }}
                      className="font-mono font-bold text-[#04203F] hover:text-[#0E9AA7] transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <span className="truncate max-w-[180px]">{selectedTxDetail.transactionId || selectedTxDetail.id}</span>
                      <Copy className="w-3 h-3 text-slate-400" />
                    </button>
                  </div>

                  {/* Date & Time */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200/60">
                    <span className="text-slate-500 font-medium">Date & Time</span>
                    <span className="font-semibold text-slate-800">
                      {selectedTxDetail.createdAt?.toDate 
                        ? selectedTxDetail.createdAt.toDate().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
                        : 'Recent'}
                    </span>
                  </div>

                  {/* Payment Method / Account */}
                  {selectedTxDetail.paymentMethod && (
                    <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200/60">
                      <span className="text-slate-500 font-medium">Payment Method</span>
                      <span className="font-bold text-slate-900 uppercase">
                        {selectedTxDetail.paymentMethod} {selectedTxDetail.accountNumber ? `(${selectedTxDetail.accountNumber})` : ''}
                      </span>
                    </div>
                  )}

                  {/* Order Number (if commission) */}
                  {selectedTxDetail.orderNumber && (
                    <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200/60">
                      <span className="text-slate-500 font-medium">Linked Order</span>
                      <span className="font-bold text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-lg border border-blue-200">
                        #{selectedTxDetail.orderNumber}
                      </span>
                    </div>
                  )}

                  {/* Rejection Reason (if rejected) */}
                  {selectedTxDetail.rejectReason && (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 space-y-1">
                      <span className="font-bold text-[11px] uppercase tracking-wider block text-rose-700">Rejection Reason</span>
                      <p className="text-xs">{selectedTxDetail.rejectReason}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-slate-200/60 bg-white/80 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
                <button
                  onClick={() => setSelectedTxDetail(null)}
                  className="w-full py-2.5 rounded-xl bg-[#04203F] hover:bg-[#083358] text-white font-bold text-xs transition-colors cursor-pointer shadow-xs active:scale-98"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
