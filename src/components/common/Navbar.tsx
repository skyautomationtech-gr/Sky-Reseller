import React, { useState } from 'react';
import { UserProfile } from '../../types';
import { GlobalSearchBar } from './GlobalSearchBar';
import { QrScannerModal } from './QrScannerModal';
import { NotificationBellDropdown } from '../notifications/NotificationBellDropdown';
import { SkyLogo } from './SkyLogo';
import { LogOut, Menu, Store, QrCode } from 'lucide-react';

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

  return (
    <header className="bg-white border-b border-slate-200 h-16 px-4 md:px-6 flex items-center justify-between sticky top-0 z-20 shadow-xs gap-4">
      <div className="flex items-center gap-2.5 shrink-0">
        {onToggleMobileMenu && (
          <button
            onClick={onToggleMobileMenu}
            className="md:hidden p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors"
            title="Open Menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <div className="flex items-center gap-3">
          <div className="md:hidden">
            <SkyLogo size="sm" showText={false} lightMode={true} />
          </div>
          <h1 className="text-sm md:text-lg font-bold text-slate-900 truncate max-w-[150px] sm:max-w-none">{title}</h1>
        </div>
      </div>

      {/* Global Search Bar (Admin / Super Admin) */}
      {isAdminOrSuperAdmin && (
        <div className="hidden md:flex flex-1 max-w-md mx-4">
          <GlobalSearchBar user={user} onNavigateTab={onNavigateTab} />
        </div>
      )}

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Scan QR Button */}
        {isAdminOrSuperAdmin && (
          <button
            onClick={() => setIsQrModalOpen(true)}
            className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold py-2 px-3 rounded-xl transition-colors"
            title="Scan QR Code"
          >
            <QrCode className="w-4 h-4 text-blue-600" />
            <span className="hidden sm:inline">Scan QR</span>
          </button>
        )}

        <div className="hidden lg:flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-full text-xs text-slate-600">
          <Store className="w-3.5 h-3.5 text-blue-600" />
          <span className="font-semibold text-slate-900 truncate max-w-[120px]">{user.shopName}</span>
          <span className="text-slate-300">|</span>
          <span className="capitalize text-slate-500 font-medium">{user.role.replace('_', ' ')}</span>
        </div>

        {/* Realtime Notification Bell with Badge & Dropdown */}
        <NotificationBellDropdown
          user={user}
          onNavigateNotifications={() => onNavigateTab && onNavigateTab('notifications')}
        />

        <button
          onClick={onLogout}
          className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium py-2 px-3 sm:px-3.5 rounded-xl transition-colors shadow-sm"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>

      {/* Camera QR Scanner Modal */}
      <QrScannerModal isOpen={isQrModalOpen} onClose={() => setIsQrModalOpen(false)} />
    </header>
  );
};


