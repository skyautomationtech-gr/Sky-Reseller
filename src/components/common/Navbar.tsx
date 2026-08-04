import React from 'react';
import { UserProfile } from '../../types';
import { Bell, LogOut, Menu, Store } from 'lucide-react';

interface NavbarProps {
  user: UserProfile;
  onLogout: () => void;
  title: string;
  onToggleMobileMenu?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ user, onLogout, title, onToggleMobileMenu }) => {
  return (
    <header className="bg-white border-b border-slate-200 h-16 px-4 md:px-6 flex items-center justify-between sticky top-0 z-20 shadow-xs">
      <div className="flex items-center gap-2.5">
        {onToggleMobileMenu && (
          <button
            onClick={onToggleMobileMenu}
            className="md:hidden p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors"
            title="Open Menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <h1 className="text-sm md:text-lg font-bold text-slate-900 truncate">{title}</h1>
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        <div className="hidden sm:flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-full text-xs text-slate-600">
          <Store className="w-3.5 h-3.5 text-blue-600" />
          <span className="font-semibold text-slate-900 truncate max-w-[120px]">{user.shopName}</span>
          <span className="text-slate-300">|</span>
          <span className="capitalize text-slate-500 font-medium">{user.role.replace('_', ' ')}</span>
        </div>

        <button className="relative p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-blue-600 rounded-full"></span>
        </button>

        <button
          onClick={onLogout}
          className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium py-2 px-3 sm:px-3.5 rounded-xl transition-colors shadow-sm"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
};
