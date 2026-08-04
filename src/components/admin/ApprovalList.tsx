import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserProfile } from '../../types';
import { CheckCircle2, XCircle, Clock, Store, Phone, MapPin, Mail, Eye, AlertCircle, FileText } from 'lucide-react';

export const ApprovalList: React.FC = () => {
  const [pendingUsers, setPendingUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectingUser, setRejectingUser] = useState<UserProfile | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  const fetchPendingUsers = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'users'), where('status', '==', 'pending'));
      const querySnapshot = await getDocs(q);
      const list: UserProfile[] = [];
      querySnapshot.forEach((docSnap) => {
        list.push(docSnap.data() as UserProfile);
      });
      setPendingUsers(list);
    } catch (err) {
      console.error('Error fetching pending users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingUsers();
  }, []);

  const handleApprove = async (uid: string) => {
    try {
      await updateDoc(doc(db, 'users', uid), {
        status: 'approved',
        rejectReason: null,
      });
      setPendingUsers(prev => prev.filter(u => u.uid !== uid));
    } catch (err) {
      console.error('Error approving user:', err);
      alert('Failed to approve user');
    }
  };

  const handleRejectConfirm = async () => {
    if (!rejectingUser || !rejectReason.trim()) {
      alert('Please provide a rejection reason.');
      return;
    }

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
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <Clock className="w-6 h-6 animate-spin mr-2" />
        <span>Loading pending applications...</span>
      </div>
    );
  }

  if (pendingUsers.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
        <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-slate-900 mb-1">No Pending Approvals</h3>
        <p className="text-sm text-slate-500">All reseller registration applications have been reviewed.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Pending Reseller Applications</h2>
          <p className="text-xs text-slate-500 mt-0.5">Review and approve new reseller accounts requesting access.</p>
        </div>
        <span className="bg-amber-100 text-amber-800 text-xs font-semibold px-3 py-1 rounded-full">
          {pendingUsers.length} Pending
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {pendingUsers.map((user) => (
          <div key={user.uid} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col justify-between">
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
                <span className="bg-amber-50 text-amber-700 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
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
              </div>

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
                className="flex-1 bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 font-medium py-2 px-4 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5"
              >
                <XCircle className="w-4 h-4" />
                <span>Reject</span>
              </button>
              <button
                onClick={() => handleApprove(user.uid)}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 px-4 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 shadow-sm"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Approve Account</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Reject Modal */}
      {rejectingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Reject Reseller Application</h3>
            <p className="text-xs text-slate-500">
              Provide a clear reason for rejecting <span className="font-semibold text-slate-900">{rejectingUser.fullName}</span> ({rejectingUser.shopName}). This will be displayed to the user.
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
                onClick={handleRejectConfirm}
                className="flex-1 px-4 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-medium hover:bg-rose-700 shadow-sm"
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
