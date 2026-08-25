import React, { useState, useEffect } from 'react';
import { UserProfile } from '../../types';
import { GlobalSearchBar } from './GlobalSearchBar';
import { QrScannerModal } from './QrScannerModal';
import { NotificationBellDropdown } from '../notifications/NotificationBellDropdown';
import { subscribeToTotalUnreadChatCount } from '../../lib/chatService';
import { SkyLogo } from './SkyLogo';
import { LogOut, Menu, Store, QrCode, RotateCw, Search, ArrowLeft, MessagesSquare } from 'lucide-react';
import { useRefresh } from '../../context/RefreshContext';

interface NavbarProps {
  user: UserProfile;
  onLogout: () => void;
  title: string;
  onToggleMobileMenu?: () => void;
  onNavigateTab?: (tab: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ 
  user, 
  onLogout, 
  title, 
  onToggleMobileMenu,
  onNavigateTab
}) => {
  const isAdminOrSuperAdmin = user.role === 'super_admin' || user.role === 'admin';
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState<number>(0);
  const { isRefreshing, refreshCurrentPage, formattedLastUpdated } = useRefresh();

  useEffect(() => {
    const unsub = subscribeToTotalUnreadChatCount(user.role, user.uid, (cnt) => {
      setUnreadChatCount(cnt);
    });
    return () => unsub();
  }, [user.role, user.uid]);

  // Expanded search overlay mode for mobile
  if (isSearchExpanded && isAdminOrSuperAdmin) {
    return (
      <header className="bg-white border-b border-slate-200 h-16 px-4 flex items-center sticky top-0 z-20 shadow-xs gap-3">
        <button
          onClick={() => setIsSearchExpanded(false)}
          className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0 cursor-pointer"
          title="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <GlobalSearchBar user={user} onNavigateTab={(tab) => {
            if (onNavigateTab) onNavigateTab(tab);
            setIsSearchExpanded(false);
          }} />
        </div>
      </header>
    );
  }

  return (
    <header className="bg-white border-b border-slate-200 h-16 px-4 md:px-6 flex items-center justify-between sticky top-0 z-20 shadow-xs gap-4">
      <div className="flex items-center gap-2 shrink-0">
        {onToggleMobileMenu && (
          <button
            onClick={onToggleMobileMenu}
            className="md:hidden p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer"
            title="Open Menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <div className="flex items-center gap-2">
          <div className="md:hidden">
            <SkyLogo size="sm" showText={false} lightMode={true} />
          </div>
          <h1 className="text-xs sm:text-sm md:text-lg font-bold text-slate-900 truncate max-w-[120px] sm:max-w-none">{title}</h1>
        </div>
      </div>

      {/* Global Search Bar (Admin / Super Admin - Desktop) */}
      {isAdminOrSuperAdmin && (
        <div className="hidden md:flex flex-1 max-w-md mx-4">
          <GlobalSearchBar user={user} onNavigateTab={onNavigateTab} />
        </div>
      )}

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Mobile Search Button (Admin / Super Admin - Mobile) */}
        {isAdminOrSuperAdmin && (
          <button
            onClick={() => setIsSearchExpanded(true)}
            className="md:hidden p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer"
            title="Search"
          >
            <Search className="w-5 h-5" />
          </button>
        )}

        {/* Global Refresh Button */}
        <button
          onClick={() => refreshCurrentPage()}
          disabled={isRefreshing}
          className="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold py-2 px-3 rounded-xl transition-all border border-blue-200/80 disabled:opacity-50 group min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 justify-center cursor-pointer"
          title={`Refresh data (Press R)\nLast updated: ${formattedLastUpdated}`}
        >
          <RotateCw className={`w-4 h-4 text-blue-600 transition-transform ${isRefreshing ? 'animate-spin text-blue-800' : 'group-hover:rotate-180 duration-500'}`} />
          <span className="hidden md:inline">{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
        </button>

        {/* Scan QR Button */}
        {isAdminOrSuperAdmin && (
          <button
            onClick={() => setIsQrModalOpen(true)}
            className="hidden sm:flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold py-2 px-3 rounded-xl transition-colors min-h-[38px] cursor-pointer"
            title="Scan QR Code"
          >
            <QrCode className="w-4 h-4 text-blue-600" />
            <span>Scan QR</span>
          </button>
        )}

        <div className="hidden lg:flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-full text-xs text-slate-600">
          <Store className="w-3.5 h-3.5 text-blue-600" />
          <span className="font-semibold text-slate-900 truncate max-w-[120px]">{user.shopName}</span>
          <span className="text-slate-300">|</span>
          <span className="capitalize text-slate-500 font-medium">{user.role.replace('_', ' ')}</span>
        </div>

        {/* Live Chat Direct Shortcut Button */}
        <button
          onClick={() => onNavigateTab && onNavigateTab('chat')}
          className="relative p-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer"
          title="Open Live Chat"
        >
          <MessagesSquare className="w-5 h-5 text-slate-700 hover:text-blue-600" />
          {unreadChatCount > 0 && (
            <span className="absolute top-1.5 right-1.5 bg-rose-500 text-white font-black text-[10px] w-4 h-4 rounded-full flex items-center justify-center ring-2 ring-white animate-bounce">
              {unreadChatCount > 9 ? '9+' : unreadChatCount}
            </span>
          )}
        </button>

        {/* Realtime Notification Bell with Badge & Dropdown */}
        <NotificationBellDropdown
          user={user}
          onNavigateNotifications={() => onNavigateTab && onNavigateTab('notifications')}
        />

        {/* User Profile Avatar / Icon on the right */}
        <button
          onClick={() => {
            if (onNavigateTab) {
              onNavigateTab(user.role === 'reseller' ? 'profile' : 'settings');
            }
          }}
          className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl border border-slate-200 overflow-hidden bg-slate-100 flex items-center justify-center cursor-pointer shrink-0 hover:scale-105 active:scale-95 transition-transform"
          title="Go to Profile"
        >
          {user.profilePhotoUrl ? (
            <img src={user.profilePhotoUrl} alt={user.fullName} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-slate-900 text-white flex items-center justify-center font-bold text-xs uppercase">
              {user.fullName.charAt(0)}
            </div>
          )}
        </button>
      </div>

      {/* Camera QR Scanner Modal */}
      <QrScannerModal isOpen={isQrModalOpen} onClose={() => setIsQrModalOpen(false)} />
    </header>
  );
};
