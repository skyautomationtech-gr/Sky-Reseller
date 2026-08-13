import React, { useState, useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserProfile, UserRole, UserStatus } from '../../types';
import { 
  X, Shield, User, Store, Phone, Mail, MapPin, CreditCard, 
  Percent, FileText, CheckCircle2, AlertCircle, Eye, EyeOff, Key, Lock,
  Building2, Landmark, Smartphone, Save
} from 'lucide-react';

interface EditUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUser: UserProfile | null;
  currentUser?: UserProfile;
  onUserUpdated: () => void;
}

export const EditUserModal: React.FC<EditUserModalProps> = ({
  isOpen,
  onClose,
  targetUser,
  currentUser,
  onUserUpdated,
}) => {
  const isSuperAdmin = currentUser?.role === 'super_admin';

  const [formData, setFormData] = useState({
    fullName: '',
    shopName: '',
    mobile: '',
    email: '',
    role: 'reseller' as UserRole,
    status: 'approved' as UserStatus,
    rejectReason: '',
    division: '',
    district: '',
    upazila: '',
    address: '',
    nidNumber: '',
    nidUrl: '',
    profilePhotoUrl: '',
    shopPhotoUrl: '',
    customCommissionRate: '',
    bankName: '',
    accountNumber: '',
    bkashNumber: '',
    nagadNumber: '',
    adminNotes: '',
    plainPassword: '',
  });

  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [activeTab, setActiveTab] = useState<'profile' | 'location' | 'financial' | 'documents'>('profile');

  useEffect(() => {
    if (targetUser) {
      setFormData({
        fullName: targetUser.fullName || '',
        shopName: targetUser.shopName || '',
        mobile: targetUser.mobile || '',
        email: targetUser.email || '',
        role: targetUser.role || 'reseller',
        status: targetUser.status || 'approved',
        rejectReason: targetUser.rejectReason || '',
        division: targetUser.division || '',
        district: targetUser.district || '',
        upazila: targetUser.upazila || '',
        address: targetUser.address || '',
        nidNumber: targetUser.nidNumber || '',
        nidUrl: targetUser.nidUrl || '',
        profilePhotoUrl: targetUser.profilePhotoUrl || '',
        shopPhotoUrl: targetUser.shopPhotoUrl || '',
        customCommissionRate: targetUser.customCommissionRate !== undefined ? String(targetUser.customCommissionRate) : '',
        bankName: targetUser.bankName || '',
        accountNumber: targetUser.accountNumber || '',
        bkashNumber: targetUser.bkashNumber || '',
        nagadNumber: targetUser.nagadNumber || '',
        adminNotes: targetUser.adminNotes || '',
        plainPassword: targetUser.plainPassword || '',
      });
      setShowPassword(false);
      setSuccessMsg('');
      setErrorMsg('');
    }
  }, [targetUser]);

  if (!isOpen || !targetUser) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin) {
      setErrorMsg('Only Super Admin is authorized to edit Reseller & Admin details.');
      return;
    }

    setSaving(true);
    setSuccessMsg('');
    setErrorMsg('');

    try {
      const updatePayload: Record<string, any> = {
        fullName: formData.fullName.trim(),
        shopName: formData.shopName.trim(),
        mobile: formData.mobile.trim(),
        email: formData.email.trim(),
        role: formData.role,
        status: formData.status,
        rejectReason: formData.status === 'rejected' ? formData.rejectReason.trim() : null,
        division: formData.division.trim(),
        district: formData.district.trim(),
        upazila: formData.upazila.trim(),
        address: formData.address.trim(),
        nidNumber: formData.nidNumber.trim(),
        nidUrl: formData.nidUrl.trim(),
        profilePhotoUrl: formData.profilePhotoUrl.trim(),
        shopPhotoUrl: formData.shopPhotoUrl.trim(),
        bankName: formData.bankName.trim(),
        accountNumber: formData.accountNumber.trim(),
        bkashNumber: formData.bkashNumber.trim(),
        nagadNumber: formData.nagadNumber.trim(),
        adminNotes: formData.adminNotes.trim(),
        plainPassword: formData.plainPassword.trim(),
        customCommissionRate: formData.customCommissionRate !== '' ? Number(formData.customCommissionRate) : null,
      };

      await updateDoc(doc(db, 'users', targetUser.uid), updatePayload);

      setSuccessMsg('User details updated successfully!');
      onUserUpdated();
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      console.error('Error updating user:', err);
      setErrorMsg(err.message || 'Failed to update user details.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full my-8 overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-900 text-white p-6 relative">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 text-slate-300 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-4">
            {formData.profilePhotoUrl ? (
              <img
                src={formData.profilePhotoUrl}
                alt={formData.fullName}
                className="w-16 h-16 rounded-2xl object-cover border-2 border-white/30 shadow-md"
              />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-white/20 border-2 border-white/30 flex items-center justify-center text-white font-bold text-xl shadow-md">
                {formData.fullName.charAt(0) || 'U'}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold">{formData.fullName || 'User Profile'}</h2>
                <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                  formData.role === 'super_admin' 
                    ? 'bg-purple-500/30 text-purple-200 border border-purple-400/30'
                    : formData.role === 'admin'
                    ? 'bg-blue-500/30 text-blue-200 border border-blue-400/30'
                    : 'bg-emerald-500/30 text-emerald-200 border border-emerald-400/30'
                }`}>
                  {formData.role.replace('_', ' ')}
                </span>
              </div>
              <p className="text-xs text-blue-200 mt-1 flex items-center gap-1.5">
                <Store className="w-3.5 h-3.5 opacity-80" />
                <span>{formData.shopName || 'No Shop Name'}</span>
                <span className="opacity-40">•</span>
                <span>UID: {targetUser.uid.substring(0, 10)}...</span>
              </p>
            </div>
          </div>

          {!isSuperAdmin && (
            <div className="mt-4 bg-amber-500/20 border border-amber-400/30 rounded-xl p-2.5 flex items-center gap-2 text-xs text-amber-100">
              <Lock className="w-4 h-4 text-amber-300 shrink-0" />
              <span>Editing user details is strictly allowed for <strong>Super Admin</strong> only. Viewing in Read-Only mode.</span>
            </div>
          )}
        </div>

        {/* Tab Buttons */}
        <div className="flex border-b border-slate-200 bg-slate-50/80 px-6 pt-3 gap-2 overflow-x-auto text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`pb-3 px-3 transition-colors border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'profile'
                ? 'border-blue-600 text-blue-600 font-bold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            Account & Role
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('location')}
            className={`pb-3 px-3 transition-colors border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'location'
                ? 'border-blue-600 text-blue-600 font-bold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            Address & Location
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('financial')}
            className={`pb-3 px-3 transition-colors border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'financial'
                ? 'border-blue-600 text-blue-600 font-bold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            Commission & Payouts
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('documents')}
            className={`pb-3 px-3 transition-colors border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'documents'
                ? 'border-blue-600 text-blue-600 font-bold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            NID & Media
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 flex-1 overflow-y-auto space-y-5">
          {successMsg && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-3 text-xs font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-3 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* TAB 1: Profile & Role */}
          {activeTab === 'profile' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={!isSuperAdmin}
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-600 focus:bg-white disabled:opacity-70 disabled:cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Shop / Business Name *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={!isSuperAdmin}
                    value={formData.shopName}
                    onChange={(e) => setFormData({ ...formData, shopName: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-600 focus:bg-white disabled:opacity-70 disabled:cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Mobile Phone *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={!isSuperAdmin}
                    value={formData.mobile}
                    onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-600 focus:bg-white disabled:opacity-70 disabled:cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    disabled={!isSuperAdmin}
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-600 focus:bg-white disabled:opacity-70 disabled:cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Account Role (Super Admin Only)
                  </label>
                  <select
                    disabled={!isSuperAdmin}
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-600 focus:bg-white disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    <option value="reseller">Reseller Account</option>
                    <option value="admin">Admin Staff Account</option>
                    <option value="super_admin">Super Admin Account</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Account Status
                  </label>
                  <select
                    disabled={!isSuperAdmin}
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as UserStatus })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-600 focus:bg-white disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    <option value="approved">Approved (Active)</option>
                    <option value="pending">Pending Approval</option>
                    <option value="suspended">Suspended</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>

                {isSuperAdmin && (
                  <div>
                    <label className="block text-xs font-bold text-amber-900 mb-1 flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Key className="w-3.5 h-3.5 text-amber-600" />
                        Account Password (Super Admin View)
                      </span>
                      {!formData.plainPassword && (
                        <span className="text-[10px] text-amber-600 font-normal italic">Not recorded yet</span>
                      )}
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={formData.plainPassword}
                        onChange={(e) => setFormData({ ...formData, plainPassword: e.target.value })}
                        placeholder="User password..."
                        className="w-full pl-3.5 pr-10 py-2.5 bg-amber-50/70 border border-amber-300/80 rounded-xl text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-amber-500 focus:bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-700"
                        title={showPassword ? 'Hide Password' : 'Show Password'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4 text-amber-700" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {formData.status === 'rejected' && (
                <div>
                  <label className="block text-xs font-semibold text-rose-700 mb-1">
                    Rejection Reason
                  </label>
                  <input
                    type="text"
                    disabled={!isSuperAdmin}
                    value={formData.rejectReason}
                    onChange={(e) => setFormData({ ...formData, rejectReason: e.target.value })}
                    placeholder="Enter explicit reason for rejection..."
                    className="w-full px-3.5 py-2 bg-rose-50 border border-rose-200 text-rose-900 rounded-xl text-xs focus:ring-2 focus:ring-rose-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Internal Super Admin Remarks & Notes
                </label>
                <textarea
                  rows={2}
                  disabled={!isSuperAdmin}
                  value={formData.adminNotes}
                  onChange={(e) => setFormData({ ...formData, adminNotes: e.target.value })}
                  placeholder="Super Admin internal notes regarding performance, agreements, or background check..."
                  className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-600 focus:bg-white disabled:opacity-70 resize-none"
                />
              </div>
            </div>
          )}

          {/* TAB 2: Location & Address */}
          {activeTab === 'location' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Division
                  </label>
                  <input
                    type="text"
                    disabled={!isSuperAdmin}
                    value={formData.division}
                    onChange={(e) => setFormData({ ...formData, division: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-600 focus:bg-white disabled:opacity-70"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    District
                  </label>
                  <input
                    type="text"
                    disabled={!isSuperAdmin}
                    value={formData.district}
                    onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-600 focus:bg-white disabled:opacity-70"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Upazila / Thana
                  </label>
                  <input
                    type="text"
                    disabled={!isSuperAdmin}
                    value={formData.upazila}
                    onChange={(e) => setFormData({ ...formData, upazila: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-600 focus:bg-white disabled:opacity-70"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Full Street Address & Shop Location
                </label>
                <textarea
                  rows={3}
                  disabled={!isSuperAdmin}
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-600 focus:bg-white disabled:opacity-70 resize-none"
                />
              </div>
            </div>
          )}

          {/* TAB 3: Financial & Commission */}
          {activeTab === 'financial' && (
            <div className="space-y-4">
              <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Percent className="w-4 h-4 text-blue-600" />
                  <h4 className="text-xs font-bold text-blue-900">Custom Commission Rate Override</h4>
                </div>
                <p className="text-[11px] text-blue-700 mb-3 leading-relaxed">
                  Override the global system commission for this specific user. Leave blank to use default global/category rates.
                </p>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    disabled={!isSuperAdmin}
                    value={formData.customCommissionRate}
                    onChange={(e) => setFormData({ ...formData, customCommissionRate: e.target.value })}
                    placeholder="e.g. 12.5"
                    className="w-36 px-3.5 py-2 bg-white border border-blue-300 rounded-xl text-xs font-bold text-blue-900 focus:ring-2 focus:ring-blue-600"
                  />
                  <span className="text-xs font-bold text-blue-800">% Special Reseller Rate</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                    <Landmark className="w-3.5 h-3.5 text-slate-400" />
                    Bank Name
                  </label>
                  <input
                    type="text"
                    disabled={!isSuperAdmin}
                    value={formData.bankName}
                    onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                    placeholder="e.g. Dutch Bangla Bank Ltd"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-600 focus:bg-white disabled:opacity-70"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5 text-slate-400" />
                    Bank Account Number
                  </label>
                  <input
                    type="text"
                    disabled={!isSuperAdmin}
                    value={formData.accountNumber}
                    onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                    placeholder="Account Number"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-600 focus:bg-white disabled:opacity-70"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1 text-pink-600">
                    <Smartphone className="w-3.5 h-3.5 text-pink-500" />
                    bKash Personal / Merchant
                  </label>
                  <input
                    type="text"
                    disabled={!isSuperAdmin}
                    value={formData.bkashNumber}
                    onChange={(e) => setFormData({ ...formData, bkashNumber: e.target.value })}
                    placeholder="017xxxxxxxx"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-600 focus:bg-white disabled:opacity-70"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1 text-amber-600">
                    <Smartphone className="w-3.5 h-3.5 text-amber-500" />
                    Nagad Account
                  </label>
                  <input
                    type="text"
                    disabled={!isSuperAdmin}
                    value={formData.nagadNumber}
                    onChange={(e) => setFormData({ ...formData, nagadNumber: e.target.value })}
                    placeholder="018xxxxxxxx"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-600 focus:bg-white disabled:opacity-70"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Identity & Media */}
          {activeTab === 'documents' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  National ID (NID) Number
                </label>
                <input
                  type="text"
                  disabled={!isSuperAdmin}
                  value={formData.nidNumber}
                  onChange={(e) => setFormData({ ...formData, nidNumber: e.target.value })}
                  placeholder="e.g. 19951234567890"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-600 focus:bg-white disabled:opacity-70"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                {/* Profile Photo */}
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 text-center space-y-2">
                  <span className="text-[11px] font-bold text-slate-700 block">Profile Photo</span>
                  {formData.profilePhotoUrl ? (
                    <img
                      src={formData.profilePhotoUrl}
                      alt="Profile"
                      className="w-full h-28 object-cover rounded-xl border border-slate-300"
                    />
                  ) : (
                    <div className="h-28 bg-slate-200/60 rounded-xl flex items-center justify-center text-slate-400 text-xs">
                      No Photo
                    </div>
                  )}
                  <input
                    type="text"
                    disabled={!isSuperAdmin}
                    value={formData.profilePhotoUrl}
                    onChange={(e) => setFormData({ ...formData, profilePhotoUrl: e.target.value })}
                    placeholder="Image URL"
                    className="w-full px-2 py-1 text-[10px] bg-white border border-slate-300 rounded-lg"
                  />
                </div>

                {/* Shop Photo */}
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 text-center space-y-2">
                  <span className="text-[11px] font-bold text-slate-700 block">Shop Photo</span>
                  {formData.shopPhotoUrl ? (
                    <img
                      src={formData.shopPhotoUrl}
                      alt="Shop"
                      className="w-full h-28 object-cover rounded-xl border border-slate-300"
                    />
                  ) : (
                    <div className="h-28 bg-slate-200/60 rounded-xl flex items-center justify-center text-slate-400 text-xs">
                      No Photo
                    </div>
                  )}
                  <input
                    type="text"
                    disabled={!isSuperAdmin}
                    value={formData.shopPhotoUrl}
                    onChange={(e) => setFormData({ ...formData, shopPhotoUrl: e.target.value })}
                    placeholder="Shop Image URL"
                    className="w-full px-2 py-1 text-[10px] bg-white border border-slate-300 rounded-lg"
                  />
                </div>

                {/* NID Card Document */}
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 text-center space-y-2">
                  <span className="text-[11px] font-bold text-slate-700 block">NID Card Image</span>
                  {formData.nidUrl ? (
                    <img
                      src={formData.nidUrl}
                      alt="NID"
                      className="w-full h-28 object-cover rounded-xl border border-slate-300"
                    />
                  ) : (
                    <div className="h-28 bg-slate-200/60 rounded-xl flex items-center justify-center text-slate-400 text-xs">
                      No NID Card
                    </div>
                  )}
                  <input
                    type="text"
                    disabled={!isSuperAdmin}
                    value={formData.nidUrl}
                    onChange={(e) => setFormData({ ...formData, nidUrl: e.target.value })}
                    placeholder="NID Image URL"
                    className="w-full px-2 py-1 text-[10px] bg-white border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="border-t border-slate-200 pt-4 flex items-center justify-between gap-3">
            <span className="text-[11px] text-slate-500 italic">
              {isSuperAdmin ? 'Super Admin editing mode enabled' : 'Read-only mode'}
            </span>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors"
              >
                Close
              </button>

              {isSuperAdmin && (
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-md transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{saving ? 'Saving...' : 'Save User Details'}</span>
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
