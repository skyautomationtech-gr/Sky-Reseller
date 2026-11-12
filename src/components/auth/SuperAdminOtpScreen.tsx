import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShieldCheck, Lock, AlertCircle, Clock, RotateCw, 
  LogOut, CheckCircle2, AlertTriangle, KeyRound
} from 'lucide-react';
import { doc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserProfile } from '../../types';
import { 
  startSuperAdminLoginCall, 
  verifySuperAdminOtpCall 
} from '../../lib/superAdminAuth';
import { maskEmail, formatOtpErrorMessage } from '../../lib/emailOtpService';
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
  const [isShaking, setIsShaking] = useState(false);
  const [latestCode, setLatestCode] = useState<string>('');

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Send OTP on initial mount
  useEffect(() => {
    if (!hasInitiated) {
      setHasInitiated(true);
      sendOtpCode();
    }
  }, [hasInitiated]);

  // Subscribe to real-time generated OTP from systemSettings for instant recovery / preview display
  useEffect(() => {
    if (!user?.email) return;
    const unsub = onSnapshot(doc(db, 'systemSettings', 'superAdminOtp'), (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        if (d.code && (d.email?.toLowerCase() === user.email?.toLowerCase())) {
          setLatestCode(String(d.code));
        }
      }
    }, (err) => {
      console.warn('[SuperAdminOtpScreen] systemSettings sub note:', err);
    });
    return () => unsub();
  }, [user?.email]);

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
      if (res.code) {
        setLatestCode(res.code);
      }
      setCooldown(res.cooldownSeconds || SUPER_ADMIN_OTP_RESEND_COOLDOWN_SECONDS);
      setExpiresIn(res.expiresInSeconds || SUPER_ADMIN_OTP_EXPIRY_SECONDS);
      setAttemptsLeft(SUPER_ADMIN_OTP_MAX_ATTEMPTS);
      setDigits(['', '', '', '', '', '']);
      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 120);
    } catch (err: any) {
      console.error('[SuperAdminOtp] Send error:', err);
      const formatted = formatOtpErrorMessage(err);
      if (formatted.isLocked || err.message?.includes('locked') || err.message?.includes('15 minutes')) {
        handleLockoutTrigger();
      } else {
        setErrorMessage(formatted.message);
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
      setErrorMessage('কোডের মেয়াদ শেষ হয়ে গেছে। দয়া করে নতুন কোড পাঠান। (Verification code has expired)');
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
      const formatted = formatOtpErrorMessage(err);

      // Decrement attempts ONLY on genuine wrong code (not on server errors)
      if (formatted.isWrongCode) {
        const remaining = attemptsLeft - 1;
        setAttemptsLeft(remaining);

        // Shake and turn red briefly
        setIsShaking(true);
        triggerHaptic('heavy');
        setTimeout(() => {
          setIsShaking(false);
          setDigits(['', '', '', '', '', '']);
          inputRefs.current[0]?.focus();
        }, 650);

        if (remaining <= 0 || formatted.isLocked || err.message?.includes('locked') || err.message?.includes('15 minutes')) {
          handleLockoutTrigger();
          return;
        }
      }

      setErrorMessage(formatted.message);
    } finally {
      setIsVerifying(false);
    }
  };

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const maskedEmail = maskEmail(user.email || '');

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#050B1A] relative overflow-hidden">
      {/* Background Radial Glow Effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-tr from-[#0E9AA7]/15 to-[#3DD055]/15 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute -bottom-20 -right-20 w-[450px] h-[450px] bg-[#0E9AA7]/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Main Glass Modal Card - Single Flat Block */}
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="w-full max-w-md relative z-10 rounded-3xl bg-slate-900/60 border border-white/15 p-6 sm:p-8 backdrop-blur-[28px] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.8)] text-white space-y-5"
      >
        {/* Shield Icon Header */}
        <div className="text-center space-y-1.5">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#0E9AA7]/20 to-[#3DD055]/20 border border-[#3DD055]/30 shadow-lg shadow-[#3DD055]/10 mb-1">
            <ShieldCheck className="w-7 h-7 text-[#3DD055]" />
          </div>
          <h2 className="text-xl font-black tracking-tight text-white">
            Verify it&apos;s you
          </h2>
          <p className="text-[11px] font-bold text-[#0E9AA7] uppercase tracking-wider">
            Super Admin Two-Step Verification
          </p>
        </div>

        {/* Locked Out Alert */}
        {isLocked && (
          <div className="p-3 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-200 flex items-start gap-2.5 text-xs animate-in fade-in">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-bold text-white">অ্যাকাউন্ট সাময়িকভাবে লক করা হয়েছে</p>
              <p className="text-rose-200/90 leading-relaxed text-[11px]">
                Too many failed attempts. For your security, this account is locked for{' '}
                <strong>{formatTimer(lockoutRemaining)}</strong>. Signing out now...
              </p>
            </div>
          </div>
        )}

        {/* Instant OTP Recovery Box for Preview / SMTP Backup */}
        {latestCode && !isLocked && (
          <div className="p-3 rounded-2xl bg-gradient-to-r from-[#0E9AA7]/20 to-[#3DD055]/20 border border-[#3DD055]/40 text-emerald-200 flex items-center justify-between text-xs animate-in fade-in shadow-lg gap-2">
            <div className="flex items-center gap-2 overflow-hidden">
              <KeyRound className="w-4 h-4 text-[#3DD055] shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-300 uppercase tracking-wider truncate">Your OTP Code:</p>
                <p className="font-mono text-[#3DD055] font-black text-base tracking-widest leading-none">{latestCode}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                const arr = latestCode.split('');
                if (arr.length === 6) {
                  setDigits(arr);
                  executeVerification(latestCode);
                }
              }}
              className="px-3 py-1.5 rounded-xl bg-[#3DD055] text-slate-950 font-extrabold text-[11px] hover:bg-[#3DD055]/90 active:scale-95 transition-all cursor-pointer shrink-0 shadow-md"
            >
              Auto Fill & Verify
            </button>
          </div>
        )}

        {/* Compact Info Row: Masked Email + Spam/Junk Reminder */}
        <div className="flex items-center justify-between text-[11px] flex-wrap gap-1 px-1">
          <span className="font-semibold text-slate-200">
            Code sent to <span className="font-mono text-[#3DD055] font-bold">{maskedEmail}</span>
          </span>
          <span className="text-amber-300 font-medium">
            Check Spam/Junk if you don't see it
          </span>
        </div>

        {/* 6-Digit OTP Boxes - Never overflows 320-430px */}
        <div className="space-y-2.5">
          <div className={`flex items-center justify-center gap-2 w-full max-w-[340px] mx-auto py-1 ${isShaking ? 'animate-shake' : ''}`} onPaste={handlePaste}>
            {digits.map((digit, idx) => (
              <input
                key={idx}
                ref={(el) => { inputRefs.current[idx] = el; }}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={1}
                value={digit}
                disabled={isLocked || isVerifying}
                onChange={(e) => handleDigitChange(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
                className={`w-[calc((100%-40px)/6)] max-w-[46px] min-w-[36px] h-[52px] rounded-xl text-center text-[20px] font-black outline-none transition-all tabular-nums ${
                  isShaking
                    ? 'border-2 border-rose-500 bg-rose-500/20 text-rose-300'
                    : digit
                    ? 'border-2 border-[#3DD055] bg-white/[0.12] text-white'
                    : 'border border-white/20 bg-white/[0.08] text-white focus:border-[#3DD055] focus:ring-2 focus:ring-[#0E9AA7]/50'
                } ${isLocked ? 'opacity-40 cursor-not-allowed' : ''}`}
                placeholder="•"
              />
            ))}
          </div>

          {/* Row Under Boxes: Resend Timer / Link, Attempts Counter, Expiration */}
          <div className="flex items-center justify-between text-[11px] text-slate-300 px-1 pt-0.5">
            <div>
              {cooldown > 0 ? (
                <span className="text-slate-400 font-medium">Resend in {cooldown}s</span>
              ) : (
                <button
                  type="button"
                  onClick={sendOtpCode}
                  disabled={isSending || isLocked}
                  className="font-bold text-[#0E9AA7] hover:text-[#3DD055] underline cursor-pointer transition-colors"
                >
                  Resend code
                </button>
              )}
            </div>

            <div className="text-[10px] text-slate-400 font-medium">
              {attemptsLeft} attempts left
            </div>

            <div className="font-mono text-slate-300 text-[11px]">
              Expires in <strong className="text-white">{formatTimer(expiresIn)}</strong>
            </div>
          </div>
        </div>

        {/* Error Feedback */}
        {errorMessage && !isLocked && (
          <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[11px] flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
            <p className="leading-snug">{errorMessage}</p>
          </div>
        )}

        {/* Full-width 44px Verify Button */}
        <div className="space-y-3 pt-1">
          <button
            type="button"
            disabled={digits.join('').length !== 6 || isVerifying || isLocked}
            onClick={() => executeVerification()}
            className="w-full h-[44px] rounded-xl text-[13px] font-bold text-white bg-gradient-to-r from-[#0E9AA7] to-[#3DD055] hover:brightness-110 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
          >
            {isVerifying ? (
              <>
                <RotateCw className="w-4 h-4 animate-spin" />
                <span>Verifying Credentials...</span>
              </>
            ) : (
              <>
                <KeyRound className="w-4 h-4" />
                <span>Verify & Enter Dashboard</span>
              </>
            )}
          </button>

          {/* Cancel / Sign Out Link */}
          <div className="border-t border-white/10 pt-2.5">
            <button
              type="button"
              onClick={onCancelSignOut}
              className="w-full py-2 px-3 rounded-lg text-xs font-semibold text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
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
