import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserProfile, Wallet } from '../../types';
import { ProductManagement } from '../inventory/ProductManagement';
import { OrderList } from '../orders/OrderList';
import { WalletView } from '../wallet/WalletView';
import { CreateOrderModal } from '../orders/CreateOrderModal';
import { ResellerHomePage } from '../home/ResellerHomePage';
import { ResellerAccountHub } from '../profile/ResellerAccountHub';
import { FloatingHelpButtons } from '../common/FloatingHelpButtons';
import { BottomNavigation } from '../common/BottomNavigation';
import { SkyLogo } from '../common/SkyLogo';
import { NotificationBellDropdown } from '../notifications/NotificationBellDropdown';
import { subscribeToTotalUnreadChatCount } from '../../lib/chatService';
import { RotateCw, MessagesSquare } from 'lucide-react';
import { usePageRefresh, useRefresh } from '../../context/RefreshContext';

interface ResellerDashboardProps {
  user: UserProfile;
  onLogout: () => void;
}

export const ResellerDashboard: React.FC<ResellerDashboardProps> = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState('home');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Live Metrics
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [totalOrders, setTotalOrders] = useState<number>(0);
  const [pendingOrders, setPendingOrders] = useState<number>(0);
  const [deliveredOrders, setDeliveredOrders] = useState<number>(0);
  const [todaysOrders, setTodaysOrders] = useState<number>(0);
  const [totalEarnings, setTotalEarnings] = useState<number>(0);
  const [pendingCommission, setPendingCommission] = useState<number>(0);
  const [unreadNotifications, setUnreadNotifications] = useState<number>(0);
  const [unreadChatCount, setUnreadChatCount] = useState<number>(0);
  const [loadingMetrics, setLoadingMetrics] = useState<boolean>(true);

  const { isRefreshing, formattedLastUpdated, showToast, refreshCurrentPage } = useRefresh();

  const handleRefresh = async () => {
    await fetchResellerStats();
    showToast('✓ Data refreshed', 'success');
  };

  usePageRefresh(activeTab, handleRefresh);

  useEffect(() => {
    fetchResellerStats();

    const unsubChat = subscribeToTotalUnreadChatCount(user.role, user.uid, (cnt) => {
      setUnreadChatCount(cnt);
    });

    const handlePushNav = (e: any) => {
      if (e.detail?.tab) {
        setActiveTab(e.detail.tab);
      }
    };
    window.addEventListener('sky_navigate_tab', handlePushNav);
    return () => {
      unsubChat();
      window.removeEventListener('sky_navigate_tab', handlePushNav);
    };
  }, [user.uid]);

  const fetchResellerStats = async () => {
    setLoadingMetrics(true);
    try {
      // 1. Wallet Balance
      const wSnap = await getDoc(doc(db, 'wallets', user.uid));
      if (wSnap.exists()) {
        const wData = wSnap.data() as Wallet;
        setWalletBalance(wData.balance || 0);
      }

      // 2. Orders & Financial Metrics
      const q = query(collection(db, 'orders'), where('resellerId', '==', user.uid));
      const ordersSnap = await getDocs(q);
      setTotalOrders(ordersSnap.size);

      let p = 0;
      let d = 0;
      let tCount = 0;
      let earnedSum = 0;
      let pendingCommSum = 0;

      const today = new Date();
      const currentMonth = today.getMonth();
      const currentYear = today.getFullYear();

      ordersSnap.forEach((docSnap) => {
        const o = docSnap.data();
        const st = o.status;
        
        // Count specific statuses
        if (st === 'pending') p++;
        if (st === 'delivered') d++;

        // Determine date
        let orderDate: Date | null = null;
        if (o.createdAt) {
          if (o.createdAt.toDate) {
            orderDate = o.createdAt.toDate();
          } else if (o.createdAt.seconds) {
            orderDate = new Date(o.createdAt.seconds * 1000);
          } else {
            orderDate = new Date(o.createdAt);
          }
        }

        if (orderDate) {
          if (
            orderDate.getDate() === today.getDate() &&
            orderDate.getMonth() === currentMonth &&
            orderDate.getFullYear() === currentYear
          ) {
            tCount++;
          }
        }

        // Earnings (Commission from delivered orders)
        if (st === 'delivered') {
          earnedSum += o.sellAmount || 0;
        } else if (st !== 'cancelled' && st !== 'returned') {
          // Commission from active in-progress orders
          pendingCommSum += o.sellAmount || 0;
        }
      });

      setPendingOrders(p);
      setDeliveredOrders(d);
      setTodaysOrders(tCount);
      setTotalEarnings(earnedSum);
      setPendingCommission(pendingCommSum);

      // 3. Unread Notifications
      const [noticesSnap, readsSnap] = await Promise.all([
        getDocs(collection(db, 'notices')),
        getDocs(collection(db, 'noticeReads')),
      ]);

      const reads = new Set<string>();
      readsSnap.forEach((docD) => {
        const data = docD.data();
        if (data.resellerId === user.uid) {
          reads.add(data.noticeId);
        }
      });

      let unreadCount = 0;
      noticesSnap.forEach((docN) => {
        const n = docN.data();
        if (n.targetAudience === 'all' || n.targetResellerId === user.uid) {
          if (!reads.has(docN.id)) {
            unreadCount++;
          }
        }
      });
      setUnreadNotifications(unreadCount);

    } catch (err) {
      console.error('Error fetching reseller dashboard metrics:', err);
    } finally {
      setLoadingMetrics(false);
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return <ResellerHomePage user={user} onNavigateTab={setActiveTab} />;
      case 'products':
        return <ProductManagement user={user} />;
      case 'orders':
        return <OrderList user={user} />;
      case 'wallet':
        return <WalletView user={user} />;
      case 'reviews':
      case 'feedback':
      case 'commission':
      case 'notifications':
      case 'support':
      case 'chat':
      case 'live_chat':
      case 'profile':
      case 'settings':
      case 'security':
      case 'more':
        return (
          <ResellerAccountHub
            user={user}
            activeSubTab={activeTab}
            onNavigateTab={setActiveTab}
            onLogout={onLogout}
            unreadChatCount={unreadChatCount}
            unreadNotificationsCount={unreadNotifications}
          />
        );
      default:
        return <ResellerHomePage user={user} onNavigateTab={setActiveTab} />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex justify-center selection:bg-blue-500 selection:text-white">
      {/* Mobile-First App Container (Full width on phone/tablet, sleek centered app shell on wide desktop) */}
      <div className="w-full max-w-2xl min-h-screen bg-slate-50 flex flex-col relative shadow-xl md:border-x border-slate-200">
        
        {/* Native Mobile App Header (Sticky) */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/90 px-3.5 py-2.5 flex items-center justify-between shadow-xs">
          <div 
            onClick={() => setActiveTab('home')}
            className="flex items-center gap-2 cursor-pointer select-none active:scale-95 transition-transform"
          >
            <SkyLogo size="sm" showText={false} lightMode={true} />
            <div>
              <div className="flex items-center gap-1">
                <span className="text-sm font-black text-slate-900 tracking-tight leading-none">SKY RESELLER</span>
              </div>
              <p className="text-[11px] font-medium text-slate-500 truncate max-w-[130px] leading-tight mt-0.5">
                {user.shopName || user.fullName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Live Wallet Balance Pill */}
            <button
              onClick={() => setActiveTab('wallet')}
              className="bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/90 text-emerald-800 px-2.5 py-1.5 rounded-full flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-2xs"
              title="Wallet Balance - Click to View"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-extrabold tracking-tight">৳{walletBalance.toLocaleString()}</span>
            </button>

            {/* Live Chat Direct Button */}
            <button
              onClick={() => setActiveTab('chat')}
              className="relative p-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors min-w-[38px] min-h-[38px] flex items-center justify-center cursor-pointer active:scale-90"
              title="Live Chat Support"
            >
              <MessagesSquare className="w-5 h-5 text-slate-700 hover:text-blue-600" />
              {unreadChatCount > 0 && (
                <span className="absolute top-1 right-1 bg-rose-500 text-white font-black text-[10px] w-4 h-4 rounded-full flex items-center justify-center ring-2 ring-white animate-bounce">
                  {unreadChatCount > 9 ? '9+' : unreadChatCount}
                </span>
              )}
            </button>

            {/* Realtime Notification Bell */}
            <NotificationBellDropdown
              user={user}
              onNavigateNotifications={() => setActiveTab('notifications')}
            />

            {/* Quick Refresh Icon */}
            <button
              onClick={() => refreshCurrentPage()}
              disabled={isRefreshing}
              className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors min-w-[38px] min-h-[38px] flex items-center justify-center cursor-pointer active:scale-90"
              title="Refresh"
            >
              <RotateCw className={`w-4 h-4 text-slate-600 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`} />
            </button>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 pb-24 overflow-x-hidden">
          {renderContent()}
        </main>

        {/* Floating Quick Action / Help Buttons */}
        <FloatingHelpButtons isResellerMobile={true} />

        {/* Fixed Mobile Bottom Navigation Bar */}
        <BottomNavigation 
          activeTab={activeTab} 
          setActiveTab={setActiveTab} 
          pendingOrdersCount={pendingOrders}
          unreadChatCount={unreadChatCount}
          unreadNotificationsCount={unreadNotifications}
        />

        {/* Create Order Modal */}
        <CreateOrderModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          user={user}
          onOrderCreated={() => {
            fetchResellerStats();
            setActiveTab('orders');
          }}
        />
      </div>
    </div>
  );
};
