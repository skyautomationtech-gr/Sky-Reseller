import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight } from 'lucide-react';
import resellbdLogo from '../../assets/images/logo.png';

export const SPLASH_DURATION_MS = 60000;
export const SKIP_AFTER_MS = 10000;

interface SplashLoadingScreenProps {
  onSkip?: () => void;
  splashDurationMs?: number;
  skipAfterMs?: number;
}

export const SplashLoadingScreen: React.FC<SplashLoadingScreenProps> = ({
  onSkip,
  splashDurationMs = SPLASH_DURATION_MS,
  skipAfterMs = SKIP_AFTER_MS,
}) => {
  const initialCountdown = Math.ceil(skipAfterMs / 1000);
  const [countdown, setCountdown] = useState<number>(initialCountdown);
  const [canSkip, setCanSkip] = useState<boolean>(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setCanSkip(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="fixed inset-0 z-[999999] bg-gradient-to-b from-[#050B1A] via-[#071026] to-[#0B1630] flex flex-col items-center justify-center text-white overflow-hidden select-none">
      {/* 1. Fluid Morphing Background Blobs (4 Blobs with SVG/CSS Morphing & Drift) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Blob 1: Deep Navy / Royal Blue (#04203F) */}
        <div 
          className="absolute -top-16 -left-16 w-[360px] h-[360px] sm:w-[520px] sm:h-[520px] bg-[#04203F]/60 rounded-full blur-[70px] sm:blur-[90px] will-change-transform animate-blob-morph-1 mix-blend-screen" 
        />
        {/* Blob 2: Vibrant Teal (#0E9AA7) */}
        <div 
          className="absolute top-1/3 -right-24 w-[340px] h-[340px] sm:w-[480px] sm:h-[480px] bg-[#0E9AA7]/35 rounded-full blur-[65px] sm:blur-[85px] will-change-transform animate-blob-morph-2 mix-blend-screen" 
        />
        {/* Blob 3: Brand Green (#3DD055) */}
        <div 
          className="absolute -bottom-20 left-1/5 w-[320px] h-[320px] sm:w-[460px] sm:h-[460px] bg-[#3DD055]/25 rounded-full blur-[70px] sm:blur-[90px] will-change-transform animate-blob-morph-3 mix-blend-screen" 
        />
        {/* Blob 4: Deep Teal Ocean Accent (#0A4D68) */}
        <div 
          className="absolute top-1/4 left-1/3 w-[260px] h-[260px] sm:w-[380px] sm:h-[380px] bg-[#0E9AA7]/20 rounded-full blur-[60px] will-change-transform animate-blob-morph-4 mix-blend-screen" 
        />

        {/* Subtle Noise / Grain Overlay for Luxury Depth */}
        <div className="absolute inset-0 opacity-[0.035] pointer-events-none bg-[radial-gradient(#ffffff_1px,transparent_1.5px)] [background-size:16px_16px]" />
      </div>

      {/* Top-Right Secondary Skip Trigger once unlocked */}
      {canSkip && onSkip && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="absolute top-6 right-6 z-30 pt-safe"
        >
          <button
            onClick={onSkip}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/[0.08] hover:bg-white/[0.18] active:bg-white/[0.25] backdrop-blur-[16px] border border-white/20 text-xs font-semibold text-slate-200 hover:text-white transition-all cursor-pointer shadow-md"
            style={{ WebkitBackdropFilter: 'blur(16px)' }}
          >
            <span>Skip</span>
            <ChevronRight className="w-3.5 h-3.5 text-emerald-400" />
          </button>
        </motion.div>
      )}

      {/* 2. Main Centered Content */}
      <div className="relative z-10 flex flex-col items-center justify-center p-6 max-w-sm w-full mx-auto text-center">
        
        {/* Glass Logo Card with Spring Entrance & Diagonal Shimmer */}
        <motion.div
          initial={{ opacity: 0, scale: 0.85, filter: 'blur(8px)' }}
          animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
          transition={{ duration: 0.65, type: 'spring', stiffness: 220, damping: 22 }}
          className="relative mb-7 group"
        >
          {/* Soft Brand Outer Glow (Teal & Green, low-opacity) */}
          <div className="absolute -inset-2 bg-gradient-to-r from-[#0E9AA7]/35 via-[#3DD055]/25 to-[#04203F]/45 rounded-[36px] blur-xl opacity-80 pointer-events-none" />

          {/* Frosted Glass Card */}
          <div 
            className="relative w-32 h-32 sm:w-36 sm:h-36 rounded-[28px] border border-white/22 bg-white/[0.09] backdrop-blur-[24px] saturate-[150%] p-6 shadow-[0_20px_50px_-10px_rgba(14,154,167,0.3),0_0_30px_rgba(61,208,85,0.15)] flex items-center justify-center overflow-hidden glass-card-fallback"
            style={{
              WebkitBackdropFilter: 'blur(24px) saturate(150%)',
            }}
          >
            {/* Diagonal Light-Reflection Highlight across the card */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              <div className="absolute -inset-[100%] bg-gradient-to-tr from-transparent via-white/[0.18] to-transparent animate-shimmer-sweep pointer-events-none" />
            </div>

            {/* Logo Image with Subtle Floating Animation */}
            <motion.img
              initial={{ opacity: 0, y: 8 }}
              animate={{ 
                opacity: 1, 
                y: [0, -6, 0] 
              }}
              transition={{ 
                opacity: { duration: 0.45, delay: 0.18 },
                y: { duration: 3.5, repeat: Infinity, ease: 'easeInOut' }
              }}
              src={resellbdLogo || '/resellbd-logo.png'}
              alt="ReSellBD Logo"
              className="w-full h-full object-contain drop-shadow-[0_4px_14px_rgba(0,0,0,0.35)]"
              onError={(e) => {
                const target = e.currentTarget;
                if (target.src !== window.location.origin + '/resellbd-logo.png') {
                  target.src = '/resellbd-logo.png';
                }
              }}
            />
          </div>
        </motion.div>

        {/* 3. ReSellBD Title: Fades up from below (staggered ~0.2s after card) */}
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.22, ease: 'easeOut' }}
          className="text-3xl sm:text-4xl font-black tracking-tight mb-3 text-white drop-shadow-md"
        >
          ReSellBD
        </motion.h1>

        {/* 4. Tagline & Loading Progress Indicator */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.42, ease: 'easeOut' }}
          className="flex flex-col items-center gap-3.5 w-full"
        >
          {/* Glass-style Loading Pill with Rotating Gradient Ring */}
          <div 
            className="flex items-center gap-3 bg-white/[0.08] backdrop-blur-[16px] px-5 py-2.5 rounded-full border border-white/18 shadow-lg shadow-black/20"
            style={{
              WebkitBackdropFilter: 'blur(16px)',
            }}
          >
            {/* Custom Glass Rotating Ring with Teal -> Green gradient stroke */}
            <div className="relative w-4 h-4 shrink-0 flex items-center justify-center">
              <svg className="w-full h-full animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-20" cx="12" cy="12" r="10" stroke="#ffffff" strokeWidth="3" />
                <path 
                  d="M12 2a10 10 0 0 1 10 10" 
                  stroke="url(#spinnerGradient)" 
                  strokeWidth="3" 
                  strokeLinecap="round" 
                />
                <defs>
                  <linearGradient id="spinnerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#0E9AA7" />
                    <stop offset="100%" stopColor="#3DD055" />
                  </linearGradient>
                </defs>
              </svg>
            </div>

            <span className="text-xs sm:text-sm font-semibold tracking-wide text-slate-200">
              Loading ReSellBD Portal...
            </span>
          </div>

          {/* 60-Second Linear Progress Bar: Fills smoothly from 0% to 100% over splash duration */}
          <div className="w-48 sm:w-56 h-1.5 bg-white/10 rounded-full overflow-hidden border border-white/15 p-[0.5px]">
            <motion.div 
              initial={{ width: '0%' }}
              animate={{ width: '100%' }}
              transition={{ duration: splashDurationMs / 1000, ease: 'linear' }}
              className="h-full rounded-full animate-liquid-flow bg-[linear-gradient(90deg,#0E9AA7,#3DD055,#0E9AA7)] [background-size:200%_100%] shadow-[0_0_8px_rgba(61,208,85,0.6)]" 
            />
          </div>
        </motion.div>
      </div>

      {/* 5. Bottom Center Skip Section (Countdown hint for first 10s, then Glass Pill Button) */}
      <div className="absolute bottom-9 inset-x-0 flex flex-col items-center justify-center z-20 pb-safe px-4">
        <AnimatePresence mode="wait">
          {!canSkip ? (
            <motion.div
              key="countdown-hint"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3 }}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.06] backdrop-blur-md border border-white/10 text-[11px] font-medium text-slate-400 select-none shadow-sm"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Skip available in {countdown}s</span>
            </motion.div>
          ) : (
            <motion.button
              key="skip-button"
              initial={{ opacity: 0, y: 14, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.4, type: 'spring', stiffness: 260, damping: 20 }}
              onClick={onSkip}
              className="group flex items-center justify-center gap-2 px-7 py-3 min-h-[44px] min-w-[120px] rounded-full bg-white/[0.12] hover:bg-white/[0.22] active:bg-white/[0.28] backdrop-blur-[20px] border border-white/25 shadow-lg shadow-black/30 text-white font-semibold text-sm tracking-wide transition-all cursor-pointer select-none active:scale-[0.98]"
              style={{
                WebkitBackdropFilter: 'blur(20px)',
              }}
            >
              <span>Skip</span>
              <ChevronRight className="w-4 h-4 text-emerald-400 group-hover:translate-x-0.5 transition-transform" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Embedded Styles for Blob Morphing & Shimmer (also in index.css) */}
      <style>{`
        /* Fallback for browsers without backdrop-filter */
        @supports not ((-webkit-backdrop-filter: blur(24px)) or (backdrop-filter: blur(24px))) {
          .glass-card-fallback {
            background: rgba(255, 255, 255, 0.14) !important;
          }
        }
      `}</style>
    </div>
  );
};
