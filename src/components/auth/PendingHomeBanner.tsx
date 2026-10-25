import React, { useState, useEffect } from 'react';
import { UserProfile } from '../../types';
import { Clock, ShieldAlert, Sparkles, MessageCircle } from 'lucide-react';
import { triggerHaptic } from '../../lib/nativeFeedback';

interface PendingHomeBannerProps {
  user: UserProfile;
  onOpenLockedModal?: () => void;
}

export const PendingHomeBanner: React.FC<PendingHomeBannerProps> = ({ user, onOpenLockedModal }) => {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    const updateElapsed = () => {
      let createdMs = Date.now();
      const raw = user.createdAt;
      if (raw) {
        if (typeof raw.toDate === 'function') {
          createdMs = raw.toDate().getTime();
        } else if (raw.seconds) {
          createdMs = raw.seconds * 1000;
        } else {
          const d = new Date(raw);
          if (!isNaN(d.getTime())) {
            createdMs = d.getTime();
          }
        }
      }

      const now = Date.now();
      const diff = Math.max(0, now - createdMs);
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      
      if (hours === 0 && mins === 0) {
        setElapsed('just now');
      } else if (hours === 0) {
        setElapsed(`${mins}m`);
      } else {
        setElapsed(`${hours}h ${mins}m`);
      }
    };

    updateElapsed();
    const timer = setInterval(updateElapsed, 30000); // Check every 30s
    return () => clearInterval(timer);
  }, [user.createdAt]);

  return (
    <div className="sticky top-0 z-20 bg-gradient-to-r from-amber-500/15 via-orange-500/15 to-amber-500/15 border-b border-amber-500/30 backdrop-blur-xl px-4 py-2.5 transition-all shadow-xs">
      <div className="max-w-xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-500 shrink-0">
            <Clock className="w-4 h-4 animate-spin-slow" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-black text-amber-900 tracking-tight">Your account is under review</span>
              <span className="bg-amber-500/20 text-amber-800 text-[10px] font-extrabold px-1.5 py-0.2 rounded-md border border-amber-500/30">
                {elapsed}
              </span>
            </div>
            <p className="text-[11px] text-amber-800/90 font-medium truncate">
              Approval usually takes up to 1 hour • Wholesale prices will unlock
            </p>
          </div>
        </div>

        {onOpenLockedModal && (
          <button
            onClick={() => {
              triggerHaptic('light');
              onOpenLockedModal();
            }}
            className="text-[11px] font-bold text-amber-900 bg-amber-500/20 hover:bg-amber-500/30 px-2.5 py-1.5 rounded-lg border border-amber-500/30 shrink-0 transition active:scale-95"
          >
            Details
          </button>
        )}
      </div>
    </div>
  );
};
