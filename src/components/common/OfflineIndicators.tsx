import React from 'react';
import { useNetwork } from '../../context/NetworkContext';
import { WifiOff, Loader2, RefreshCw, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const NoInternetOverlay: React.FC = () => {
  const { isOnline, isChecking, recheckConnection } = useNetwork();

  if (isOnline) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#f8fafc] p-6 text-center select-none safe-top safe-bottom">
      {/* Background soft glowing orb for modern look */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-rose-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 max-w-sm w-full flex flex-col items-center space-y-6">
        {/* Animated Icon Box with pulsing circles (Red/Orange theme) */}
        <div className="relative flex items-center justify-center w-24 h-24">
          <span className="absolute inline-flex h-full w-full rounded-full bg-rose-500/10 animate-ping duration-1000 opacity-75" />
          <span className="absolute inline-flex h-20 w-20 rounded-full bg-rose-500/20 animate-pulse" />
          <div className="relative w-16 h-16 rounded-2xl bg-[#ef4444] flex items-center justify-center shadow-lg shadow-rose-500/30">
            <WifiOff className="w-8 h-8 text-white" />
          </div>
        </div>

        {/* Informative message (Dark gray #1e293b text) */}
        <div className="space-y-2">
          <h2 className="text-xl sm:text-2xl font-extrabold text-[#1e293b] tracking-tight">No Internet Connection</h2>
          <p className="text-xs sm:text-sm text-slate-500 leading-relaxed px-2">
            Please check your mobile data or Wi-Fi settings and try again.
          </p>
        </div>

        {/* Retry button action with min 48px height */}
        <button
          onClick={() => recheckConnection()}
          disabled={isChecking}
          className="w-full max-w-xs bg-[#3b82f6] hover:bg-blue-600 active:scale-[0.98] text-white text-sm font-extrabold py-3.5 px-6 rounded-2xl shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:scale-100 cursor-pointer min-h-[48px]"
        >
          {isChecking ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          <span>{isChecking ? 'Checking...' : 'Try Again'}</span>
        </button>

        {/* Auto-retry subtext in background */}
        <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-slate-400 font-semibold pt-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500 shrink-0" />
          <span>Auto-retrying connection in background...</span>
        </div>
      </div>
    </div>
  );
};

export const TopBannerIndicator: React.FC = () => {
  const { isOnline, showReconnectedBanner } = useNetwork();

  return (
    <AnimatePresence mode="wait">
      {!isOnline ? (
        <motion.div
          key="offline-banner"
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -50, opacity: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="bg-[#ef4444] text-white text-xs font-bold px-4 py-2.5 flex items-center justify-center gap-2 shadow-md relative z-[100] text-center border-b border-rose-700/40 safe-top"
        >
          <WifiOff className="w-3.5 h-3.5 shrink-0 animate-pulse text-rose-100" />
          <span>No internet connection - some features may be unavailable.</span>
        </motion.div>
      ) : showReconnectedBanner ? (
        <motion.div
          key="online-banner"
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -50, opacity: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="bg-emerald-600 text-white text-xs font-bold px-4 py-2.5 flex items-center justify-center gap-2 shadow-md relative z-[100] text-center border-b border-emerald-700/40 safe-top"
        >
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-100" />
          <span>Back online! Reconnecting to database.</span>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};
