import React, { useState, useEffect } from 'react';
import { 
  collection, query, getDocs, doc, runTransaction, updateDoc, serverTimestamp, orderBy 
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserProfile, Wallet, WithdrawalRequest } from '../../types';
import { formatResellerId } from '../../lib/resellerIdHelper';
import { logAuditAction } from '../../lib/auditLogger';
import { createAppNotification } from '../../lib/notificationHelper';
import { 
  Clock, CheckCircle2, XCircle, AlertCircle, Loader2, Check, X, 
  Eye, FileText, Building2, Smartphone, Search, Filter, RefreshCw
} from 'lucide-react';

interface AdminWithdrawalManagerProps {
  user: UserProfile;
}

export const AdminWithdrawalManager: React.FC<AdminWithdrawalManagerProps> = ({ user }) => {
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'completed'>('pending');
  const [searchQuery, setSearchQuery] = useState('');

  // Processing state
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Rejection modal
  const [selectedReqToReject, setSelectedReqToReject] = useState<WithdrawalRequest | null>(null);
  const [rejectionNotes, setRejectionNotes] = useState('');

  // Proof View modal
  const [selectedProofUrl, setSelectedProofUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchWithdrawalRequests();
  }, [statusFilter]);

  const fetchWithdrawalRequests = async () => {
    setLoading(true);
    setError('');
    try {
      const q = query(
        collection(db, 'withdrawalRequests')
      );
      const snap = await getDocs(q);
      const list: WithdrawalRequest[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as WithdrawalRequest);
      });

      // Sort by requestedAt desc
      list.sort((a, b) => {
        const timeA = a.requestedAt?.toDate ? a.requestedAt.toDate().getTime() : new Date(a.requestedAt || 0).getTime();
        const timeB = b.requestedAt?.toDate ? b.requestedAt.toDate().getTime() : new Date(b.requestedAt || 0).getTime();
        return timeB - timeA;
      });

      setWithdrawals(list);
    } catch (err: any) {
      console.error('Error fetching withdrawal requests:', err);
      setError('Failed to load withdrawal requests.');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (reqItem: WithdrawalRequest) => {
    setProcessingId(reqItem.id);
    setError('');

    try {
      await runTransaction(db, async (transaction) => {
        const reqRef = doc(db, 'withdrawalRequests', reqItem.id);
        const walletRef = doc(db, 'wallets', reqItem.resellerId);

        const walletSnap = await transaction.get(walletRef);
        let currentBalance = 0;
        let totalWithdrawn = 0;

        if (walletSnap.exists()) {
          const wData = walletSnap.data() as Wallet;
          currentBalance = wData.balance || 0;
          totalWithdrawn = wData.totalWithdrawn || 0;
        }

        if (currentBalance < reqItem.amount) {
          throw new Error(`Reseller balance (৳${currentBalance}) is insufficient for payout of ৳${reqItem.amount}.`);
        }

        // 1. Deduct amount from wallet balance, update totalWithdrawn
        transaction.set(walletRef, {
          resellerId: reqItem.resellerId,
          balance: currentBalance - reqItem.amount,
          totalWithdrawn: totalWithdrawn + reqItem.amount,
          updatedAt: serverTimestamp(),
        }, { merge: true });

        // 2. Update withdrawal request status to completed
        const txId = `TXN-${Math.floor(100000 + Math.random() * 900000)}`;
        transaction.update(reqRef, {
          status: 'completed',
          processedAt: serverTimestamp(),
          transactionId: txId,
          notes: 'Approved & processed by admin',
        });
      });

      // Audit Log
      await logAuditAction(
        user.uid,
        user.fullName,
        user.role,
        'APPROVE_WITHDRAWAL_REQUEST',
        reqItem.id,
        `Approved withdrawal request ${reqItem.requestId} for ৳${reqItem.amount} to ${reqItem.resellerName}`
      );

      // Notify Reseller
      try {
        await createAppNotification({
          title: `Withdrawal Approved! ৳${reqItem.amount} 💸`,
          message: `Your withdrawal request #${reqItem.requestId} (৳${reqItem.amount}) was approved and processed to your account.`,
          type: 'payout',
          targetAudience: 'reseller',
          targetResellerId: reqItem.resellerId,
          metadata: {
            requestId: reqItem.id,
            amount: reqItem.amount,
            type: 'payout',
          },
          priority: 'high',
        });
      } catch (notifErr) {
        console.error('Failed to notify reseller of approved withdrawal:', notifErr);
      }

      fetchWithdrawalRequests();
    } catch (err: any) {
      console.error('Approval failed:', err);
      setError(err?.message || 'Failed to approve withdrawal request.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleConfirmReject = async () => {
    if (!selectedReqToReject) return;
    if (!rejectionNotes.trim()) {
      setError('Please provide a reason for rejecting the withdrawal request.');
      return;
    }

    setProcessingId(selectedReqToReject.id);
    setError('');

    try {
      const reqRef = doc(db, 'withdrawalRequests', selectedReqToReject.id);
      await updateDoc(reqRef, {
        status: 'rejected',
        processedAt: serverTimestamp(),
        notes: rejectionNotes.trim(),
      });

      // Audit Log
      await logAuditAction(
        user.uid,
        user.fullName,
        user.role,
        'REJECT_WITHDRAWAL_REQUEST',
        selectedReqToReject.id,
        `Rejected withdrawal request ${selectedReqToReject.requestId} for ৳${selectedReqToReject.amount}. Reason: ${rejectionNotes.trim()}`
      );

      // Notify Reseller
      try {
        await createAppNotification({
          title: `Withdrawal Request Rejected ❌`,
          message: `Your withdrawal request #${selectedReqToReject.requestId} (৳${selectedReqToReject.amount}) was declined. Reason: ${rejectionNotes.trim()}`,
          type: 'payout',
          targetAudience: 'reseller',
          targetResellerId: selectedReqToReject.resellerId,
          metadata: {
            requestId: selectedReqToReject.id,
            amount: selectedReqToReject.amount,
            type: 'payout',
          },
          priority: 'normal',
        });
      } catch (notifErr) {
        console.error('Failed to notify reseller of rejected withdrawal:', notifErr);
      }

      setSelectedReqToReject(null);
      setRejectionNotes('');
      fetchWithdrawalRequests();
    } catch (err: any) {
      console.error('Rejection failed:', err);
      setError(err?.message || 'Failed to reject withdrawal request.');
    } finally {
      setProcessingId(null);
    }
  };

  const filteredWithdrawals = withdrawals.filter((w) => {
    const matchesStatus = statusFilter === 'all' || w.status === statusFilter;
    const matchesSearch = 
      (w.requestId || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (w.resellerName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (w.resellerShopName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (w.accountDetails || '').includes(searchQuery);
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <Clock className="w-5 h-5 text-emerald-600" />
            <span>Reseller Withdrawal Management</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Review, verify account details, and disburse wallet payouts
          </p>
        </div>

        <button
          onClick={fetchWithdrawalRequests}
          disabled={loading}
          className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl w-full sm:w-auto overflow-x-auto">
          {(['pending', 'completed', 'rejected', 'all'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg capitalize transition-all cursor-pointer whitespace-nowrap ${
                statusFilter === st
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by Request ID, Reseller, Account..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
          />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
          <span>Loading withdrawal requests...</span>
        </div>
      ) : filteredWithdrawals.length === 0 ? (
        <div className="p-10 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-2xl">
          No withdrawal requests found matching your filter criteria.
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200">
                  <th className="px-4 py-3">Request ID</th>
                  <th className="px-4 py-3">Reseller</th>
                  <th className="px-4 py-3">Method & Details</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredWithdrawals.map((reqItem) => {
                  const isProc = processingId === reqItem.id;

                  let statusBadge = (
                    <span className="bg-amber-100 text-amber-800 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Pending
                    </span>
                  );

                  if (reqItem.status === 'completed' || reqItem.status === 'approved') {
                    statusBadge = (
                      <span className="bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Completed
                      </span>
                    );
                  } else if (reqItem.status === 'rejected') {
                    statusBadge = (
                      <span className="bg-rose-100 text-rose-800 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
                        <XCircle className="w-3 h-3" /> Rejected
                      </span>
                    );
                  }

                  return (
                    <tr key={reqItem.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 font-mono font-extrabold text-slate-900">
                        {reqItem.requestId || reqItem.id.substring(0, 8)}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <p className="font-bold text-slate-900">{reqItem.resellerShopName || reqItem.resellerName}</p>
                          <span className="font-mono text-[9px] font-bold text-blue-700 bg-blue-50 px-1 py-0.2 rounded border border-blue-200">
                            {formatResellerId(reqItem.resellerId)}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500">{reqItem.resellerName}</p>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 font-extrabold text-indigo-700">
                          {reqItem.paymentMethod === 'Bank Transfer' ? (
                            <Building2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          ) : (
                            <Smartphone className="w-3.5 h-3.5 text-pink-600 shrink-0" />
                          )}
                          <span>{reqItem.paymentMethod}</span>
                        </div>
                        <p className="font-mono font-bold text-slate-800 mt-0.5">{reqItem.accountDetails}</p>
                        {reqItem.paymentMethod === 'Bank Transfer' && (
                          <p className="text-[10px] text-slate-500">
                            {reqItem.accountHolderName} • {reqItem.bankName}
                          </p>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right font-black text-slate-900 text-sm">
                        ৳{reqItem.amount.toLocaleString('en-BD')}
                      </td>

                      <td className="px-4 py-3 text-center">{statusBadge}</td>

                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {reqItem.proofUrl && (
                            <button
                              onClick={() => setSelectedProofUrl(reqItem.proofUrl || null)}
                              className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs transition-colors cursor-pointer"
                              title="View Attached Proof Document"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {reqItem.status === 'pending' && (
                            <>
                              <button
                                onClick={() => handleApprove(reqItem)}
                                disabled={isProc}
                                className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-[11px] rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                              >
                                {isProc ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                <span>Approve</span>
                              </button>

                              <button
                                onClick={() => {
                                  setSelectedReqToReject(reqItem);
                                  setRejectionNotes('');
                                }}
                                disabled={isProc}
                                className="px-2.5 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-700 font-bold text-[11px] rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                              >
                                <X className="w-3 h-3" />
                                <span>Reject</span>
                              </button>
                            </>
                          )}
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
            {filteredWithdrawals.map((reqItem) => {
              const isProc = processingId === reqItem.id;

              let statusBadge = (
                <span className="bg-amber-100 text-amber-800 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Pending
                </span>
              );

              if (reqItem.status === 'completed' || reqItem.status === 'approved') {
                statusBadge = (
                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Completed
                  </span>
                );
              } else if (reqItem.status === 'rejected') {
                statusBadge = (
                  <span className="bg-rose-100 text-rose-800 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
                    <XCircle className="w-3 h-3" /> Rejected
                  </span>
                );
              }

              return (
                <div key={reqItem.id} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3 relative">
                  {/* Header: Request ID & Status */}
                  <div className="flex items-center justify-between gap-2 border-b border-slate-200/60 pb-2">
                    <span className="font-mono font-black text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-200">
                      #{reqItem.requestId || reqItem.id.substring(0, 8)}
                    </span>
                    {statusBadge}
                  </div>

                  {/* Reseller Shop details */}
                  <div className="flex justify-between items-start text-xs">
                    <div>
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] text-slate-400 font-bold uppercase">Reseller</span>
                        <span className="font-mono text-[9px] font-bold text-blue-700 bg-blue-50 px-1 py-0.2 rounded border border-blue-200">
                          {formatResellerId(reqItem.resellerId)}
                        </span>
                      </div>
                      <span className="font-extrabold text-slate-900">{reqItem.resellerShopName || reqItem.resellerName}</span>
                      <span className="text-[10px] text-slate-500 block">{reqItem.resellerName}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] text-slate-400 font-bold block uppercase">Amount</span>
                      <span className="font-black text-emerald-600 text-sm block">৳{reqItem.amount.toLocaleString('en-BD')}</span>
                    </div>
                  </div>

                  {/* Payment Info */}
                  <div className="text-[11px] bg-white p-2.5 rounded-xl border border-slate-200/50 space-y-1">
                    <span className="text-[9px] text-slate-400 font-bold block uppercase">Payment Method</span>
                    <div className="flex items-center gap-1.5 font-extrabold text-indigo-700">
                      {reqItem.paymentMethod === 'Bank Transfer' ? (
                        <Building2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      ) : (
                        <Smartphone className="w-3.5 h-3.5 text-pink-600 shrink-0" />
                      )}
                      <span>{reqItem.paymentMethod}</span>
                    </div>
                    <p className="font-mono font-bold text-slate-800 break-all">{reqItem.accountDetails}</p>
                    {reqItem.paymentMethod === 'Bank Transfer' && (
                      <p className="text-[10px] text-slate-500">
                        {reqItem.accountHolderName} • {reqItem.bankName}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-slate-200/40">
                    {reqItem.proofUrl && (
                      <button
                        onClick={() => setSelectedProofUrl(reqItem.proofUrl || null)}
                        className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 border border-slate-200"
                        title="View Attached Proof Document"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Proof</span>
                      </button>
                    )}

                    {reqItem.status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleApprove(reqItem)}
                          disabled={isProc}
                          className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          {isProc ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          <span>Approve</span>
                        </button>

                        <button
                          onClick={() => {
                            setSelectedReqToReject(reqItem);
                            setRejectionNotes('');
                          }}
                          disabled={isProc}
                          className="px-3.5 py-2 bg-rose-100 hover:bg-rose-200 text-rose-700 font-bold text-xs rounded-xl transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Reject</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Proof Modal */}
      {selectedProofUrl && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="text-sm font-extrabold text-slate-900">Verification Document Proof</h4>
              <button
                onClick={() => setSelectedProofUrl(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-2 bg-slate-50 border border-slate-200 rounded-xl overflow-hidden flex items-center justify-center max-h-96">
              <img
                src={selectedProofUrl}
                alt="Withdrawal Verification Proof"
                className="max-h-80 max-w-full object-contain rounded-lg"
              />
            </div>
            <div className="text-right">
              <button
                onClick={() => setSelectedProofUrl(null)}
                className="px-4 py-2 bg-slate-900 text-white font-bold text-xs rounded-xl"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rejection Modal */}
      {selectedReqToReject && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <XCircle className="w-5 h-5 text-rose-600" />
                <span>Reject Withdrawal Request</span>
              </h4>
              <button
                onClick={() => setSelectedReqToReject(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Rejecting request <strong>{selectedReqToReject.requestId}</strong> for <strong>৳{selectedReqToReject.amount}</strong> submitted by <strong>{selectedReqToReject.resellerName}</strong>.
            </p>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Rejection Reason / Notes <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                placeholder="Specify reason for rejection (e.g. Invalid account number format, details mismatch)..."
                value={rejectionNotes}
                onChange={(e) => setRejectionNotes(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setSelectedReqToReject(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReject}
                disabled={processingId === selectedReqToReject.id}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl shadow-md flex items-center gap-1.5"
              >
                {processingId === selectedReqToReject.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirm Rejection</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
