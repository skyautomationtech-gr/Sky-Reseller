import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserProfile, UserStatus } from '../../types';
import { EditUserModal } from './EditUserModal';
import { Store, Phone, Mail, MapPin, Search, Ban, CheckCircle2, Clock, XCircle, Shield, Edit, UserCheck, CreditCard, Percent, Key, Eye, EyeOff, RotateCw } from 'lucide-react';
import { usePageRefresh, useRefresh } from '../../context/RefreshContext';

interface AllResellersListProps {
  user?: UserProfile;
}

export const AllResellersList: React.FC<AllResellersListProps> = ({ user: currentUser }) => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});

  const isSuperAdmin = currentUser?.role === 'super_admin';

  const { isRefreshing, showToast, refreshCurrentPage } = useRefresh();

  const handleRefresh = async () => {
    await fetchUsers(true);
  };

  usePageRefresh('resellers', handleRefresh);

  const fetchUsers = async (isManualRefresh = false) => {
    setLoading(true);
    try {
      const querySnapshot = await getDocs(collection(db, 'users'));
      const list: UserProfile[] = [];
      querySnapshot.forEach((docSnap) => {
        list.push(docSnap.data() as UserProfile);
      });
      setUsers(list);
      if (isManualRefresh) {
        showToast('✓ Reseller directory refreshed', 'success');
      }
    } catch (err) {
      console.error('Error fetching users:', err);
      if (isManualRefresh) {
        showToast('✗ Failed to refresh reseller directory', 'error');
      }
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
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    const matchesSearch =
      user.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.shopName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.mobile.includes(searchQuery) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (user.district && user.district.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (user.upazila && user.upazila.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesStatus && matchesRole && matchesSearch;
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
        return <span className="bg-purple-100 text-purple-800 border border-purple-200 text-[10px] font-bold px-2 py-0.5 rounded uppercase flex items-center gap-1 w-fit"><Shield className="w-3 h-3 text-purple-600" /> Super Admin</span>;
      case 'admin':
        return <span className="bg-blue-100 text-blue-800 border border-blue-200 text-[10px] font-bold px-2 py-0.5 rounded uppercase flex items-center gap-1 w-fit"><Shield className="w-3 h-3 text-blue-600" /> Admin</span>;
      default:
        return <span className="bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-bold px-2 py-0.5 rounded uppercase w-fit">Reseller</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <span>Reseller & Admin User Directory</span>
            {isSuperAdmin && (
              <span className="bg-purple-100 text-purple-800 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                Super Admin Edit Unlocked
              </span>
            )}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">View and edit details of all Reseller and Admin accounts.</p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
          <button
            type="button"
            onClick={() => refreshCurrentPage()}
            disabled={isRefreshing || loading}
            className="bg-white border border-slate-200 hover:border-blue-400 text-slate-700 hover:text-blue-600 text-xs font-semibold px-3 py-2 rounded-xl shadow-2xs transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer h-[38px] shrink-0"
            title="Refresh Directory"
          >
            <RotateCw className={`w-3.5 h-3.5 text-blue-600 ${isRefreshing || loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {/* Search Input */}
          <div className="relative w-full sm:w-72">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name, shop, phone, city..."
              className="w-full pl-9 pr-4 py-2 bg-white rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-blue-600 focus:border-transparent h-[38px]"
            />
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        {/* Role Filter */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-500 mr-2 uppercase tracking-wider">Account Role:</span>
          {[
            { key: 'all', label: 'All Roles' },
            { key: 'reseller', label: 'Resellers Only' },
            { key: 'admin', label: 'Admins Only' },
            { key: 'super_admin', label: 'Super Admins' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setRoleFilter(tab.key)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                roleFilter === tab.key
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Status Filter */}
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <span className="text-xs font-bold text-slate-500 mr-2 uppercase tracking-wider">Filter Status:</span>
          {[
            { key: 'all', label: 'All Statuses' },
            { key: 'approved', label: 'Approved' },
            { key: 'pending', label: 'Pending' },
            { key: 'suspended', label: 'Suspended' },
            { key: 'rejected', label: 'Rejected' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                statusFilter === tab.key
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Clock className="w-6 h-6 animate-spin mr-2" />
          <span>Loading user accounts directory...</span>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-xs">
          <Store className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-900 mb-1">No Accounts Found</h3>
          <p className="text-xs text-slate-500">No reseller or admin accounts match the selected criteria.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  <th className="py-3.5 px-4">User & Shop Details</th>
                  <th className="py-3.5 px-4">Role</th>
                  <th className="py-3.5 px-4">Contact & Location</th>
                  {isSuperAdmin && <th className="py-3.5 px-4">Password</th>}
                  <th className="py-3.5 px-4">Commission / Payout info</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredUsers.map((u) => (
                  <tr key={u.uid} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        {u.profilePhotoUrl ? (
                          <img
                            src={u.profilePhotoUrl}
                            alt={u.fullName}
                            className="w-10 h-10 rounded-xl object-cover border border-slate-200 cursor-pointer hover:opacity-90"
                            onClick={() => setSelectedPhoto(u.profilePhotoUrl)}
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 font-bold">
                            {u.fullName.charAt(0) || 'U'}
                          </div>
                        )}
                        <div>
                          <div className="font-bold text-slate-900">{u.fullName}</div>
                          <div className="text-blue-600 font-medium text-[11px]">{u.shopName || 'No Shop Name'}</div>
                          <div className="text-[10px] text-slate-400">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      {getRoleBadge(u.role)}
                    </td>
                    <td className="py-4 px-4 space-y-0.5 text-slate-600">
                      <div className="flex items-center gap-1.5 font-medium text-slate-900">
                        <Phone className="w-3 h-3 text-slate-400" />
                        <span>{u.mobile}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-500">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        <span>{u.upazila || 'N/A'}, {u.district || 'N/A'}</span>
                      </div>
                    </td>
                    {isSuperAdmin && (
                      <td className="py-4 px-4">
                        {u.plainPassword ? (
                          <div className="flex items-center gap-1 bg-amber-50 border border-amber-200 text-amber-900 px-2.5 py-1 rounded-lg w-fit text-[11px] font-mono shadow-2xs">
                            <Key className="w-3 h-3 text-amber-600 shrink-0" />
                            <span>{visiblePasswords[u.uid] ? u.plainPassword : '••••••••'}</span>
                            <button
                              type="button"
                              onClick={() => setVisiblePasswords(prev => ({ ...prev, [u.uid]: !prev[u.uid] }))}
                              className="text-amber-700 hover:text-amber-950 p-0.5 ml-1 transition-colors"
                              title={visiblePasswords[u.uid] ? "Hide password" : "Show password"}
                            >
                              {visiblePasswords[u.uid] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400 italic">Not set</span>
                        )}
                      </td>
                    )}
                    <td className="py-4 px-4 space-y-1 text-[11px]">
                      {u.customCommissionRate !== undefined && u.customCommissionRate !== null ? (
                        <div className="bg-blue-50 text-blue-800 border border-blue-200 font-bold px-2 py-0.5 rounded-lg w-fit flex items-center gap-1">
                          <Percent className="w-3 h-3 text-blue-600" />
                          <span>{u.customCommissionRate}% Custom</span>
                        </div>
                      ) : (
                        <div className="text-slate-400 italic">Global Rate</div>
                      )}
                      {(u.bkashNumber || u.nagadNumber || u.accountNumber) ? (
                        <div className="text-slate-500 text-[10px] flex items-center gap-1">
                          <CreditCard className="w-3 h-3 text-slate-400" />
                          <span>{u.bkashNumber ? `bKash: ${u.bkashNumber}` : u.nagadNumber ? `Nagad: ${u.nagadNumber}` : u.bankName ? `${u.bankName}` : 'Payout Configured'}</span>
                        </div>
                      ) : null}
                    </td>
                    <td className="py-4 px-4">
                      {getStatusBadge(u.status)}
                    </td>
                    <td className="py-4 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* Edit Details Button */}
                        <button
                          onClick={() => setEditingUser(u)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs ${
                            isSuperAdmin 
                              ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                          }`}
                          title={isSuperAdmin ? 'View & Edit Details' : 'View Details'}
                        >
                          <Edit className="w-3.5 h-3.5" />
                          <span>{isSuperAdmin ? 'Edit Details' : 'View Details'}</span>
                        </button>

                        {/* Quick Action Button for Status */}
                        {u.role !== 'super_admin' && isSuperAdmin && (
                          <>
                            {u.status === 'approved' && (
                              <button
                                onClick={() => handleStatusChange(u.uid, 'suspended')}
                                className="px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 font-medium hover:bg-rose-100 transition-colors text-[11px]"
                              >
                                Suspend
                              </button>
                            )}
                            {u.status === 'suspended' && (
                              <button
                                onClick={() => handleStatusChange(u.uid, 'approved')}
                                className="px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 font-medium hover:bg-emerald-100 transition-colors text-[11px]"
                              >
                                Reactivate
                              </button>
                            )}
                            {u.status === 'pending' && (
                              <button
                                onClick={() => handleStatusChange(u.uid, 'approved')}
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 transition-colors text-[11px]"
                              >
                                Approve
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card Layout Fallback */}
          <div className="md:hidden divide-y divide-slate-100">
            {filteredUsers.map((u) => (
              <div key={u.uid} className="p-4 space-y-3 bg-white">
                {/* Profile row */}
                <div className="flex gap-3">
                  {u.profilePhotoUrl ? (
                    <img
                      src={u.profilePhotoUrl}
                      alt={u.fullName}
                      className="w-11 h-11 rounded-xl object-cover border border-slate-200 shrink-0"
                      onClick={() => setSelectedPhoto(u.profilePhotoUrl)}
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 font-bold shrink-0 border border-slate-200/50">
                      {u.fullName.charAt(0) || 'U'}
                    </div>
                  )}
                  <div className="space-y-0.5 min-w-0">
                    <div className="font-extrabold text-slate-900 text-xs truncate">{u.fullName}</div>
                    <div className="text-blue-600 font-bold text-[10px] truncate">{u.shopName || 'No Shop Name'}</div>
                    <div className="text-[10px] text-slate-400 truncate">{u.email}</div>
                  </div>
                </div>

                {/* Role and Status Row */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-slate-100/60">
                  {getRoleBadge(u.role)}
                  {getStatusBadge(u.status)}
                </div>

                {/* Details grid */}
                <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-200/40">
                  <div className="space-y-0.5">
                    <span className="text-[9px] text-slate-400 font-bold block uppercase">Contact Info</span>
                    <div className="flex items-center gap-1 text-slate-800 font-semibold font-mono text-[10px]">
                      <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                      <span>{u.mobile}</span>
                    </div>
                    <div className="flex items-center gap-1 text-slate-500 text-[10px] truncate">
                      <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                      <span>{u.upazila || 'N/A'}, {u.district || 'N/A'}</span>
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-[9px] text-slate-400 font-bold block uppercase">Commission & Payout</span>
                    {u.customCommissionRate !== undefined && u.customCommissionRate !== null ? (
                      <span className="inline-flex items-center gap-1 text-[9px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                        <Percent className="w-2.5 h-2.5" /> {u.customCommissionRate}% Custom
                      </span>
                    ) : (
                      <span className="text-slate-400 italic text-[10px] block">Global Rate</span>
                    )}
                    {(u.bkashNumber || u.nagadNumber || u.accountNumber) ? (
                      <div className="text-slate-500 text-[9px] truncate mt-0.5 flex items-center gap-0.5">
                        <CreditCard className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                        <span>{u.bkashNumber ? `bKash: ${u.bkashNumber}` : u.nagadNumber ? `Nagad: ${u.nagadNumber}` : u.bankName ? u.bankName : 'Configured'}</span>
                      </div>
                    ) : null}
                  </div>

                  {isSuperAdmin && u.plainPassword && (
                    <div className="col-span-2 space-y-1 pt-1 border-t border-slate-200/30">
                      <span className="text-[9px] text-slate-400 font-bold block uppercase">Login Credentials</span>
                      <div className="flex items-center gap-1 bg-amber-50 border border-amber-200 text-amber-900 px-2 py-0.5 rounded-lg w-fit text-[10px] font-mono shadow-2xs">
                        <Key className="w-3 h-3 text-amber-600 shrink-0" />
                        <span>{visiblePasswords[u.uid] ? u.plainPassword : '••••••••'}</span>
                        <button
                          type="button"
                          onClick={() => setVisiblePasswords(prev => ({ ...prev, [u.uid]: !prev[u.uid] }))}
                          className="text-amber-700 hover:text-amber-950 p-0.5 ml-1 transition-colors"
                          title={visiblePasswords[u.uid] ? "Hide password" : "Show password"}
                        >
                          {visiblePasswords[u.uid] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Action Row */}
                <div className="flex flex-wrap items-center justify-end gap-1.5 pt-2 border-t border-slate-100">
                  <button
                    onClick={() => setEditingUser(u)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs ${
                      isSuperAdmin 
                        ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                    }`}
                  >
                    <Edit className="w-3.5 h-3.5" />
                    <span>{isSuperAdmin ? 'Edit Details' : 'View Details'}</span>
                  </button>

                  {u.role !== 'super_admin' && isSuperAdmin && (
                    <>
                      {u.status === 'approved' && (
                        <button
                          onClick={() => handleStatusChange(u.uid, 'suspended')}
                          className="px-2.5 py-1.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 font-bold hover:bg-rose-100 transition-colors text-xs"
                        >
                          Suspend
                        </button>
                      )}
                      {u.status === 'suspended' && (
                        <button
                          onClick={() => handleStatusChange(u.uid, 'approved')}
                          className="px-2.5 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 font-bold hover:bg-emerald-100 transition-colors text-xs"
                        >
                          Reactivate
                        </button>
                      )}
                      {u.status === 'pending' && (
                        <button
                          onClick={() => handleStatusChange(u.uid, 'approved')}
                          className="px-2.5 py-1.5 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 transition-colors text-xs"
                        >
                          Approve
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit User Details Modal */}
      <EditUserModal
        isOpen={!!editingUser}
        onClose={() => setEditingUser(null)}
        targetUser={editingUser}
        currentUser={currentUser}
        onUserUpdated={() => fetchUsers()}
      />

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

