import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShieldCheck, Lock, AlertCircle, Clock, RotateCw, 
  LogOut, CheckCircle2, AlertTriangle, KeyRound
} from 'lucide-react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserProfile } from '../../types';
import { 
  startSuperAdminLoginCall, 
  verifySuperAdminOtpCall 
} from '../../lib/superAdminAuth';
import { triggerHaptic } from '../../lib/nativeFeedback';
import { 
  SUPER_ADMIN_OTP_EXPIRY_SECONDS, 
  SUPER_ADMIN_OTP_RESEND_COOLDOWN_SECONDS, 
  SUPER_ADMIN_OTP_MAX_ATTEMPTS,
  SUPER_ADMIN_OTP_LOCKOUT_MINUTES 
} from '../../config/authSecurity';

interface SuperAdminOtpScreenProps {
  user: UserProfile;
  onVerified: () => void | Promise<void>;
  onCancelSignOut: () => void | Promise<void>;
}

export const SuperAdminOtpScreen: React.FC<SuperAdminOtpScreenProps> = ({
  user,
  onVerified,
  onCancelSignOut,
}) => {
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0); // in seconds
  const [expiresIn, setExpiresIn] = useState(SUPER_ADMIN_OTP_EXPIRY_SECONDS); // 5 minutes
  const [attemptsLeft, setAttemptsLeft] = useState(SUPER_ADMIN_OTP_MAX_ATTEMPTS); // 5 attempts
  const [errorMessage, setErrorMessage] = useState('');
  const [isLocked, setIsLocked] = useState(false);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);
  const [hasInitiated, setHasInitiated] = useState(false);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Send OTP on initial mount
  useEffect(() => {
    if (!hasInitiated) {
      setHasInitiated(true);
      sendOtpCode();
    }
  }, [hasInitiated]);

  // Resend Cooldown Countdown (60s)
  useEffect(() => {
    let timer: any;
    if (cooldown > 0) {
      timer = setInterval(() => {
        setCooldown((prev) => Math.max(0, prev - 1));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [cooldown]);

  // Expiration Countdown (5 minutes = 300s)
  useEffect(() => {
    let timer: any;
    if (expiresIn > 0 && !isLocked) {
      timer = setInterval(() => {
        setExpiresIn((prev) => {
          if (prev <= 1) {
            setErrorMessage('ভেরিফিকেশন কোডের মেয়াদ শেষ হয়ে গেছে। দয়া করে নতুন কোড পাঠান। (Verification code has expired)');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [expiresIn, isLocked]);

  // Lockout Countdown (15 minutes)
  useEffect(() => {
    let timer: any;
    if (isLocked && lockoutRemaining > 0) {
      timer = setInterval(() => {
        setLockoutRemaining((prev) => {
          if (prev <= 1) {
            setIsLocked(false);
            setAttemptsLeft(SUPER_ADMIN_OTP_MAX_ATTEMPTS);
            setErrorMessage('');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isLocked, lockoutRemaining]);

  // Send / Resend OTP
  const sendOtpCode = async () => {
    if (isLocked) return;
    setIsSending(true);
    setErrorMessage('');
    triggerHaptic('light');

    try {
      const res = await startSuperAdminLoginCall(user.email);
      setCooldown(res.cooldownSeconds || SUPER_ADMIN_OTP_RESEND_COOLDOWN_SECONDS);
      setExpiresIn(res.expiresInSeconds || SUPER_ADMIN_OTP_EXPIRY_SECONDS);
      setAttemptsLeft(SUPER_ADMIN_OTP_MAX_ATTEMPTS);
      setDigits(['', '', '', '', '', '']);
      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 100);
    } catch (err: any) {
      console.error('[SuperAdminOtp] Send error:', err);
      if (err.message?.includes('locked') || err.message?.includes('15 minutes')) {
        handleLockoutTrigger();
      } else {
        setErrorMessage(err.message || 'Could not send the verification email. Please try again later.');
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleLockoutTrigger = () => {
    setIsLocked(true);
    setLockoutRemaining(SUPER_ADMIN_OTP_LOCKOUT_MINUTES * 60);
    setErrorMessage('অতিরিক্ত ভুল চেষ্টার কারণে অ্যাকাউন্টটি সাময়িকভাবে ১৫ মিনিটের জন্য লক করা হয়েছে। (Account locked for 15 minutes)');
    triggerHaptic('heavy');

    // Force sign-out after 3.5 seconds to protect the session
    setTimeout(() => {
      onCancelSignOut();
    }, 3500);
  };

  // Handle Digit Inputs
  const handleDigitChange = (index: number, val: string) => {
    if (isLocked) return;
    const clean = val.replace(/\D/g, '').slice(-1);
    const updated = [...digits];
    updated[index] = clean;
    setDigits(updated);
    setErrorMessage('');

    if (clean && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto verify when all 6 digits are typed
    const fullCode = updated.join('');
    if (fullCode.length === 6) {
      executeVerification(fullCode);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (isLocked) return;
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;

    const updated = ['', '', '', '', '', ''];
    for (let i = 0; i < pasted.length; i++) {
      updated[i] = pasted[i];
    }
    setDigits(updated);

    if (pasted.length === 6) {
      executeVerification(pasted);
    } else {
      inputRefs.current[Math.min(pasted.length, 5)]?.focus();
    }
  };

  // Execute verification strictly on server
  const executeVerification = async (codeToVerify?: string) => {
    const code = (codeToVerify || digits.join('')).trim();
    if (code.length !== 6 || isVerifying || isLocked) return;

    if (expiresIn <= 0) {
      setErrorMessage('Verification code has expired. Please click "Resend Code".');
      return;
    }

    setIsVerifying(true);
    setErrorMessage('');
    triggerHaptic('medium');

    try {
      const result = await verifySuperAdminOtpCall(code, user.email);
      if (result.verified) {
        triggerHaptic('heavy');
        // Persist verified session document to Firestore to satisfy isOtpVerified() security rules
        try {
          const sessionExpiresAt = result.expiresAt || (Date.now() + 12 * 60 * 60 * 1000);
          await setDoc(doc(db, 'adminSessions', user.uid), {
            uid: user.uid,
            email: user.email,
            verified: true,
            expiresAt: sessionExpiresAt,
            verifiedAt: serverTimestamp(),
          });
        } catch (sessionDocErr) {
          console.warn('[SuperAdminOtp] Could not write adminSessions document:', sessionDocErr);
        }
        await onVerified();
      }
    } catch (err: any) {
      console.error('[SuperAdminOtp] Verify error:', err);
      const remaining = attemptsLeft - 1;
      setAttemptsLeft(remaining);

      if (remaining <= 0 || err.message?.includes('locked') || err.message?.includes('15 minutes')) {
        handleLockoutTrigger();
      } else {
        setErrorMessage(
          err.message || `ভুল কোড। আপনার আর ${remaining}টি সুযোগ বাকি রয়েছে। (Incorrect code. ${remaining} attempts remaining)`
        );
        triggerHaptic('light');
        // Clear digits for next attempt
        setDigits(['', '', '', '', '', '']);
        setTimeout(() => inputRefs.current[0]?.focus(), 50);
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const maskedEmail = user.email ? user.email.replace(/(.{2})(.*)(?=@)/, (_, a, b) => a + '*'.repeat(Math.max(b.length, 3))) : 'your email';

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#050B1A] relative overflow-hidden">
      {/* Background Radial Glow Effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-tr from-[#0E9AA7]/15 to-[#3DD055]/15 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute -bottom-20 -right-20 w-[450px] h-[450px] bg-[#0E9AA7]/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Main Glass Modal Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="w-full max-w-md relative z-10 rounded-3xl bg-slate-900/60 border border-white/15 p-6 sm:p-8 backdrop-blur-[28px] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.8)] text-white space-y-6"
      >
        {/* Shield Icon Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#0E9AA7]/20 to-[#3DD055]/20 border border-[#3DD055]/30 shadow-lg shadow-[#3DD055]/10 mb-1">
            <ShieldCheck className="w-8 h-8 text-[#3DD055]" />
          </div>
          <h2 className="text-2xl font-black tracking-tight text-white flex items-center justify-center gap-2">
            <span>Verify it&apos;s you</span>
          </h2>
          <p className="text-xs font-semibold text-[#0E9AA7] uppercase tracking-wider">
            Super Admin Two-Step Verification (দ্বি-স্তরীয় নিরাপত্তা)
          </p>
          <p className="text-xs text-slate-300 leading-relaxed max-w-xs mx-auto pt-1">
            We sent a secure 6-digit verification code to your Super Admin email:{' '}
            <span className="font-mono font-bold text-white bg-white/10 px-2 py-0.5 rounded-md inline-block mt-1">
              {maskedEmail}
            </span>
          </p>
        </div>

        {/* Locked Out Alert */}
        {isLocked && (
          <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-200 flex items-start gap-3 text-xs animate-in fade-in">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-white">অ্যাকাউন্ট সাময়িকভাবে লক করা হয়েছে</p>
              <p className="text-rose-200/90 leading-relaxed">
                Too many failed attempts. For your security, this account is locked for{' '}
                <strong>{formatTimer(lockoutRemaining)}</strong>. Signing out now...
              </p>
            </div>
          </div>
        )}

        {/* 6-Digit OTP Boxes */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Enter 6-Digit Code
            </span>
            {expiresIn > 0 && !isLocked && (
              <span className="text-[11px] font-mono text-slate-300 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-[#3DD055]" />
                Expires in <strong className="text-white">{formatTimer(expiresIn)}</strong>
              </span>
            )}
          </div>

          <div className="grid grid-cols-6 gap-2 sm:gap-2.5" onPaste={handlePaste}>
            {digits.map((digit, idx) => (
              <input
                key={idx}
                ref={(el) => { inputRefs.current[idx] = el; }}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                value={digit}
                disabled={isLocked || isVerifying}
                onChange={(e) => handleDigitChange(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
                className={`w-full h-14 sm:h-16 text-center text-2xl font-mono font-black rounded-2xl transition-all outline-hidden ${
                  digit
                    ? 'bg-white/15 border-2 border-[#3DD055] text-white shadow-lg shadow-[#3DD055]/20'
                    : 'bg-white/[0.06] border border-white/20 text-white placeholder-slate-600 focus:border-[#0E9AA7] focus:ring-2 focus:ring-[#0E9AA7]/30'
                } ${isLocked ? 'opacity-40 cursor-not-allowed' : ''}`}
                placeholder="•"
                autoComplete="one-time-code"
              />
            ))}
          </div>

          {/* Attempt counter info */}
          <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 pt-0.5">
            <span>
              Attempts remaining:{' '}
              <strong className={attemptsLeft <= 2 ? 'text-rose-400' : 'text-slate-200'}>
                {attemptsLeft} / {SUPER_ADMIN_OTP_MAX_ATTEMPTS}
              </strong>
            </span>
            {isVerifying && (
              <span className="text-[#3DD055] flex items-center gap-1 font-semibold animate-pulse">
                <RotateCw className="w-3 h-3 animate-spin" /> Verifying...
              </span>
            )}
          </div>
        </div>

        {/* Error Alert */}
        {errorMessage && !isLocked && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <p className="leading-snug">{errorMessage}</p>
          </div>
        )}

        {/* Spam / Junk Folder Hint */}
        <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-200/90 text-[11px] flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-bold text-white">ইনবক্সে কোড না পেলে Spam / Junk ফোল্ডার চেক করুন</p>
            <p className="text-slate-300">
              Transactional security code is delivered via Gmail SMTP. Check your Spam or Promotions folder if it takes a moment to appear.
            </p>
          </div>
        </div>

        {/* Actions Bar */}
        <div className="space-y-3 pt-2">
          {/* Verify Button (for manual trigger if needed) */}
          <button
            type="button"
            disabled={digits.join('').length !== 6 || isVerifying || isLocked}
            onClick={() => executeVerification()}
            className="w-full py-3.5 px-4 rounded-2xl font-bold text-sm tracking-wide bg-gradient-to-r from-[#0E9AA7] via-[#2cb895] to-[#3DD055] text-white shadow-xl shadow-[#3DD055]/20 hover:brightness-110 active:scale-[0.99] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
          >
            {isVerifying ? (
              <>
                <RotateCw className="w-4 h-4 animate-spin" />
                <span>Verifying Credentials...</span>
              </>
            ) : (
              <>
                <KeyRound className="w-4 h-4" />
                <span>Verify & Open Super Admin Dashboard</span>
              </>
            )}
          </button>

          {/* Resend OTP Button */}
          <div className="flex items-center justify-center">
            <button
              type="button"
              disabled={isSending || cooldown > 0 || isLocked}
              onClick={sendOtpCode}
              className={`text-xs font-semibold tracking-wide transition-all flex items-center gap-1.5 py-1.5 px-3 rounded-lg ${
                cooldown > 0 || isLocked
                  ? 'text-slate-500 cursor-not-allowed'
                  : 'text-slate-300 hover:text-white hover:bg-white/10 cursor-pointer'
              }`}
            >
              {isSending ? (
                <>
                  <RotateCw className="w-3.5 h-3.5 animate-spin text-[#3DD055]" />
                  <span>Sending code...</span>
                </>
              ) : cooldown > 0 ? (
                <>
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>Resend code in {cooldown}s</span>
                </>
              ) : (
                <>
                  <RotateCw className="w-3.5 h-3.5 text-[#3DD055]" />
                  <span>Resend Verification Code (পুনরায় কোড পাঠান)</span>
                </>
              )}
            </button>
          </div>

          <div className="border-t border-white/10 pt-3">
            {/* Cancel / Sign Out Button */}
            <button
              type="button"
              onClick={onCancelSignOut}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Cancel & Sign Out (লগআউট)</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
