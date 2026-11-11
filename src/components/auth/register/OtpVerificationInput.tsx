import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  CheckCircle2, RotateCw, AlertCircle, ShieldCheck, 
  Clock, Mail, Lock, Check, Edit2, AlertTriangle
} from 'lucide-react';
import { 
  sendEmailOtpCall, 
  verifyEmailOtpCall, 
  maskEmail, 
  formatOtpErrorMessage 
} from '../../../lib/emailOtpService';
import { triggerHaptic } from '../../../lib/nativeFeedback';

interface OtpVerificationInputProps {
  email: string;
  isVerified: boolean;
  onVerifiedChange: (verified: boolean) => void;
  onEmailChange?: (newEmail: string) => void;
  disabled?: boolean;
  isResubmit?: boolean;
  shakeField?: boolean;
  onFocus?: () => void;
}

export const OtpVerificationInput: React.FC<OtpVerificationInputProps> = ({
  email,
  isVerified,
  onVerifiedChange,
  onEmailChange,
  disabled = false,
  isResubmit = false,
  shakeField = false,
  onFocus,
}) => {
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [cooldown, setCooldown] = useState(0); // in seconds
  const [expiresIn, setExpiresIn] = useState(600); // 10 minutes in seconds
  const [attemptsLeft, setAttemptsLeft] = useState(5);
  const [errorMessage, setErrorMessage] = useState('');
  const [successNotice, setSuccessNotice] = useState('');
  const [isShaking, setIsShaking] = useState(false);
  const [isEditingEmail, setIsEditingEmail] = useState(false);

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

  // Expiration countdown timer (10 minutes = 600s)
  useEffect(() => {
    let timer: any;
    if (expiresIn > 0 && codeSent && !isVerified) {
      timer = setInterval(() => {
        setExpiresIn((prev) => {
          if (prev <= 1) {
            setErrorMessage('কোডের মেয়াদ শেষ হয়ে গেছে। দয়া করে নতুন কোড পাঠান। (Verification code has expired)');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [expiresIn, codeSent, isVerified]);

  // Send / Resend OTP
  const handleSendOtp = async () => {
    const cleanEmail = String(email || '').trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      setErrorMessage('সঠিক ইমেইল ঠিকানা লিখুন। (Please enter a valid email address.)');
      return;
    }

    triggerHaptic('light');
    setIsSending(true);
    setErrorMessage('');
    setSuccessNotice('');
    setIsEditingEmail(false);

    try {
      const response = await sendEmailOtpCall(cleanEmail);
      setCodeSent(true);
      setCooldown(response.cooldownSeconds || 60);
      setExpiresIn(response.expiresInSeconds || 600);
      setAttemptsLeft(5);
      setDigits(['', '', '', '', '', '']);
      setSuccessNotice(`যাচাইকরণ কোড পাঠানো হয়েছে: ${maskEmail(cleanEmail)}`);

      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 120);
    } catch (err: any) {
      console.error('[OtpVerificationInput] Send error:', err);
      const formatted = formatOtpErrorMessage(err);
      setErrorMessage(formatted.message);
    } finally {
      setIsSending(false);
    }
  };

  // Handle single digit input
  const handleDigitChange = (index: number, val: string) => {
    const cleaned = val.replace(/\D/g, '').slice(-1);
    const newDigits = [...digits];
    newDigits[index] = cleaned;
    setDigits(newDigits);
    setErrorMessage('');

    // Auto-advance to next input
    if (cleaned && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-verify when 6th digit is typed
    const fullCode = newDigits.join('');
    if (fullCode.length === 6) {
      triggerVerifyOtp(fullCode);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;

    const newDigits = ['', '', '', '', '', ''];
    for (let i = 0; i < pasted.length; i++) {
      newDigits[i] = pasted[i];
    }
    setDigits(newDigits);

    if (pasted.length === 6) {
      triggerVerifyOtp(pasted);
    } else {
      inputRefs.current[Math.min(pasted.length, 5)]?.focus();
    }
  };

  // Trigger verify strictly against server
  const triggerVerifyOtp = async (codeToVerify?: string) => {
    const fullCode = (codeToVerify || digits.join('')).trim();
    if (fullCode.length !== 6) {
      setErrorMessage('সম্পূর্ণ ৬ সংখ্যার কোডটি লিখুন। (Please enter all 6 digits.)');
      return;
    }

    if (attemptsLeft <= 0) {
      setErrorMessage('সর্বোচ্চ চেষ্টার সীমা শেষ। নতুন কোড পাঠান। (Maximum attempts exceeded)');
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
        setSuccessNotice('✓ ইমেইল সফলভাবে যাচাই হয়েছে! (Email verified)');
      }
    } catch (err: any) {
      console.error('[OtpVerificationInput] Verify error:', err);
      const formatted = formatOtpErrorMessage(err);

      // Decrement attempts ONLY on genuine wrong code (not on server errors)
      if (formatted.isWrongCode) {
        if (typeof formatted.attemptsLeft === 'number') {
          setAttemptsLeft(formatted.attemptsLeft);
        } else {
          setAttemptsLeft((prev) => Math.max(0, prev - 1));
        }

        // Trigger shake animation and turn red briefly, then clear and focus first box
        setIsShaking(true);
        triggerHaptic('heavy');
        setTimeout(() => {
          setIsShaking(false);
          setDigits(['', '', '', '', '', '']);
          inputRefs.current[0]?.focus();
        }, 650);
      }

      setErrorMessage(formatted.message);
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
    <div className={`p-3.5 sm:p-4 rounded-2xl bg-white/[0.06] backdrop-blur-[24px] border border-white/15 space-y-3 ${shakeField ? 'animate-shake' : ''}`}>
      {/* 1. Email Field Section - dark glass style, never bright white */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[12px] font-bold text-slate-200 flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5 text-[#0E9AA7]" />
            <span>Email Address (ইমেইল ঠিকানা)</span>
            <span className="text-[#3DD055]">*</span>
          </label>

          {isVerified ? (
            <span className="text-[11px] font-bold text-[#3DD055] flex items-center gap-1 bg-[#3DD055]/15 border border-[#3DD055]/30 px-2 py-0.5 rounded-full animate-in fade-in">
              <Check className="w-3 h-3 text-[#3DD055]" />
              <span>Email Verified</span>
            </span>
          ) : codeSent && !isEditingEmail ? (
            <button
              type="button"
              onClick={() => {
                setIsEditingEmail(true);
                setCodeSent(false);
                setDigits(['', '', '', '', '', '']);
                setErrorMessage('');
              }}
              className="text-[11px] font-bold text-[#0E9AA7] hover:text-[#3DD055] flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Edit2 className="w-3 h-3" />
              <span>Change</span>
            </button>
          ) : null}
        </div>

        <div className="relative flex items-center">
          <input
            type="email"
            required
            disabled={disabled || isResubmit || (codeSent && !isEditingEmail && !isVerified)}
            placeholder="e.g. reseller@gmail.com"
            value={email}
            onFocus={onFocus}
            onChange={(e) => {
              if (onEmailChange) {
                onEmailChange(e.target.value);
              }
              if (isVerified) onVerifiedChange(false);
            }}
            className={`w-full h-[48px] px-3.5 py-2.5 rounded-xl text-sm font-semibold outline-none transition-all ${
              codeSent && !isEditingEmail && !isVerified
                ? 'bg-white/[0.04] border border-white/10 text-slate-300 cursor-not-allowed pr-28'
                : isVerified
                ? 'bg-emerald-500/[0.08] border border-emerald-500/30 text-emerald-100 pr-10'
                : 'bg-white/[0.08] border border-white/20 text-white placeholder-slate-400 focus:border-[#3DD055] focus:ring-2 focus:ring-[#0E9AA7]/50'
            }`}
          />

          {/* Integrated Action Button inside or next to Email input */}
          {!isVerified && (!codeSent || isEditingEmail) && (
            <button
              type="button"
              disabled={isSending || disabled || !email || cooldown > 0}
              onClick={handleSendOtp}
              className={`absolute right-1.5 h-[38px] px-3.5 rounded-lg text-[12px] font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs ${
                cooldown > 0
                  ? 'bg-white/10 text-slate-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-[#0E9AA7] to-[#3DD055] text-white hover:brightness-110 active:scale-95'
              }`}
            >
              {isSending ? (
                <>
                  <RotateCw className="w-3 h-3 animate-spin" />
                  <span>Sending...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Send Code</span>
                </>
              )}
            </button>
          )}

          {isVerified && (
            <div className="absolute right-3 text-[#3DD055]">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          )}
        </div>
      </div>

      {/* 2. OTP Verification Panel - One Flat Glass Card, No Inner Nesting */}
      <AnimatePresence>
        {codeSent && !isVerified && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="space-y-3 pt-1 overflow-hidden"
          >
            {/* Compact Info Row: Masked Email + Spam/Junk Reminder */}
            <div className="flex items-center justify-between text-[11px] flex-wrap gap-1 px-0.5">
              <span className="font-semibold text-slate-200">
                Code sent to <span className="font-mono text-[#3DD055] font-bold">{maskEmail(email)}</span>
              </span>
              <span className="text-amber-300 font-medium">
                Check Spam/Junk if you don't see it
              </span>
            </div>

            {/* 6 OTP Boxes in Flex Row - Never overflows 320-430px */}
            <div className={`flex items-center justify-center gap-2 w-full max-w-[340px] mx-auto py-1 ${isShaking ? 'animate-shake' : ''}`}>
              {digits.map((digit, idx) => (
                <input
                  key={idx}
                  ref={(el) => (inputRefs.current[idx] = el)}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleDigitChange(idx, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(idx, e)}
                  onPaste={handlePaste}
                  disabled={isVerifying || isVerified}
                  className={`w-[calc((100%-40px)/6)] max-w-[46px] min-w-[36px] h-[52px] rounded-xl text-center text-[20px] font-black outline-none transition-all tabular-nums ${
                    isShaking
                      ? 'border-2 border-rose-500 bg-rose-500/20 text-rose-300'
                      : digit
                      ? 'border-2 border-[#3DD055] bg-white/[0.12] text-white'
                      : 'border border-white/20 bg-white/[0.08] text-white focus:border-[#3DD055] focus:ring-2 focus:ring-[#0E9AA7]/50'
                  }`}
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
                    onClick={handleSendOtp}
                    disabled={isSending}
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

            {/* Full-width 44px Verify Button */}
            <button
              type="button"
              disabled={isVerifying || digits.join('').length !== 6}
              onClick={() => triggerVerifyOtp()}
              className="w-full h-[44px] rounded-xl text-[13px] font-bold text-white bg-gradient-to-r from-[#0E9AA7] to-[#3DD055] hover:brightness-110 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
            >
              {isVerifying ? (
                <>
                  <RotateCw className="w-4 h-4 animate-spin" />
                  <span>Verifying Code...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-[#3DD055]" />
                  <span>Verify Code</span>
                </>
              )}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Friendly Error / Success Feedback */}
      <AnimatePresence>
        {errorMessage && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[11px] font-medium flex items-start gap-2"
          >
            <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </motion.div>
        )}

        {successNotice && !errorMessage && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-medium flex items-center gap-2"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>{successNotice}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
