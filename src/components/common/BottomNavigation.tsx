import React from 'react';
import { Home, ShoppingBag, Package, Wallet, UserCircle } from 'lucide-react';
import { triggerHaptic } from '../../lib/nativeFeedback';

interface BottomNavigationProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  pendingOrdersCount?: number;
  unreadChatCount?: number;
  unreadNotificationsCount?: number;
}

export const BottomNavigation: React.FC<BottomNavigationProps> = ({ 
  activeTab, 
  setActiveTab,
  pendingOrdersCount = 0,
  unreadChatCount = 0,
  unreadNotificationsCount = 0,
}) => {
  const moreSubTabs = ['profile', 'support', 'notifications', 'chat', 'reviews', 'feedback', 'commission', 'security', 'settings', 'more'];
  const isMoreActive = moreSubTabs.includes(activeTab);
  const totalAccountBadges = unreadChatCount + unreadNotificationsCount;

  const navItems = [
    { id: 'home', label: 'Home', icon: Home, badge: 0 },
    { id: 'products', label: 'Catalog', icon: ShoppingBag, badge: 0 },
    { id: 'orders', label: 'Orders', icon: Package, badge: pendingOrdersCount },
    { id: 'wallet', label: 'Wallet', icon: Wallet, badge: 0 },
    { id: 'more', label: 'Account', icon: UserCircle, badge: totalAccountBadges, isActiveOverride: isMoreActive },
  ];

  const handleTabClick = (tabId: string) => {
    triggerHaptic('light');
    setActiveTab(tabId);
  };

  return (
    <nav 
      aria-label="Mobile Bottom Navigation"
      className="fixed bottom-0 left-0 right-0 h-[64px] bg-white/85 backdrop-blur-2xl border-t border-white/80 shadow-[0_-10px_30px_rgba(15,23,42,0.06)] z-40 pb-safe transition-all"
    >
      <div className="grid grid-cols-5 h-full max-w-lg mx-auto px-1.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.isActiveOverride !== undefined ? item.isActiveOverride : activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleTabClick(item.id)}
              className={`flex flex-col items-center justify-center gap-1 h-full w-full transition-all duration-200 select-none cursor-pointer relative fluid-spring ${
                isActive ? 'text-blue-600 font-bold' : 'text-slate-400 hover:text-slate-700 font-medium'
              }`}
              style={{ minHeight: '48px', WebkitTapHighlightColor: 'transparent' }}
            >
              <div className="relative flex items-center justify-center">
                {isActive && (
                  <span className="absolute -inset-2 bg-gradient-to-tr from-blue-500/15 to-indigo-500/10 rounded-full scale-100 transition-all duration-300 -z-10 shadow-xs" />
                )}
                <Icon className={`w-5 h-5 transition-transform duration-200 ${isActive ? 'scale-110 stroke-[2.4] text-blue-600' : 'scale-100 stroke-[1.8]'}`} />
                {item.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 bg-rose-500 text-white font-extrabold text-[10px] min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center ring-2 ring-white shadow-xs animate-pulse">
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                )}
                {isActive && (
                  <span className="absolute -bottom-1.5 w-1.5 h-1.5 bg-blue-600 rounded-full shadow-[0_0_8px_rgba(37,99,235,0.6)] animate-pulse" />
                )}
              </div>
              <span className={`text-[11px] tracking-tight leading-tight transition-colors ${isActive ? 'text-blue-600' : 'text-slate-500'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

