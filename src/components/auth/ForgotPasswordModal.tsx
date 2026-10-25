import React, { useState } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { X, Mail, CheckCircle2, AlertCircle } from 'lucide-react';

import { resolveLoginIdentifier } from '../../lib/resellerRegistrationService';

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ForgotPasswordModal: React.FC<ForgotPasswordModalProps> = ({ isOpen, onClose }) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter your email or Reseller ID');
      return;
    }
    setLoading(true);
    setError('');
    try {
      let targetEmail = email.trim();
      if (!targetEmail.includes('@')) {
        try {
          targetEmail = await resolveLoginIdentifier(targetEmail);
        } catch {
          setError('No account found matching this Reseller ID.');
          setLoading(false);
          return;
        }
      }
      await sendPasswordResetEmail(auth, targetEmail);
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Failed to send password reset email');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-[#141527]/95 border border-white/10 rounded-3xl shadow-2xl max-w-md w-full p-6 sm:p-8 relative backdrop-blur-xl animate-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-white p-1.5 rounded-full hover:bg-white/10 transition-colors"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 rounded-full flex items-center justify-center mx-auto mb-3 shadow-lg shadow-cyan-500/10">
            <Mail className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold text-white tracking-tight">Reset Password</h3>
          <p className="text-xs sm:text-sm text-slate-400 mt-1.5 leading-relaxed">
            Enter your registered email address and we'll send you a secure link to reset your password.
          </p>
        </div>

        {success ? (
          <div className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 rounded-2xl p-5 text-center backdrop-blur-md">
            <CheckCircle2 className="w-9 h-9 text-emerald-400 mx-auto mb-2.5" />
            <p className="font-semibold text-white">Reset Link Sent!</p>
            <p className="text-xs mt-1 text-slate-300">Check your inbox or Spam/Junk folder for password reset instructions.</p>
            <button
              onClick={onClose}
              className="mt-5 w-full h-[46px] bg-emerald-600 hover:bg-emerald-500 text-white rounded-full font-medium transition-colors text-sm shadow-lg shadow-emerald-900/30"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-rose-500/15 border border-rose-500/30 text-rose-200 p-3.5 rounded-2xl text-xs flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{error}</span>
              </div>
            )}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300 ml-3">
                Email Address or Reseller ID
              </label>
              <div className="relative flex items-center h-[50px] rounded-full bg-white/[0.06] hover:bg-white/[0.09] focus-within:bg-white/[0.09] border border-white/10 hover:border-white/20 focus-within:border-cyan-400/60 focus-within:ring-2 focus-within:ring-cyan-400/20 backdrop-blur-md transition-all duration-200">
                <div className="pl-4 pr-1 text-slate-400 pointer-events-none flex items-center">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. RSB-000001 or email@example.com"
                  className="w-full h-full bg-transparent text-white placeholder-slate-400 text-sm pl-2.5 pr-4 outline-none font-normal"
                />
              </div>
            </div>
            <div className="flex gap-3 pt-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 h-[48px] rounded-full border border-white/15 text-slate-300 text-sm font-medium hover:bg-white/5 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 h-[48px] rounded-full bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium transition-colors shadow-lg shadow-cyan-600/20 disabled:opacity-50"
              >
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
