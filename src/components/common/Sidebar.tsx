import React from 'react';
import { UserProfile, UserRole } from '../../types';
import { 
  LayoutDashboard, Shield, Users, CheckCircle2, Package, 
  Layers, Tag, ShoppingBag, Wallet, Percent, BarChart3, 
  Bell, LifeBuoy, Settings, FileText, User as UserIcon, LogOut, X 
} from 'lucide-react';

interface SidebarProps {
  user: UserProfile;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onLogout: () => void;
  onOpenAddAdmin?: () => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  user, 
  activeTab, 
  setActiveTab, 
  onLogout, 
  onOpenAddAdmin,
  isMobileOpen = false,
  onCloseMobile
}) => {
  const role: UserRole = user.role;

  const getMenuItems = () => {
    if (role === 'super_admin') {
      return [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'approvals', label: 'Approvals', icon: CheckCircle2 },
        { id: 'admin', label: 'Admin Management', icon: Shield, action: onOpenAddAdmin },
        { id: 'resellers', label: 'Resellers', icon: Users },
        { id: 'products', label: 'Products', icon: Package },
        { id: 'categories', label: 'Categories', icon: Layers },
        { id: 'brands', label: 'Brands', icon: Tag },
        { id: 'orders', label: 'Orders', icon: ShoppingBag },
        { id: 'wallet', label: 'Wallet', icon: Wallet },
        { id: 'commission', label: 'Commission', icon: Percent },
        { id: 'reports', label: 'Reports', icon: BarChart3 },
        { id: 'notifications', label: 'Notifications', icon: Bell },
        { id: 'support', label: 'Support', icon: LifeBuoy },
        { id: 'settings', label: 'Settings', icon: Settings },
        { id: 'audit', label: 'Audit Logs', icon: FileText },
      ];
    } else if (role === 'admin') {
      return [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'approvals', label: 'Approvals', icon: CheckCircle2 },
        { id: 'resellers', label: 'Resellers', icon: Users },
        { id: 'products', label: 'Products', icon: Package },
        { id: 'categories', label: 'Categories', icon: Layers },
        { id: 'brands', label: 'Brands', icon: Tag },
        { id: 'orders', label: 'Orders', icon: ShoppingBag },
        { id: 'wallet', label: 'Wallet', icon: Wallet },
        { id: 'commission', label: 'Commission', icon: Percent },
        { id: 'reports', label: 'Reports', icon: BarChart3 },
        { id: 'notifications', label: 'Notifications', icon: Bell },
        { id: 'support', label: 'Support', icon: LifeBuoy },
        { id: 'settings', label: 'Settings', icon: Settings },
      ];
    } else {
      // Reseller
      return [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'products', label: 'Products', icon: Package },
        { id: 'orders', label: 'Orders', icon: ShoppingBag },
        { id: 'wallet', label: 'Wallet', icon: Wallet },
        { id: 'commission', label: 'Commission', icon: Percent },
        { id: 'notifications', label: 'Notifications', icon: Bell },
        { id: 'support', label: 'Support', icon: LifeBuoy },
        { id: 'profile', label: 'Profile', icon: UserIcon },
        { id: 'settings', label: 'Settings', icon: Settings },
      ];
    }
  };

  const menuItems = getMenuItems();

  const sidebarContent = (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col shrink-0 min-h-screen border-r border-slate-800 h-full">
      <div className="p-6 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-md shadow-blue-600/30">
            SR
          </div>
          <div>
            <h1 className="font-bold text-white text-base">Sky Reseller</h1>
            <p className="text-[11px] text-slate-400 capitalize">{role.replace('_', ' ')} Portal</p>
          </div>
        </div>
        {onCloseMobile && (
          <button
            onClick={onCloseMobile}
            className="md:hidden text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="p-4 border-b border-slate-800/60 bg-slate-950/40">
        <div className="flex items-center gap-3">
          {user.profilePhotoUrl ? (
            <img src={user.profilePhotoUrl} alt={user.fullName} className="w-9 h-9 rounded-lg object-cover border border-slate-700" />
          ) : (
            <div className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center text-slate-200 font-bold text-xs">
              {user.fullName.charAt(0)}
            </div>
          )}
          <div className="overflow-hidden">
            <p className="text-xs font-semibold text-white truncate">{user.fullName}</p>
            <p className="text-[10px] text-slate-400 truncate">{user.shopName}</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                if (item.action) {
                  item.action();
                } else {
                  setActiveTab(item.id);
                }
                if (onCloseMobile) onCloseMobile();
              }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800">
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <div className="hidden md:block shrink-0">
        {sidebarContent}
      </div>

      {/* Mobile Drawer */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          {/* Overlay */}
          <div 
            className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs transition-opacity" 
            onClick={onCloseMobile}
          />
          {/* Content */}
          <div className="relative z-10 w-64 h-full shadow-2xl animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};
