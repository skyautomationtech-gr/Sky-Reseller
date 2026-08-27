import React, { useState } from 'react';
import { MessageSquare, PhoneCall, Headphones, X, MessagesSquare, Sparkles } from 'lucide-react';

interface FloatingHelpButtonsProps {
  className?: string;
  isResellerMobile?: boolean;
  onOpenLiveChat?: () => void;
}

export const FloatingHelpButtons: React.FC<FloatingHelpButtonsProps> = ({ 
  className = '', 
  isResellerMobile = false,
  onOpenLiveChat
}) => {
  const [expanded, setExpanded] = useState(false);

  const handleLiveChatClick = () => {
    setExpanded(false);
    if (onOpenLiveChat) {
      onOpenLiveChat();
    } else {
      window.dispatchEvent(new CustomEvent('sky_navigate_tab', { detail: { tab: 'chat' } }));
    }
  };

  return (
    <div className={`fixed ${isResellerMobile ? 'bottom-20 md:bottom-6' : 'bottom-6'} right-6 z-40 flex flex-col items-end gap-2.5 ${className}`}>
      {expanded && (
        <div className="flex flex-col gap-2 animate-in slide-in-from-bottom-2 duration-150">
          <button
            type="button"
            onClick={handleLiveChatClick}
            className="flex items-center gap-2.5 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-extrabold rounded-2xl shadow-xl transition-all hover:scale-105 cursor-pointer border border-white/20"
          >
            <MessagesSquare className="w-4 h-4 text-amber-300" />
            <span>In-App Live Chat</span>
          </button>

          <a
            href="https://wa.me/8801722063777"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-2xl shadow-xl transition-all hover:scale-105"
          >
            <MessageSquare className="w-4 h-4" />
            <span>WhatsApp Chat</span>
          </a>

          <a
            href="tel:01722063777"
            className="flex items-center gap-2.5 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-2xl shadow-xl transition-all hover:scale-105"
          >
            <PhoneCall className="w-4 h-4 text-blue-400" />
            <span>Call Hotline</span>
          </a>
        </div>
      )}

      <button
        onClick={() => setExpanded(!expanded)}
        className="w-13 h-13 bg-blue-600 hover:bg-blue-500 text-white rounded-full flex items-center justify-center shadow-2xl transition-all transform active:scale-95 border-2 border-white cursor-pointer"
        title="Support & Contact"
      >
        {expanded ? <X className="w-6 h-6" /> : <Headphones className="w-6 h-6" />}
      </button>
    </div>
  );
};
