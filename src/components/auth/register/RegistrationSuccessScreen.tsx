import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Check, Copy, CheckCircle2, ShieldCheck, Clock, Sparkles, ArrowRight, Store } from 'lucide-react';
import { triggerHaptic } from '../../../lib/nativeFeedback';

interface RegistrationSuccessScreenProps {
  resellerId: string;
  shopName: string;
  onContinue: () => void;
}

export const RegistrationSuccessScreen: React.FC<RegistrationSuccessScreenProps> = ({
  resellerId,
  shopName,
  onContinue,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    try {
      navigator.clipboard.writeText(resellerId);
      setCopied(true);
      triggerHaptic('medium');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  // Light celebratory confetti particles
  const confettiParticles = Array.from({ length: 24 }).map((_, i) => ({
    id: i,
    color: ['#3DD055', '#0E9AA7', '#38BDF8', '#F59E0B', '#EC4899', '#A855F7'][i % 6],
    left: `${(i * 4.2) + 2}%`,
    delay: (i * 0.1) % 2,
    size: (i % 3) * 3 + 5,
  }));

  return (
    <div className="relative w-full max-w-xl mx-auto py-4 px-2 select-none">
      {/* Falling celebratory confetti */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {confettiParticles.map((p) => (
          <motion.div
            key={p.id}
            initial={{ y: -30, opacity: 1, rotate: 0 }}
            animate={{
              y: [0, 500],
              opacity: [1, 0.8, 0],
              rotate: [0, 360 * (p.id % 2 === 0 ? 1 : -1)],
            }}
            transition={{
              duration: 3.5,
              repeat: Infinity,
              delay: p.delay,
              ease: 'linear',
            }}
            className="absolute rounded-xs shadow-xs"
            style={{
              left: p.left,
              width: p.size,
              height: p.size,
              backgroundColor: p.color,
            }}
          />
        ))}
      </div>

      {/* Main Glass Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 25 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="relative rounded-3xl bg-white/[0.08] backdrop-blur-[24px] border border-white/20 p-6 sm:p-8 shadow-[0_20px_60px_rgba(0,0,0,0.6)] text-center space-y-6 overflow-hidden"
      >
        {/* Soft Ambient Radial Behind Success Icon */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-gradient-to-b from-[#3DD055]/30 via-[#0E9AA7]/20 to-transparent blur-3xl pointer-events-none" />

        {/* Lightning Checkmark Icon */}
        <div className="relative mx-auto w-20 h-20 flex items-center justify-center">
          {/* Pulsing lightning ring */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-[#0E9AA7] via-[#3DD055] to-[#38BDF8] animate-spin opacity-40 blur-md" style={{ animationDuration: '6s' }} />
          
          <div className="relative w-18 h-18 rounded-full bg-[#07132B] border-2 border-[#3DD055] flex items-center justify-center shadow-[0_0_30px_rgba(61,208,85,0.6)]">
            <motion.div
              initial={{ scale: 0, rotate: -45 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.15, type: 'spring', stiffness: 260, damping: 20 }}
            >
              <Check className="w-10 h-10 text-[#3DD055] stroke-[3]" />
            </motion.div>
          </div>
        </div>

        {/* Heading & Subtext */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#3DD055]/15 border border-[#3DD055]/30 text-[#3DD055] text-xs font-bold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Registration Application Submitted</span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Welcome, {shopName || 'Reseller'}!
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 max-w-md mx-auto leading-relaxed">
            Your application is registered in the ReSellBD system and is waiting for compliance review.
          </p>
        </div>

        {/* Reseller ID Box with 1-Click Copy */}
        <div className="p-4 rounded-2xl bg-black/40 border border-[#0E9AA7]/50 shadow-[0_0_25px_rgba(14,154,167,0.25)] space-y-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Your System Reseller ID
          </span>
          <div className="flex items-center justify-center gap-3 pt-1">
            <span className="font-mono text-2xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-[#38BDF8] to-[#3DD055] tracking-widest drop-shadow-md">
              {resellerId}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold active:scale-95 ${
                copied
                  ? 'bg-[#3DD055] text-black border-[#3DD055] shadow-lg shadow-[#3DD055]/30'
                  : 'bg-white/10 hover:bg-white/20 text-white border-white/20 hover:border-white/40'
              }`}
              title="Copy Reseller ID"
            >
              {copied ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-black" />
                  <span className="text-[11px]">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-cyan-300" />
                  <span className="text-[11px]">Copy ID</span>
                </>
              )}
            </button>
          </div>
          <p className="text-[10px] text-slate-400 pt-1">
            Save this ID! You can use it along with your password to log in anytime.
          </p>
        </div>

        {/* Status Timeline */}
        <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3 text-left">
          <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider">
            <Clock className="w-3.5 h-3.5 text-[#0E9AA7]" />
            Application Status Timeline
          </h4>

          <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-gradient-to-b before:from-[#3DD055] before:via-[#0E9AA7] before:to-white/15">
            {/* Step 1: Submitted */}
            <div className="relative">
              <div className="absolute -left-6 top-0.5 w-5 h-5 rounded-full bg-[#3DD055] flex items-center justify-center ring-4 ring-[#07132B]">
                <Check className="w-3 h-3 text-black stroke-[3]" />
              </div>
              <div className="text-xs">
                <span className="font-bold text-white">Application Submitted</span>
                <p className="text-[11px] text-slate-400">Personal details & documents securely received.</p>
              </div>
            </div>

            {/* Step 2: Under Review */}
            <div className="relative">
              <div className="absolute -left-6 top-0.5 w-5 h-5 rounded-full bg-gradient-to-tr from-[#0E9AA7] to-[#3DD055] flex items-center justify-center ring-4 ring-[#07132B] animate-pulse">
                <div className="w-2 h-2 rounded-full bg-white" />
              </div>
              <div className="text-xs">
                <span className="font-bold text-[#3DD055] flex items-center gap-1">
                  <span>Under Admin Verification</span>
                  <span className="text-[9px] px-1.5 py-0.2 bg-[#3DD055]/20 rounded border border-[#3DD055]/30">IN PROGRESS</span>
                </span>
                <p className="text-[11px] text-slate-400">KYC verification typically completed within 1–4 hours.</p>
              </div>
            </div>

            {/* Step 3: Approved */}
            <div className="relative opacity-60">
              <div className="absolute -left-6 top-0.5 w-5 h-5 rounded-full bg-white/20 flex items-center justify-center ring-4 ring-[#07132B]">
                <div className="w-2 h-2 rounded-full bg-white/40" />
              </div>
              <div className="text-xs">
                <span className="font-bold text-slate-300">Account Approved & Live</span>
                <p className="text-[11px] text-slate-400">Access full wholesale catalog, auto-sync, & instant payouts.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Continue Button */}
        <div className="pt-2">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('medium');
              onContinue();
            }}
            className="w-full min-h-[52px] rounded-2xl bg-gradient-to-r from-[#0E9AA7] via-[#3DD055] to-[#0E9AA7] text-white font-extrabold text-sm sm:text-base flex items-center justify-center gap-2 shadow-[0_10px_30px_rgba(61,208,85,0.4)] border border-white/30 hover:brightness-110 active:scale-98 transition-all cursor-pointer relative overflow-hidden group"
          >
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              <div className="absolute -inset-[100%] bg-gradient-to-tr from-transparent via-white/30 to-transparent group-hover:animate-shimmer-sweep" />
            </div>
            <span>Continue to Status Portal</span>
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </motion.div>
    </div>
  );
};
