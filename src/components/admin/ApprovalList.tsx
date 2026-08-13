import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserProfile, PayoutChangeRequest } from '../../types';
import { CheckCircle2, XCircle, Clock, Store, Phone, MapPin, Mail, Eye, AlertCircle, FileText, CreditCard, Shield, UserCheck, ArrowRight, Key } from 'lucide-react';

interface ApprovalListProps {
  user?: UserProfile;
}

export const ApprovalList: React.FC<ApprovalListProps> = ({ user: currentUser }) => {
  const [activeTab, setActiveTab] = useState<'registrations' | 'payouts'>('registrations');
  const [pendingUsers, setPendingUsers] = useState<UserProfile[]>([]);
  const [pendingPayouts, setPendingPayouts] = useState<PayoutChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);

  // Rejection states
  const [rejectingUser, setRejectingUser] = useState<UserProfile | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectingPayout, setRejectingPayout] = useState<PayoutChangeRequest | null>(null);
  const [payoutRejectReason, setPayoutRejectReason] = useState('');

  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const fetchApprovalsData = async () => {
    setLoading(true);
    try {
      // 1. Fetch pending registrations
      const qUsers = query(collection(db, 'users'), where('status', '==', 'pending'));
      const usersSnap = await getDocs(qUsers);
      const userList: UserProfile[] = [];
      usersSnap.forEach((docSnap) => {
        userList.push(docSnap.data() as UserProfile);
      });
      setPendingUsers(userList);

      // 2. Fetch pending payout change requests
      const qPayouts = query(collection(db, 'payoutChangeRequests'), where('status', '==', 'pending'));
      const payoutsSnap = await getDocs(qPayouts);
      const payoutList: PayoutChangeRequest[] = [];
      payoutsSnap.forEach((docSnap) => {
        payoutList.push({ id: docSnap.id, ...docSnap.data() } as PayoutChangeRequest);
      });
      setPendingPayouts(payoutList);
    } catch (err) {
      console.error('Error fetching pending approvals:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApprovalsData();
  }, []);

  // --- Registration Actions ---
  const handleApproveUser = async (uid: string) => {
    setActionLoadingId(uid);
    try {
      await updateDoc(doc(db, 'users', uid), {
        status: 'approved',
        rejectReason: null,
      });
      setPendingUsers(prev => prev.filter(u => u.uid !== uid));
    } catch (err) {
      console.error('Error approving user:', err);
      alert('Failed to approve user account.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRejectUserConfirm = async () => {
    if (!rejectingUser || !rejectReason.trim()) {
      alert('Please provide a rejection reason.');
      return;
    }

    setActionLoadingId(rejectingUser.uid);
    try {
      await updateDoc(doc(db, 'users', rejectingUser.uid), {
        status: 'rejected',
        rejectReason: rejectReason.trim(),
      });
      setPendingUsers(prev => prev.filter(u => u.uid !== rejectingUser.uid));
      setRejectingUser(null);
      setRejectReason('');
    } catch (err) {
      console.error('Error rejecting user:', err);
      alert('Failed to reject user');
    } finally {
      setActionLoadingId(null);
    }
  };

  // --- Payout Change Actions ---
  const handleApprovePayout = async (payoutReq: PayoutChangeRequest) => {
    setActionLoadingId(payoutReq.id);
    try {
      // 1. Mark payout request as approved
      await updateDoc(doc(db, 'payoutChangeRequests', payoutReq.id), {
        status: 'approved',
        approvedAt: serverTimestamp(),
        approvedBy: currentUser?.fullName || 'Admin',
      });

      // 2. Update user's profile with new payout info
      await updateDoc(doc(db, 'users', payoutReq.resellerId), {
        payoutMethod: payoutReq.payoutMethod,
        bkashNumber: payoutReq.bkashNumber || '',
        nagadNumber: payoutReq.nagadNumber || '',
        rocketNumber: payoutReq.rocketNumber || '',
        bankName: payoutReq.bankName || '',
        accountNumber: payoutReq.accountNumber || '',
        accountHolderName: payoutReq.accountHolderName || '',
        branchName: payoutReq.branchName || '',
      });

      // 3. Notify reseller
      await addDoc(collection(db, 'notices'), {
        resellerId: payoutReq.resellerId,
        title: 'Payout Account Updated',
        message: `Your request to update payout method to ${payoutReq.payoutMethod.toUpperCase()} has been approved by Admin!`,
        type: 'system',
        targetRole: 'reseller',
        createdAt: serverTimestamp(),
      });

      setPendingPayouts(prev => prev.filter(p => p.id !== payoutReq.id));
    } catch (err) {
      console.error('Error approving payout change:', err);
      alert('Failed to approve payout account change.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRejectPayoutConfirm = async () => {
    if (!rejectingPayout || !payoutRejectReason.trim()) {
      alert('Please provide a rejection reason for this payout change.');
      return;
    }

    setActionLoadingId(rejectingPayout.id);
    try {
      // 1. Mark payout request as rejected
      await updateDoc(doc(db, 'payoutChangeRequests', rejectingPayout.id), {
        status: 'rejected',
        rejectionReason: payoutRejectReason.trim(),
      });

      // 2. Notify reseller
      await addDoc(collection(db, 'notices'), {
        resellerId: rejectingPayout.resellerId,
        title: 'Payout Account Change Rejected',
        message: `Your payout account change request was rejected. Reason: ${payoutRejectReason.trim()}`,
        type: 'system',
        targetRole: 'reseller',
        createdAt: serverTimestamp(),
      });

      setPendingPayouts(prev => prev.filter(p => p.id !== rejectingPayout.id));
      setRejectingPayout(null);
      setPayoutRejectReason('');
    } catch (err) {
      console.error('Error rejecting payout change:', err);
      alert('Failed to reject payout account change.');
    } finally {
      setActionLoadingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400 text-xs">
        <Clock className="w-6 h-6 animate-spin mr-2 text-blue-600" />
        <span>Loading pending approval items...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Bar with Navigation Tabs */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-600" />
            <span>Admin Approval Center</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Review and authorize new accounts and account changes.</p>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('registrations')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'registrations'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <UserCheck className="w-4 h-4 text-blue-600" />
            <span>Reseller Registrations</span>
            {pendingUsers.length > 0 && (
              <span className="bg-amber-500 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                {pendingUsers.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('payouts')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'payouts'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CreditCard className="w-4 h-4 text-emerald-600" />
            <span>Payout Account Changes</span>
            {pendingPayouts.length > 0 && (
              <span className="bg-emerald-600 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                {pendingPayouts.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* --- TAB 1: RESELLER REGISTRATIONS --- */}
      {activeTab === 'registrations' && (
        <div className="space-y-4">
          {pendingUsers.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-xs">
              <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-1">No Pending Applications</h3>
              <p className="text-xs text-slate-500">All reseller sign-up applications have been processed.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {pendingUsers.map((user) => (
                <div key={user.uid} className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col justify-between">
                  <div className="p-6 space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        {user.profilePhotoUrl ? (
                          <img
                            src={user.profilePhotoUrl}
                            alt={user.fullName}
                            className="w-12 h-12 rounded-xl object-cover border border-slate-200 cursor-pointer hover:opacity-90"
                            onClick={() => setSelectedPhoto(user.profilePhotoUrl)}
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-sm">
                            {user.fullName.charAt(0)}
                          </div>
                        )}
                        <div>
                          <h3 className="font-bold text-slate-900 text-base">{user.fullName}</h3>
                          <div className="flex items-center gap-1.5 text-xs text-blue-600 font-medium">
                            <Store className="w-3.5 h-3.5" />
                            <span>{user.shopName}</span>
                          </div>
                        </div>
                      </div>
                      <span className="bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
                        Pending
                      </span>
                    </div>

                    <div className="bg-slate-50 rounded-xl p-3.5 space-y-2 text-xs text-slate-600">
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="font-medium text-slate-900">{user.mobile}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{user.email}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{user.address}, {user.upazila}, {user.district}, {user.division}</span>
                      </div>
                      {currentUser?.role === 'super_admin' && user.plainPassword && (
                        <div className="flex items-center gap-1.5 pt-1 text-amber-900 border-t border-slate-200/80 font-mono text-xs">
                          <Key className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>Password: <strong className="font-bold">{user.plainPassword}</strong></span>
                        </div>
                      )}
                    </div>

                    {/* Initial Payout Account provided at registration */}
                    {(user.bkashNumber || user.nagadNumber || user.rocketNumber || user.bankName) && (
                      <div className="bg-blue-50/60 border border-blue-200 rounded-xl p-3 text-xs space-y-1">
                        <span className="text-[10px] font-bold text-blue-800 uppercase tracking-wider block">Provided Payout Method:</span>
                        <div className="font-medium text-slate-800">
                          {user.payoutMethod === 'bank' ? (
                            <span>Bank: {user.bankName} (Acct: {user.accountNumber})</span>
                          ) : user.bkashNumber ? (
                            <span>bKash: {user.bkashNumber}</span>
                          ) : user.nagadNumber ? (
                            <span>Nagad: {user.nagadNumber}</span>
                          ) : user.rocketNumber ? (
                            <span>Rocket: {user.rocketNumber}</span>
                          ) : (
                            <span>Configured</span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Photos Preview thumbnails */}
                    <div className="flex items-center gap-3 pt-1">
                      {user.shopPhotoUrl && (
                        <div className="relative group cursor-pointer" onClick={() => setSelectedPhoto(user.shopPhotoUrl)}>
                          <img src={user.shopPhotoUrl} alt="Shop" className="w-14 h-14 rounded-lg object-cover border border-slate-200" />
                          <div className="absolute inset-0 bg-black/40 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px]">
                            Shop
                          </div>
                        </div>
                      )}
                      {user.nidUrl && (
                        <div className="relative group cursor-pointer" onClick={() => setSelectedPhoto(user.nidUrl || '')}>
                          <img src={user.nidUrl} alt="NID" className="w-14 h-14 rounded-lg object-cover border border-slate-200" />
                          <div className="absolute inset-0 bg-black/40 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px]">
                            NID
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-slate-100 bg-slate-50/50 p-4 flex gap-3">
                    <button
                      onClick={() => setRejectingUser(user)}
                      disabled={actionLoadingId === user.uid}
                      className="flex-1 bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 font-medium py-2 px-4 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>Reject</span>
                    </button>
                    <button
                      onClick={() => handleApproveUser(user.uid)}
                      disabled={actionLoadingId === user.uid}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 px-4 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Approve Account</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* --- TAB 2: PAYOUT ACCOUNT CHANGES --- */}
      {activeTab === 'payouts' && (
        <div className="space-y-4">
          {pendingPayouts.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-xs">
              <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <CreditCard className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-1">No Pending Payout Change Requests</h3>
              <p className="text-xs text-slate-500">There are no requested updates to reseller bank or mobile wallet details.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {pendingPayouts.map((req) => (
                <div key={req.id} className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col justify-between">
                  <div className="p-6 space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="font-bold text-slate-900 text-base">{req.resellerName}</h3>
                        <div className="flex items-center gap-1.5 text-xs text-blue-600 font-medium">
                          <Store className="w-3.5 h-3.5" />
                          <span>{req.shopName || 'Reseller'}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">Mobile: {req.mobile}</div>
                      </div>
                      <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center gap-1">
                        <CreditCard className="w-3 h-3 text-emerald-600" />
                        <span>Payout Update</span>
                      </span>
                    </div>

                    {/* New Requested Payout Details Box */}
                    <div className="bg-slate-900 text-white rounded-xl p-4 space-y-2 text-xs shadow-md">
                      <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                        <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                          Requested Payout Method:
                        </span>
                        <span className="bg-emerald-500/20 text-emerald-300 font-extrabold px-2.5 py-0.5 rounded-md uppercase text-[10px]">
                          {req.payoutMethod}
                        </span>
                      </div>

                      {req.payoutMethod === 'bkash' && (
                        <div className="flex items-center justify-between text-pink-300 font-mono font-bold text-sm">
                          <span>bKash Number:</span>
                          <span>{req.bkashNumber}</span>
                        </div>
                      )}

                      {req.payoutMethod === 'nagad' && (
                        <div className="flex items-center justify-between text-amber-300 font-mono font-bold text-sm">
                          <span>Nagad Number:</span>
                          <span>{req.nagadNumber}</span>
                        </div>
                      )}

                      {req.payoutMethod === 'rocket' && (
                        <div className="flex items-center justify-between text-purple-300 font-mono font-bold text-sm">
                          <span>Rocket Number:</span>
                          <span>{req.rocketNumber}</span>
                        </div>
                      )}

                      {req.payoutMethod === 'bank' && (
                        <div className="space-y-1 text-slate-200 text-[11px]">
                          <p><span className="text-slate-400">Bank Name:</span> <strong className="text-white">{req.bankName}</strong></p>
                          <p><span className="text-slate-400">Account Holder:</span> <strong className="text-white">{req.accountHolderName}</strong></p>
                          <p><span className="text-slate-400">Account Number:</span> <strong className="text-emerald-400 font-mono">{req.accountNumber}</strong></p>
                          <p><span className="text-slate-400">Branch:</span> <strong className="text-white">{req.branchName}</strong></p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-slate-100 bg-slate-50/50 p-4 flex gap-3">
                    <button
                      onClick={() => setRejectingPayout(req)}
                      disabled={actionLoadingId === req.id}
                      className="flex-1 bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 font-medium py-2 px-4 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>Reject Change</span>
                    </button>
                    <button
                      onClick={() => handleApprovePayout(req)}
                      disabled={actionLoadingId === req.id}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 px-4 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Approve Payout</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Reject User Registration Modal */}
      {rejectingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Reject Reseller Application</h3>
            <p className="text-xs text-slate-500">
              Provide a clear reason for rejecting <span className="font-semibold text-slate-900">{rejectingUser.fullName}</span> ({rejectingUser.shopName}).
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Rejection Reason *
              </label>
              <textarea
                rows={3}
                required
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g., Shop photo is unclear or mobile number verification failed."
                className="w-full p-3 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-rose-500 focus:border-transparent resize-none"
              ></textarea>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { setRejectingUser(null); setRejectReason(''); }}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-medium hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRejectUserConfirm}
                className="flex-1 px-4 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-medium hover:bg-rose-700 shadow-xs"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Payout Change Modal */}
      {rejectingPayout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Reject Payout Account Update</h3>
            <p className="text-xs text-slate-500">
              Provide a reason for rejecting the payout account change for <span className="font-semibold text-slate-900">{rejectingPayout.resellerName}</span>.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Rejection Reason *
              </label>
              <textarea
                rows={3}
                required
                value={payoutRejectReason}
                onChange={(e) => setPayoutRejectReason(e.target.value)}
                placeholder="e.g., Mobile wallet number invalid or name mismatch."
                className="w-full p-3 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-rose-500 focus:border-transparent resize-none"
              ></textarea>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { setRejectingPayout(null); setPayoutRejectReason(''); }}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-medium hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRejectPayoutConfirm}
                className="flex-1 px-4 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-medium hover:bg-rose-700 shadow-xs"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo Lightbox Modal */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setSelectedPhoto(null)}>
          <div className="relative max-w-3xl max-h-[90vh]">
            <img src={selectedPhoto} alt="Enlarged view" className="max-w-full max-h-[85vh] rounded-2xl object-contain shadow-2xl" />
            <button
              onClick={() => setSelectedPhoto(null)}
              className="absolute -top-4 -right-4 bg-white text-slate-800 rounded-full p-2 shadow-lg hover:bg-slate-100"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

