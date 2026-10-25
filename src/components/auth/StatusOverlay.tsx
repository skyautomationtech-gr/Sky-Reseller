import React from 'react';
import { UserProfile } from '../../types';
import { AlertTriangle, ShieldAlert, Phone, MessageCircle, LogOut, RefreshCw, Calendar, FileText, Ban } from 'lucide-react';
import { triggerHaptic } from '../../lib/nativeFeedback';

interface StatusOverlayProps {
  user: UserProfile;
  onLogout: () => void;
  onResubmit?: () => void;
}

export const StatusOverlay: React.FC<StatusOverlayProps> = ({ user, onLogout, onResubmit }) => {
  const isRejected = user.status === 'rejected';
  const isSuspended = user.status === 'suspended';

  if (!isRejected && !isSuspended) return null;

  const isPermanent = user.suspensionType === 'permanent';
  const formattedUntilDate = user.suspendedUntil 
    ? new Date(user.suspendedUntil).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    : null;

  return (
    <div className="fixed inset-0 z-[100] bg-[#050B1A]/95 backdrop-blur-2xl flex flex-col items-center justify-center p-4 sm:p-6 text-center select-none overflow-y-auto">
      {/* Background Decorative Gradient Blobs */}
      <div className="absolute top-1/4 -left-20 w-80 h-80 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative bg-white/[0.04] border border-white/10 p-6 sm:p-8 rounded-3xl backdrop-blur-xl max-w-md w-full shadow-2xl text-white animate-in zoom-in-95 duration-200">
        
        {/* Status Icon */}
        <div className={`w-18 h-18 rounded-3xl flex items-center justify-center mx-auto mb-5 shadow-xl ${
          isRejected 
            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' 
            : isPermanent
              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
              : 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
        }`}>
          {isRejected ? (
            <FileText className="w-9 h-9" />
          ) : isPermanent ? (
            <Ban className="w-9 h-9" />
          ) : (
            <AlertTriangle className="w-9 h-9" />
          )}
        </div>
        
        {/* Title */}
        <h2 className="text-xl sm:text-2xl font-black text-white mb-2 tracking-tight">
          {isRejected 
            ? 'More Information Required' 
            : isPermanent 
              ? 'Your account has been blocked' 
              : 'Your account is temporarily restricted'
          }
        </h2>

        {/* Subtitle / Explanation */}
        <p className="text-xs sm:text-sm text-slate-300 mb-6 leading-relaxed">
          {isRejected
            ? 'The administration team reviewed your application and requested corrections before approval.'
            : isPermanent
              ? 'Your account access has been revoked due to policy or administrative compliance reasons.'
              : 'Your account is under a temporary administrative pause. Full access will be restored according to the timeline below.'
          }
        </p>

        {/* Reason Card */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-left mb-6 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            <span>Reason from Admin</span>
          </div>
          <p className="text-sm font-medium text-slate-200 pl-6 leading-relaxed">
            {isRejected
              ? (user.rejectReason || 'Information provided did not match verification criteria. Please update and resubmit.')
              : (user.suspensionReason || 'Account suspended by administrator.')
            }
          </p>

          {/* Highlighted sections if specified by Admin */}
          {isRejected && user.rejectedSections && user.rejectedSections.length > 0 && (
            <div className="pt-2 border-t border-white/10 mt-2">
              <span className="text-[11px] font-bold text-slate-400 block mb-1">Sections requiring correction:</span>
              <div className="flex flex-wrap gap-1.5">
                {user.rejectedSections.map((sec) => (
                  <span key={sec} className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-extrabold px-2 py-0.5 rounded-full capitalize">
                    {sec}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Temporary suspension expiry date */}
          {isSuspended && !isPermanent && formattedUntilDate && (
            <div className="pt-2 border-t border-white/10 mt-2 flex items-center gap-2 text-xs text-amber-300 font-semibold">
              <Calendar className="w-4 h-4" />
              <span>Restricted until: {formattedUntilDate}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-3">
          {/* Edit & Resubmit button for rejected resellers */}
          {isRejected && onResubmit && (
            <button 
              onClick={() => {
                triggerHaptic('medium');
                onResubmit();
              }} 
              className="w-full py-3.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-2xl font-black text-sm shadow-xl shadow-blue-600/30 active:scale-98 transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Edit & Resubmit Application</span>
            </button>
          )}

          {/* Contact Support Buttons (WhatsApp / Call Only) */}
          <div className="grid grid-cols-2 gap-2.5">
            <a 
              href="https://wa.me/8801700000000?text=Hello%2C%20I%20need%20help%20with%20my%20ReSellBD%20reseller%20account%20status."
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => triggerHaptic('light')}
              className="py-3 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 rounded-2xl flex items-center justify-center gap-2 text-xs font-bold transition active:scale-95"
            >
              <MessageCircle className="w-4 h-4" /> WhatsApp
            </a>
            <a 
              href="tel:+8801700000000" 
              onClick={() => triggerHaptic('light')}
              className="py-3 bg-white/10 hover:bg-white/15 border border-white/15 text-white rounded-2xl flex items-center justify-center gap-2 text-xs font-bold transition active:scale-95"
            >
              <Phone className="w-4 h-4" /> Call
            </a>
          </div>

          {/* Logout Button */}
          <button 
            onClick={() => {
              triggerHaptic('light');
              onLogout();
            }} 
            className="w-full py-3 text-slate-400 hover:text-white transition flex items-center justify-center gap-2 text-xs font-bold cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Log Out</span>
          </button>
        </div>
      </div>
    </div>
  );
};
