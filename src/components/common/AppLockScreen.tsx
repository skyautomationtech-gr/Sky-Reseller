import React, { useState, useEffect, useCallback } from 'react';
import bcrypt from 'bcryptjs';
import { UserProfile } from '../../types';
import { KeyRound, LogOut, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { NeumorphicPinKeypad } from './NeumorphicPinKeypad';
import { triggerHaptic } from '../../lib/nativeFeedback';
import { DEFAULT_VERSION } from '../../lib/versionService';

interface AppLockScreenProps {
  user: UserProfile;
  appVersion?: string;
  onUnlock: () => void;
  onLogout: () => void;
}

export const AppLockScreen: React.FC<AppLockScreenProps> = ({
  user,
  appVersion = DEFAULT_VERSION,
  onUnlock,
  onLogout,
}) => {
  const [pin, setPin] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isError, setIsError] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [failedAttempts, setFailedAttempts] = useState<number>(0);
  const [isLockedOut, setIsLockedOut] = useState<boolean>(false);
  const [lockoutCountdown, setLockoutCountdown] = useState<number>(0);
  const [showForgotModal, setShowForgotModal] = useState<boolean>(false);
  const [verifying, setVerifying] = useState<boolean>(false);

  // Handle Lockout Countdown timer
  useEffect(() => {
    let timer: any = null;
    if (isLockedOut && lockoutCountdown > 0) {
      timer = setInterval(() => {
        setLockoutCountdown((prev) => {
          if (prev <= 1) {
            setIsLockedOut(false);
            setFailedAttempts(0);
            setErrorMessage('');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isLockedOut, lockoutCountdown]);

  // Retrieve PIN length from user object or local storage fallback
  const getTargetPinLength = useCallback((): number => {
    if (user.appLockPinLength && user.appLockPinLength >= 4 && user.appLockPinLength <= 6) {
      return user.appLockPinLength;
    }
    const localLen = localStorage.getItem(`sky_app_pin_length_${user.uid}`);
    if (localLen) {
      const parsed = parseInt(localLen, 10);
      if (parsed >= 4 && parsed <= 6) return parsed;
    }
    return 4; // standard default
  }, [user.appLockPinLength, user.uid]);

  const targetPinLength = getTargetPinLength();

  const getStoredPinHash = (): string | null => {
    if (user.appLockPinHash) {
      return user.appLockPinHash;
    }
    const localHash = localStorage.getItem(`sky_app_pin_hash_${user.uid}`);
    return localHash || null;
  };

  const handleKeyPress = (digit: string) => {
    if (isLockedOut || verifying || isSuccess) return;
    if (pin.length < targetPinLength) {
      const nextPin = pin + digit;
      setPin(nextPin);
      setErrorMessage('');
      setIsError(false);

      if (nextPin.length === targetPinLength) {
        verifyPin(nextPin);
      }
    }
  };

  const handleBackspace = () => {
    if (isLockedOut || verifying || isSuccess) return;
    if (pin.length > 0) {
      setPin(pin.slice(0, -1));
      setErrorMessage('');
      setIsError(false);
    }
  };

  const verifyPin = async (enteredPin: string) => {
    const storedHash = getStoredPinHash();

    if (!storedHash) {
      // Fallback if no PIN hash is found: unlock immediately
      triggerHaptic('success');
      setIsSuccess(true);
      setTimeout(() => {
        onUnlock();
      }, 200);
      return;
    }

    setVerifying(true);

    try {
      let isValid = false;

      // Check bcrypt hash format ($2a$ or $2b$)
      if (storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$')) {
        isValid = bcrypt.compareSync(enteredPin, storedHash);
      } else {
        // Base64 simple hash check fallback
        const base64Entered = btoa(enteredPin + '_sky_secret');
        isValid = base64Entered === storedHash;
      }

      if (isValid) {
        triggerHaptic('success');
        setIsSuccess(true);
        localStorage.removeItem('appBackgroundedAt');
        setTimeout(() => {
          onUnlock();
        }, 300);
      } else {
        // Failed attempt handling
        triggerHaptic('error');
        setIsError(true);
        const nextFailed = failedAttempts + 1;
        setFailedAttempts(nextFailed);

        if (nextFailed >= 5) {
          setIsLockedOut(true);
          setLockoutCountdown(30);
          setErrorMessage('Too many failed attempts. Try again in 30 seconds.');
        } else {
          setErrorMessage(`Wrong PIN. ${5 - nextFailed} attempts left`);
        }

        setTimeout(() => {
          setPin('');
          setIsError(false);
        }, 600);
      }
    } catch (err) {
      console.error('Error verifying PIN:', err);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.25, ease: 'easeInOut' }}
      className="fixed inset-0 z-[99999] bg-[#EEF2F7] flex flex-col justify-between select-none overflow-hidden min-h-screen"
    >
      {/* ======================================================== */}
      {/* 1. TOP SECTION — Soft Sky-Blue Gradient Header (35-40%) */}
      {/* ======================================================== */}
      <div
        className="w-full flex-shrink-0 pt-[max(2rem,env(safe-area-inset-top))] pb-10 sm:pb-12 px-6 flex flex-col items-center justify-center text-center relative z-0"
        style={{
          background: 'linear-gradient(180deg, #BFE3FF 0%, #8EC9FF 100%)',
          minHeight: '36vh',
        }}
      >
        {/* Subtle decorative glow overlay */}
        <div className="absolute inset-0 bg-white/10 pointer-events-none" />

        <div className="relative z-10 w-full max-w-sm flex flex-col items-center space-y-4">
          {/* Header Subtitle */}
          <p className="text-[11px] sm:text-xs font-black tracking-[0.25em] text-[#0B1630]/70 uppercase">
            LOCK
          </p>

          {/* Main Title */}
          <h1 className="text-2xl sm:text-[28px] font-black text-[#0B1630] tracking-tight">
            Enter Your PIN
          </h1>

          {/* User Name Subtext */}
          {(user.fullName || user.shopName) && (
            <p className="text-xs text-[#0B1630]/60 font-semibold -mt-2 truncate max-w-[260px]">
              {user.fullName || user.shopName}
            </p>
          )}

          {/* Neumorphic PIN Indicators Row */}
          <div className="pt-2">
            <motion.div
              animate={isError ? { x: [-14, 14, -10, 10, -5, 5, 0] } : {}}
              transition={{ duration: 0.45 }}
              className="flex items-center justify-center gap-3.5 sm:gap-4 py-1"
            >
              {Array.from({ length: targetPinLength }).map((_, idx) => {
                const isFilled = idx < pin.length;

                return (
                  <div
                    key={idx}
                    className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center relative transition-all duration-200"
                    style={{
                      background: '#EEF2F7',
                      boxShadow: isError
                        ? '0 0 14px rgba(239, 68, 68, 0.45)'
                        : '4px 4px 10px rgba(166, 180, 200, 0.65), -4px -4px 10px rgba(255, 255, 255, 0.95)',
                    }}
                  >
                    {isFilled ? (
                      <motion.div
                        key={`filled-${idx}`}
                        initial={{ scale: 0.4, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                        className="w-4 h-4 sm:w-4.5 sm:h-4.5 rounded-full"
                        style={{
                          background: isError
                            ? '#EF4444'
                            : isSuccess
                            ? '#3DD055'
                            : 'linear-gradient(135deg, #0E9AA7 0%, #3DD055 100%)',
                          boxShadow: isError
                            ? '0 0 8px rgba(239, 68, 68, 0.8)'
                            : isSuccess
                            ? '0 0 8px rgba(61, 208, 85, 0.8)'
                            : '0 0 8px rgba(14, 154, 167, 0.6)',
                        }}
                      />
                    ) : (
                      <span
                        className={`font-black text-sm select-none ${
                          isError ? 'text-rose-500' : 'text-[#0B1630]/35'
                        }`}
                      >
                        -
                      </span>
                    )}
                  </div>
                );
              })}
            </motion.div>
          </div>

          {/* Feedback / Lockout / Error Message Banner */}
          <div className="min-h-[22px] flex items-center justify-center">
            {errorMessage ? (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-700 font-bold text-xs shadow-xs"
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{errorMessage}</span>
              </motion.div>
            ) : isLockedOut && lockoutCountdown > 0 ? (
              <span className="text-xs font-mono font-bold text-rose-700">
                Wait {lockoutCountdown}s...
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. BOTTOM SECTION — Neumorphic Curved Sheet (#EEF2F7)     */}
      {/* ======================================================== */}
      <div
        className="w-full bg-[#EEF2F7] rounded-t-[38px] sm:rounded-t-[46px] -mt-6 sm:-mt-8 relative z-10 flex-1 flex flex-col justify-between px-6 pt-5 sm:pt-6 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] shadow-[0_-8px_30px_rgba(11,22,48,0.06)]"
      >
        {/* Forgot PIN / USE PASSWORD Link */}
        <div className="text-center space-y-0.5 pt-1 pb-3">
          <p className="text-[11px] sm:text-xs text-[#0B1630]/55 font-semibold">
            Forgot your PIN?
          </p>
          <button
            type="button"
            onClick={() => setShowForgotModal(true)}
            className="text-xs sm:text-[13px] font-black text-[#0B1630] hover:text-[#0E9AA7] tracking-wider transition-colors cursor-pointer active:scale-95 uppercase inline-block py-1 px-3 rounded-lg"
          >
            USE PASSWORD
          </button>
        </div>

        {/* 3x4 Neumorphic Keypad */}
        <div className="flex-1 flex items-center justify-center py-1">
          <NeumorphicPinKeypad
            pin={pin}
            maxPinLength={targetPinLength}
            onDigitPress={handleKeyPress}
            onBackspace={handleBackspace}
            showFingerprint={false}
            disabled={isLockedOut || verifying || isSuccess}
          />
        </div>

        {/* App Version Footer */}
        <div className="text-center pt-2">
          <p className="text-[10px] sm:text-[11px] font-semibold text-[#0B1630]/45 tracking-wide">
            ReSellBD v{appVersion}
          </p>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 3. FORGOT PIN / USE PASSWORD CONFIRMATION MODAL         */}
      {/* ======================================================== */}
      <AnimatePresence>
        {showForgotModal && (
          <div className="fixed inset-0 z-[100000] bg-[#0B1630]/60 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              className="bg-[#EEF2F7] rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4 text-center border border-white/60"
              style={{
                boxShadow:
                  '12px 12px 30px rgba(166, 180, 200, 0.7), -12px -12px 30px rgba(255, 255, 255, 0.9)',
              }}
            >
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto text-[#0E9AA7]"
                style={{
                  background: '#EEF2F7',
                  boxShadow:
                    '4px 4px 10px rgba(166, 180, 200, 0.7), -4px -4px 10px rgba(255, 255, 255, 0.95)',
                }}
              >
                <KeyRound className="w-7 h-7" />
              </div>

              <div className="space-y-1.5">
                <h3 className="font-black text-lg text-[#0B1630]">
                  Unlock with Password
                </h3>
                <p className="text-xs text-[#0B1630]/70 leading-relaxed font-medium">
                  If you forgot your Security PIN, you can sign out and log back in using your password to regain access or change your PIN.
                </p>
              </div>

              <div className="flex flex-col gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('medium');
                    onLogout();
                  }}
                  className="w-full py-3 px-4 bg-gradient-to-r from-[#0E9AA7] to-[#0A808C] text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Log In with Password</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowForgotModal(false)}
                  className="w-full py-2.5 text-[#0B1630]/70 hover:text-[#0B1630] font-bold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
