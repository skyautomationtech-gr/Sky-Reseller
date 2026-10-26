import React, { useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import { Delete, Fingerprint } from 'lucide-react';
import { triggerHaptic } from '../../lib/nativeFeedback';

export interface NeumorphicPinKeypadProps {
  pin: string;
  maxPinLength?: number;
  onDigitPress: (digit: string) => void;
  onBackspace: () => void;
  onFingerprint?: () => void;
  showFingerprint?: boolean;
  disabled?: boolean;
}

export const NeumorphicPinKeypad: React.FC<NeumorphicPinKeypadProps> = ({
  pin,
  maxPinLength = 4,
  onDigitPress,
  onBackspace,
  onFingerprint,
  showFingerprint = false,
  disabled = false,
}) => {
  const handleDigit = useCallback(
    (digit: string) => {
      if (disabled) return;
      if (pin.length < maxPinLength) {
        triggerHaptic('light');
        onDigitPress(digit);
      }
    },
    [disabled, pin.length, maxPinLength, onDigitPress]
  );

  const handleBackspace = useCallback(() => {
    if (disabled || pin.length === 0) return;
    triggerHaptic('light');
    onBackspace();
  }, [disabled, pin.length, onBackspace]);

  const handleBiometric = useCallback(() => {
    if (disabled || !onFingerprint) return;
    triggerHaptic('medium');
    onFingerprint();
  }, [disabled, onFingerprint]);

  // Handle hardware / physical keyboard input (digits and Backspace)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (disabled) return;
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        handleBackspace();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [disabled, handleDigit, handleBackspace]);

  return (
    <div
      className="w-full max-w-[320px] mx-auto select-none touch-manipulation pb-2"
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      <div className="grid grid-cols-3 gap-y-3.5 sm:gap-y-4 gap-x-5 sm:gap-x-6 justify-items-center">
        {/* Digits 1 through 9 */}
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
          <motion.button
            key={digit}
            type="button"
            disabled={disabled}
            whileTap={{ scale: 0.92 }}
            onClick={() => handleDigit(digit)}
            aria-label={`Digit ${digit}`}
            className="w-16 h-16 sm:w-18 sm:h-18 rounded-full bg-[#EEF2F7] flex items-center justify-center font-extrabold text-2xl sm:text-[26px] text-[#0B1630] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            style={{
              boxShadow:
                '6px 6px 14px rgba(166, 180, 200, 0.7), -6px -6px 14px rgba(255, 255, 255, 0.95)',
            }}
          >
            {digit}
          </motion.button>
        ))}

        {/* Bottom Row: Fingerprint (left), 0 (center), Backspace (right) */}

        {/* 1. Fingerprint slot: Show if enabled, otherwise render empty placeholder to keep grid aligned */}
        {showFingerprint && onFingerprint ? (
          <motion.button
            type="button"
            disabled={disabled}
            whileTap={{ scale: 0.92 }}
            onClick={handleBiometric}
            aria-label="Unlock with biometric"
            title="Biometric Unlock"
            className="w-16 h-16 sm:w-18 sm:h-18 rounded-full bg-[#EEF2F7] flex items-center justify-center text-[#0E9AA7] hover:text-[#0B1630] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            style={{
              boxShadow:
                '6px 6px 14px rgba(166, 180, 200, 0.7), -6px -6px 14px rgba(255, 255, 255, 0.95)',
            }}
          >
            <Fingerprint className="w-7 h-7 sm:w-8 sm:h-8" strokeWidth={2.2} />
          </motion.button>
        ) : (
          <div className="w-16 h-16 sm:w-18 sm:h-18 pointer-events-none" aria-hidden="true" />
        )}

        {/* 2. Digit 0 */}
        <motion.button
          type="button"
          disabled={disabled}
          whileTap={{ scale: 0.92 }}
          onClick={() => handleDigit('0')}
          aria-label="Digit 0"
          className="w-16 h-16 sm:w-18 sm:h-18 rounded-full bg-[#EEF2F7] flex items-center justify-center font-extrabold text-2xl sm:text-[26px] text-[#0B1630] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          style={{
            boxShadow:
              '6px 6px 14px rgba(166, 180, 200, 0.7), -6px -6px 14px rgba(255, 255, 255, 0.95)',
          }}
        >
          0
        </motion.button>

        {/* 3. Backspace button */}
        <motion.button
          type="button"
          disabled={disabled || pin.length === 0}
          whileTap={{ scale: 0.92 }}
          onClick={handleBackspace}
          aria-label="Delete last digit"
          title="Backspace"
          className="w-16 h-16 sm:w-18 sm:h-18 rounded-full bg-[#EEF2F7] flex items-center justify-center text-[#0B1630] hover:text-rose-600 cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
          style={{
            boxShadow:
              '6px 6px 14px rgba(166, 180, 200, 0.7), -6px -6px 14px rgba(255, 255, 255, 0.95)',
          }}
        >
          <Delete className="w-6 h-6 sm:w-7 sm:h-7" strokeWidth={2.2} />
        </motion.button>
      </div>
    </div>
  );
};
