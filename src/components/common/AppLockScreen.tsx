import React, { useState, useEffect } from 'react';
import bcrypt from 'bcryptjs';
import { UserProfile } from '../../types';
import { Shield, Lock, Eye, EyeOff, Delete, AlertCircle, LogOut, KeyRound, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface AppLockScreenProps {
  user: UserProfile;
  onUnlock: () => void;
  onLogout: () => void;
}

export const AppLockScreen: React.FC<AppLockScreenProps> = ({
  user,
  onUnlock,
  onLogout,
}) => {
  const [pin, setPin] = useState<string>('');
  const [showPin, setShowPin] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isError, setIsError] = useState<boolean>(false);
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

  // Retrieve PIN hash from user object or local storage fallback
  const getTargetPinLength = (): number => {
    if (user.appLockPinLength && user.appLockPinLength >= 4 && user.appLockPinLength <= 6) {
      return user.appLockPinLength;
    }
    const localLen = localStorage.getItem(`sky_app_pin_length_${user.uid}`);
    if (localLen) {
      const parsed = parseInt(localLen, 10);
      if (parsed >= 4 && parsed <= 6) return parsed;
    }
    return 4; // default
  };

  const getStoredPinHash = (): string | null => {
    if (user.appLockPinHash) {
      return user.appLockPinHash;
    }
    const localHash = localStorage.getItem(`sky_app_pin_hash_${user.uid}`);
    return localHash || null;
  };

  const handleKeyPress = (digit: string) => {
    if (isLockedOut || verifying) return;
    if (pin.length < 6) {
      const nextPin = pin + digit;
      setPin(nextPin);
      setErrorMessage('');
      setIsError(false);

      const targetLen = getTargetPinLength();
      const isFinal = nextPin.length === targetLen || nextPin.length === 6;
      
      if (nextPin.length >= 4) {
        verifyPin(nextPin, isFinal);
      }
    }
  };

  const handleDelete = () => {
    if (isLockedOut || verifying) return;
    if (pin.length > 0) {
      setPin(pin.slice(0, -1));
      setErrorMessage('');
      setIsError(false);
    }
  };

  const handleClear = () => {
    if (isLockedOut || verifying) return;
    setPin('');
    setErrorMessage('');
    setIsError(false);
  };

  const verifyPin = async (enteredPin: string, isFinalAttempt: boolean) => {
    const storedHash = getStoredPinHash();

    if (!storedHash) {
      // Fallback if no PIN hash is found: allow unlock
      onUnlock();
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
        localStorage.removeItem('appBackgroundedAt');
        onUnlock();
      } else if (isFinalAttempt) {
        // Only trigger failed attempt if reaching target length or explicitly submitted
        setIsError(true);
        const nextFailed = failedAttempts + 1;
        setFailedAttempts(nextFailed);

        if (nextFailed >= 5) {
          setIsLockedOut(true);
          setLockoutCountdown(30);
          setErrorMessage('Too many failed attempts. Try again in 30 seconds.');
        } else {
          setErrorMessage(`Incorrect PIN. (${5 - nextFailed} attempts remaining)`);
        }

        setTimeout(() => {
          setPin('');
          setIsError(false);
        }, 500);
      }
    } catch (err) {
      console.error('Error verifying PIN:', err);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[99999] bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white flex flex-col items-center justify-between p-6 select-none overflow-y-auto min-h-screen">
      {/* Top Branding Header */}
      <div className="w-full max-w-xs pt-6 text-center flex flex-col items-center space-y-3">
        <div className="relative">
          <div className="w-16 h-16 bg-indigo-600/30 rounded-3xl border border-indigo-500/40 flex items-center justify-center shadow-2xl shadow-indigo-500/20">
            <Lock className="w-8 h-8 text-indigo-400 animate-pulse" />
          </div>
          <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center border-2 border-slate-900">
            <Shield className="w-3.5 h-3.5 text-slate-950" />
          </div>
        </div>

        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-white">Sky Reseller Lock</h2>
          <p className="text-xs text-slate-400 mt-0.5 font-medium">
            Protected Session for <span className="text-indigo-300 font-bold">{user.fullName || user.shopName}</span>
          </p>
        </div>
      </div>

      {/* Middle PIN Indicators & Input */}
      <div className="w-full max-w-xs py-4 flex flex-col items-center space-y-6">
        <div className="text-center space-y-1">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
            {isLockedOut ? 'Security Lockout Active' : 'Enter 4-6 Digit Security PIN'}
          </p>
        </div>

        {/* PIN Digit Indicators */}
        <motion.div
          animate={isError ? { x: [-12, 12, -8, 8, -4, 4, 0] } : {}}
          transition={{ duration: 0.4 }}
          className="flex items-center justify-center gap-3.5 py-2 min-h-[48px]"
        >
          {Array.from({ length: Math.max(4, pin.length) }).map((_, idx) => {
            const hasValue = idx < pin.length;
            const digitChar = pin[idx];

            return (
              <div
                key={idx}
                className={`w-11 h-12 rounded-2xl border-2 flex items-center justify-center text-lg font-bold font-mono transition-all duration-200 shadow-md ${
                  isError
                    ? 'border-rose-500 bg-rose-500/20 text-rose-300'
                    : hasValue
                    ? 'border-indigo-500 bg-indigo-600/30 text-white shadow-indigo-500/20 scale-105'
                    : 'border-slate-700 bg-slate-800/60 text-slate-500'
                }`}
              >
                {hasValue ? (showPin ? digitChar : '•') : ''}
              </div>
            );
          })}
        </motion.div>

        {/* Show / Hide PIN Toggle Button */}
        <button
          type="button"
          onClick={() => setShowPin(!showPin)}
          className="px-3.5 py-1.5 bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white rounded-full border border-slate-700/70 text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer active:scale-95"
        >
          {showPin ? (
            <>
              <EyeOff className="w-3.5 h-3.5 text-indigo-400" />
              <span>Hide PIN Digits</span>
            </>
          ) : (
            <>
              <Eye className="w-3.5 h-3.5 text-indigo-400" />
              <span>Show PIN Digits</span>
            </>
          )}
        </button>

        {/* Error / Lockout Banner */}
        {errorMessage && (
          <div className="w-full p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-center space-y-1">
            <div className="flex items-center justify-center gap-1.5 text-rose-400 text-xs font-bold">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            {isLockedOut && lockoutCountdown > 0 && (
              <p className="text-[11px] text-rose-300 font-mono font-bold">
                Please wait {lockoutCountdown} seconds...
              </p>
            )}
          </div>
        )}
      </div>

      {/* Number Pad Keypad */}
      <div className="w-full max-w-xs space-y-3 pb-2">
        <div className="grid grid-cols-3 gap-3">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              disabled={isLockedOut || verifying}
              onClick={() => handleKeyPress(digit)}
              className="h-14 bg-slate-800/80 hover:bg-slate-700/80 active:bg-indigo-600 active:scale-95 text-white font-extrabold text-xl rounded-2xl border border-slate-700/80 shadow-md transition-all flex items-center justify-center cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {digit}
            </button>
          ))}

          {/* Bottom Row: Clear, 0, Backspace */}
          <button
            type="button"
            disabled={isLockedOut || verifying || pin.length === 0}
            onClick={handleClear}
            className="h-14 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white font-bold text-xs rounded-2xl border border-slate-800 transition-all flex items-center justify-center cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          >
            CLEAR
          </button>

          <button
            type="button"
            disabled={isLockedOut || verifying}
            onClick={() => handleKeyPress('0')}
            className="h-14 bg-slate-800/80 hover:bg-slate-700/80 active:bg-indigo-600 active:scale-95 text-white font-extrabold text-xl rounded-2xl border border-slate-700/80 shadow-md transition-all flex items-center justify-center cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            0
          </button>

          <button
            type="button"
            disabled={isLockedOut || verifying || pin.length === 0}
            onClick={handleDelete}
            className="h-14 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white font-bold text-xs rounded-2xl border border-slate-800 transition-all flex items-center justify-center cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed active:scale-95"
          >
            <Delete className="w-5 h-5 text-indigo-400" />
          </button>
        </div>

        {/* Forgot PIN Link */}
        <div className="pt-2 text-center">
          <button
            type="button"
            onClick={() => setShowForgotModal(true)}
            className="text-xs font-bold text-slate-400 hover:text-indigo-300 underline underline-offset-4 transition-colors cursor-pointer"
          >
            Forgot PIN?
          </button>
        </div>
      </div>

      {/* Forgot PIN Confirmation Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-[100000] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 bg-amber-500/20 text-amber-400 rounded-2xl flex items-center justify-center mx-auto border border-amber-500/30">
              <KeyRound className="w-6 h-6" />
            </div>

            <div className="space-y-1.5">
              <h3 className="font-extrabold text-base text-white">Reset App Lock PIN</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                If you forgot your Security PIN, you can sign out of your account and log back in using your password to reset or manage PIN settings.
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={onLogout}
                className="w-full py-3 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out & Log In with Password</span>
              </button>

              <button
                type="button"
                onClick={() => setShowForgotModal(false)}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
