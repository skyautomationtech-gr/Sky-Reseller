import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserProfile, UserStatus } from '../../types';
import { Store, Phone, Mail, MapPin, Search, Ban, CheckCircle2, Clock, XCircle, Shield } from 'lucide-react';

export const AllResellersList: React.FC = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const querySnapshot = await getDocs(collection(db, 'users'));
      const list: UserProfile[] = [];
      querySnapshot.forEach((docSnap) => {
        list.push(docSnap.data() as UserProfile);
      });
      setUsers(list);
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleStatusChange = async (uid: string, newStatus: UserStatus) => {
    try {
      await updateDoc(doc(db, 'users', uid), {
        status: newStatus,
        ...(newStatus === 'approved' ? { rejectReason: null } : {})
      });
      setUsers(prev => prev.map(u => u.uid === uid ? { ...u, status: newStatus } : u));
    } catch (err) {
      console.error('Error updating user status:', err);
      alert('Failed to update status');
    }
  };

  const filteredUsers = users.filter(user => {
    const matchesStatus = statusFilter === 'all' || user.status === statusFilter;
    const matchesSearch =
      user.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.shopName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.mobile.includes(searchQuery) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const getStatusBadge = (status: UserStatus) => {
    switch (status) {
      case 'approved':
        return <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center gap-1 w-fit"><CheckCircle2 className="w-3 h-3" /> Approved</span>;
      case 'pending':
        return <span className="bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center gap-1 w-fit"><Clock className="w-3 h-3" /> Pending</span>;
      case 'rejected':
        return <span className="bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center gap-1 w-fit"><XCircle className="w-3 h-3" /> Rejected</span>;
      case 'suspended':
        return <span className="bg-slate-100 text-slate-700 border border-slate-300 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center gap-1 w-fit"><Ban className="w-3 h-3" /> Suspended</span>;
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'super_admin':
        return <span className="bg-purple-100 text-purple-800 text-[10px] font-bold px-2 py-0.5 rounded uppercase">Super Admin</span>;
      case 'admin':
        return <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded uppercase">Admin</span>;
      default:
        return <span className="bg-slate-100 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded uppercase">Reseller</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Reseller & User Directory</h2>
          <p className="text-xs text-slate-500 mt-0.5">Manage all registered accounts, status updates, and suspensions.</p>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-72">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search name, shop, phone..."
            className="w-full pl-9 pr-4 py-2 bg-white rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-blue-600 focus:border-transparent"
          />
        </div>
      </div>

      {/* Chip / Toggle Style Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-500 mr-2">Filter Status:</span>
        {[
          { key: 'all', label: 'All Users' },
          { key: 'approved', label: 'Approved' },
          { key: 'pending', label: 'Pending' },
          { key: 'suspended', label: 'Suspended' },
          { key: 'rejected', label: 'Rejected' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
              statusFilter === tab.key
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Clock className="w-6 h-6 animate-spin mr-2" />
          <span>Loading users directory...</span>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
          <Store className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-900 mb-1">No Users Found</h3>
          <p className="text-xs text-slate-500">No users match the selected filter criteria.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  <th className="py-3.5 px-4">User & Shop</th>
                  <th className="py-3.5 px-4">Role</th>
                  <th className="py-3.5 px-4">Contact & Location</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredUsers.map((user) => (
                  <tr key={user.uid} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        {user.profilePhotoUrl ? (
                          <img
                            src={user.profilePhotoUrl}
                            alt={user.fullName}
                            className="w-10 h-10 rounded-xl object-cover border border-slate-200 cursor-pointer"
                            onClick={() => setSelectedPhoto(user.profilePhotoUrl)}
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 font-bold">
                            {user.fullName.charAt(0)}
                          </div>
                        )}
                        <div>
                          <div className="font-bold text-slate-900">{user.fullName}</div>
                          <div className="text-blue-600 font-medium">{user.shopName}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      {getRoleBadge(user.role)}
                    </td>
                    <td className="py-4 px-4 space-y-0.5 text-slate-600">
                      <div className="flex items-center gap-1.5 font-medium text-slate-900">
                        <Phone className="w-3 h-3 text-slate-400" />
                        <span>{user.mobile}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-500">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        <span>{user.upazila}, {user.district}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      {getStatusBadge(user.status)}
                    </td>
                    <td className="py-4 px-4 text-right">
                      {user.role !== 'super_admin' && (
                        <div className="flex items-center justify-end gap-2">
                          {user.status === 'approved' && (
                            <button
                              onClick={() => handleStatusChange(user.uid, 'suspended')}
                              className="px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 font-medium hover:bg-rose-100 transition-colors text-[11px]"
                            >
                              Suspend
                            </button>
                          )}
                          {user.status === 'suspended' && (
                            <button
                              onClick={() => handleStatusChange(user.uid, 'approved')}
                              className="px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 font-medium hover:bg-emerald-100 transition-colors text-[11px]"
                            >
                              Reactivate
                            </button>
                          )}
                          {user.status === 'pending' && (
                            <button
                              onClick={() => handleStatusChange(user.uid, 'approved')}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 transition-colors text-[11px]"
                            >
                              Approve
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Photo Lightbox */}
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
