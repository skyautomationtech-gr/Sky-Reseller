import React, { useState, useEffect } from 'react';
import { Home, ShoppingBag, Package, Wallet, UserCircle, Lock } from 'lucide-react';
import { motion } from 'motion/react';
import { triggerHaptic } from '../../lib/nativeFeedback';

interface BottomNavigationProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  pendingOrdersCount?: number;
  unreadChatCount?: number;
  unreadNotificationsCount?: number;
  isRestricted?: boolean;
  onOpenLockedModal?: (featureName: string) => void;
}

export const BottomNavigation: React.FC<BottomNavigationProps> = ({ 
  activeTab, 
  setActiveTab,
  pendingOrdersCount = 0,
  unreadChatCount = 0,
  unreadNotificationsCount = 0,
  isRestricted = false,
  onOpenLockedModal,
}) => {
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  // Auto-hide floating nav bar when virtual keyboard opens on mobile devices
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const initialHeight = window.innerHeight;
    const handleResize = () => {
      // If height decreases by more than 160px, on-screen keyboard is active
      const currentHeight = window.innerHeight;
      if (initialHeight - currentHeight > 160) {
        setIsKeyboardOpen(true);
      } else {
        setIsKeyboardOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const moreSubTabs = ['profile', 'support', 'notifications', 'chat', 'reviews', 'feedback', 'commission', 'security', 'settings', 'more'];
  const isMoreActive = moreSubTabs.includes(activeTab);
  const totalAccountBadges = unreadChatCount + unreadNotificationsCount;

  const navItems = [
    { id: 'home', label: 'Home', icon: Home, badge: 0, locked: false },
    { id: 'products', label: 'Catalog', icon: ShoppingBag, badge: 0, locked: false },
    { id: 'orders', label: 'Orders', icon: Package, badge: pendingOrdersCount, locked: isRestricted },
    { id: 'wallet', label: 'Wallet', icon: Wallet, badge: 0, locked: isRestricted },
    { id: 'more', label: 'Account', icon: UserCircle, badge: totalAccountBadges, isActiveOverride: isMoreActive, locked: false },
  ];

  const handleTabClick = (item: typeof navItems[0]) => {
    triggerHaptic('light');
    if (item.locked) {
      if (onOpenLockedModal) {
        onOpenLockedModal(item.label);
      }
      return;
    }
    setActiveTab(item.id);
  };

  return (
    <nav 
      aria-label="Mobile Bottom Navigation"
      className={`fixed left-3 right-3 max-w-lg mx-auto h-[64px] rounded-3xl z-40 transition-all duration-300 pointer-events-auto select-none ${
        isKeyboardOpen ? 'translate-y-28 opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'
      }`}
      style={{
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)',
        backgroundColor: 'rgba(255, 255, 255, 0.75)',
        backdropFilter: 'blur(20px) saturate(160%)',
        WebkitBackdropFilter: 'blur(20px) saturate(160%)',
        border: '1px solid rgba(255, 255, 255, 0.75)',
        boxShadow: '0 12px 32px -4px rgba(4, 32, 63, 0.12), 0 4px 12px rgba(0, 0, 0, 0.04)',
      }}
    >
      <div className="grid grid-cols-5 h-full items-center px-1.5 relative">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.isActiveOverride !== undefined ? item.isActiveOverride : activeTab === item.id;
          
          return (
            <motion.button
              key={item.id}
              onClick={() => handleTabClick(item)}
              whileTap={{ scale: 0.94 }}
              className={`relative flex flex-col items-center justify-center gap-0.5 h-full w-full py-1.5 transition-colors cursor-pointer ${
                isActive ? 'text-[#04203F] font-bold' : 'text-slate-400 hover:text-slate-600 font-medium'
              }`}
              style={{ minHeight: '48px', WebkitTapHighlightColor: 'transparent' }}
            >
              {/* Sliding Glass Highlight Pill for Active Item */}
              {isActive && (
                <motion.div
                  layoutId="activeNavTab"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  className="absolute inset-x-1.5 inset-y-1.5 rounded-2xl bg-gradient-to-b from-white/90 to-white/60 shadow-[0_2px_8px_rgba(4,32,63,0.06),inset_0_1px_1px_rgba(255,255,255,0.8)] border border-white/80 -z-10"
                />
              )}

              <div className="relative flex items-center justify-center">
                <Icon 
                  className={`w-5 h-5 transition-transform duration-200 ${
                    isActive ? 'scale-105 stroke-[2.4] text-[#04203F]' : 'scale-100 stroke-[1.8]'
                  }`} 
                />
                
                {/* Lock Badge if Restricted */}
                {item.locked && (
                  <span className="absolute -top-1.5 -right-2 bg-slate-800 text-amber-400 p-0.5 rounded-full ring-2 ring-white shadow-xs">
                    <Lock className="w-2.5 h-2.5" />
                  </span>
                )}

                {/* Counter Badge (if not locked) */}
                {!item.locked && item.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 bg-[#E11D48] text-white font-extrabold text-[10px] min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center ring-2 ring-white shadow-xs">
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                )}
              </div>

              <span className={`text-[11px] tracking-tight leading-tight transition-colors ${
                isActive ? 'text-[#04203F] font-bold' : 'text-slate-400'
              }`}>
                {item.label}
              </span>
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
};
