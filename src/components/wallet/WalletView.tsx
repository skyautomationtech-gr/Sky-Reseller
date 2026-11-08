import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, query, where, getDocs, doc, runTransaction, serverTimestamp, setDoc, updateDoc, addDoc
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { PaymentMethod, UserProfile, Wallet, WalletTransaction, PayoutChangeRequest, Order } from '../../types';
import { formatResellerId } from '../../lib/resellerIdHelper';
import { WithdrawalRequestForm } from './WithdrawalRequestForm';
import { AdminWithdrawalManager } from './AdminWithdrawalManager';
import { 
  Wallet as WalletIcon, ArrowUpRight, ArrowDownLeft, Clock, CheckCircle2, 
  XCircle, AlertCircle, Loader2, DollarSign, Building2, Smartphone, Plus,
  Users, Check, X, ShieldCheck, CreditCard, Edit3, Copy,
  ChevronRight, HelpCircle, FileText, Filter, Calendar, Download, ExternalLink,
  Eye, EyeOff, Share2, Search, SlidersHorizontal, ArrowUpDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AnimatedCounter } from '../common/AnimatedCounter';
import { triggerHaptic } from '../../lib/nativeFeedback';
import { usePageRefresh, useRefresh } from '../../context/RefreshContext';
import { DENSITY_TOKENS as DT } from '../../utils/densityTokens';
import { useScrollToTop } from '../../utils/scrollToTop';

interface WalletViewProps {
  user: UserProfile;
}

export const WalletView: React.FC<WalletViewProps> = ({ user }) => {
  const isAdminOrSuperAdmin = user.role === 'super_admin' || user.role === 'admin';

  // Instantly reset scroll to top on mount
  useScrollToTop([]);

  // Core Data States
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [allWallets, setAllWallets] = useState<(Wallet & { resellerName?: string; shopName?: string })[]>([]);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [pendingWithdrawals, setPendingWithdrawals] = useState<WalletTransaction[]>([]);
  const [pendingDeposits, setPendingDeposits] = useState<WalletTransaction[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  // Balance Visibility Toggle (Persisted in localStorage)
  const [isBalanceHidden, setIsBalanceHidden] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sky_wallet_hide_balance') === 'true';
    } catch (_) {
      return false;
    }
  });

  const toggleBalanceHidden = () => {
    triggerHaptic('light');
    const nextVal = !isBalanceHidden;
    setIsBalanceHidden(nextVal);
    try {
      localStorage.setItem('sky_wallet_hide_balance', String(nextVal));
    } catch (_) {}
  };

  // Modals
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState<string>('1000');
  const [depositPaymentMethod, setDepositPaymentMethod] = useState<PaymentMethod>('bkash');
  const [depositAccountNumber, setDepositAccountNumber] = useState('');
  const [depositTransactionId, setDepositTransactionId] = useState('');
  const [depositProofUrl, setDepositProofUrl] = useState<string | null>(null);
  const [depositError, setDepositError] = useState('');
  const [submittingDeposit, setSubmittingDeposit] = useState(false);
  const [depositSuccess, setDepositSuccess] = useState(false);

  // Admin Actions
  const [processingTxId, setProcessingTxId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  // Payout Account Editing
  const [pendingPayoutRequest, setPendingPayoutRequest] = useState<PayoutChangeRequest | null>(null);
  const [isPayoutModalOpen, setIsPayoutModalOpen] = useState(false);
  const [editPayoutMethod, setEditPayoutMethod] = useState<'bkash' | 'nagad' | 'rocket' | 'bank'>(user.payoutMethod || 'bkash');
  const [editBkash, setEditBkash] = useState(user.bkashNumber || '');
  const [editNagad, setEditNagad] = useState(user.nagadNumber || '');
  const [editRocket, setEditRocket] = useState(user.rocketNumber || '');
  const [editBankName, setEditBankName] = useState(user.bankName || '');
  const [editAccountHolder, setEditAccountHolder] = useState(user.accountHolderName || user.fullName || '');
  const [editAccountNumber, setEditAccountNumber] = useState(user.accountNumber || '');
  const [editBranchName, setEditBranchName] = useState(user.branchName || '');
  const [payoutModalError, setPayoutModalError] = useState('');
  const [submittingPayout, setSubmittingPayout] = useState(false);

  // UX, Search & Ledger Filters
  const [selectedTxDetail, setSelectedTxDetail] = useState<WalletTransaction | null>(null);
  const [txSearchTerm, setTxSearchTerm] = useState('');
  const [txFilter, setTxFilter] = useState<'all' | 'commission' | 'deposit' | 'withdrawal' | 'adjustment'>('all');
  const [txStatusFilter, setTxStatusFilter] = useState<'all' | 'approved' | 'pending' | 'rejected'>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [sortOption, setSortOption] = useState<'newest' | 'oldest' | 'amount_high'>('newest');
  const [chartPeriod, setChartPeriod] = useState<'7days' | '6months'>('6months');
  const [visibleCount, setVisibleCount] = useState<number>(20);
  const [copiedId, setCopiedId] = useState(false);
  const [copiedDetailTxId, setCopiedDetailTxId] = useState(false);
  const [copiedReceivingNum, setCopiedReceivingNum] = useState(false);
  const [activeChartIndex, setActiveChartIndex] = useState<number | null>(null);

  const { showToast } = useRefresh();

  // Auto-refresh when tab opened
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
        // Admin: fetch directory of all wallets & users
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

        // Pending withdrawals
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

        // Pending deposits
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

        // System transactions
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
          showToast('✓ Wallet directory updated', 'success');
        }
      } else {
        // Reseller Wallet
        const walletSnap = await getDocs(query(collection(db, 'wallets'), where('resellerId', '==', user.uid)));
        let freshBalance = 0;
        if (!walletSnap.empty) {
          const wData = walletSnap.docs[0].data() as Wallet;
          setWallet(wData);
          freshBalance = wData.balance || 0;
        } else {
          setWallet({ resellerId: user.uid, balance: 0, totalEarned: 0, totalWithdrawn: 0, updatedAt: new Date() });
        }

        // Transactions
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

        // Active orders for pending commission calculations
        const ordersQuery = query(collection(db, 'orders'), where('resellerId', '==', user.uid));
        const ordersSnap = await getDocs(ordersQuery);
        const orderList: Order[] = [];
        ordersSnap.forEach((d) => {
          orderList.push(Object.assign({ id: d.id }, d.data()) as unknown as Order);
        });
        setOrders(orderList);

        // Pending payout change request
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

        if (isManualRefresh) {
          showToast(`✓ Balance: ৳${freshBalance.toLocaleString()}`, 'success');
        }
      }
    } catch (err: any) {
      console.error('Error fetching wallet data:', err);
      setActionError('Failed to load wallet data.');
    } finally {
      setLoading(false);
    }
  };

  // Calculations for stats
  const monthlyMetrics = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    let earnedThisMonth = 0;
    let withdrawnThisMonth = 0;
    let pendingCommission = 0;

    transactions.forEach((tx) => {
      if (tx.status !== 'approved') return;

      let d: Date | null = null;
      if (tx.createdAt) {
        if (tx.createdAt.toDate) d = tx.createdAt.toDate();
        else if (tx.createdAt.seconds) d = new Date(tx.createdAt.seconds * 1000);
        else d = new Date(tx.createdAt);
      }

      if (d && d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
        if (tx.type === 'commission') earnedThisMonth += tx.amount || 0;
        else if (tx.type === 'withdrawal') withdrawnThisMonth += tx.amount || 0;
      }
    });

    const activeStatuses = ['pending', 'accepted', 'packing', 'ready_to_ship', 'shipped'];
    orders.forEach((o) => {
      if (activeStatuses.includes(o.status)) {
        pendingCommission += Number(o.sellAmount || 0);
      }
    });

    return { earnedThisMonth, withdrawnThisMonth, pendingCommission };
  }, [transactions, orders]);

  // Earnings Mini Chart Data (7 days or 6 months)
  const chartData = useMemo(() => {
    const bars: { label: string; key: string; amount: number }[] = [];
    const now = new Date();

    if (chartPeriod === '7days') {
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const label = d.toLocaleDateString('en-US', { weekday: 'narrow' });
        const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        bars.push({ label, key, amount: 0 });
      }

      transactions.forEach((tx) => {
        if (tx.type === 'commission' && tx.status === 'approved') {
          let txDate: Date | null = null;
          if (tx.createdAt) {
            if (tx.createdAt.toDate) txDate = tx.createdAt.toDate();
            else if (tx.createdAt.seconds) txDate = new Date(tx.createdAt.seconds * 1000);
            else txDate = new Date(tx.createdAt);
          }
          if (txDate) {
            const key = `${txDate.getFullYear()}-${txDate.getMonth()}-${txDate.getDate()}`;
            const b = bars.find((item) => item.key === key);
            if (b) b.amount += tx.amount || 0;
          }
        }
      });
    } else {
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const label = d.toLocaleDateString('en-US', { month: 'short' });
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        bars.push({ label, key, amount: 0 });
      }

      transactions.forEach((tx) => {
        if (tx.type === 'commission' && tx.status === 'approved') {
          let txDate: Date | null = null;
          if (tx.createdAt) {
            if (tx.createdAt.toDate) txDate = tx.createdAt.toDate();
            else if (tx.createdAt.seconds) txDate = new Date(tx.createdAt.seconds * 1000);
            else txDate = new Date(tx.createdAt);
          }
          if (txDate) {
            const key = `${txDate.getFullYear()}-${txDate.getMonth()}`;
            const b = bars.find((item) => item.key === key);
            if (b) b.amount += tx.amount || 0;
          }
        }
      });
    }

    const maxAmount = Math.max(...bars.map((b) => b.amount), 1);
    let bestBar = bars[0];
    bars.forEach((b) => {
      if (b.amount > (bestBar?.amount || 0)) bestBar = b;
    });

    return { bars, maxAmount, bestBar };
  }, [transactions, chartPeriod]);

  // Filtered Ledger & Totals Strip
  const { filteredTransactions, ledgerTotals } = useMemo(() => {
    let list = transactions.filter((tx) => {
      // 1. Search term
      if (txSearchTerm.trim()) {
        const term = txSearchTerm.toLowerCase().trim();
        const idMatch = tx.id.toLowerCase().includes(term);
        const orderMatch = tx.orderNumber?.toLowerCase().includes(term);
        const methodMatch = tx.paymentMethod?.toLowerCase().includes(term);
        const txIdMatch = tx.transactionId?.toLowerCase().includes(term);
        if (!idMatch && !orderMatch && !methodMatch && !txIdMatch) return false;
      }

      // 2. Type Filter
      if (txFilter !== 'all' && tx.type !== txFilter) return false;

      // 3. Status Filter
      if (txStatusFilter !== 'all' && tx.status !== txStatusFilter) return false;

      // 4. Month Filter
      if (selectedMonth !== 'all') {
        let txDate: Date | null = null;
        if (tx.createdAt) {
          if (tx.createdAt.toDate) txDate = tx.createdAt.toDate();
          else if (tx.createdAt.seconds) txDate = new Date(tx.createdAt.seconds * 1000);
          else txDate = new Date(tx.createdAt);
        }
        if (!txDate) return false;

        const now = new Date();
        if (selectedMonth === 'this_month') {
          if (txDate.getMonth() !== now.getMonth() || txDate.getFullYear() !== now.getFullYear()) return false;
        } else if (selectedMonth === 'last_month') {
          const lastM = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          if (txDate.getMonth() !== lastM.getMonth() || txDate.getFullYear() !== lastM.getFullYear()) return false;
        }
      }

      return true;
    });

    // Sort
    list.sort((a, b) => {
      if (sortOption === 'oldest') {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
        return timeA - timeB;
      }
      if (sortOption === 'amount_high') {
        return (b.amount || 0) - (a.amount || 0);
      }
      // default: newest
      const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
      const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
      return timeB - timeA;
    });

    // Totals calculation
    let totalIn = 0;
    let totalOut = 0;
    list.forEach((tx) => {
      if (tx.status === 'approved') {
        if (tx.type === 'commission' || tx.type === 'deposit') {
          totalIn += tx.amount || 0;
        } else if (tx.type === 'withdrawal') {
          totalOut += tx.amount || 0;
        }
      }
    });

    return {
      filteredTransactions: list,
      ledgerTotals: { totalIn, totalOut, net: totalIn - totalOut }
    };
  }, [transactions, txSearchTerm, txFilter, txStatusFilter, selectedMonth, sortOption]);

  // Export Statement as CSV
  const handleDownloadStatement = () => {
    triggerHaptic('light');
    if (filteredTransactions.length === 0) {
      showToast('No transactions to export.', 'info');
      return;
    }

    const headers = ['Date & Time', 'Transaction ID', 'Type', 'Amount (BDT)', 'Status', 'Method', 'Account Number', 'Order / Ref'];
    const rows = filteredTransactions.map((tx) => {
      let dateStr = '';
      if (tx.createdAt) {
        const d = tx.createdAt.toDate ? tx.createdAt.toDate() : new Date(tx.createdAt);
        dateStr = d.toLocaleString();
      }
      return [
        `"${dateStr}"`,
        `"${tx.id}"`,
        `"${tx.type}"`,
        tx.amount,
        `"${tx.status}"`,
        `"${tx.paymentMethod || 'N/A'}"`,
        `"${tx.accountNumber || 'N/A'}"`,
        `"${tx.orderNumber ? `Order #${tx.orderNumber}` : tx.transactionId || ''}"`
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `reseller_wallet_statement_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('✓ Statement exported as CSV', 'success');
  };

  // Submit Deposit Request (Add Money)
  const handleRequestDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(depositAmount);

    if (isNaN(numAmount) || numAmount <= 0) {
      setDepositError('Enter a valid deposit amount.');
      return;
    }

    if (!depositAccountNumber.trim()) {
      setDepositError('Sender Account / Mobile number is required.');
      return;
    }

    if (!depositTransactionId.trim()) {
      setDepositError('Transaction ID (TxID) / Ref is required.');
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
        proofUrl: depositProofUrl || null,
        createdAt: serverTimestamp(),
      });

      setDepositSuccess(true);
      showToast('✓ Deposit request submitted for review', 'success');
      fetchWalletData();
    } catch (err: any) {
      console.error('Deposit request error:', err);
      setDepositError(err.message || 'Failed to submit deposit request.');
    } finally {
      setSubmittingDeposit(false);
    }
  };

  // Submit Payout Change Request
  const handleRequestPayoutChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingPayout(true);
    setPayoutModalError('');

    try {
      if (editPayoutMethod === 'bkash' && !editBkash.trim()) throw new Error('bKash number is required.');
      if (editPayoutMethod === 'nagad' && !editNagad.trim()) throw new Error('Nagad number is required.');
      if (editPayoutMethod === 'rocket' && !editRocket.trim()) throw new Error('Rocket number is required.');
      if (editPayoutMethod === 'bank' && (!editBankName.trim() || !editAccountNumber.trim() || !editAccountHolder.trim())) {
        throw new Error('Bank name, account holder, and account number are required.');
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

      setIsPayoutModalOpen(false);
      showToast('✓ Payout method request submitted for review', 'success');
      fetchWalletData();
    } catch (err: any) {
      console.error('Payout change error:', err);
      setPayoutModalError(err.message || 'Failed to submit payout update request.');
    } finally {
      setSubmittingPayout(false);
    }
  };

  // Share Receipt function using navigator.share or copy fallback
  const handleShareReceipt = (tx: WalletTransaction) => {
    triggerHaptic('light');
    const summary = `ReSellBD Payment Receipt\nRef: ${tx.id}\nType: ${tx.type.toUpperCase()}\nAmount: ৳${tx.amount}\nStatus: ${tx.status.toUpperCase()}\nDate: ${
      tx.createdAt?.toDate ? tx.createdAt.toDate().toLocaleString() : new Date().toLocaleString()
    }`;

    if (navigator.share) {
      navigator.share({ title: 'Payment Receipt', text: summary }).catch(() => {});
    } else {
      navigator.clipboard.writeText(summary);
      showToast('Receipt text copied to clipboard', 'info');
    }
  };

  // Withdraw disabled rules
  const availableBalance = wallet?.balance || 0;
  const hasPendingWithdraw = transactions.some((t) => t.type === 'withdrawal' && t.status === 'pending');
  const hasConfiguredPayout = Boolean(
    user.payoutMethod === 'bank' 
      ? (user.bankName && user.accountNumber) 
      : (user.bkashNumber || user.nagadNumber || user.rocketNumber)
  );

  let isWithdrawDisabled = false;
  let withdrawDisabledReason = '';
  if (availableBalance < 500) {
    isWithdrawDisabled = true;
    withdrawDisabledReason = 'Minimum withdrawal requirement is ৳500.';
  } else if (hasPendingWithdraw) {
    isWithdrawDisabled = true;
    withdrawDisabledReason = 'A withdrawal request is already pending approval.';
  } else if (!hasConfiguredPayout) {
    isWithdrawDisabled = true;
    withdrawDisabledReason = 'Please add a payout method first.';
  }

  // Official receiving accounts
  const receivingNumber = 
    depositPaymentMethod === 'bkash' ? '01700-112233' :
    depositPaymentMethod === 'nagad' ? '01800-445566' :
    depositPaymentMethod === 'rocket' ? '01900-778899' : '1501203948571 (BRAC Bank)';

  return (
    <div className={`space-y-3.5 pb-24 ${DT.sideMargin} selection:bg-[#0E9AA7]/20`}>
      
      {/* 1. COMPACT TOP ROW: Title + Hide/Show Balance Toggle */}
      <div className="flex items-center justify-between gap-2 pt-1 border-b border-slate-200/60 pb-2">
        <div className="min-w-0">
          <h2 className={DT.pageTitle}>
            {isAdminOrSuperAdmin ? 'Reseller Wallets' : 'Wallet'}
          </h2>
          <p className={DT.pageSubtitle}>
            {isAdminOrSuperAdmin
              ? 'Manage reseller balances & pending payout requests'
              : 'Passbook ledger, instant withdraw & payment history'}
          </p>
        </div>

        {/* Eye Toggle Icon Button */}
        <button
          onClick={toggleBalanceHidden}
          className={DT.iconButton}
          title={isBalanceHidden ? 'Show balance' : 'Hide balance'}
        >
          {isBalanceHidden ? <EyeOff className="w-4 h-4 text-slate-500" /> : <Eye className="w-4 h-4 text-[#0E9AA7]" />}
        </button>
      </div>

      {actionError && (
        <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[11px] flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* RESELLER VIEW */}
      {!isAdminOrSuperAdmin && (
        <>
          {/* 2. COMPACT BALANCE CARD (~110px high, glass over soft teal-to-navy tint) */}
          <div 
            className={`${DT.cardRadius} p-3 border shadow-[0_2px_12px_rgba(4,32,63,0.04)] relative overflow-hidden select-none space-y-2`}
            style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.92) 0%, rgba(240,249,255,0.85) 100%)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              borderColor: 'rgba(255, 255, 255, 0.9)',
            }}
          >
            {/* Top row: Label + Status Chip + Copy Reseller ID */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className={DT.metaLabel}>Available balance</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.2 rounded-full text-[9px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#3DD055] animate-pulse" />
                  <span>Ready</span>
                </span>
              </div>

              {/* Reseller ID button */}
              <button
                onClick={() => {
                  triggerHaptic('light');
                  const idText = formatResellerId(user);
                  navigator.clipboard.writeText(idText);
                  setCopiedId(true);
                  showToast('ID copied', 'info');
                  setTimeout(() => setCopiedId(false), 1500);
                }}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 border border-slate-200/80 text-slate-700 font-mono font-bold text-[10px] transition-colors cursor-pointer"
              >
                <span>ID: {formatResellerId(user)}</span>
                {copiedId ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-slate-400" />}
              </button>
            </div>

            {/* Balance Numerals */}
            <div className="pt-0.5">
              <div className={DT.balanceAmount}>
                {isBalanceHidden ? (
                  <span className="text-slate-400">••••</span>
                ) : (
                  <div className="flex items-baseline gap-0.5">
                    <span className="text-lg font-bold text-[#0E9AA7]">৳</span>
                    <AnimatedCounter value={availableBalance} />
                  </div>
                )}
              </div>
            </div>

            {/* Tiny bottom info line on card */}
            <div className="pt-1 border-t border-slate-200/60 flex items-center justify-between text-[10px] font-semibold text-slate-500">
              <div>
                <span>Pending Commission: </span>
                <span className="font-mono font-bold text-[#0E9AA7]">
                  {isBalanceHidden ? '••••' : `৳${monthlyMetrics.pendingCommission.toLocaleString()}`}
                </span>
              </div>
              <div>
                <span>On hold: </span>
                <span className="font-mono font-bold text-slate-600">
                  {isBalanceHidden ? '••••' : '৳0'}
                </span>
              </div>
            </div>
          </div>

          {/* 3. QUICK ACTIONS ROW (5 small icon tiles, icon 18px + label 10px) */}
          <div className="grid grid-cols-5 gap-1.5 text-center">
            {/* 1. Add Money */}
            <button
              onClick={() => {
                triggerHaptic('light');
                setDepositError('');
                setDepositSuccess(false);
                setIsDepositModalOpen(true);
              }}
              className="p-2 rounded-xl bg-white/80 hover:bg-white border border-slate-200/80 flex flex-col items-center justify-center gap-1 transition-all active:scale-95 shadow-2xs cursor-pointer min-h-[58px]"
            >
              <div className="w-7 h-7 rounded-lg bg-emerald-50 text-[#3DD055] border border-emerald-100 flex items-center justify-center">
                <Plus className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-bold text-slate-800 leading-none">Add Money</span>
            </button>

            {/* 2. Withdraw */}
            <button
              onClick={() => {
                if (isWithdrawDisabled) {
                  showToast(withdrawDisabledReason, 'info');
                  return;
                }
                triggerHaptic('light');
                setIsWithdrawModalOpen(true);
              }}
              className={`p-2 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all active:scale-95 shadow-2xs cursor-pointer min-h-[58px] ${
                isWithdrawDisabled
                  ? 'bg-slate-50 text-slate-400 border-slate-200/60 opacity-60'
                  : 'bg-white/80 hover:bg-white border-slate-200/80'
              }`}
            >
              <div className="w-7 h-7 rounded-lg bg-blue-50 text-[#04203F] border border-blue-100 flex items-center justify-center">
                <ArrowUpRight className="w-4 h-4 text-[#04203F]" />
              </div>
              <span className="text-[10px] font-bold text-slate-800 leading-none">Withdraw</span>
            </button>

            {/* 3. Statement */}
            <button
              onClick={handleDownloadStatement}
              className="p-2 rounded-xl bg-white/80 hover:bg-white border border-slate-200/80 flex flex-col items-center justify-center gap-1 transition-all active:scale-95 shadow-2xs cursor-pointer min-h-[58px]"
            >
              <div className="w-7 h-7 rounded-lg bg-teal-50 text-[#0E9AA7] border border-teal-100 flex items-center justify-center">
                <Download className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-bold text-slate-800 leading-none">Statement</span>
            </button>

            {/* 4. Payout Accounts */}
            <button
              onClick={() => {
                triggerHaptic('light');
                document.getElementById('payout-section')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="p-2 rounded-xl bg-white/80 hover:bg-white border border-slate-200/80 flex flex-col items-center justify-center gap-1 transition-all active:scale-95 shadow-2xs cursor-pointer min-h-[58px]"
            >
              <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center">
                <CreditCard className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-bold text-slate-800 leading-none">Accounts</span>
            </button>

            {/* 5. Support */}
            <button
              onClick={() => {
                triggerHaptic('light');
                window.dispatchEvent(new CustomEvent('sky_navigate_tab', { detail: { tab: 'support' } }));
              }}
              className="p-2 rounded-xl bg-white/80 hover:bg-white border border-slate-200/80 flex flex-col items-center justify-center gap-1 transition-all active:scale-95 shadow-2xs cursor-pointer min-h-[58px]"
            >
              <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center">
                <HelpCircle className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-bold text-slate-800 leading-none">Support</span>
            </button>
          </div>

          {/* 6. STATS ROW (4 mini tiles in a 2x2 grid) */}
          <div className="grid grid-cols-2 gap-2">
            {/* Earned this month */}
            <div className={`${DT.cardRadius} ${DT.cardGlass} p-2.5 flex items-center justify-between`}>
              <div>
                <span className={DT.metaLabel}>Earned (Month)</span>
                <span className="text-[14px] font-extrabold text-[#3DD055] font-mono tabular-nums block mt-0.5">
                  {isBalanceHidden ? '••••' : `+৳${monthlyMetrics.earnedThisMonth.toLocaleString()}`}
                </span>
              </div>
              <ArrowDownLeft className="w-4 h-4 text-[#3DD055] shrink-0" />
            </div>

            {/* Withdrawn this month */}
            <div className={`${DT.cardRadius} ${DT.cardGlass} p-2.5 flex items-center justify-between`}>
              <div>
                <span className={DT.metaLabel}>Withdrawn (Month)</span>
                <span className="text-[14px] font-extrabold text-[#04203F] font-mono tabular-nums block mt-0.5">
                  {isBalanceHidden ? '••••' : `-৳${monthlyMetrics.withdrawnThisMonth.toLocaleString()}`}
                </span>
              </div>
              <ArrowUpRight className="w-4 h-4 text-[#04203F] shrink-0" />
            </div>

            {/* Lifetime earned */}
            <div className={`${DT.cardRadius} ${DT.cardGlass} p-2.5 flex items-center justify-between`}>
              <div>
                <span className={DT.metaLabel}>Lifetime Earned</span>
                <span className="text-[14px] font-extrabold text-slate-900 font-mono tabular-nums block mt-0.5">
                  {isBalanceHidden ? '••••' : `৳${(wallet?.totalEarned || 0).toLocaleString()}`}
                </span>
              </div>
              <DollarSign className="w-4 h-4 text-emerald-600 shrink-0" />
            </div>

            {/* Total withdrawn */}
            <div className={`${DT.cardRadius} ${DT.cardGlass} p-2.5 flex items-center justify-between`}>
              <div>
                <span className={DT.metaLabel}>Total Withdrawn</span>
                <span className="text-[14px] font-extrabold text-slate-900 font-mono tabular-nums block mt-0.5">
                  {isBalanceHidden ? '••••' : `৳${(wallet?.totalWithdrawn || 0).toLocaleString()}`}
                </span>
              </div>
              <Clock className="w-4 h-4 text-teal-600 shrink-0" />
            </div>
          </div>

          {/* 7. EARNINGS MINI CHART (Height ~110px, toggle 7 Days / 6 Months) */}
          <div className={`${DT.cardRadius} ${DT.cardGlass} p-3 space-y-2`}>
            <div className="flex items-center justify-between">
              <span className={DT.sectionTitle}>Earnings Mini Chart</span>
              
              {/* Toggle Buttons */}
              <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                <button
                  onClick={() => setChartPeriod('7days')}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                    chartPeriod === '7days' ? 'bg-[#04203F] text-white shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  7 Days
                </button>
                <button
                  onClick={() => setChartPeriod('6months')}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                    chartPeriod === '6months' ? 'bg-[#04203F] text-white shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  6 Months
                </button>
              </div>
            </div>

            <div className="h-[90px] pt-3 pb-1 flex items-end justify-between gap-1.5 border-b border-slate-200/60">
              {chartData.bars.map((b, idx) => {
                const heightPct = Math.max(12, Math.round((b.amount / chartData.maxAmount) * 100));
                const isHovered = activeChartIndex === idx;

                return (
                  <div
                    key={b.key}
                    onClick={() => {
                      triggerHaptic('light');
                      setActiveChartIndex(isHovered ? null : idx);
                    }}
                    className="flex-1 flex flex-col items-center justify-end h-full cursor-pointer group"
                  >
                    {isHovered && (
                      <span className="text-[9px] font-mono font-extrabold text-[#04203F] bg-white px-1 rounded shadow-2xs border border-slate-200 mb-0.5">
                        ৳{b.amount.toLocaleString()}
                      </span>
                    )}
                    <div 
                      className={`w-full max-w-[22px] rounded-t-md transition-all duration-200 ${
                        isHovered ? 'bg-[#0E9AA7]' : 'bg-[#04203F]/80 group-hover:bg-[#0E9AA7]'
                      }`}
                      style={{ height: `${heightPct}%` }}
                    />
                    <span className="text-[9px] font-bold text-slate-400 mt-1">{b.label}</span>
                  </div>
                );
              })}
            </div>

            {/* Tiny summary line */}
            <div className="text-[10px] text-slate-500 font-medium flex items-center justify-between pt-0.5">
              <span>Best month: <strong className="text-slate-800">{chartData.bestBar?.label || 'N/A'}</strong></span>
              <span className="font-mono font-bold text-[#0E9AA7]">৳{(chartData.bestBar?.amount || 0).toLocaleString()}</span>
            </div>
          </div>

          {/* 8. PENDING REQUESTS LIST (Only when any pending) */}
          {(() => {
            const pendingList = transactions.filter((t) => t.status === 'pending');
            if (pendingList.length === 0) return null;

            return (
              <div className="space-y-1.5">
                <span className={DT.sectionTitle}>Pending Requests</span>
                <div className="space-y-1.5">
                  {pendingList.map((tx) => (
                    <div
                      key={tx.id}
                      className="p-2.5 rounded-xl bg-amber-50/80 border border-amber-200 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 truncate">
                            Pending {tx.type === 'deposit' ? 'Deposit' : 'Withdrawal'}: ৳{tx.amount}
                          </p>
                          <p className="text-[10px] text-slate-500 truncate font-mono">
                            {tx.paymentMethod?.toUpperCase()} ({tx.accountNumber || ''})
                          </p>
                        </div>
                      </div>

                      <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 shrink-0">
                        Pending
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* 9. PAYOUT ACCOUNTS SECTION */}
          <div 
            id="payout-section"
            className={`${DT.cardRadius} ${DT.cardGlass} p-3 space-y-2.5`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <CreditCard className="w-4 h-4 text-[#0E9AA7]" />
                <h3 className={DT.sectionTitle}>Payout Accounts</h3>
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
                  setEditAccountHolder(user.accountHolderName || user.fullName || '');
                  setEditAccountNumber(user.accountNumber || '');
                  setEditBranchName(user.branchName || '');
                  setPayoutModalError('');
                  setIsPayoutModalOpen(true);
                }}
                className={DT.smallButton}
              >
                <Edit3 className="w-3 h-3" />
                <span>{hasConfiguredPayout ? 'Edit Account' : 'Add Account'}</span>
              </button>
            </div>

            {/* Pending Payout Request Notice */}
            {pendingPayoutRequest && (
              <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[11px] flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>Account update request to <strong className="uppercase">{pendingPayoutRequest.payoutMethod}</strong> is pending review.</span>
              </div>
            )}

            {!hasConfiguredPayout ? (
              <div className="p-3 rounded-xl border border-dashed border-slate-200 text-center space-y-2 bg-slate-50/50">
                <p className="text-[11px] text-slate-500 font-medium">No payout method yet</p>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setIsPayoutModalOpen(true);
                  }}
                  className={DT.primaryButton}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add payout method</span>
                </button>
              </div>
            ) : (
              <div className="p-2.5 bg-white/90 rounded-xl border border-slate-200/80 space-y-1 text-xs">
                {(() => {
                  const method = user.payoutMethod || 'bkash';
                  const rawNumber = method === 'bkash' 
                    ? user.bkashNumber 
                    : method === 'nagad' 
                    ? user.nagadNumber 
                    : method === 'rocket' 
                    ? user.rocketNumber 
                    : user.accountNumber;
                  const masked = rawNumber && rawNumber.length > 4 
                    ? `•••• ${rawNumber.slice(-4)}` 
                    : (rawNumber || 'Not set');

                  return (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold uppercase text-[#04203F] bg-slate-100 px-2 py-0.5 rounded text-[10px]">
                          {method}
                        </span>
                        <span className="font-semibold text-slate-800 text-[11px]">
                          {user.accountHolderName || user.fullName}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-700 text-[11px]">{masked}</span>
                        <span className="text-[9px] font-extrabold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                          Default
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {/* 10. TRANSACTION HISTORY / LEDGER */}
          <div className={`${DT.cardRadius} ${DT.cardGlass} p-3 space-y-2.5`}>
            
            {/* Header + Search Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-[#0E9AA7]" />
                  <h3 className={DT.sectionTitle}>Transaction Ledger</h3>
                </div>

                <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                  {filteredTransactions.length} entries
                </span>
              </div>

              {/* Search Box */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by ID, order #, channel..."
                  value={txSearchTerm}
                  onChange={(e) => {
                    setTxSearchTerm(e.target.value);
                    setVisibleCount(20);
                  }}
                  className="w-full h-[32px] pl-8 pr-7 text-[11px] bg-slate-50/80 border border-slate-200 rounded-lg outline-none focus:border-[#0E9AA7]"
                />
                {txSearchTerm && (
                  <button onClick={() => setTxSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Filter Chips + Status + Month + Sort Controls */}
            <div className="space-y-1.5">
              {/* Type Filter Chips */}
              <div className="flex items-center gap-1 overflow-x-auto scrollbar-none pb-0.5">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'commission', label: 'Earned' },
                  { id: 'deposit', label: 'Deposit' },
                  { id: 'withdrawal', label: 'Withdraw' },
                  { id: 'adjustment', label: 'Adjustment' },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => {
                      triggerHaptic('light');
                      setTxFilter(f.id as any);
                      setVisibleCount(20);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all cursor-pointer ${
                      txFilter === f.id ? 'bg-[#04203F] text-white shadow-2xs' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Status & Month & Sort Row */}
              <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                {/* Status Filter */}
                <select
                  value={txStatusFilter}
                  onChange={(e) => setTxStatusFilter(e.target.value as any)}
                  className="h-[28px] px-1.5 bg-slate-50 border border-slate-200 rounded-md font-semibold text-slate-700 outline-none"
                >
                  <option value="all">Status: All</option>
                  <option value="approved">Approved</option>
                  <option value="pending">Pending</option>
                  <option value="rejected">Rejected</option>
                </select>

                {/* Month Picker */}
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="h-[28px] px-1.5 bg-slate-50 border border-slate-200 rounded-md font-semibold text-slate-700 outline-none"
                >
                  <option value="all">Month: All</option>
                  <option value="this_month">This Month</option>
                  <option value="last_month">Last Month</option>
                </select>

                {/* Sort */}
                <select
                  value={sortOption}
                  onChange={(e) => setSortOption(e.target.value as any)}
                  className="h-[28px] px-1.5 bg-slate-50 border border-slate-200 rounded-md font-semibold text-slate-700 outline-none"
                >
                  <option value="newest">Newest</option>
                  <option value="oldest">Oldest</option>
                  <option value="amount_high">Highest ৳</option>
                </select>
              </div>
            </div>

            {/* Totals Strip for Current Filter */}
            <div className="p-2 rounded-lg bg-slate-100/90 border border-slate-200/80 flex items-center justify-between text-[11px] font-bold">
              <div>
                <span className="text-slate-400">In: </span>
                <span className="text-[#3DD055] font-mono">+৳{ledgerTotals.totalIn.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-slate-400">Out: </span>
                <span className="text-[#04203F] font-mono">-৳{ledgerTotals.totalOut.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-slate-400">Net: </span>
                <span className="text-[#0E9AA7] font-mono">৳{ledgerTotals.net.toLocaleString()}</span>
              </div>
            </div>

            {/* Transaction Rows (52px High, 28px Round Icon) */}
            {filteredTransactions.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl space-y-1">
                <p className="font-semibold text-slate-600">No matching entries</p>
                <p className="text-[11px]">Try clearing search keywords or selecting different filter options.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {(() => {
                  // Group by date
                  const grouped: { [key: string]: WalletTransaction[] } = {};
                  filteredTransactions.slice(0, visibleCount).forEach((tx) => {
                    let dateLabel = 'Past';
                    if (tx.createdAt) {
                      const d = tx.createdAt.toDate ? tx.createdAt.toDate() : new Date(tx.createdAt);
                      const now = new Date();
                      if (d.toDateString() === now.toDateString()) {
                        dateLabel = 'Today';
                      } else {
                        const y = new Date();
                        y.setDate(now.getDate() - 1);
                        if (d.toDateString() === y.toDateString()) {
                          dateLabel = 'Yesterday';
                        } else {
                          dateLabel = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
                        }
                      }
                    }
                    if (!grouped[dateLabel]) grouped[dateLabel] = [];
                    grouped[dateLabel].push(tx);
                  });

                  return Object.entries(grouped).map(([dateLabel, items]) => (
                    <div key={dateLabel} className="space-y-1">
                      <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider px-1 pt-1">
                        {dateLabel}
                      </div>

                      <div className="divide-y divide-slate-100 border-t border-b border-slate-200/60">
                        {items.map((tx) => {
                          const isCredit = tx.type === 'commission' || tx.type === 'deposit';
                          const timeStr = tx.createdAt?.toDate 
                            ? tx.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            : '';

                          const title = tx.type === 'commission'
                            ? `Commission: Order #${tx.orderNumber || ''}`
                            : tx.type === 'deposit'
                            ? `Deposit (${tx.paymentMethod?.toUpperCase() || ''})`
                            : tx.type === 'withdrawal'
                            ? `Withdrawal (${tx.paymentMethod?.toUpperCase() || ''})`
                            : 'Adjustment';

                          const statusBadge = tx.status === 'approved'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : tx.status === 'pending'
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200';

                          return (
                            <div
                              key={tx.id}
                              onClick={() => {
                                triggerHaptic('light');
                                setSelectedTxDetail(tx);
                              }}
                              className={`${DT.txRowHeight} px-1.5 flex items-center justify-between gap-2.5 hover:bg-slate-50/80 transition-colors cursor-pointer group`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                {/* 28px Round Icon */}
                                <div className={`${DT.txIconSize} rounded-full flex items-center justify-center shrink-0 border ${
                                  isCredit ? 'bg-emerald-50 border-emerald-200 text-[#3DD055]' : 'bg-slate-100 border-slate-200 text-[#04203F]'
                                }`}>
                                  {isCredit ? <ArrowDownLeft className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                                </div>

                                <div className="min-w-0">
                                  <p className="text-[12px] font-bold text-[#04203F] truncate group-hover:text-[#0E9AA7] transition-colors">
                                    {title}
                                  </p>
                                  <p className="text-[10px] text-slate-400 font-medium">
                                    {timeStr}
                                  </p>
                                </div>
                              </div>

                              <div className="text-right shrink-0">
                                <span className={`text-[13px] font-mono font-extrabold block ${
                                  isCredit ? 'text-[#3DD055]' : 'text-[#04203F]'
                                }`}>
                                  {isCredit ? '+' : '-'}৳{tx.amount?.toLocaleString()}
                                </span>
                                <span className={`inline-block text-[8px] font-bold uppercase px-1.5 py-0.2 rounded border ${statusBadge}`}>
                                  {tx.status}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ));
                })()}

                {/* Load More */}
                {visibleCount < filteredTransactions.length && (
                  <div className="pt-2 text-center">
                    <button
                      onClick={() => setVisibleCount((prev) => prev + 20)}
                      className={DT.smallButton}
                    >
                      Load more entries
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 11. SMALL INFO NOTICE AT BOTTOM */}
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px] text-slate-600 flex items-center justify-between">
            <span>Payout requests are reviewed within 24 hours. Need help?</span>
            <button
              onClick={() => {
                triggerHaptic('light');
                window.dispatchEvent(new CustomEvent('sky_navigate_tab', { detail: { tab: 'support' } }));
              }}
              className="font-bold text-[#0E9AA7] hover:underline shrink-0"
            >
              Contact support
            </button>
          </div>
        </>
      )}

      {/* ADMIN & SUPER ADMIN DIRECTORY */}
      {isAdminOrSuperAdmin && (
        <div className="space-y-4">
          <AdminWithdrawalManager user={user} />

          {/* Pending Deposit Requests Table */}
          <div className={`${DT.cardRadius} bg-white border border-slate-200 p-4 space-y-3`}>
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-emerald-600" />
                <span>Pending Top-up Requests</span>
              </h3>
              <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                {pendingDeposits.length} Pending
              </span>
            </div>

            {pendingDeposits.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4 border border-dashed border-slate-200 rounded-xl">
                No pending deposit top-up requests.
              </p>
            ) : (
              <div className="space-y-2">
                {pendingDeposits.map((tx) => (
                  <div key={tx.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-2 text-xs">
                    <div>
                      <p className="font-bold text-slate-900">{tx.resellerShopName || tx.resellerName}</p>
                      <p className="text-[10px] text-slate-500 font-mono">
                        {tx.paymentMethod?.toUpperCase()} · {tx.accountNumber} · TxID: {tx.transactionId}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono font-extrabold text-emerald-600 text-xs">৳{tx.amount}</span>
                      <button
                        onClick={() => {
                          triggerHaptic('light');
                          setProcessingTxId(tx.id);
                          runTransaction(db, async (transaction) => {
                            const txRef = doc(db, 'transactions', tx.id);
                            const walletRef = doc(db, 'wallets', tx.resellerId);
                            const walletSnap = await transaction.get(walletRef);
                            let balance = 0;
                            if (walletSnap.exists()) balance = walletSnap.data().balance || 0;
                            transaction.set(walletRef, { resellerId: tx.resellerId, balance: balance + tx.amount, updatedAt: serverTimestamp() }, { merge: true });
                            transaction.update(txRef, { status: 'approved', updatedAt: serverTimestamp() });
                          }).then(() => {
                            showToast('✓ Deposit approved', 'success');
                            fetchWalletData();
                          }).catch((e) => setActionError(e.message)).finally(() => setProcessingTxId(null));
                        }}
                        disabled={processingTxId === tx.id}
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] rounded-lg transition-colors cursor-pointer"
                      >
                        Approve
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: Deposit Request (Add Money Flow) */}
      {isDepositModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto animate-in zoom-in-95 duration-150 text-xs">
            <div className="flex items-center justify-between px-4 py-3 bg-[#04203F] text-white">
              <div className="flex items-center gap-2">
                <WalletIcon className="w-4 h-4 text-[#3DD055]" />
                <h3 className="text-sm font-bold">Add Money / Deposit</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsDepositModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {depositSuccess ? (
              <div className="p-5 text-center space-y-3">
                <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                  <Check className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-slate-900">Request Submitted</h4>
                <p className="text-[11px] text-slate-500">
                  Your deposit request of <strong>৳{depositAmount}</strong> via {depositPaymentMethod.toUpperCase()} has been submitted. It will be credited once verified by administrators.
                </p>
                <button
                  onClick={() => setIsDepositModalOpen(false)}
                  className="w-full py-2 rounded-xl bg-[#04203F] text-white font-bold text-xs"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleRequestDeposit} className="p-4 space-y-3">
                {depositError && (
                  <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[11px] flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{depositError}</span>
                  </div>
                )}

                {/* Amount */}
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-600 uppercase">Deposit Amount (BDT) *</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={100}
                    placeholder="e.g. 1000"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    className="w-full h-[36px] px-3 font-mono font-bold text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-[#0E9AA7]"
                    required
                  />
                  {/* Quick Chips */}
                  <div className="flex items-center gap-1.5 pt-1">
                    {[500, 1000, 2000, 5000].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setDepositAmount(amt.toString())}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          depositAmount === amt.toString() ? 'bg-[#04203F] text-white' : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        ৳{amt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Payment Channel Selector */}
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-600 uppercase">Select Channel *</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: 'bkash', label: 'bKash' },
                      { id: 'nagad', label: 'Nagad' },
                      { id: 'bank_transfer', label: 'Bank' },
                    ].map((ch) => (
                      <button
                        key={ch.id}
                        type="button"
                        onClick={() => setDepositPaymentMethod(ch.id as any)}
                        className={`py-1.5 rounded-lg border font-bold text-center transition-all ${
                          depositPaymentMethod === ch.id ? 'bg-[#04203F] text-white border-[#04203F]' : 'bg-slate-50 border-slate-200 text-slate-700'
                        }`}
                      >
                        {ch.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Receiving Account Box with Copy */}
                <div className="p-2.5 bg-slate-900 text-white rounded-xl flex items-center justify-between text-[11px]">
                  <div>
                    <span className="text-[9px] text-slate-400 font-bold uppercase block">Send money to ({depositPaymentMethod})</span>
                    <span className="font-mono font-bold">{receivingNumber}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const numOnly = receivingNumber.replace(/[^0-9]/g, '');
                      navigator.clipboard.writeText(numOnly);
                      setCopiedReceivingNum(true);
                      showToast('Number copied', 'info');
                      setTimeout(() => setCopiedReceivingNum(false), 1500);
                    }}
                    className="px-2 py-1 bg-[#0E9AA7] text-white text-[10px] font-bold rounded-md flex items-center gap-1 cursor-pointer"
                  >
                    <Copy className="w-3 h-3" />
                    <span>{copiedReceivingNum ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>

                {/* Sender Account */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Sender Account / Phone Number *</label>
                  <input
                    type="text"
                    placeholder="017XXXXXXXX"
                    value={depositAccountNumber}
                    onChange={(e) => setDepositAccountNumber(e.target.value)}
                    className="w-full h-[34px] px-3 font-mono font-bold bg-slate-50 border border-slate-200 rounded-xl outline-none"
                    required
                  />
                </div>

                {/* Transaction ID */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Transaction ID (TxID) / Ref *</label>
                  <input
                    type="text"
                    placeholder="e.g. 9K27B6X19W"
                    value={depositTransactionId}
                    onChange={(e) => setDepositTransactionId(e.target.value)}
                    className="w-full h-[34px] px-3 font-mono font-bold bg-slate-50 border border-slate-200 rounded-xl outline-none"
                    required
                  />
                </div>

                <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsDepositModalOpen(false)}
                    className="px-3.5 py-1.5 rounded-xl bg-slate-100 text-slate-700 font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingDeposit}
                    className="px-4 py-1.5 rounded-xl bg-[#04203F] hover:bg-[#0E9AA7] text-white font-bold transition-all disabled:opacity-50"
                  >
                    {submittingDeposit ? 'Submitting...' : 'Submit Deposit'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* MODAL: Request Withdrawal */}
      {isWithdrawModalOpen && (
        <WithdrawalRequestForm
          user={user}
          availableBalance={availableBalance}
          onSuccess={() => {
            setIsWithdrawModalOpen(false);
            fetchWalletData();
          }}
          onCancel={() => setIsWithdrawModalOpen(false)}
        />
      )}

      {/* MODAL: Edit Payout Account Request */}
      {isPayoutModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-md my-auto bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-xs">
            <div className="flex items-center justify-between px-4 py-3 bg-[#04203F] text-white">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-[#0E9AA7]" />
                <h3 className="text-sm font-bold">Edit Payout Account</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsPayoutModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRequestPayoutChange} className="p-4 space-y-3">
              <div className="bg-teal-50 border border-teal-200 rounded-xl p-2.5 text-[10px] text-[#0E9AA7] flex items-start gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>Account updates are reviewed by administrators before taking effect.</span>
              </div>

              {payoutModalError && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[11px] flex items-center gap-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{payoutModalError}</span>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Payout Method</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { id: 'bkash', name: 'bKash' },
                    { id: 'nagad', name: 'Nagad' },
                    { id: 'rocket', name: 'Rocket' },
                    { id: 'bank', name: 'Bank' },
                  ].map((m) => (
                    <button
                      type="button"
                      key={m.id}
                      onClick={() => setEditPayoutMethod(m.id as any)}
                      className={`py-1.5 rounded-lg border text-[11px] font-bold transition-all text-center ${
                        editPayoutMethod === m.id ? 'bg-[#04203F] text-white border-[#04203F]' : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
              </div>

              {editPayoutMethod === 'bkash' && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-0.5">bKash Number *</label>
                  <input
                    type="text"
                    required
                    value={editBkash}
                    onChange={(e) => setEditBkash(e.target.value)}
                    placeholder="017XXXXXXXX"
                    className="w-full h-[32px] px-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none font-mono font-bold"
                  />
                </div>
              )}

              {editPayoutMethod === 'nagad' && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Nagad Number *</label>
                  <input
                    type="text"
                    required
                    value={editNagad}
                    onChange={(e) => setEditNagad(e.target.value)}
                    placeholder="018XXXXXXXX"
                    className="w-full h-[32px] px-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none font-mono font-bold"
                  />
                </div>
              )}

              {editPayoutMethod === 'rocket' && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Rocket Number *</label>
                  <input
                    type="text"
                    required
                    value={editRocket}
                    onChange={(e) => setEditRocket(e.target.value)}
                    placeholder="019XXXXXXXX"
                    className="w-full h-[32px] px-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none font-mono font-bold"
                  />
                </div>
              )}

              {editPayoutMethod === 'bank' && (
                <div className="space-y-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Bank Name *</label>
                    <input
                      type="text"
                      required
                      value={editBankName}
                      onChange={(e) => setEditBankName(e.target.value)}
                      placeholder="e.g. BRAC Bank"
                      className="w-full h-[32px] px-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Account Holder Name *</label>
                    <input
                      type="text"
                      required
                      value={editAccountHolder}
                      onChange={(e) => setEditAccountHolder(e.target.value)}
                      placeholder="Name on Bank Account"
                      className="w-full h-[32px] px-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Account Number *</label>
                    <input
                      type="text"
                      required
                      value={editAccountNumber}
                      onChange={(e) => setEditAccountNumber(e.target.value)}
                      placeholder="150XXXXXXXXXX"
                      className="w-full h-[32px] px-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none font-mono font-bold"
                    />
                  </div>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsPayoutModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-100 text-slate-700 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingPayout}
                  className="px-4 py-1.5 rounded-xl bg-[#04203F] hover:bg-[#0E9AA7] text-white font-bold transition-all disabled:opacity-50"
                >
                  {submittingPayout ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Transaction Detail Bottom Sheet */}
      {selectedTxDetail && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-3 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border border-slate-200 p-4 space-y-3 animate-in slide-in-from-bottom duration-150 text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-[#0E9AA7]" />
                <h3 className="text-xs font-bold text-slate-900">Transaction Entry</h3>
              </div>
              <button
                onClick={() => setSelectedTxDetail(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="text-[9px] text-slate-400 font-bold uppercase block">Amount</span>
                  <span className={`text-base font-mono font-extrabold ${
                    selectedTxDetail.type === 'commission' || selectedTxDetail.type === 'deposit'
                      ? 'text-[#3DD055]'
                      : 'text-[#04203F]'
                  }`}>
                    ৳{selectedTxDetail.amount?.toLocaleString()}
                  </span>
                </div>
                <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-800">
                  {selectedTxDetail.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono">
                <div className="p-2 bg-slate-50 rounded-lg border border-slate-200/80">
                  <span className="text-[9px] text-slate-400 font-bold block font-sans uppercase">Ref ID</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(selectedTxDetail.id);
                      setCopiedDetailTxId(true);
                      showToast('Copied Ref ID', 'info');
                      setTimeout(() => setCopiedDetailTxId(false), 1500);
                    }}
                    className="font-bold text-slate-800 truncate block text-left hover:text-[#0E9AA7]"
                  >
                    {selectedTxDetail.id.slice(0, 10)}... {copiedDetailTxId ? '✓' : ''}
                  </button>
                </div>
                <div className="p-2 bg-slate-50 rounded-lg border border-slate-200/80">
                  <span className="text-[9px] text-slate-400 font-bold block font-sans uppercase">Type</span>
                  <span className="font-bold text-[#04203F] uppercase">{selectedTxDetail.type}</span>
                </div>
              </div>

              {selectedTxDetail.orderNumber && (
                <div className="p-2.5 bg-blue-50/80 border border-blue-200 rounded-xl flex items-center justify-between text-xs">
                  <div>
                    <span className="text-[9px] text-blue-700 font-bold block">Linked Order</span>
                    <span className="font-mono font-bold text-blue-900">Order #{selectedTxDetail.orderNumber}</span>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedTxDetail(null);
                      window.dispatchEvent(new CustomEvent('sky_navigate_tab', { detail: { tab: 'orders' } }));
                    }}
                    className="px-2.5 py-1 rounded-lg bg-blue-600 text-white font-bold text-[10px] flex items-center gap-1"
                  >
                    <span>View Order</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              )}

              {selectedTxDetail.paymentMethod && (
                <div className="p-2.5 bg-slate-50 border border-slate-200/80 rounded-xl space-y-0.5">
                  <span className="text-[9px] text-slate-400 font-bold block uppercase">Payment Channel</span>
                  <p className="font-semibold text-slate-800 uppercase text-[11px]">
                    {selectedTxDetail.paymentMethod} {selectedTxDetail.accountNumber ? `(${selectedTxDetail.accountNumber})` : ''}
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={() => handleShareReceipt(selectedTxDetail)}
                className="py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-1"
              >
                <Share2 className="w-3.5 h-3.5 text-[#0E9AA7]" />
                <span>Share Receipt</span>
              </button>
              <button
                onClick={() => setSelectedTxDetail(null)}
                className="py-2 rounded-xl bg-[#04203F] hover:bg-[#0E9AA7] text-white text-xs font-bold transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
