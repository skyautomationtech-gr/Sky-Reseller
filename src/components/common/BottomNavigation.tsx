import React from 'react';
import { Home, Package, Wallet, HelpCircle, User } from 'lucide-react';

interface BottomNavigationProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const BottomNavigation: React.FC<BottomNavigationProps> = ({ activeTab, setActiveTab }) => {
  const navItems = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'orders', label: 'Orders', icon: Package },
    { id: 'wallet', label: 'Wallet', icon: Wallet },
    { id: 'support', label: 'Support', icon: HelpCircle },
    { id: 'profile', label: 'Profile', icon: User },
  ];

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 h-[64px] bg-white border-t border-slate-200/80 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] z-30 pb-safe">
      <div className="grid grid-cols-5 h-full max-w-md mx-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center justify-center gap-1 h-full w-full transition-all duration-150 active:scale-95 ${
                isActive ? 'text-blue-600' : 'text-slate-400 hover:text-slate-500'
              }`}
              style={{ minHeight: '44px' }}
            >
              <div className="relative flex items-center justify-center">
                <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110' : 'scale-100'}`} />
                {isActive && (
                  <span className="absolute -bottom-1 w-1 h-1 bg-blue-600 rounded-full animate-pulse" />
                )}
              </div>
              <span className="text-[10px] font-bold tracking-wide select-none">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
