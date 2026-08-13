import React, { useState } from 'react';
import { MessageSquare, PhoneCall, Headphones, X } from 'lucide-react';

export const FloatingHelpButtons: React.FC = () => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2">
      {expanded && (
        <div className="flex flex-col gap-2 animate-in slide-in-from-bottom-2 duration-150">
          <a
            href="https://wa.me/8801577351518"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-2xl shadow-xl transition-all hover:scale-105"
          >
            <MessageSquare className="w-4 h-4" />
            <span>WhatsApp Chat</span>
          </a>
          <a
            href="tel:01577351518"
            className="flex items-center gap-2.5 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-2xl shadow-xl transition-all hover:scale-105"
          >
            <PhoneCall className="w-4 h-4 text-blue-400" />
            <span>Call Hotline</span>
          </a>
        </div>
      )}

      <button
        onClick={() => setExpanded(!expanded)}
        className="w-13 h-13 bg-blue-600 hover:bg-blue-500 text-white rounded-full flex items-center justify-center shadow-2xl transition-all transform active:scale-95 border-2 border-white"
        title="Support & Contact"
      >
        {expanded ? <X className="w-6 h-6" /> : <Headphones className="w-6 h-6" />}
      </button>
    </div>
  );
};
