import React from 'react';
import { Lock } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const AccessLockedModal: React.FC<Props> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="bg-[#0B1630] border border-white/10 p-6 rounded-3xl w-full max-w-sm relative shadow-2xl animate-in slide-in-from-bottom">
        <div className="w-12 h-12 bg-cyan-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <Lock className="w-6 h-6 text-cyan-400" />
        </div>
        <h3 className="text-xl font-bold text-white text-center mb-2">Feature Locked</h3>
        <p className="text-slate-400 text-center mb-6">This feature unlocks after your account is approved by an administrator.</p>
        <button onClick={onClose} className="w-full py-3 bg-white/10 text-white rounded-full font-semibold">
          Understood
        </button>
      </div>
    </div>
  );
};
