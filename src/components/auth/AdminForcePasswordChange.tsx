import React, { useState } from 'react';
import { UserProfile } from '../../types';
import {
  Lock,
  ShieldAlert,
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  LogOut,
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import {
  evaluatePasswordStrength,
  changeAdminPasswordCall
} from '../../lib/adminManagementService';

interface AdminForcePasswordChangeProps {
  user: UserProfile;
  onPasswordChanged: () => void;
  onLogout: () => void;
}

export const AdminForcePasswordChange: React.FC<AdminForcePasswordChangeProps> = ({
  user,
  onPasswordChanged,
  onLogout,
}) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const strength = evaluatePasswordStrength(newPassword);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!newPassword) {
      setError('নতুন পাসওয়ার্ড প্রদান করুন (Please enter a new password).');
      return;
    }

    if (!strength.isValid) {
      setError('পাসওয়ার্ডটি অবশ্যই ন্যূনতম ৮ অক্ষরের হতে হবে এবং বড় হাতের অক্ষর, ছোট হাতের অক্ষর, সংখ্যা ও স্পেশাল চিহ্ন থাকতে হবে। (Password does not meet complexity requirements).');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('নতুন পাসওয়ার্ড এবং কনফার্ম পাসওয়ার্ড মিলছে না। (Passwords do not match).');
      return;
    }

    setLoading(true);

    try {
      await changeAdminPasswordCall(newPassword, currentPassword || undefined);
      setSuccess(true);
      setTimeout(() => {
        onPasswordChanged();
      }, 1500);
    } catch (err: any) {
      console.error('[AdminForcePasswordChange] Error:', err);
      setError(err?.message || 'পাসওয়ার্ড পরিবর্তন করতে ব্যর্থ হয়েছে। দয়া করে আবার চেষ্টা করুন। (Failed to update password).');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#050B1A]/95 backdrop-blur-2xl overflow-y-auto">
      {/* Background ambient light */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-gradient-to-tr from-[#0E9AA7]/20 to-[#3DD055]/15 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-md bg-[#0B1528]/90 border border-white/15 rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header Icon */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#0E9AA7] to-[#3DD055] p-[1px] mx-auto shadow-xl shadow-[#3DD055]/20">
            <div className="w-full h-full bg-[#070E1E] rounded-[15px] flex items-center justify-center">
              <KeyRound className="w-7 h-7 text-[#3DD055]" />
            </div>
          </div>
          <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight">
            Set Your New Password
          </h1>
          <p className="text-xs text-emerald-400 font-semibold">
            প্রথমবার লগইন: আপনার নিজস্ব পাসওয়ার্ড সেট করুন
          </p>
          <div className="inline-block px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] text-slate-300">
            {user.fullName} ({user.adminId || 'Admin'}) • {user.email}
          </div>
        </div>

        {/* Security Policy Notice */}
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 space-y-1">
          <p className="font-semibold flex items-center gap-1.5 text-amber-200">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
            বাধ্যতামূলক নিরাপত্তা পলিসি (Mandatory Security Policy):
          </p>
          <p className="text-[11px] text-slate-300 leading-relaxed">
            সুপার অ্যাডমিন আপনাকে একটি প্রাথমিক অস্থায়ী পাসওয়ার্ড প্রদান করেছিলেন। সিস্টেম সুরক্ষার স্বার্থে অ্যাডমিন পোর্টালে প্রবেশের পূর্বে আপনাকে একটি শক্তিশালী নিজস্ব পাসওয়ার্ড নির্ধারণ করতে হবে।
          </p>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-start gap-2 text-xs text-rose-300 animate-in fade-in duration-200">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            <div className="flex-1">{error}</div>
          </div>
        )}

        {/* Success Banner */}
        {success && (
          <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center gap-2.5 text-xs text-emerald-300 animate-in fade-in duration-200">
            <CheckCircle2 className="w-5 h-5 text-[#3DD055] shrink-0" />
            <div>
              <p className="font-bold text-white">পাসওয়ার্ড সফলভাবে সেট হয়েছে!</p>
              <p className="text-[11px] text-emerald-400 mt-0.5">অ্যাডমিন পোর্টালে রিডাইরেক্ট করা হচ্ছে...</p>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* Current / Temp Password (optional verification) */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Temporary / Current Password (বর্তমান অস্থায়ী পাসওয়ার্ড)
            </label>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                placeholder="সুপার অ্যাডমিনের দেওয়া অস্থায়ী পাসওয়ার্ড"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-[#0E9AA7]"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-3 top-3 text-slate-400 hover:text-white"
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* New Password */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              New Personal Password (আপনার নতুন নিজস্ব পাসওয়ার্ড) <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                required
                placeholder="নতুন শক্তিশালী পাসওয়ার্ড লিখুন"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-[#3DD055] font-mono"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-3 text-slate-400 hover:text-white"
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Password Strength Meter */}
            {newPassword && (
              <div className="space-y-1 pt-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Security Strength:</span>
                  <span className="font-semibold" style={{ color: strength.color }}>
                    {strength.label}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden flex">
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
                    {strength.hasMinLength ? '✓' : '•'} 8+ chars
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
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Confirm New Password (নতুন পাসওয়ার্ডটি পুনরায় লিখুন) <span className="text-rose-400">*</span>
            </label>
            <input
              type="password"
              required
              placeholder="পাসওয়ার্ডটি পুনরায় নিশ্চিত করুন"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-[#3DD055] font-mono"
            />
          </div>

          {/* Submit Button */}
          <div className="pt-2 space-y-3">
            <button
              type="submit"
              disabled={loading || !strength.isValid || newPassword !== confirmPassword}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-[#0E9AA7] to-[#3DD055] text-slate-950 font-bold text-xs hover:brightness-110 shadow-lg shadow-[#3DD055]/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  Updating Password...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  Save Password & Access Portal
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onLogout}
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out (লগআউট)
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
