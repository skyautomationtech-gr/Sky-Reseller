import React, { useState, useEffect } from 'react';
import { UserProfile, UserRole } from '../../types';
import { getCurrentAppVersion } from '../../lib/versionService';
import { subscribeToTotalUnreadChatCount } from '../../lib/chatService';
import { ChangelogModal } from '../version/ChangelogModal';
import { SkyLogo } from './SkyLogo';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LayoutDashboard, Shield, Users, CheckCircle2, Package, 
  Layers, Tag, ShoppingBag, Wallet, Percent, BarChart3, 
  Bell, LifeBuoy, Settings, FileText, User as UserIcon, LogOut, X, Store, Sparkles, Star, MessageSquare, MessagesSquare
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
  const [currentVersion, setCurrentVersion] = useState('1.0.0');
  const [isChangelogOpen, setIsChangelogOpen] = useState(false);
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string>('Sky Reseller');
  const [unreadChatCount, setUnreadChatCount] = useState<number>(0);

  useEffect(() => {
    getCurrentAppVersion().then((v) => {
      if (v?.version) setCurrentVersion(v.version);
    });

    const fetchLogo = async () => {
      try {
        const sSnap = await getDoc(doc(db, 'settings', 'general'));
        if (sSnap.exists()) {
          const sData = sSnap.data();
          if (sData.logoUrl) setCompanyLogo(sData.logoUrl);
          if (sData.companyName) setCompanyName(sData.companyName);
        }
      } catch (err) {
        console.error('Error fetching logo in sidebar:', err);
      }
    };
    fetchLogo();

    // Subscribe to unread live chat count
    const unsubChat = subscribeToTotalUnreadChatCount(user.role, user.uid, (cnt) => {
      setUnreadChatCount(cnt);
    });

    return () => unsubChat();
  }, [user.role, user.uid]);

  const getMenuItems = () => {
    if (role === 'super_admin') {
      return [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'chat', label: 'Live Chat', icon: MessagesSquare, badge: unreadChatCount },
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
        { id: 'support', label: 'Support & Tickets', icon: LifeBuoy },
        { id: 'settings', label: 'Settings', icon: Settings },
        { id: 'audit', label: 'Audit Logs', icon: FileText },
      ];
    } else if (role === 'admin') {
      return [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'chat', label: 'Live Chat', icon: MessagesSquare, badge: unreadChatCount },
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
        { id: 'support', label: 'Support & Tickets', icon: LifeBuoy },
        { id: 'settings', label: 'Settings', icon: Settings },
      ];
    } else {
      // Reseller
      return [
        { id: 'home', label: 'Home', icon: Store },
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'chat', label: 'Live Chat', icon: MessagesSquare, badge: unreadChatCount },
        { id: 'products', label: 'Products', icon: Package },
        { id: 'orders', label: 'Orders', icon: ShoppingBag },
        { id: 'reviews', label: 'Write Review', icon: Star },
        { id: 'feedback', label: 'Feedback / Complaint', icon: MessageSquare },
        { id: 'wallet', label: 'Wallet', icon: Wallet },
        { id: 'commission', label: 'Commission', icon: Percent },
        { id: 'notifications', label: 'Notifications', icon: Bell },
        { id: 'support', label: 'Support & Help', icon: LifeBuoy },
        { id: 'profile', label: 'Profile', icon: UserIcon },
        { id: 'settings', label: 'Settings', icon: Settings },
      ];
    }
  };

  const menuItems = getMenuItems();

  const sidebarContent = (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col shrink-0 min-h-screen border-r border-slate-800 h-full">
      <div className="p-5 border-b border-slate-800 flex items-center justify-between">
        <SkyLogo size="md" showText={true} customLogoUrl={companyLogo} />
        {onCloseMobile && (
          <button
            onClick={onCloseMobile}
            className="md:hidden text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
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
            <p className="text-[10px] text-slate-400 truncate">{user.shopName || user.role}</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          const badgeCount = item.badge || 0;

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
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-colors min-h-[44px] cursor-pointer ${
                isActive
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </div>

              {badgeCount > 0 && (
                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full shrink-0 ${
                  isActive ? 'bg-white text-blue-600' : 'bg-rose-500 text-white animate-pulse'
                }`}>
                  {badgeCount > 99 ? '99+' : badgeCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800 space-y-2">
        <button
          onClick={() => setIsChangelogOpen(true)}
          className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-300 transition-colors group min-h-[36px] cursor-pointer"
        >
          <div className="flex items-center gap-1.5 text-[11px]">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 group-hover:scale-110 transition-transform" />
            <span className="font-medium">App Version</span>
          </div>
          <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
            v{currentVersion}
          </span>
        </button>
      </div>

      {isChangelogOpen && (
        <ChangelogModal
          isOpen={isChangelogOpen}
          onClose={() => setIsChangelogOpen(false)}
          currentVersion={currentVersion}
        />
      )}
    </aside>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <div className="hidden md:block shrink-0">
        {sidebarContent}
      </div>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {isMobileOpen && (
          <div className="fixed inset-0 z-50 md:hidden flex">
            {/* Overlay */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs" 
              onClick={onCloseMobile}
            />
            {/* Content */}
            <motion.div 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'tween', duration: 0.3, ease: 'easeOut' }}
              className="relative z-10 w-64 h-full shadow-2xl"
            >
              {sidebarContent}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
