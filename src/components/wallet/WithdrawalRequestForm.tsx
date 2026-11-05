import React, { useState } from 'react';
import { collection, addDoc, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserProfile, WithdrawalPaymentMethod } from '../../types';
import { logAuditAction } from '../../lib/auditLogger';
import { 
  ArrowUpRight, CheckCircle2, AlertTriangle, Loader2, Copy, Check,
  Paperclip, X, Smartphone, Building2, Info, ArrowLeft, ShieldCheck
} from 'lucide-react';
import { DENSITY_TOKENS } from '../../utils/densityTokens';

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
}[] = [
  { id: 'bKash', label: 'bKash', sublabel: 'Mobile Wallet', icon: Smartphone },
  { id: 'Nagad', label: 'Nagad', sublabel: 'Mobile Wallet', icon: Smartphone },
  { id: 'Rocket', label: 'Rocket', sublabel: 'Mobile Wallet', icon: Smartphone },
  { id: 'Bank Transfer', label: 'Bank Transfer', sublabel: 'Commercial Bank', icon: Building2 },
];

export const WithdrawalRequestForm: React.FC<WithdrawalRequestFormProps> = ({
  user,
  availableBalance,
  onSuccess,
  onCancel,
}) => {
  // Pre-select user's saved method
  const initialMethod: WithdrawalPaymentMethod = 
    user.payoutMethod === 'nagad' ? 'Nagad' :
    user.payoutMethod === 'rocket' ? 'Rocket' :
    user.payoutMethod === 'bank' ? 'Bank Transfer' : 'bKash';

  const initialAccountNum = 
    initialMethod === 'bKash' ? user.bkashNumber || '' :
    initialMethod === 'Nagad' ? user.nagadNumber || '' :
    initialMethod === 'Rocket' ? user.rocketNumber || '' : user.accountNumber || '';

  const [amount, setAmount] = useState<string>('500');
  const [paymentMethod, setPaymentMethod] = useState<WithdrawalPaymentMethod>(initialMethod);
  const [accountDetails, setAccountDetails] = useState<string>(initialAccountNum);
  const [accountHolderName, setAccountHolderName] = useState<string>(user.accountHolderName || user.fullName || '');
  const [bankName, setBankName] = useState<string>(user.bankName || '');
  const [proofFile, setProofFile] = useState<{ name: string; url: string; type: string } | null>(null);

  // Step 1: Input, Step 2: Confirm
  const [step, setStep] = useState<'input' | 'confirm'>('input');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>('');
  const [submittedRequestId, setSubmittedRequestId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const numAmount = parseFloat(amount) || 0;
  const isBalanceExceeded = numAmount > availableBalance;
  const isBelowMinimum = numAmount > 0 && numAmount < 500;

  const handleMethodChange = (method: WithdrawalPaymentMethod) => {
    setPaymentMethod(method);
    let autoNum = '';
    if (method === 'bKash') autoNum = user.bkashNumber || '';
    else if (method === 'Nagad') autoNum = user.nagadNumber || '';
    else if (method === 'Rocket') autoNum = user.rocketNumber || '';
    else if (method === 'Bank Transfer') autoNum = user.accountNumber || '';
    setAccountDetails(autoNum);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError('Proof file size must be under 5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      if (evt.target?.result) {
        setProofFile({ name: file.name, url: evt.target.result as string, type: file.type });
      }
    };
    reader.readAsDataURL(file);
  };

  const validateInputs = (): boolean => {
    setError('');
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Please enter a valid amount.');
      return false;
    }
    if (numAmount < 500) {
      setError('Minimum withdrawal requirement is ৳500.');
      return false;
    }
    if (numAmount > availableBalance) {
      setError(`Insufficient balance! Available: ৳${availableBalance.toLocaleString()}`);
      return false;
    }
    if (!accountDetails.trim()) {
      setError(`Please enter your ${paymentMethod} account / phone number.`);
      return false;
    }
    if (paymentMethod === 'Bank Transfer') {
      if (!accountHolderName.trim() || !bankName.trim()) {
        setError('Account holder name and bank name are required for Bank Transfer.');
        return false;
      }
    }
    return true;
  };

  const handleProceedToConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateInputs()) {
      setStep('confirm');
    }
  };

  const handleFinalSubmit = async () => {
    if (!validateInputs()) return;

    setSubmitting(true);
    try {
      const randNum = Math.floor(100000 + Math.random() * 900000);
      const generatedRequestId = `WR-${randNum}`;

      const withdrawalData: any = {
        requestId: generatedRequestId,
        userId: user.uid,
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
      };

      const reqRef = await addDoc(collection(db, 'withdrawalRequests'), withdrawalData);

      const txRef = doc(collection(db, 'transactions'));
      await setDoc(txRef, {
        userId: user.uid,
        resellerId: user.uid,
        resellerName: user.fullName,
        resellerShopName: user.shopName || user.fullName,
        type: 'withdrawal',
        amount: numAmount,
        status: 'pending',
        paymentMethod: paymentMethod === 'bKash' ? 'bkash' : paymentMethod === 'Nagad' ? 'nagad' : paymentMethod === 'Rocket' ? 'rocket' : 'bank_transfer',
        accountNumber: accountDetails.trim(),
        withdrawalRequestId: generatedRequestId,
        createdAt: serverTimestamp(),
      });

      await logAuditAction(
        user.uid,
        user.fullName,
        user.role,
        'SUBMIT_WITHDRAWAL_REQUEST',
        reqRef.id,
        `Submitted withdrawal request (${generatedRequestId}) for ৳${numAmount.toLocaleString()} via ${paymentMethod}`
      );

      setSubmittedRequestId(generatedRequestId);
      if (onSuccess) onSuccess(generatedRequestId);
    } catch (err: any) {
      console.error('Error submitting withdrawal:', err);
      setError(err?.message || 'Failed to submit withdrawal request.');
      setStep('input');
    } finally {
      setSubmitting(false);
    }
  };

  const last4 = accountDetails.trim().length >= 4 ? accountDetails.trim().slice(-4) : accountDetails.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto animate-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-4 py-3 bg-[#04203F] text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ArrowUpRight className="w-4 h-4 text-[#3DD055]" />
            <div>
              <h3 className="text-[14px] font-bold text-white">Request Withdrawal</h3>
              <p className="text-[10px] text-slate-300">Min ৳500 · 24h Processing</p>
            </div>
          </div>
          {onCancel && (
            <button onClick={onCancel} className="p-1 text-slate-400 hover:text-white rounded-lg">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Success View */}
        {submittedRequestId ? (
          <div className="p-5 text-center space-y-4">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div>
              <h4 className="text-[15px] font-bold text-slate-900">Request Submitted!</h4>
              <p className="text-[12px] text-slate-500 mt-0.5">
                Withdrawal of <strong className="text-slate-900">৳{numAmount.toLocaleString()}</strong> via {paymentMethod} (••{last4}) is logged.
              </p>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs font-mono">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Ref ID</span>
              <span className="font-bold text-slate-800">{submittedRequestId}</span>
            </div>
            <button
              onClick={() => onCancel && onCancel()}
              className="w-full py-2.5 rounded-xl bg-[#04203F] hover:bg-[#0E9AA7] text-white text-xs font-bold transition-all"
            >
              Done
            </button>
          </div>
        ) : step === 'confirm' ? (
          /* Confirmation Step */
          <div className="p-4 space-y-4 text-xs">
            <div className="p-3.5 bg-blue-50/80 border border-blue-200 rounded-xl space-y-2">
              <div className="flex items-center gap-1.5 text-blue-900 font-bold">
                <ShieldCheck className="w-4 h-4 text-[#0E9AA7]" />
                <span>Confirm Withdrawal Summary</span>
              </div>
              <div className="space-y-1 text-[12px] text-slate-700">
                <p>You will receive <strong className="text-[#3DD055] font-mono font-extrabold text-[14px]">৳{numAmount.toLocaleString()}</strong></p>
                <p>Destination: <strong className="uppercase font-bold text-slate-900">{paymentMethod}</strong> (••{last4})</p>
                {paymentMethod === 'Bank Transfer' && (
                  <p>Bank: <strong>{bankName}</strong> ({accountHolderName})</p>
                )}
                <p className="text-[10px] text-slate-500 pt-1 border-t border-blue-200/60">
                  Processing fee: ৳0 · Expected payout within 24 hours.
                </p>
              </div>
            </div>

            {error && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setStep('input')}
                disabled={submitting}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleFinalSubmit}
                disabled={submitting}
                className="px-5 py-2 rounded-xl bg-[#04203F] hover:bg-[#0E9AA7] text-white text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1.5"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Submitting...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Confirm Payout</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* Input Form Step */
          <form onSubmit={handleProceedToConfirm} className="p-4 space-y-3.5 text-xs">
            {error && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[11px] flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Amount Input with Max Button */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <label className="font-bold text-slate-600 uppercase">Amount (BDT) *</label>
                <span className="text-slate-400">Available: ৳{availableBalance.toLocaleString()}</span>
              </div>

              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono font-bold text-slate-400">৳</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={500}
                  max={availableBalance}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full h-[36px] pl-7 pr-16 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-sm outline-none focus:border-[#0E9AA7]"
                  required
                />
                <button
                  type="button"
                  onClick={() => setAmount(Math.max(0, availableBalance).toString())}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded-md bg-slate-200 hover:bg-slate-300 text-slate-800 text-[10px] font-bold"
                >
                  MAX
                </button>
              </div>

              {isBalanceExceeded && (
                <p className="text-[10px] font-bold text-rose-600">Amount exceeds available balance.</p>
              )}
              {isBelowMinimum && (
                <p className="text-[10px] font-bold text-amber-600">Minimum withdrawal requirement is ৳500.</p>
              )}
            </div>

            {/* Quick Amount Selector */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {[500, 1000, 2000, 5000].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setAmount(amt.toString())}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                    amount === amt.toString() ? 'bg-[#04203F] text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  ৳{amt}
                </button>
              ))}
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-600 uppercase">Payout Method *</label>
              <div className="grid grid-cols-2 gap-1.5">
                {PAYMENT_METHODS.map((pm) => {
                  const isSelected = paymentMethod === pm.id;
                  return (
                    <button
                      key={pm.id}
                      type="button"
                      onClick={() => handleMethodChange(pm.id)}
                      className={`p-2 rounded-xl border text-left flex items-center justify-between transition-all ${
                        isSelected ? 'bg-teal-50 border-[#0E9AA7] text-[#04203F]' : 'bg-slate-50 border-slate-200 text-slate-700'
                      }`}
                    >
                      <div>
                        <span className="font-bold text-[11px] block">{pm.label}</span>
                        <span className="text-[9px] text-slate-400 block">{pm.sublabel}</span>
                      </div>
                      <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                        isSelected ? 'bg-[#0E9AA7] border-[#0E9AA7] text-white' : 'border-slate-300'
                      }`}>
                        {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Account Details */}
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-600 uppercase">
                {paymentMethod === 'Bank Transfer' ? 'Bank Account Number *' : `${paymentMethod} Mobile Number *`}
              </label>
              <input
                type="text"
                value={accountDetails}
                onChange={(e) => setAccountDetails(e.target.value)}
                placeholder="e.g. 017XXXXXXXX"
                className="w-full h-[36px] px-3 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-xs outline-none focus:border-[#0E9AA7]"
                required
              />
            </div>

            {paymentMethod === 'Bank Transfer' && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">Bank Name *</label>
                  <input
                    type="text"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="e.g. BRAC Bank"
                    className="w-full h-[32px] px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">Holder Name *</label>
                  <input
                    type="text"
                    value={accountHolderName}
                    onChange={(e) => setAccountHolderName(e.target.value)}
                    placeholder="Account Name"
                    className="w-full h-[32px] px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none"
                    required
                  />
                </div>
              </div>
            )}

            {/* Bottom Actions */}
            <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold"
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                disabled={isBalanceExceeded || isBelowMinimum}
                className="px-5 py-2 rounded-xl bg-[#04203F] hover:bg-[#0E9AA7] text-white font-bold transition-all disabled:opacity-50"
              >
                Review Payout
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
};
