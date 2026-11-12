import React, { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserProfile } from '../../types';
import {
  ShieldCheck,
  UserPlus,
  RefreshCw,
  Mail,
  Phone,
  CheckCircle2,
  AlertTriangle,
  Ban,
  Search,
  KeyRound,
  Shield,
  Send,
  Sliders,
  X,
  Check,
  Info
} from 'lucide-react';
import {
  ADMIN_PERMISSIONS_LIST,
  resendAdminWelcomeEmailCall,
  toggleAdminStatusCall,
  updateAdminPermissionsCall,
} from '../../lib/adminManagementService';

interface AdminManagementViewProps {
  user: UserProfile;
  onOpenCreateAdmin: () => void;
}

export const AdminManagementView: React.FC<AdminManagementViewProps> = ({
  user,
  onOpenCreateAdmin,
}) => {
  const [admins, setAdmins] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Quick Permissions Modal state
  const [editingAdmin, setEditingAdmin] = useState<UserProfile | null>(null);
  const [editPermissions, setEditPermissions] = useState<string[]>([]);
  const [savingPermissions, setSavingPermissions] = useState(false);

  // Status toggle confirmation
  const [confirmStatusAdmin, setConfirmStatusAdmin] = useState<UserProfile | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  // Resend email loading
  const [resendingUid, setResendingUid] = useState<string | null>(null);

  const isSoleSuperAdmin = user.email?.toLowerCase().trim() === 'skyautomationtech@gmail.com' && user.role === 'super_admin';

  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'users'), where('role', '==', 'admin'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: UserProfile[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ uid: docSnap.id, ...docSnap.data() } as UserProfile);
        });
        // Sort by adminId or createdAt
        list.sort((a, b) => {
          if (a.adminId && b.adminId) return a.adminId.localeCompare(b.adminId);
          return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
        });
        setAdmins(list);
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching admins:', err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const showBanner = (text: string, type: 'success' | 'error' = 'success') => {
    setActionMessage({ text, type });
    setTimeout(() => setActionMessage(null), 4000);
  };

  const handleResendWelcomeEmail = async (admin: UserProfile) => {
    if (!admin.uid) return;
    setResendingUid(admin.uid);
    try {
      const res = await resendAdminWelcomeEmailCall(admin.uid);
      showBanner(res.message || `Welcome email sent to ${admin.email}!`, 'success');
    } catch (err: any) {
      showBanner(err.message || 'Could not resend email.', 'error');
    } finally {
      setResendingUid(null);
    }
  };

  const handleToggleStatus = async () => {
    if (!confirmStatusAdmin || !confirmStatusAdmin.uid) return;
    setStatusLoading(true);
    const newStatus = confirmStatusAdmin.status === 'suspended' ? 'approved' : 'suspended';

    try {
      const res = await toggleAdminStatusCall(confirmStatusAdmin.uid, newStatus);
      showBanner(res.message || `Admin status changed to ${newStatus}.`, 'success');
      setConfirmStatusAdmin(null);
    } catch (err: any) {
      showBanner(err.message || 'Could not update status.', 'error');
    } finally {
      setStatusLoading(false);
    }
  };

  const openPermissionsModal = (admin: UserProfile) => {
    setEditingAdmin(admin);
    setEditPermissions(admin.permissions || []);
  };

  const handleSavePermissions = async () => {
    if (!editingAdmin || !editingAdmin.uid) return;
    setSavingPermissions(true);
    try {
      await updateAdminPermissionsCall(editingAdmin.uid, editPermissions);
      showBanner(`Permissions updated for ${editingAdmin.fullName}!`, 'success');
      setEditingAdmin(null);
    } catch (err: any) {
      showBanner(err.message || 'Failed to update permissions.', 'error');
    } finally {
      setSavingPermissions(false);
    }
  };

  const filteredAdmins = admins.filter((a) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      a.fullName?.toLowerCase().includes(q) ||
      a.email?.toLowerCase().includes(q) ||
      a.mobile?.includes(q) ||
      a.adminId?.toLowerCase().includes(q)
    );
  });

  const activeCount = admins.filter((a) => a.status === 'approved').length;

  return (
    <div className="space-y-6">
      {/* Top Banner Alert */}
      {actionMessage && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between text-xs animate-in fade-in duration-200 ${
            actionMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-[#3DD055] shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{actionMessage.text}</span>
          </div>
          <button
            onClick={() => setActionMessage(null)}
            className="text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#0B1528]/80 border border-white/10 rounded-2xl p-5 backdrop-blur-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#0E9AA7] to-[#3DD055] p-[1px] flex items-center justify-center">
              <div className="w-full h-full bg-[#0B1528] rounded-[11px] flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-[#3DD055]" />
              </div>
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                Admin Management
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#3DD055]/15 text-[#3DD055] border border-[#3DD055]/30">
                  {activeCount} / 10 Active Admins
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                অ্যাডমিন তৈরি, অনুমতি নিয়ন্ত্রণ এবং অ্যাকাউন্ট স্ট্যাটাস পরিচালনা করুন
              </p>
            </div>
          </div>
        </div>

        {/* Action Button */}
        {isSoleSuperAdmin ? (
          <button
            onClick={onOpenCreateAdmin}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#0E9AA7] to-[#3DD055] text-slate-950 font-bold text-xs hover:brightness-110 shadow-lg shadow-[#3DD055]/20 transition-all cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            + Create New Admin
          </button>
        ) : (
          <div className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-1.5">
            <Info className="w-4 h-4" />
            Super Admin View Only
          </div>
        )}
      </div>

      {/* Search and Filter */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search admins by name, email, or Admin ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-[#0E9AA7]"
          />
        </div>
        <div className="text-xs text-slate-400">
          Showing <span className="font-bold text-white">{filteredAdmins.length}</span> administrators
        </div>
      </div>

      {/* Admin Cards Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <RefreshCw className="w-8 h-8 animate-spin text-[#0E9AA7] mb-2" />
          <p className="text-xs">Loading administrator accounts...</p>
        </div>
      ) : filteredAdmins.length === 0 ? (
        <div className="text-center py-16 px-4 bg-[#0B1528]/50 border border-white/5 rounded-2xl">
          <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-3 text-slate-500">
            <Shield className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-white mb-1">
            {searchQuery ? 'No administrators match your search' : 'No Sub-Administrators Created Yet'}
          </h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mb-4">
            {searchQuery
              ? 'Try searching with a different name, email, or Admin ID.'
              : 'As Super Admin, you can delegate operational tasks like order processing, catalog updates, and wallet approvals to trusted team members.'}
          </p>
          {isSoleSuperAdmin && !searchQuery && (
            <button
              onClick={onOpenCreateAdmin}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#3DD055]/15 border border-[#3DD055]/30 text-[#3DD055] text-xs font-bold hover:bg-[#3DD055]/25 transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              Create First Admin Account
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredAdmins.map((admin) => {
            const isSuspended = admin.status === 'suspended';
            const mustChange = admin.mustChangePassword === true;
            const perms = admin.permissions || [];

            return (
              <div
                key={admin.uid}
                className={`relative rounded-2xl p-5 border transition-all ${
                  isSuspended
                    ? 'bg-rose-950/10 border-rose-500/20 opacity-80'
                    : 'bg-[#0B1528]/80 border-white/10 hover:border-white/20'
                }`}
              >
                {/* Admin Header */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#0E9AA7]/20 to-[#3DD055]/20 border border-white/10 flex items-center justify-center text-white font-bold text-sm">
                      {admin.profilePhotoUrl ? (
                        <img
                          src={admin.profilePhotoUrl}
                          alt={admin.fullName}
                          className="w-full h-full rounded-xl object-cover"
                        />
                      ) : (
                        admin.fullName?.charAt(0).toUpperCase() || 'A'
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-white">{admin.fullName}</h3>
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-[#0E9AA7]/15 text-[#0E9AA7] border border-[#0E9AA7]/30">
                          {admin.adminId || 'ADM-????'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                        <span className="flex items-center gap-1">
                          <Mail className="w-3 h-3 text-slate-500" />
                          {admin.email}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div>
                    {isSuspended ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400 text-[10px] font-bold">
                        <Ban className="w-3 h-3" />
                        Suspended
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#3DD055]/15 border border-[#3DD055]/30 text-[#3DD055] text-[10px] font-bold">
                        <CheckCircle2 className="w-3 h-3" />
                        Approved
                      </span>
                    )}
                  </div>
                </div>

                {/* Sub details: Mobile, First login status */}
                <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-white/[0.03] border border-white/5 text-[11px] mb-3">
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <Phone className="w-3.5 h-3.5 text-slate-500" />
                    <span>{admin.mobile || 'No mobile'}</span>
                  </div>
                  <div className="flex items-center justify-end gap-1.5">
                    {mustChange ? (
                      <span className="text-amber-400 flex items-center gap-1 font-medium text-[10px]">
                        <KeyRound className="w-3 h-3" />
                        First Login Pending
                      </span>
                    ) : (
                      <span className="text-emerald-400 flex items-center gap-1 font-medium text-[10px]">
                        <CheckCircle2 className="w-3 h-3" />
                        Active & Verified
                      </span>
                    )}
                  </div>
                </div>

                {/* Permissions Chips */}
                <div className="space-y-1.5 mb-4">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>Assigned Permissions ({perms.length}):</span>
                    {isSoleSuperAdmin && (
                      <button
                        onClick={() => openPermissionsModal(admin)}
                        className="text-[#0E9AA7] hover:underline flex items-center gap-1 text-[10px]"
                      >
                        <Sliders className="w-3 h-3" />
                        Edit Permissions
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {perms.slice(0, 4).map((pId) => {
                      const def = ADMIN_PERMISSIONS_LIST.find((p) => p.id === pId);
                      return (
                        <span
                          key={pId}
                          className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[10px] text-slate-300"
                        >
                          {def ? def.label : pId}
                        </span>
                      );
                    })}
                    {perms.length > 4 && (
                      <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[10px] text-slate-500">
                        +{perms.length - 4} more
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Action Buttons */}
                {isSoleSuperAdmin && (
                  <div className="flex items-center justify-between pt-3 border-t border-white/5 gap-2">
                    {/* Resend Welcome Email */}
                    <button
                      onClick={() => handleResendWelcomeEmail(admin)}
                      disabled={resendingUid === admin.uid}
                      className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors disabled:opacity-50"
                      title="Resend welcome email with password reset link"
                    >
                      {resendingUid === admin.uid ? (
                        <RefreshCw className="w-3 h-3 animate-spin text-[#0E9AA7]" />
                      ) : (
                        <Send className="w-3 h-3 text-[#0E9AA7]" />
                      )}
                      Resend Welcome Email
                    </button>

                    {/* Suspend / Activate Toggle */}
                    <button
                      onClick={() => setConfirmStatusAdmin(admin)}
                      className={`px-3 py-1.5 rounded-lg border text-[11px] font-semibold flex items-center gap-1.5 transition-colors ${
                        isSuspended
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                          : 'bg-rose-500/10 border-rose-500/30 text-rose-300 hover:bg-rose-500/20'
                      }`}
                    >
                      {isSuspended ? (
                        <>
                          <CheckCircle2 className="w-3 h-3" />
                          Activate Admin
                        </>
                      ) : (
                        <>
                          <Ban className="w-3 h-3" />
                          Suspend Admin
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Permissions Modal */}
      {editingAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-lg bg-[#070E1E] border border-white/10 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white">Edit Permissions: {editingAdmin.fullName}</h3>
                <p className="text-xs text-slate-400">{editingAdmin.adminId} • {editingAdmin.email}</p>
              </div>
              <button
                onClick={() => setEditingAdmin(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
              {ADMIN_PERMISSIONS_LIST.map((perm) => {
                const isChecked = editPermissions.includes(perm.id);
                return (
                  <label
                    key={perm.id}
                    className={`flex items-start gap-2.5 p-2.5 rounded-xl cursor-pointer border transition-colors ${
                      isChecked
                        ? 'bg-[#3DD055]/10 border-[#3DD055]/30 text-white'
                        : 'bg-white/[0.02] border-white/5 text-slate-400 hover:bg-white/5'
                    }`}
                  >
                    <div className="pt-0.5">
                      <div
                        className={`w-4 h-4 rounded flex items-center justify-center ${
                          isChecked ? 'bg-[#3DD055] text-slate-950 font-bold' : 'border border-slate-600 bg-white/5'
                        }`}
                      >
                        {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={isChecked}
                        onChange={() => {
                          setEditPermissions((prev) =>
                            prev.includes(perm.id) ? prev.filter((p) => p !== perm.id) : [...prev, perm.id]
                          );
                        }}
                      />
                    </div>
                    <div className="flex-1 text-xs">
                      <p className="font-semibold leading-tight">{perm.label}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{perm.description}</p>
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setEditingAdmin(null)}
                className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSavePermissions}
                disabled={savingPermissions || editPermissions.length === 0}
                className="px-5 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-[#0E9AA7] to-[#3DD055] text-slate-950 hover:brightness-110 shadow-lg shadow-[#3DD055]/20 disabled:opacity-50"
              >
                {savingPermissions ? 'Saving...' : 'Save Permissions'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Status Toggle Modal */}
      {confirmStatusAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-md bg-[#070E1E] border border-white/10 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="text-center space-y-2">
              <div
                className={`w-12 h-12 rounded-2xl mx-auto flex items-center justify-center ${
                  confirmStatusAdmin.status === 'suspended'
                    ? 'bg-emerald-500/15 text-[#3DD055]'
                    : 'bg-rose-500/15 text-rose-400'
                }`}
              >
                {confirmStatusAdmin.status === 'suspended' ? <CheckCircle2 className="w-6 h-6" /> : <Ban className="w-6 h-6" />}
              </div>
              <h3 className="text-base font-bold text-white">
                {confirmStatusAdmin.status === 'suspended' ? 'Activate Administrator Account?' : 'Suspend Administrator Account?'}
              </h3>
              <p className="text-xs text-slate-400">
                {confirmStatusAdmin.fullName} ({confirmStatusAdmin.adminId || confirmStatusAdmin.email})
              </p>
            </div>

            <p className="text-xs text-slate-300 text-center">
              {confirmStatusAdmin.status === 'suspended'
                ? 'এই অ্যাকাউন্টটি পুনরায় সক্রিয় করলে অ্যাডমিন পুনরায় সিস্টেমে লগইন ও কাজ করতে পারবেন।'
                : 'অ্যাকাউন্ট সাসপেন্ড করলে তাৎক্ষণিকভাবে অ্যাডমিনের সেশন বন্ধ হয়ে যাবে এবং তিনি আর অ্যাডমিন পোর্টালে প্রবেশ করতে পারবেন না।'}
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setConfirmStatusAdmin(null)}
                disabled={statusLoading}
                className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleToggleStatus}
                disabled={statusLoading}
                className={`px-5 py-2 text-xs font-bold rounded-xl text-slate-950 transition-all ${
                  confirmStatusAdmin.status === 'suspended'
                    ? 'bg-[#3DD055] hover:brightness-110 shadow-lg shadow-[#3DD055]/30'
                    : 'bg-rose-500 hover:brightness-110 text-white shadow-lg shadow-rose-500/30'
                }`}
              >
                {statusLoading ? 'Processing...' : confirmStatusAdmin.status === 'suspended' ? 'Confirm Activation' : 'Confirm Suspension'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
