import React from 'react';
import { UserProfile } from '../../types';
import { AlertTriangle, Clock, Phone, MessageCircle } from 'lucide-react';

interface StatusOverlayProps {
  user: UserProfile;
  onLogout: () => void;
  onResubmit?: () => void;
}

export const StatusOverlay: React.FC<StatusOverlayProps> = ({ user, onLogout, onResubmit }) => {
  const isRejected = user.status === 'rejected';
  const isSuspended = user.status === 'suspended';

  if (!isRejected && !isSuspended) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-[#050B1A] flex flex-col items-center justify-center p-6 text-center">
      <div className="bg-white/5 border border-white/10 p-8 rounded-3xl backdrop-blur-md max-w-sm w-full">
        <div className="w-16 h-16 bg-rose-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-8 h-8 text-rose-400" />
        </div>
        
        <h2 className="text-2xl font-bold text-white mb-2">
          {isRejected ? 'Account Rejected' : `Account ${user.suspensionType === 'permanent' ? 'Blocked' : 'Restricted'}`}
        </h2>
        <p className="text-slate-400 mb-6">
          {isRejected 
            ? `Reason: ${user.rejectReason || 'Contact support for details.'}`
            : `Reason: ${user.suspensionReason || 'Please contact support.'} ${user.suspendedUntil ? `(Until: ${new Date(user.suspendedUntil).toLocaleDateString()})` : ''}`
          }
        </p>

        <div className="space-y-3">
          {isRejected && onResubmit && (
            <button onClick={onResubmit} className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-full font-semibold">
              Edit & Resubmit
            </button>
          )}
          <div className="flex gap-3">
            <a href="tel:+8801700000000" className="flex-1 py-3 bg-white/10 text-white rounded-full flex items-center justify-center gap-2">
              <Phone className="w-4 h-4" /> Call
            </a>
            <a href="https://wa.me/8801700000000" className="flex-1 py-3 bg-emerald-600 text-white rounded-full flex items-center justify-center gap-2">
              <MessageCircle className="w-4 h-4" /> WhatsApp
            </a>
          </div>
          <button onClick={onLogout} className="w-full py-3 text-slate-500 hover:text-white transition">
            Logout
          </button>
        </div>
      </div>
    </div>
  );
};
