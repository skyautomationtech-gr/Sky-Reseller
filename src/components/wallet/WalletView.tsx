import React, { useState, useEffect } from 'react';
import { 
  collection, query, where, getDocs, doc, runTransaction, serverTimestamp, setDoc, updateDoc, addDoc
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { PaymentMethod, UserProfile, Wallet, WalletTransaction, PayoutChangeRequest } from '../../types';
import { WithdrawalRequestForm } from './WithdrawalRequestForm';
import { AdminWithdrawalManager } from './AdminWithdrawalManager';
import { 
  Wallet as WalletIcon, ArrowUpRight, ArrowDownLeft, Clock, CheckCircle2, 
  XCircle, AlertCircle, Loader2, DollarSign, Building2, Smartphone, Plus,
  Users, Check, X, ShieldCheck, CreditCard, Edit3, RotateCw, Copy
} from 'lucide-react';
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
      {/* Page Title & Refresh Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Wallet & Payouts</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {isAdminOrSuperAdmin 
              ? 'Manage reseller deposits, withdrawals, and monitor global transaction ledgers'
              : 'Monitor your reseller wallet balance, track payout transactions, and top up funds'}
          </p>
        </div>

        <button
          onClick={() => refreshCurrentPage()}
          disabled={isRefreshing || loading}
          className="bg-white border border-slate-200 hover:border-blue-400 text-slate-700 hover:text-blue-600 text-xs font-semibold px-3.5 py-2 rounded-xl shadow-2xs transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer self-start sm:self-center"
          title="Refresh Wallet Data"
        >
          <RotateCw className={`w-3.5 h-3.5 text-blue-600 ${isRefreshing || loading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Refresh Wallet</span>
        </button>
      </div>

      {/* Reseller Header & Wallet Summary */}
      {!isAdminOrSuperAdmin && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Prominent Balance Card */}
          <div className="md:col-span-2 bg-gradient-to-r from-slate-900 to-blue-950 p-6 rounded-2xl text-white shadow-xl border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                  <WalletIcon className="w-4 h-4" /> Available Wallet Balance
                </span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-bold px-2.5 py-1 rounded-full border border-emerald-500/30">
                  Ready for Payout
                </span>
              </div>
              <div className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
                ৳{(wallet?.balance || 0).toLocaleString()}
              </div>
            </div>

            <div className="pt-6 mt-4 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <p className="text-xs text-slate-400">
                Reseller ID: <span className="text-slate-200 font-mono font-semibold">{user.uid.substring(0, 8)}</span>
              </p>
              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => {
                    setDepositError('');
                    setIsDepositModalOpen(true);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition-all shadow-md shadow-emerald-600/30 flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Request Deposit</span>
                </button>
                <button
                  onClick={() => {
                    setWithdrawError('');
                    setIsWithdrawModalOpen(true);
                  }}
                  disabled={(wallet?.balance || 0) <= 0}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition-all shadow-md shadow-blue-600/30 flex items-center gap-2 disabled:opacity-50"
                >
                  <ArrowUpRight className="w-4 h-4" />
                  <span>Request Withdraw</span>
                </button>
              </div>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="space-y-3">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Total Lifetime Earned</span>
                <span className="text-xl font-bold text-emerald-600">৳{(wallet?.totalEarned || 0).toLocaleString()}</span>
              </div>
              <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                <ArrowDownLeft className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Total Withdrawn</span>
                <span className="text-xl font-bold text-slate-800">৳{(wallet?.totalWithdrawn || 0).toLocaleString()}</span>
              </div>
              <div className="w-10 h-10 bg-slate-100 text-slate-600 rounded-xl flex items-center justify-center">
                <ArrowUpRight className="w-5 h-5" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Registered Payout Method Card & Pending Approval Banner (Reseller) */}
      {!isAdminOrSuperAdmin && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Registered Payout Account</h3>
                <p className="text-xs text-slate-500">Your approved account details where earnings are sent upon withdrawal</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
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
              className="bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs px-4 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-xs"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit Payout Method</span>
            </button>
          </div>

          {/* Pending Payout Request Alert */}
          {pendingPayoutRequest && (
            <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-4 flex items-start gap-3">
              <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-bold text-amber-900">Payout Account Change Request PENDING APPROVAL</p>
                <p className="text-amber-800">
                  You submitted a request to update your payout account to <strong className="uppercase">{pendingPayoutRequest.payoutMethod}</strong>.
                  An Admin or Super Admin must review and approve this change before it takes effect.
                </p>
              </div>
            </div>
          )}

          {/* Current Active Details Display */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 text-xs">
            {user.payoutMethod === 'bank' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Bank Name</span>
                  <span className="font-semibold text-slate-900">{user.bankName || 'Not configured'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Account Holder</span>
                  <span className="font-semibold text-slate-900">{user.accountHolderName || 'Not configured'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Account Number</span>
                  <span className="font-mono font-bold text-blue-700">{user.accountNumber || 'Not configured'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Branch Name</span>
                  <span className="font-semibold text-slate-900">{user.branchName || 'Not configured'}</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Default Payout Method</span>
                  <span className="font-bold text-slate-900 uppercase">{user.payoutMethod || 'Mobile Wallet'}</span>
                </div>
                {user.bkashNumber && (
                  <div>
                    <span className="text-[10px] text-pink-600 font-bold uppercase tracking-wider block">bKash Number</span>
                    <span className="font-mono font-bold text-slate-900">{user.bkashNumber}</span>
                  </div>
                )}
                {user.nagadNumber && (
                  <div>
                    <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider block">Nagad Number</span>
                    <span className="font-mono font-bold text-slate-900">{user.nagadNumber}</span>
                  </div>
                )}
                {user.rocketNumber && (
                  <div>
                    <span className="text-[10px] text-purple-600 font-bold uppercase tracking-wider block">Rocket Number</span>
                    <span className="font-mono font-bold text-slate-900">{user.rocketNumber}</span>
                  </div>
                )}
                {(!user.bkashNumber && !user.nagadNumber && !user.rocketNumber && !user.bankName) && (
                  <span className="text-slate-400 italic">No account numbers added yet. Click "Edit Payout Method" above.</span>
                )}
              </div>
            )}
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

      {/* Transaction History Section */}
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
                    {isAdminOrSuperAdmin && <th className="px-4 py-3">Reseller</th>}
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
                        {/* Type */}
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

                        {/* Reseller (Admin view) */}
                        {isAdminOrSuperAdmin && (
                          <td className="px-4 py-3 font-semibold text-slate-800">
                            {tx.resellerShopName || tx.resellerName || 'Reseller'}
                          </td>
                        )}

                        {/* Amount */}
                        <td
                          className={`px-4 py-3 text-right font-extrabold text-sm ${
                            isComm || tx.type === 'deposit' ? 'text-emerald-600' : 'text-slate-900'
                          }`}
                        >
                          {isComm || tx.type === 'deposit' ? '+' : '-'}৳{tx.amount}
                        </td>

                        {/* Status */}
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

                        {/* Details */}
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

            {/* Mobile Card Layout Fallback */}
            <div className="md:hidden space-y-4">
              {transactions.map((tx) => {
                const isComm = tx.type === 'commission';
                const isWith = tx.type === 'withdrawal';

                return (
                  <div key={tx.id} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2 border-b border-slate-200/60 pb-2">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase border ${
                          isComm
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : isWith
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-slate-100 text-slate-700 border-slate-300'
                        }`}
                      >
                        {isComm ? <ArrowDownLeft className="w-2.5 h-2.5" /> : <ArrowUpRight className="w-2.5 h-2.5" />}
                        <span>{tx.type}</span>
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold capitalize ${
                          tx.status === 'approved'
                            ? 'bg-emerald-100 text-emerald-800'
                            : tx.status === 'pending'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {tx.status}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-xs">
                      {isAdminOrSuperAdmin && (
                        <div>
                          <span className="text-[9px] text-slate-400 font-bold block uppercase">Reseller</span>
                          <span className="font-semibold text-slate-800">{tx.resellerShopName || tx.resellerName || 'Reseller'}</span>
                        </div>
                      )}
                      <div className="ml-auto text-right">
                        <span className="text-[9px] text-slate-400 font-bold block uppercase">Amount</span>
                        <span
                          className={`font-black text-sm ${
                            isComm || tx.type === 'deposit' ? 'text-emerald-600' : 'text-slate-900'
                          }`}
                        >
                          {isComm || tx.type === 'deposit' ? '+' : '-'}৳{tx.amount}
                        </span>
                      </div>
                    </div>

                    <div className="text-[11px] bg-white p-2.5 rounded-xl border border-slate-200/50 space-y-1.5">
                      <span className="text-[9px] text-slate-400 font-bold block uppercase">Reference details</span>
                      <div className="flex flex-wrap gap-1.5">
                        {tx.orderNumber && (
                          <span className="font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                            Order {tx.orderNumber}
                          </span>
                        )}
                        {tx.paymentMethod && (
                          <span className="uppercase font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                            {tx.paymentMethod} ({tx.accountNumber})
                          </span>
                        )}
                        {tx.transactionId && (
                          <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                            TxID: {tx.transactionId}
                          </span>
                        )}
                      </div>
                      {tx.rejectReason && (
                        <p className="text-[10px] text-rose-600 font-medium mt-1">Reason: {tx.rejectReason}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

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
    </div>
  );
};
