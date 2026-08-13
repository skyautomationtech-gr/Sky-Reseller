import React, { useState } from 'react';
import { collection, addDoc, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserProfile, WithdrawalPaymentMethod, WithdrawalRequest } from '../../types';
import { logAuditAction } from '../../lib/auditLogger';
import { 
  DollarSign, ArrowUpRight, CheckCircle2, AlertTriangle, Loader2, Copy, Check,
  Paperclip, X, FileText, Smartphone, Building2, ShieldCheck, ArrowLeft, Info, HelpCircle
} from 'lucide-react';

interface WithdrawalRequestFormProps {
  user: UserProfile;
  availableBalance: number;
  onSuccess?: (requestId: string) => void;
  onCancel?: () => void;
}

const PAYMENT_METHODS: {
  id: WithdrawalPaymentMethod;
  label: string;
  sublabel: string;
  icon: React.ElementType;
  accentBg: string;
  accentBorder: string;
  accentText: string;
  activeRing: string;
  placeholder: string;
}[] = [
  {
    id: 'bKash',
    label: 'bKash',
    sublabel: 'Personal or Agent Mobile Wallet',
    icon: Smartphone,
    accentBg: 'bg-pink-50 hover:bg-pink-100/80',
    accentBorder: 'border-pink-300',
    accentText: 'text-pink-700',
    activeRing: 'ring-2 ring-pink-500/30 border-pink-500',
    placeholder: 'Phone number (017xxxxxxxx)',
  },
  {
    id: 'Nagad',
    label: 'Nagad',
    sublabel: 'Postal MFS Account',
    icon: Smartphone,
    accentBg: 'bg-orange-50 hover:bg-orange-100/80',
    accentBorder: 'border-orange-300',
    accentText: 'text-orange-700',
    activeRing: 'ring-2 ring-orange-500/30 border-orange-500',
    placeholder: 'Phone number (018xxxxxxxx)',
  },
  {
    id: 'Rocket',
    label: 'Rocket',
    sublabel: 'DBBL Mobile Banking',
    icon: Smartphone,
    accentBg: 'bg-purple-50 hover:bg-purple-100/80',
    accentBorder: 'border-purple-300',
    accentText: 'text-purple-700',
    activeRing: 'ring-2 ring-purple-500/30 border-purple-500',
    placeholder: 'Phone number (019xxxxxxxx)',
  },
  {
    id: 'Bank Transfer',
    label: 'Bank Transfer',
    sublabel: 'Direct Commercial Bank Account',
    icon: Building2,
    accentBg: 'bg-blue-50 hover:bg-blue-100/80',
    accentBorder: 'border-blue-300',
    accentText: 'text-blue-700',
    activeRing: 'ring-2 ring-blue-500/30 border-blue-500',
    placeholder: 'Account number (e.g. 150.110.XXXXXX)',
  },
];

export const WithdrawalRequestForm: React.FC<WithdrawalRequestFormProps> = ({
  user,
  availableBalance,
  onSuccess,
  onCancel,
}) => {
  const [amount, setAmount] = useState<string>('500');
  const [paymentMethod, setPaymentMethod] = useState<WithdrawalPaymentMethod>('bKash');
  const [accountDetails, setAccountDetails] = useState<string>('');
  const [accountHolderName, setAccountHolderName] = useState<string>('');
  const [bankName, setBankName] = useState<string>('');

  // Proof file state
  const [proofFile, setProofFile] = useState<{ name: string; url: string; type: string } | null>(null);

  // Form handling state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>('');
  const [submittedRequestId, setSubmittedRequestId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const numAmount = parseFloat(amount) || 0;
  const remainingBalance = availableBalance - numAmount;
  const isBalanceExceeded = numAmount > availableBalance;
  const isBelowMinimum = numAmount > 0 && numAmount < 500;

  const currentMethodConfig = PAYMENT_METHODS.find((m) => m.id === paymentMethod) || PAYMENT_METHODS[0];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError('Proof file size must be less than 5MB.');
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      setError('Only JPG, PNG, WEBP images or PDF files are allowed.');
      return;
    }

    setError('');
    const reader = new FileReader();
    reader.onload = (evt) => {
      if (evt.target?.result) {
        setProofFile({
          name: file.name,
          url: evt.target.result as string,
          type: file.type,
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validations
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Please enter a valid withdrawal amount.');
      return;
    }

    if (numAmount < 500) {
      setError('Minimum withdrawal amount is ৳500.');
      return;
    }

    if (numAmount > availableBalance) {
      setError(`Insufficient balance! Your available wallet balance is ৳${availableBalance.toLocaleString('en-BD')}.`);
      return;
    }

    if (!accountDetails.trim()) {
      setError(`Please enter your ${paymentMethod} account details/number.`);
      return;
    }

    if (accountDetails.trim().length > 20) {
      setError('Account details cannot exceed 20 characters.');
      return;
    }

    if (paymentMethod === 'Bank Transfer') {
      if (!accountHolderName.trim()) {
        setError('Account Holder Name is required for Bank Transfer.');
        return;
      }
      if (!bankName.trim()) {
        setError('Bank Name is required for Bank Transfer.');
        return;
      }
    }

    setSubmitting(true);

    try {
      // Generate request ID e.g. WR-892104
      const randNum = Math.floor(100000 + Math.random() * 900000);
      const generatedRequestId = `WR-${randNum}`;

      const withdrawalData: Omit<WithdrawalRequest, 'id'> = {
        requestId: generatedRequestId,
        resellerId: user.uid,
        resellerName: user.fullName || user.email || 'Reseller',
        resellerShopName: user.shopName || '',
        amount: numAmount,
        paymentMethod,
        accountDetails: accountDetails.trim(),
        accountHolderName: paymentMethod === 'Bank Transfer' ? accountHolderName.trim() : null,
        bankName: paymentMethod === 'Bank Transfer' ? bankName.trim() : null,
        proofUrl: proofFile ? proofFile.url : null,
        status: 'pending',
        requestedAt: serverTimestamp(),
        processedAt: null,
        notes: null,
      };

      // 1. Save to withdrawalRequests collection
      const reqRef = await addDoc(collection(db, 'withdrawalRequests'), withdrawalData);

      // 2. Also save to transactions collection for backward compatibility with wallet history
      const txRef = doc(collection(db, 'transactions'));
      await setDoc(txRef, {
        resellerId: user.uid,
        resellerName: user.fullName,
        resellerShopName: user.shopName || user.fullName,
        type: 'withdrawal',
        amount: numAmount,
        status: 'pending',
        paymentMethod: paymentMethod === 'bKash' ? 'bkash' : paymentMethod === 'Nagad' ? 'nagad' : 'bank_transfer',
        accountNumber: accountDetails.trim(),
        withdrawalRequestId: generatedRequestId,
        createdAt: serverTimestamp(),
      });

      // 3. Log audit action
      await logAuditAction(
        user.uid,
        user.fullName,
        user.role,
        'SUBMIT_WITHDRAWAL_REQUEST',
        reqRef.id,
        `Submitted withdrawal request (${generatedRequestId}) for ৳${numAmount.toLocaleString('en-BD')} via ${paymentMethod}`
      );

      // 4. Create announcement/notice for admin
      try {
        await addDoc(collection(db, 'notices'), {
          type: 'payment_notice',
          title: `New Withdrawal Request [${generatedRequestId}]`,
          message: `${user.fullName} requested a payout of ৳${numAmount.toLocaleString('en-BD')} via ${paymentMethod} (${accountDetails.trim()}).`,
          targetAudience: 'all',
          publishedBy: user.uid,
          publishedByName: user.fullName,
          createdAt: serverTimestamp(),
        });
      } catch (nErr) {
        console.warn('Notification creation error:', nErr);
      }

      setSubmittedRequestId(generatedRequestId);

      if (onSuccess) {
        onSuccess(generatedRequestId);
      }
    } catch (err: any) {
      console.error('Error submitting withdrawal request:', err);
      setError(err?.message || 'Failed to submit withdrawal request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const copyRefToClipboard = () => {
    if (!submittedRequestId) return;
    navigator.clipboard.writeText(submittedRequestId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden max-w-2xl mx-auto my-2 animate-in fade-in duration-200">
      {/* Top Financial Header */}
      <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white font-bold shadow-md shadow-emerald-600/30">
            <ArrowUpRight className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-white">Withdrawal Request</h2>
            <p className="text-[11px] text-slate-400">Withdraw wallet earnings to your MFS or Bank Account</p>
          </div>
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Available Balance Box Indicator */}
      <div className="bg-emerald-950/90 text-emerald-100 p-5 border-b border-emerald-800/50 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">Available Wallet Balance</span>
          <div className="text-2xl font-black text-white mt-0.5">
            ৳{availableBalance.toLocaleString('en-BD', { minimumFractionDigits: 2 })}
          </div>
        </div>

        {numAmount > 0 && (
          <div className="text-left sm:text-right bg-emerald-900/60 px-4 py-2 rounded-xl border border-emerald-700/50">
            <span className="text-[10px] font-semibold text-emerald-300 block">Remaining Balance After Withdrawal</span>
            <span className={`text-sm font-extrabold font-mono ${remainingBalance < 0 ? 'text-rose-400' : 'text-emerald-200'}`}>
              ৳{remainingBalance.toLocaleString('en-BD', { minimumFractionDigits: 2 })}
            </span>
          </div>
        )}
      </div>

      {/* Success View */}
      {submittedRequestId ? (
        <div className="p-8 text-center space-y-6">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner animate-bounce">
            <CheckCircle2 className="w-9 h-9" />
          </div>

          <div>
            <h3 className="text-xl font-extrabold text-slate-900">Withdrawal Request Submitted!</h3>
            <p className="text-xs text-slate-500 mt-1">
              Your request to withdraw <strong>৳{numAmount.toLocaleString('en-BD')}</strong> via <strong>{paymentMethod}</strong> has been logged.
            </p>
          </div>

          {/* Reference ID Card */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl max-w-sm mx-auto flex items-center justify-between gap-3 shadow-inner">
            <div className="text-left">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Request ID</span>
              <span className="text-base font-mono font-extrabold text-slate-900">{submittedRequestId}</span>
            </div>
            <button
              onClick={copyRefToClipboard}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copy ID</span>
                </>
              )}
            </button>
          </div>

          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl max-w-md mx-auto text-left text-xs text-amber-900 space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              <Info className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Processing Notice</span>
            </div>
            <p className="text-[11px] leading-relaxed text-amber-800">
              Withdrawal requests are reviewed and disbursed by the accounts team within 24 hours. You will receive a confirmation once completed.
            </p>
          </div>

          <div className="pt-2">
            <button
              onClick={() => {
                if (onCancel) onCancel();
              }}
              className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs rounded-xl shadow-md transition-colors cursor-pointer"
            >
              Back to Wallet
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2.5 animate-in fade-in duration-150">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span className="font-medium">{error}</span>
            </div>
          )}

          {/* 1. Withdrawal Amount */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Withdrawal Amount (৳) <span className="text-rose-500">*</span>
              </label>
              <span className="text-[10px] text-slate-400 font-medium">Minimum ৳500</span>
            </div>

            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 font-bold text-sm">
                ৳
              </div>
              <input
                type="number"
                min={500}
                max={availableBalance}
                step="any"
                placeholder="Enter amount (min ৳500)"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={`w-full pl-8 pr-3.5 py-3 bg-slate-50 border rounded-xl text-sm font-mono font-extrabold text-slate-900 focus:outline-none focus:ring-2 ${
                  isBalanceExceeded || isBelowMinimum
                    ? 'border-rose-400 focus:ring-rose-500/20 bg-rose-50/30'
                    : 'border-slate-300 focus:ring-emerald-500/20 focus:border-emerald-600'
                }`}
                required
              />
            </div>

            {isBalanceExceeded && (
              <p className="text-[11px] font-bold text-rose-600 flex items-center gap-1 mt-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Insufficient balance! Maximum withdrawable amount is ৳{availableBalance.toLocaleString('en-BD')}</span>
              </p>
            )}

            {isBelowMinimum && (
              <p className="text-[11px] font-bold text-amber-600 flex items-center gap-1 mt-1">
                <Info className="w-3.5 h-3.5" />
                <span>Minimum withdrawal requirement is ৳500</span>
              </p>
            )}
          </div>

          {/* Quick Amount Selector Chips */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Quick Select:</span>
            {[500, 1000, 2000, 5000].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setAmount(preset.toString())}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  amount === preset.toString()
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                ৳{preset.toLocaleString('en-BD')}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setAmount(Math.max(0, availableBalance).toString())}
              className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-extrabold text-xs rounded-lg transition-all cursor-pointer border border-indigo-200"
            >
              Max Balance
            </button>
          </div>

          {/* 2. Payment Method Selection (Radio buttons) */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Payment Method <span className="text-rose-500">*</span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PAYMENT_METHODS.map((pm) => {
                const Icon = pm.icon;
                const isSelected = paymentMethod === pm.id;

                return (
                  <label
                    key={pm.id}
                    className={`p-3.5 rounded-xl border-2 flex items-center gap-3 cursor-pointer transition-all ${pm.accentBg} ${
                      isSelected ? `${pm.activeRing} shadow-xs` : 'border-slate-200 opacity-80 hover:opacity-100'
                    }`}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      value={pm.id}
                      checked={isSelected}
                      onChange={() => {
                        setPaymentMethod(pm.id);
                        setAccountDetails('');
                      }}
                      className="accent-emerald-600 w-4 h-4 cursor-pointer"
                    />
                    <Icon className={`w-5 h-5 shrink-0 ${pm.accentText}`} />
                    <div>
                      <span className={`text-xs font-extrabold block ${pm.accentText}`}>
                        {pm.label}
                      </span>
                      <span className="text-[10px] text-slate-500 font-medium">{pm.sublabel}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* 3. Account Number / Details */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                {paymentMethod === 'Bank Transfer' ? 'Bank Account Number' : `${paymentMethod} Account / Mobile Number`}{' '}
                <span className="text-rose-500">*</span>
              </label>
              <span className="text-[10px] text-slate-400 font-mono">{accountDetails.length}/20</span>
            </div>
            <input
              type="text"
              maxLength={20}
              placeholder={currentMethodConfig.placeholder}
              value={accountDetails}
              onChange={(e) => setAccountDetails(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
              required
            />
          </div>

          {/* 4. Bank Transfer Specific Fields */}
          {paymentMethod === 'Bank Transfer' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in duration-150">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Account Holder Name <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[10px] text-slate-400 font-mono">{accountHolderName.length}/50</span>
                </div>
                <input
                  type="text"
                  maxLength={50}
                  placeholder="e.g. Tanvir Ahmed"
                  value={accountHolderName}
                  onChange={(e) => setAccountHolderName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Bank Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Dhaka Bank / BRAC Bank"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                  required
                />
              </div>
            </div>
          )}

          {/* 5. Verification Document / Proof Upload (Optional) */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Verification Proof / Document <span className="text-slate-400 font-normal">(Optional, max 5MB)</span>
            </label>

            {proofFile ? (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 truncate">
                  <Paperclip className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-semibold text-slate-800 truncate">{proofFile.name}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setProofFile(null)}
                  className="p-1 hover:bg-rose-100 text-rose-600 rounded-lg transition-colors cursor-pointer"
                  title="Remove document"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <label className="flex items-center gap-2.5 px-4 py-3 bg-slate-50 hover:bg-slate-100 border border-dashed border-slate-300 hover:border-emerald-500 rounded-xl cursor-pointer text-xs text-slate-700 font-semibold transition-all">
                <Paperclip className="w-4 h-4 text-slate-500" />
                <span>Upload Checkbook / Account Document (JPG, PNG, PDF)</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            )}
          </div>

          {/* Action Buttons */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                disabled={submitting}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={submitting || isBalanceExceeded || isBelowMinimum}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-extrabold text-xs rounded-xl transition-all shadow-md shadow-emerald-600/20 flex items-center gap-2 cursor-pointer active:scale-98"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <ArrowUpRight className="w-4 h-4" />
                  <span>Submit Withdrawal Request</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
