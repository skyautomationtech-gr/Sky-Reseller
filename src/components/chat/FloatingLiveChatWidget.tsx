import React, { useState, useEffect } from 'react';
import { UserProfile } from '../../types';
import { subscribeToTotalUnreadChatCount } from '../../lib/chatService';
import { LiveChatWindow } from './LiveChatWindow';
import { MessageSquare, X, Shield, Sparkles, ChevronDown } from 'lucide-react';

interface FloatingLiveChatWidgetProps {
  user: UserProfile;
  isResellerMobile?: boolean;
  onOpenOrder?: (orderId: string) => void;
  onOpenProduct?: (productId: string) => void;
}

export const FloatingLiveChatWidget: React.FC<FloatingLiveChatWidgetProps> = ({
  user,
  isResellerMobile = false,
  onOpenOrder,
  onOpenProduct,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const unsub = subscribeToTotalUnreadChatCount(user.role, user.uid, (cnt) => {
      setUnreadCount(cnt);
    });

    return () => unsub();
  }, [user.role, user.uid]);

  const chatId = `chat_${user.uid}`;

  return (
    <>
      {/* Floating Chat Launcher Button */}
      <div className={`fixed ${isResellerMobile ? 'bottom-20 md:bottom-6' : 'bottom-6'} right-6 z-40 flex flex-col items-end`}>
        {!isOpen && (
          <button
            onClick={() => setIsOpen(true)}
            className="relative w-14 h-14 bg-gradient-to-tr from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white rounded-full flex items-center justify-center shadow-2xl transition-all transform hover:scale-105 active:scale-95 border-2 border-white cursor-pointer group"
            title="Open Live Chat Support"
          >
            <MessageSquare className="w-6 h-6 transition-transform group-hover:scale-110" />

            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[11px] font-extrabold w-5 h-5 rounded-full flex items-center justify-center ring-2 ring-white shadow-md animate-bounce">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Floating Chat Modal (Desktop Popover or Mobile Drawer) */}
      {isOpen && (
        <div className="fixed inset-0 sm:inset-auto sm:bottom-6 sm:right-6 sm:w-[420px] sm:h-[620px] z-50 bg-white sm:rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-in fade-in slide-in-from-bottom-5 duration-200">
          {/* Header Bar */}
          <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between shadow-md shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                <MessageSquare className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-sm">Sky Live Chat</h3>
                <p className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Admin Support Online
                </p>
              </div>
            </div>

            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
              title="Close Chat"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Chat Window Body */}
          <div className="flex-1 min-h-0">
            <LiveChatWindow
              chatId={chatId}
              currentUser={user}
              partnerInfo={{
                name: 'Sky Admin Team',
                shopName: 'Official Helpdesk',
                role: 'admin',
              }}
              onOpenOrder={(ordId) => {
                setIsOpen(false);
                if (onOpenOrder) onOpenOrder(ordId);
              }}
              onOpenProduct={(prodId) => {
                setIsOpen(false);
                if (onOpenProduct) onOpenProduct(prodId);
              }}
              className="rounded-none border-none h-full shadow-none"
            />
          </div>
        </div>
      )}
    </>
  );
};
