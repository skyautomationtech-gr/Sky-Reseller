import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, RotateCw, AlertCircle, ShieldCheck, Clock } from 'lucide-react';
import { sendEmailOtpCall, verifyEmailOtpCall } from '../../../lib/emailOtpService';
import { triggerHaptic } from '../../../lib/nativeFeedback';

interface OtpVerificationInputProps {
  email: string;
  isVerified: boolean;
  onVerifiedChange: (verified: boolean) => void;
  disabled?: boolean;
}

export const OtpVerificationInput: React.FC<OtpVerificationInputProps> = ({
  email,
  isVerified,
  onVerifiedChange,
  disabled = false,
}) => {
  const [otp, setOtp] = useState<string[]>(['', '', '', '', '', '']);
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [cooldown, setCooldown] = useState(0); // in seconds (60s)
  const [expiresIn, setExpiresIn] = useState(0); // in seconds (10 min = 600s)
  const [attemptsLeft, setAttemptsLeft] = useState(5);
  const [errorMessage, setErrorMessage] = useState('');
  const [successNotice, setSuccessNotice] = useState('');

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Cooldown countdown timer (60s)
  useEffect(() => {
    let timer: any;
    if (cooldown > 0) {
      timer = setInterval(() => {
        setCooldown((prev) => Math.max(0, prev - 1));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [cooldown]);

  // Expiration countdown timer (10 minutes)
  useEffect(() => {
    let timer: any;
    if (expiresIn > 0 && !isVerified) {
      timer = setInterval(() => {
        setExpiresIn((prev) => {
          if (prev <= 1) {
            setErrorMessage('Verification code has expired. Please request a new code.');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [expiresIn, isVerified]);

  // Handle "Send OTP"
  const handleSendOtp = async () => {
    const cleanEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      setErrorMessage('Please enter a valid email address first.');
      return;
    }

    triggerHaptic('light');
    setIsSending(true);
    setErrorMessage('');
    setSuccessNotice('');

    try {
      const response = await sendEmailOtpCall(cleanEmail);
      setCodeSent(true);
      setCooldown(response.cooldownSeconds || 60);
      setExpiresIn(response.expiresInSeconds || 600); // 10 minutes
      setAttemptsLeft(5);
      setOtp(['', '', '', '', '', '']);
      setSuccessNotice(response.message || 'Verification code sent to your email.');

      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 100);
    } catch (err: any) {
      console.error('Send OTP error:', err);
      // Strictly do not expose code or simulate success on failure
      setCodeSent(false);
      setErrorMessage(
        err.message || 'Could not send the verification email. Please try again later.'
      );
    } finally {
      setIsSending(false);
    }
  };

  // Handle 6-digit box changes
  const handleDigitChange = (index: number, val: string) => {
    const cleaned = val.replace(/\D/g, '').slice(-1);
    const newOtp = [...otp];
    newOtp[index] = cleaned;
    setOtp(newOtp);
    setErrorMessage('');

    // Auto-advance to next input box
    if (cleaned && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-verify when all 6 digits are typed
    const fullCode = newOtp.join('');
    if (fullCode.length === 6) {
      triggerVerifyOtp(fullCode);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;

    const newOtp = ['', '', '', '', '', ''];
    for (let i = 0; i < pasted.length; i++) {
      newOtp[i] = pasted[i];
    }
    setOtp(newOtp);

    if (pasted.length === 6) {
      triggerVerifyOtp(pasted);
    } else {
      inputRefs.current[Math.min(pasted.length, 5)]?.focus();
    }
  };

  // Verify OTP strictly against server
  const triggerVerifyOtp = async (codeToVerify?: string) => {
    const fullCode = (codeToVerify || otp.join('')).trim();
    if (fullCode.length !== 6) {
      setErrorMessage('Please enter all 6 digits.');
      return;
    }

    if (attemptsLeft <= 0) {
      setErrorMessage('Maximum attempts exceeded. Please request a new code.');
      return;
    }

    triggerHaptic('medium');
    setIsVerifying(true);
    setErrorMessage('');
    setSuccessNotice('');

    try {
      const res = await verifyEmailOtpCall(email, fullCode);
      if (res.verified) {
        onVerifiedChange(true);
        triggerHaptic('heavy');
        setSuccessNotice('✓ Email address verified successfully!');
      }
    } catch (err: any) {
      console.error('Verify OTP error:', err);
      setAttemptsLeft((prev) => Math.max(0, prev - 1));
      setErrorMessage(err.message || 'Incorrect verification code. Please check and try again.');
      onVerifiedChange(false);
    } finally {
      setIsVerifying(false);
    }
  };

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="space-y-3">
      {/* Verification Action / Status Bar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {isVerified ? (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#3DD055]/20 border border-[#3DD055]/40 text-[#3DD055] text-xs font-bold animate-in fade-in duration-300">
            <CheckCircle2 className="w-4 h-4 text-[#3DD055]" />
            <span>✓ Email Verified</span>
          </div>
        ) : (
          <button
            type="button"
            disabled={isSending || disabled || cooldown > 0}
            onClick={handleSendOtp}
            className={`px-4 py-2 rounded-xl text-xs font-bold tracking-wide transition-all flex items-center gap-1.5 cursor-pointer shadow-xs ${
              cooldown > 0
                ? 'bg-white/10 text-slate-400 border border-white/15 cursor-not-allowed'
                : 'bg-gradient-to-r from-[#0E9AA7] to-[#3DD055] text-white hover:brightness-110 active:scale-95 border border-white/20'
            }`}
          >
            {isSending ? (
              <>
                <RotateCw className="w-3.5 h-3.5 animate-spin" />
                <span>Sending Code...</span>
              </>
            ) : cooldown > 0 ? (
              <>
                <Clock className="w-3.5 h-3.5" />
                <span>Resend in {cooldown}s</span>
              </>
            ) : codeSent ? (
              <>
                <RotateCw className="w-3.5 h-3.5" />
                <span>Resend OTP</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Send OTP (ইমেইল কোড পাঠান)</span>
              </>
            )}
          </button>
        )}

        {codeSent && !isVerified && expiresIn > 0 && (
          <span className="text-[11px] font-mono text-slate-400">
            Expires in <strong className="text-white">{formatTimer(expiresIn)}</strong>
          </span>
        )}
      </div>

      {/* 6-Box OTP Input Area */}
      {codeSent && !isVerified && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="p-4 rounded-2xl bg-white/[0.05] border border-white/15 backdrop-blur-[20px] space-y-3"
        >
          {/* Spam / Junk Folder Guide */}
          <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-2.5 text-[11px] text-amber-200 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-bold text-white">ইনবক্সে কোড না পেলে Spam / Junk ফোল্ডার চেক করুন</p>
              <p className="text-slate-300">
                A 6-digit verification code has been dispatched to your email address. Please check your inbox and Spam / Junk folder, then enter it below.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-200">
              Enter 6-Digit Verification Code
            </span>
            <span className="text-[10px] text-slate-400 font-medium">
              Attempts left: <strong className="text-white">{attemptsLeft}</strong>/5
            </span>
          </div>

          <div className="flex items-center justify-center gap-2 sm:gap-2.5">
            {otp.map((digit, idx) => (
              <input
                key={idx}
                ref={(el) => (inputRefs.current[idx] = el)}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                value={digit}
                onChange={(e) => handleDigitChange(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
                onPaste={handlePaste}
                disabled={isVerifying || isVerified}
                className="w-10 sm:w-12 h-12 sm:h-14 text-center text-lg sm:text-xl font-black rounded-xl bg-white/[0.09] border border-white/25 text-white outline-none focus:border-[#3DD055] focus:ring-2 focus:ring-[#0E9AA7]/60 focus:shadow-[0_0_15px_rgba(14,154,167,0.35)] transition-all"
              />
            ))}
          </div>

          {/* Manual Verify Button */}
          <div className="flex justify-center pt-1">
            <button
              type="button"
              disabled={isVerifying || otp.join('').length !== 6}
              onClick={() => triggerVerifyOtp()}
              className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-[#0E9AA7] hover:bg-[#0E9AA7]/80 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              {isVerifying ? (
                <>
                  <RotateCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Verifying...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#3DD055]" />
                  <span>Submit Code</span>
                </>
              )}
            </button>
          </div>
        </motion.div>
      )}

      {/* Status Messages */}
      <AnimatePresence>
        {successNotice && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-xs font-semibold text-[#3DD055] flex items-center gap-1.5"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-[#3DD055] shrink-0" />
            <span>{successNotice}</span>
          </motion.p>
        )}
        {errorMessage && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-xs font-semibold text-rose-400 flex items-center gap-1.5"
          >
            <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
};
