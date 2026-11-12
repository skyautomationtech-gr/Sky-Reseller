import React, { useState, useId } from 'react';
import {
  X,
  Shield,
  ShieldCheck,
  Mail,
  Lock,
  User,
  Phone,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Sparkles,
  Info,
  Check,
  AlertTriangle,
  FileText,
  UserCheck
} from 'lucide-react';
import {
  ADMIN_PERMISSIONS_LIST,
  FORBIDDEN_ADMIN_ACTIONS,
  generateSecurePassword,
  evaluatePasswordStrength,
  createAdminCall,
  CreateAdminResponse
} from '../../lib/adminManagementService';

interface CreateAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdminCreated: (adminInfo: CreateAdminResponse) => void;
}

export const CreateAdminModal: React.FC<CreateAdminModalProps> = ({
  isOpen,
  onClose,
  onAdminCreated,
}) => {
  const formId = useId();

  // Form State
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState('');
  const [internalNote, setInternalNote] = useState('');

  // Selected Permissions (default to all recommended)
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>(
    ADMIN_PERMISSIONS_LIST.filter((p) => p.defaultChecked).map((p) => p.id)
  );

  // UI Flow State
  const [showConfirmSheet, setShowConfirmSheet] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<CreateAdminResponse | null>(null);

  if (!isOpen) return null;

  const strength = evaluatePasswordStrength(password);

  const handleGeneratePassword = () => {
    const generated = generateSecurePassword();
    setPassword(generated);
    setShowPassword(true);
  };

  const togglePermission = (id: string) => {
    setSelectedPermissions((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const handleSelectAllPermissions = () => {
    setSelectedPermissions(ADMIN_PERMISSIONS_LIST.map((p) => p.id));
  };

  const handleClearPermissions = () => {
    setSelectedPermissions([]);
  };

  const validateForm = (): boolean => {
    setError(null);

    if (!fullName.trim() || fullName.trim().length < 2) {
      setError('Please provide a valid full name (at least 2 characters).');
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim() || !emailRegex.test(email.trim())) {
      setError('Please provide a valid email address.');
      return false;
    }

    const bdMobileRegex = /^01[3-9]\d{8}$/;
    if (!mobile.trim() || !bdMobileRegex.test(mobile.trim())) {
      setError('Please provide a valid Bangladeshi mobile number (format: 01XXXXXXXXX).');
      return false;
    }

    if (!strength.isValid) {
      setError('Temporary password must be at least 8 characters and include uppercase, lowercase, numbers, and symbols.');
      return false;
    }

    if (selectedPermissions.length === 0) {
      setError('Please select at least one operational permission for this administrator.');
      return false;
    }

    return true;
  };

  const handleProceedToConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      setShowConfirmSheet(true);
    }
  };

  const handleFinalSubmit = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await createAdminCall({
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        mobile: mobile.trim(),
        password: password,
        permissions: selectedPermissions,
        profilePhotoUrl: profilePhotoUrl.trim() || undefined,
        internalNote: internalNote.trim() || undefined,
      });

      setSuccessData(res);
      setTimeout(() => {
        onAdminCreated(res);
        onClose();
      }, 2500);
    } catch (err: any) {
      console.error('[CreateAdminModal] Error:', err);
      setError(err?.message || 'Failed to create administrator account. Please try again.');
      setShowConfirmSheet(false);
    } finally {
      setLoading(false);
    }
  };

  // Group permissions by category
  const categories = [
    { key: 'resellers', title: 'Reseller & Support Operations', titleBn: 'রিসেলার ও সাপোর্ট ব্যবস্থাপনা' },
    { key: 'catalog', title: 'Catalog & Order Management', titleBn: 'ক্যাটালগ ও অর্ডার প্রসেসিং' },
    { key: 'financial', title: 'Financials & Analytics', titleBn: 'আর্থিক লেনদেন ও রিপোর্ট' },
    { key: 'engagement', title: 'Engagement & Marketing', titleBn: 'নোটিশ ও ব্যানার' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-[#070E1E]/95 border border-white/10 rounded-2xl shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
        
        {/* Top Header Banner */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-gradient-to-r from-[#0E9AA7]/15 via-transparent to-[#3DD055]/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#0E9AA7] to-[#3DD055] p-[1px] flex items-center justify-center shadow-lg shadow-[#3DD055]/10">
              <div className="w-full h-full bg-[#070E1E] rounded-[11px] flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-[#3DD055]" />
              </div>
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
                Create New Admin Account
                <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-[#0E9AA7]/20 text-[#0E9AA7] border border-[#0E9AA7]/30">
                  Super Admin Exclusive
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                নতুন অ্যাডমিনিস্ট্রেটর তৈরি করুন এবং দায়িত্ব ও অনুমতি নির্ধারণ করুন
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2 text-xs text-rose-400 animate-in fade-in duration-200">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-semibold">ত্রুটি (Error): </span>
              {error}
            </div>
          </div>
        )}

        {/* Success Banner */}
        {successData && (
          <div className="mx-6 mt-4 p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center gap-3 text-sm text-emerald-400 animate-in fade-in duration-200">
            <CheckCircle2 className="w-6 h-6 shrink-0 text-[#3DD055]" />
            <div>
              <p className="font-bold text-white">অ্যাডমিন অ্যাকাউন্ট সফলভাবে তৈরি হয়েছে!</p>
              <p className="text-xs text-emerald-300/90 mt-0.5">
                {successData.fullName} ({successData.adminId}) • স্বাগত ইমেইল ও পাসওয়ার্ড সেট লিংক পাঠানো হয়েছে।
              </p>
            </div>
          </div>
        )}

        {/* Modal Form Content */}
        {!showConfirmSheet ? (
          <form onSubmit={handleProceedToConfirm} className="p-6 space-y-5 max-h-[78vh] overflow-y-auto">
            
            {/* Super Admin Ownership Banner */}
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2.5 text-xs text-amber-300">
              <Info className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-200">সার্ভার-এনফোর্সড নিরাপত্তা ও নীতি:</p>
                <p className="text-slate-300 text-[11px] mt-0.5">
                  অ্যাডমিনরা কেবল নির্ধারিত অনুমতি অনুযায়ী কাজ করতে পারবেন। অ্যাডমিন তৈরি, কোম্পানি সেটিংস ও সুপার অ্যাডমিন নিয়ন্ত্রণ শুধুমাত্র আপনার (মালিকের) এখতিয়ারে সীমাবদ্ধ।
                </p>
              </div>
            </div>

            {/* Basic Information Section */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#0E9AA7] flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" />
                1. Basic Admin Credentials (মূল তথ্য)
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Full Name */}
                <div>
                  <label htmlFor={`${formId}-name`} className="block text-xs font-medium text-slate-300 mb-1">
                    Full Name (পূর্ণ নাম) <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                    <input
                      id={`${formId}-name`}
                      type="text"
                      required
                      placeholder="e.g. Tanvir Ahmed"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-[#0E9AA7] focus:ring-1 focus:ring-[#0E9AA7]"
                    />
                  </div>
                </div>

                {/* Email Address */}
                <div>
                  <label htmlFor={`${formId}-email`} className="block text-xs font-medium text-slate-300 mb-1">
                    Login Email (লগইন ইমেইল) <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                    <input
                      id={`${formId}-email`}
                      type="email"
                      required
                      placeholder="admin@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-[#0E9AA7] focus:ring-1 focus:ring-[#0E9AA7]"
                    />
                  </div>
                </div>

                {/* Mobile Number */}
                <div className="sm:col-span-2">
                  <label htmlFor={`${formId}-mobile`} className="block text-xs font-medium text-slate-300 mb-1">
                    Mobile Number (মোবাইল নম্বর) <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                    <input
                      id={`${formId}-mobile`}
                      type="tel"
                      required
                      placeholder="01XXXXXXXXX"
                      value={mobile}
                      onChange={(e) => setMobile(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-[#0E9AA7] focus:ring-1 focus:ring-[#0E9AA7]"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Temporary Password Section */}
            <div className="space-y-2 p-3.5 rounded-xl bg-white/[0.03] border border-white/10">
              <div className="flex items-center justify-between">
                <label htmlFor={`${formId}-password`} className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-[#3DD055]" />
                  Temporary Password (অস্থায়ী পাসওয়ার্ড) <span className="text-rose-400">*</span>
                </label>
                <button
                  type="button"
                  onClick={handleGeneratePassword}
                  className="text-[11px] font-semibold text-[#3DD055] hover:text-emerald-300 flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#3DD055]/10 border border-[#3DD055]/20 hover:bg-[#3DD055]/20 transition-colors"
                >
                  <Sparkles className="w-3 h-3" />
                  Generate Strong Password
                </button>
              </div>

              <div className="relative">
                <input
                  id={`${formId}-password`}
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="Min 8 chars with upper, lower, number, symbol"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-3 pr-10 py-2 font-mono text-xs rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-[#3DD055] focus:ring-1 focus:ring-[#3DD055]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-white"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Password Strength Indicator */}
              {password && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Strength (শক্তির মাত্রা):</span>
                    <span className="font-semibold" style={{ color: strength.color }}>
                      {strength.label}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden flex gap-1">
                    <div
                      className="h-full transition-all duration-300 rounded-full"
                      style={{
                        width: `${(strength.score / 4) * 100}%`,
                        backgroundColor: strength.color,
                      }}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 text-[10px] text-slate-400 pt-0.5">
                    <span className={strength.hasMinLength ? 'text-emerald-400' : 'text-slate-500'}>
                      {strength.hasMinLength ? '✓' : '•'} 8+ Chars
                    </span>
                    <span className={strength.hasUpper ? 'text-emerald-400' : 'text-slate-500'}>
                      {strength.hasUpper ? '✓' : '•'} Uppercase
                    </span>
                    <span className={strength.hasLower ? 'text-emerald-400' : 'text-slate-500'}>
                      {strength.hasLower ? '✓' : '•'} Lowercase
                    </span>
                    <span className={strength.hasNumber ? 'text-emerald-400' : 'text-slate-500'}>
                      {strength.hasNumber ? '✓' : '•'} Number
                    </span>
                    <span className={strength.hasSymbol ? 'text-emerald-400' : 'text-slate-500'}>
                      {strength.hasSymbol ? '✓' : '•'} Symbol
                    </span>
                  </div>
                </div>
              )}

              <p className="text-[10px] text-amber-300/80 flex items-center gap-1 mt-1">
                <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                নিরাপত্তার স্বার্থে এই অস্থায়ী পাসওয়ার্ডটি ইমেইলে যাবে না। আপনি ব্যক্তিগতভাবে এটি অ্যাডমিনকে হস্তান্তর করবেন।
              </p>
            </div>

            {/* Permissions Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#0E9AA7] flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5" />
                  2. Administrative Permissions (দায়িত্ব ও অনুমতিসমূহ)
                </h3>
                <div className="flex items-center gap-2 text-[10px]">
                  <button
                    type="button"
                    onClick={handleSelectAllPermissions}
                    className="text-[#3DD055] hover:underline"
                  >
                    Select All
                  </button>
                  <span className="text-slate-600">|</span>
                  <button
                    type="button"
                    onClick={handleClearPermissions}
                    className="text-slate-400 hover:underline"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {categories.map((cat) => {
                  const catPermissions = ADMIN_PERMISSIONS_LIST.filter((p) => p.category === cat.key);
                  if (catPermissions.length === 0) return null;

                  return (
                    <div key={cat.key} className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-2">
                      <div className="text-[11px] font-semibold text-slate-300 flex items-center justify-between border-b border-white/5 pb-1.5">
                        <span>{cat.title}</span>
                        <span className="text-[10px] text-slate-500">{cat.titleBn}</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {catPermissions.map((perm) => {
                          const isChecked = selectedPermissions.includes(perm.id);
                          return (
                            <label
                              key={perm.id}
                              className={`flex items-start gap-2.5 p-2 rounded-lg cursor-pointer transition-all border ${
                                isChecked
                                  ? 'bg-[#3DD055]/10 border-[#3DD055]/30 text-white'
                                  : 'bg-white/[0.02] border-white/5 text-slate-400 hover:bg-white/5'
                              }`}
                            >
                              <div className="pt-0.5">
                                <div
                                  className={`w-4 h-4 rounded flex items-center justify-center transition-colors ${
                                    isChecked ? 'bg-[#3DD055] text-slate-950 font-bold' : 'border border-slate-600 bg-white/5'
                                  }`}
                                >
                                  {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                                </div>
                                <input
                                  type="checkbox"
                                  className="sr-only"
                                  checked={isChecked}
                                  onChange={() => togglePermission(perm.id)}
                                />
                              </div>
                              <div className="flex-1 text-[11px]">
                                <p className="font-semibold leading-snug">{perm.label}</p>
                                <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">{perm.description}</p>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Forbidden Roles Notice */}
              <div className="p-2.5 rounded-lg bg-rose-500/5 border border-rose-500/20 text-[10px] text-rose-300 space-y-1">
                <span className="font-bold flex items-center gap-1 text-rose-400">
                  <Lock className="w-3 h-3" />
                  অ্যাডমিনদের জন্য স্থায়ীভাবে নিষিদ্ধ কার্যক্রম (Server Enforced):
                </span>
                <ul className="list-disc list-inside space-y-0.5 text-slate-400 pl-1">
                  {FORBIDDEN_ADMIN_ACTIONS.map((action, i) => (
                    <li key={i}>{action}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Optional Metadata Section */}
            <div className="space-y-3 pt-1">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#0E9AA7] flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" />
                3. Optional Details (ঐচ্ছিক বিবরণ)
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor={`${formId}-photo`} className="block text-xs font-medium text-slate-400 mb-1">
                    Profile Photo URL (ছবি লিংক)
                  </label>
                  <input
                    id={`${formId}-photo`}
                    type="url"
                    placeholder="https://example.com/avatar.jpg"
                    value={profilePhotoUrl}
                    onChange={(e) => setProfilePhotoUrl(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-[#0E9AA7]"
                  />
                </div>

                <div>
                  <label htmlFor={`${formId}-note`} className="block text-xs font-medium text-slate-400 mb-1">
                    Internal Note (অভ্যন্তরীণ মন্তব্য)
                  </label>
                  <input
                    id={`${formId}-note`}
                    type="text"
                    placeholder="e.g. Assigned to Order Dispatch shift"
                    value={internalNote}
                    onChange={(e) => setInternalNote(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-[#0E9AA7]"
                  />
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 flex items-center justify-end gap-3 border-t border-white/10">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                Cancel (বাতিল)
              </button>
              <button
                type="submit"
                disabled={loading || !strength.isValid || selectedPermissions.length === 0}
                className="px-5 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-[#0E9AA7] to-[#3DD055] text-slate-950 hover:brightness-110 shadow-lg shadow-[#3DD055]/20 flex items-center gap-1.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <UserCheck className="w-4 h-4" />
                Review & Create Admin
              </button>
            </div>
          </form>
        ) : (
          /* Confirmation Sheet */
          <div className="p-6 space-y-5 animate-in fade-in duration-200">
            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-2xl bg-[#3DD055]/15 border border-[#3DD055]/30 mx-auto flex items-center justify-center text-[#3DD055] mb-2">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-white">Confirm Admin Account Creation</h3>
              <p className="text-xs text-slate-400">
                অনুগ্রহ করে নিচের তথ্যগুলো যাচাই করে নিশ্চিত করুন
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-3 text-xs">
              <div className="flex justify-between items-center py-1 border-b border-white/5">
                <span className="text-slate-400">Full Name:</span>
                <span className="font-bold text-white">{fullName}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-white/5">
                <span className="text-slate-400">Login Email:</span>
                <span className="font-semibold text-[#0E9AA7]">{email}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-white/5">
                <span className="text-slate-400">Mobile Number:</span>
                <span className="text-white font-mono">{mobile}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-white/5">
                <span className="text-slate-400">Assigned Role:</span>
                <span className="text-[#3DD055] font-bold">Admin (Role Enforced)</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-white/5">
                <span className="text-slate-400">Permissions Selected:</span>
                <span className="text-white font-semibold">{selectedPermissions.length} Operations</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-400">First Login Password Change:</span>
                <span className="text-amber-400 font-semibold">Mandatory (mustChangePassword: true)</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 space-y-1">
              <p className="font-bold">⚠️ মনে রাখবেন:</p>
              <p className="text-slate-300">
                অ্যাডমিন তৈরি হওয়ার সাথে সাথে তার ইমেইলে স্বাগত বার্তা ও নিজস্ব পাসওয়ার্ড তৈরির সিকিউর লিংক পাঠানো হবে। আপনি যে অস্থায়ী পাসওয়ার্ড নির্ধারণ করেছেন তা অ্যাডমিনকে শেয়ার করুন।
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmSheet(false)}
                disabled={loading}
                className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                Back to Edit (পরিবর্তন করুন)
              </button>
              <button
                type="button"
                onClick={handleFinalSubmit}
                disabled={loading}
                className="px-6 py-2.5 text-xs font-bold rounded-xl bg-gradient-to-r from-[#0E9AA7] to-[#3DD055] text-slate-950 hover:brightness-110 shadow-lg shadow-[#3DD055]/30 flex items-center gap-2 transition-all disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                    Creating Admin...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Confirm & Create Admin
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
