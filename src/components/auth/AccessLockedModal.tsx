import React from 'react';
import { Lock, Clock, CheckCircle2, ShieldAlert, Phone, MessageCircle, X } from 'lucide-react';
import { triggerHaptic } from '../../lib/nativeFeedback';

interface AccessLockedModalProps {
  isOpen: boolean;
  onClose: () => void;
  featureName?: string;
  status?: string;
}

export const AccessLockedModal: React.FC<AccessLockedModalProps> = ({
  isOpen,
  onClose,
  featureName = 'This feature',
  status = 'pending'
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4">
      {/* Blurred Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-md transition-opacity animate-in fade-in"
        onClick={onClose}
      />

      {/* Modal Dialog Box */}
      <div className="relative w-full max-w-sm bg-gradient-to-b from-[#0f172a] via-[#090d16] to-[#050811] text-white border border-white/10 rounded-3xl p-6 shadow-2xl z-10 animate-in slide-in-from-bottom duration-200">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-full bg-white/5 hover:bg-white/10 transition cursor-pointer"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Lock Icon Emblem */}
        <div className="w-14 h-14 bg-gradient-to-tr from-amber-500/20 to-orange-500/20 border border-amber-500/30 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-amber-500/10">
          <Lock className="w-7 h-7 text-amber-400" />
        </div>

        {/* Header */}
        <h3 className="text-lg font-extrabold text-white text-center mb-1">
          {featureName} is Locked
        </h3>
        <p className="text-xs text-slate-300 text-center mb-5 leading-relaxed">
          This feature unlocks automatically as soon as your reseller account is verified and approved.
        </p>

        {/* Status Timeline */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-5 space-y-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
            Verification Timeline
          </div>

          {/* Timeline Step 1 */}
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-emerald-300">Registration Complete</p>
              <p className="text-[10px] text-slate-400">Account details & shop submitted</p>
            </div>
          </div>

          {/* Vertical Connecting Line */}
          <div className="w-0.5 h-3 bg-amber-500/40 ml-3" />

          {/* Timeline Step 2 */}
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-amber-500/20 border border-amber-500/60 flex items-center justify-center text-amber-400 shrink-0 mt-0.5 animate-pulse">
              <Clock className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-amber-300">Under Review (Current)</p>
              <p className="text-[10px] text-slate-400">Approval usually takes up to 1 hour</p>
            </div>
          </div>

          {/* Vertical Connecting Line */}
          <div className="w-0.5 h-3 bg-white/20 ml-3" />

          {/* Timeline Step 3 */}
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-slate-400 shrink-0 mt-0.5">
              <Lock className="w-3 h-3" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-400">Full Access Unlocked</p>
              <p className="text-[10px] text-slate-500">Orders, wholesale prices & payouts</p>
            </div>
          </div>
        </div>

        {/* Support Buttons */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <a
            href="https://wa.me/8801700000000?text=Hello%2C%20I%20am%20waiting%20for%20my%20ReSellBD%20reseller%20account%20approval."
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => triggerHaptic('light')}
            className="py-2.5 px-3 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95"
          >
            <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
          </a>
          <a
            href="tel:+8801700000000"
            onClick={() => triggerHaptic('light')}
            className="py-2.5 px-3 bg-white/10 hover:bg-white/15 border border-white/15 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95"
          >
            <Phone className="w-3.5 h-3.5" /> Call Support
          </a>
        </div>

        {/* Dismiss Button */}
        <button
          onClick={() => {
            triggerHaptic('light');
            onClose();
          }}
          className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl font-extrabold text-xs shadow-lg shadow-blue-600/30 active:scale-98 transition cursor-pointer"
        >
          Understood, Continue Browsing
        </button>
      </div>
    </div>
  );
};
