import React, { useState, useEffect } from 'react';
import { 
  collection, query, where, getDocs, doc, runTransaction, serverTimestamp, setDoc, updateDoc
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { PaymentMethod, UserProfile, Wallet, WalletTransaction } from '../../types';
import { 
  Wallet as WalletIcon, ArrowUpRight, ArrowDownLeft, Clock, CheckCircle2, 
  XCircle, AlertCircle, Loader2, DollarSign, Building2, Smartphone, Plus,
  Users, Check, X, ShieldCheck
} from 'lucide-react';

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

  useEffect(() => {
    fetchWalletData();
  }, [user.uid, user.role]);

  const fetchWalletData = async () => {
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
      } else {
        // Fetch reseller wallet
        const wRef = doc(db, 'wallets', user.uid);
        const walletSnap = await getDocs(query(collection(db, 'wallets'), where('resellerId', '==', user.uid)));

        if (!walletSnap.empty) {
          setWallet(walletSnap.docs[0].data() as Wallet);
        } else {
          setWallet({ resellerId: user.uid, balance: 0, totalEarned: 0, totalWithdrawn: 0, updatedAt: new Date() });
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
      }
    } catch (err: any) {
      console.error('Error fetching wallet data:', err);
      setActionError('Failed to load wallet dataset.');
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

      {/* Admin View: Pending Withdrawal Requests */}
      {isAdminOrSuperAdmin && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-amber-500" />
                  <span>Pending Withdrawal Requests</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Approve or reject payouts submitted by registered resellers
                </p>
              </div>
              <span className="bg-amber-100 text-amber-800 text-xs font-bold px-3 py-1 rounded-full">
                {pendingWithdrawals.length} Pending
              </span>
            </div>

            {actionError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            {pendingWithdrawals.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl">
                No pending withdrawal requests at this time.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200">
                      <th className="px-4 py-3">Reseller / Shop</th>
                      <th className="px-4 py-3">Method</th>
                      <th className="px-4 py-3">Account Number</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {pendingWithdrawals.map((tx) => {
                      const isProc = processingTxId === tx.id;
                      return (
                        <tr key={tx.id} className="hover:bg-amber-50/40 transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-bold text-slate-900">{tx.resellerShopName || 'Reseller'}</p>
                            <p className="text-[10px] text-slate-500">{tx.resellerName}</p>
                          </td>
                          <td className="px-4 py-3 uppercase font-bold text-blue-600">
                            {tx.paymentMethod}
                          </td>
                          <td className="px-4 py-3 font-mono font-bold text-slate-800">
                            {tx.accountNumber}
                          </td>
                          <td className="px-4 py-3 text-right font-extrabold text-slate-900 text-sm">
                            ৳{tx.amount}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => handleApproveWithdrawal(tx)}
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
            )}
          </div>

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
              <div className="overflow-x-auto">
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
            )}
          </div>

          {/* Admin Table: All Resellers Wallets Summary */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              <span>Reseller Wallet Balances Directory</span>
            </h3>

            <div className="overflow-x-auto">
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
          <div className="overflow-x-auto">
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
        )}
      </div>

      {/* Modal: Request Withdraw (Reseller) */}
      {isWithdrawModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs">
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
              <div className="flex items-center gap-2">
                <WalletIcon className="w-5 h-5 text-blue-400" />
                <h3 className="text-base font-bold">Request Balance Withdrawal</h3>
              </div>
              <button
                onClick={() => setIsWithdrawModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRequestWithdraw} className="p-6 space-y-4">
              {withdrawError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{withdrawError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Withdrawal Amount (BDT)
                </label>
                <input
                  type="number"
                  placeholder={`Max ৳${wallet?.balance || 0}`}
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  max={wallet?.balance || 0}
                  className="w-full px-3.5 py-2 text-sm font-bold bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Payment Method
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['bkash', 'nagad', 'bank_transfer'] as PaymentMethod[]).map((m) => (
                    <button
                      type="button"
                      key={m}
                      onClick={() => setPaymentMethod(m)}
                      className={`p-2.5 rounded-xl border text-center text-xs font-bold uppercase transition-all ${
                        paymentMethod === m
                          ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {m === 'bank_transfer' ? 'Bank' : m}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Account / Mobile Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. 01700000000 or Bank A/C Number"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsWithdrawModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingWithdraw}
                  className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md flex items-center gap-1.5 disabled:opacity-50"
                >
                  {submittingWithdraw ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>Submit Request</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Request Deposit (Reseller) */}
      {isDepositModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs">
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
              <div className="flex items-center gap-2">
                <WalletIcon className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold">Request Balance Deposit</h3>
              </div>
              <button
                onClick={() => setIsDepositModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRequestDeposit} className="p-6 space-y-4">
              {depositError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{depositError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Deposit Amount (BDT)
                </label>
                <input
                  type="number"
                  placeholder="e.g. 1000"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm font-bold bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Payment Method
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['bkash', 'nagad', 'bank_transfer'] as PaymentMethod[]).map((m) => (
                    <button
                      type="button"
                      key={m}
                      onClick={() => setDepositPaymentMethod(m)}
                      className={`p-2.5 rounded-xl border text-center text-xs font-bold uppercase transition-all ${
                        depositPaymentMethod === m
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {m === 'bank_transfer' ? 'Bank' : m}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Sender Account / Mobile Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. 01700000000 or Bank A/C Number"
                  value={depositAccountNumber}
                  onChange={(e) => setDepositAccountNumber(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Transaction ID (TxID) / Ref
                </label>
                <input
                  type="text"
                  placeholder="e.g. 9K27B6X19W"
                  value={depositTransactionId}
                  onChange={(e) => setDepositTransactionId(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsDepositModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingDeposit}
                  className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md flex items-center gap-1.5 disabled:opacity-50"
                >
                  {submittingDeposit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>Submit Request</span>
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
