import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserProfile, Wallet } from '../../types';
import { Sidebar } from '../common/Sidebar';
import { Navbar } from '../common/Navbar';
import { ProductManagement } from '../inventory/ProductManagement';
import { OrderList } from '../orders/OrderList';
import { WalletView } from '../wallet/WalletView';
import { CommissionSummary } from '../commission/CommissionSummary';
import { CreateOrderModal } from '../orders/CreateOrderModal';
import { ResellerNoticeList } from '../notifications/ResellerNoticeList';
import { SupportSystem } from '../support/SupportSystem';
import { LiveChatWindow } from '../chat/LiveChatWindow';
import { ResellerSettings } from '../settings/ResellerSettings';
import { ResellerProfilePage } from '../profile/ResellerProfilePage';
import { ResellerHomePage } from '../home/ResellerHomePage';
import { ProductReviewForm } from '../reviews/ProductReviewForm';
import { FeedbackForm } from '../feedback/FeedbackForm';
import { FloatingHelpButtons } from '../common/FloatingHelpButtons';
import { BottomNavigation } from '../common/BottomNavigation';
import { 
  Store, Package, ShoppingBag, Wallet as WalletIcon, Percent, MapPin, Phone, Mail, 
  CheckCircle2, Plus, ArrowUpRight, TrendingUp, Clock, Bell, CalendarDays, RotateCw
} from 'lucide-react';
import { usePageRefresh, useRefresh } from '../../context/RefreshContext';

interface ResellerDashboardProps {
  user: UserProfile;
  onLogout: () => void;
}

export const ResellerDashboard: React.FC<ResellerDashboardProps> = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState('home');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
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
  const [loadingMetrics, setLoadingMetrics] = useState<boolean>(true);

  const { isRefreshing, formattedLastUpdated, showToast, refreshCurrentPage } = useRefresh();

  const handleRefresh = async () => {
    await fetchResellerStats();
    showToast('✓ Reseller Dashboard refreshed', 'success');
  };

  usePageRefresh(activeTab, handleRefresh);

  useEffect(() => {
    fetchResellerStats();

    const handlePushNav = (e: any) => {
      if (e.detail?.tab) {
        setActiveTab(e.detail.tab);
      }
    };
    window.addEventListener('sky_navigate_tab', handlePushNav);
    return () => window.removeEventListener('sky_navigate_tab', handlePushNav);
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
      case 'reviews':
        return (
          <div className="space-y-6">
            <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-lg flex items-center justify-between">
              <div>
                <h2 className="text-xl font-extrabold text-white">Product Reviews</h2>
                <p className="text-xs text-slate-400 mt-0.5">Submit feedback and star ratings for products you've received.</p>
              </div>
              <button
                onClick={() => setActiveTab('products')}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition-all"
              >
                Browse All Products →
              </button>
            </div>
            <ProductReviewForm
              user={user}
              onSuccessRedirect={(prodId) => {
                setActiveTab('products');
              }}
            />
          </div>
        );
      case 'feedback':
        return <FeedbackForm user={user} />;
      case 'wallet':
        return <WalletView user={user} />;
      case 'commission':
        return <CommissionSummary user={user} />;
      case 'notifications':
        return <ResellerNoticeList user={user} />;
      case 'support':
        return <SupportSystem user={user} />;
      case 'chat':
      case 'live_chat':
        return (
          <div className="h-[calc(100vh-8.5rem)]">
            <LiveChatWindow
              chatId={`chat_${user.uid}`}
              currentUser={user}
              partnerInfo={{
                name: 'Sky Admin Team',
                shopName: 'Official Helpdesk & Order Support',
                role: 'admin',
              }}
              onOpenOrder={(ordId) => setActiveTab('orders')}
              onOpenProduct={(prodId) => setActiveTab('products')}
              className="h-full"
            />
          </div>
        );
      case 'profile':
        return <ResellerProfilePage user={user} />;
      case 'settings':
        return <ResellerSettings user={user} onLogout={onLogout} />;
      case 'dashboard':
        return (
          <div className="space-y-6">
            {/* Welcome Banner */}
            <div className="bg-gradient-to-r from-blue-600 via-indigo-700 to-slate-900 rounded-2xl p-5 sm:p-8 text-white shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-6">
              <div className="max-w-xl">
                <span className="bg-white/20 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider inline-block mb-2">
                  Reseller Hub • Sky Automation Tech
                </span>
                <h2 className="text-lg sm:text-2xl font-extrabold mb-1">Welcome back, {user.fullName}!</h2>
                <p className="text-blue-100 text-xs leading-relaxed">
                  Your shop <span className="font-semibold text-white">{user.shopName}</span> is active. Create customer orders, track fulfillment progress, and earn commissions directly to your wallet.
                </p>
              </div>

              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="w-full sm:w-auto bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs px-5 py-3 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 shrink-0 min-h-[44px] cursor-pointer active:scale-98"
              >
                <Plus className="w-5 h-5" />
                <span>Create New Order</span>
              </button>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-4">
              
              {/* Card 1: Wallet Balance */}
              <div
                onClick={() => setActiveTab('wallet')}
                className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-emerald-500 transition-all cursor-pointer group flex flex-col justify-between active:scale-98"
              >
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider truncate">Wallet Balance</span>
                  <div className="w-8 h-8 sm:w-9 sm:h-9 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                    <WalletIcon className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <div className="text-base sm:text-xl font-extrabold text-slate-900">৳{walletBalance.toLocaleString()}</div>
                  <p className="text-[10px] text-emerald-600 font-bold mt-1 truncate">Request withdrawal →</p>
                </div>
              </div>

              {/* Card 2: Today's Orders */}
              <div
                onClick={() => setActiveTab('orders')}
                className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-sky-500 transition-all cursor-pointer group flex flex-col justify-between active:scale-98"
              >
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider truncate">Today's Orders</span>
                  <div className="w-8 h-8 sm:w-9 sm:h-9 bg-sky-50 text-sky-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                    <CalendarDays className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <div className="text-base sm:text-xl font-extrabold text-slate-900">{todaysOrders} <span className="text-xs sm:text-sm font-semibold text-slate-500">Orders</span></div>
                  <p className="text-[10px] text-sky-600 font-bold mt-1 truncate">Orders placed today →</p>
                </div>
              </div>

              {/* Card 3: Total Orders */}
              <div
                onClick={() => setActiveTab('orders')}
                className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-indigo-500 transition-all cursor-pointer group flex flex-col justify-between active:scale-98"
              >
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider truncate">Total Orders</span>
                  <div className="w-8 h-8 sm:w-9 sm:h-9 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                    <ShoppingBag className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <div className="text-base sm:text-xl font-extrabold text-slate-900">{totalOrders} <span className="text-xs sm:text-sm font-semibold text-slate-500">Orders</span></div>
                  <p className="text-[10px] text-indigo-600 font-bold mt-1 truncate">Manage all orders →</p>
                </div>
              </div>

              {/* Card 4: Pending Orders */}
              <div
                onClick={() => setActiveTab('orders')}
                className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-blue-500 transition-all cursor-pointer group flex flex-col justify-between active:scale-98"
              >
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider truncate">Pending Orders</span>
                  <div className="w-8 h-8 sm:w-9 sm:h-9 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                    <Clock className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <div className="text-base sm:text-xl font-extrabold text-slate-900">{pendingOrders} <span className="text-xs sm:text-sm font-semibold text-slate-500">Pending</span></div>
                  <p className="text-[10px] text-blue-600 font-bold mt-1 truncate">Awaiting fulfillment →</p>
                </div>
              </div>

              {/* Card 5: Delivered Orders */}
              <div
                onClick={() => setActiveTab('orders')}
                className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-emerald-500 transition-all cursor-pointer group flex flex-col justify-between active:scale-98"
              >
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider truncate">Delivered Orders</span>
                  <div className="w-8 h-8 sm:w-9 sm:h-9 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <div className="text-base sm:text-xl font-extrabold text-slate-900">{deliveredOrders} <span className="text-xs sm:text-sm font-semibold text-slate-500">Done</span></div>
                  <p className="text-[10px] text-emerald-600 font-bold mt-1 truncate">Completed orders →</p>
                </div>
              </div>

              {/* Card 6: Total Earnings */}
              <div
                onClick={() => setActiveTab('commission')}
                className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-purple-500 transition-all cursor-pointer group flex flex-col justify-between active:scale-98"
              >
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider truncate">Total Earnings</span>
                  <div className="w-8 h-8 sm:w-9 sm:h-9 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <div className="text-base sm:text-xl font-extrabold text-slate-900">৳{totalEarnings.toLocaleString()}</div>
                  <p className="text-[10px] text-purple-600 font-bold mt-1 truncate">Delivered commission →</p>
                </div>
              </div>

              {/* Card 7: Commission */}
              <div
                onClick={() => setActiveTab('commission')}
                className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-cyan-500 transition-all cursor-pointer group flex flex-col justify-between active:scale-98"
              >
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider truncate">Pending Comm.</span>
                  <div className="w-8 h-8 sm:w-9 sm:h-9 bg-cyan-50 text-cyan-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                    <Percent className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <div className="text-base sm:text-xl font-extrabold text-slate-900">৳{pendingCommission.toLocaleString()}</div>
                  <p className="text-[10px] text-cyan-600 font-bold mt-1 truncate">Pending processing →</p>
                </div>
              </div>

              {/* Card 8: Notifications */}
              <div
                onClick={() => setActiveTab('notifications')}
                className={`p-3.5 sm:p-5 rounded-2xl border transition-all cursor-pointer group flex flex-col justify-between active:scale-98 ${
                  unreadNotifications > 0 
                    ? 'bg-amber-50/50 border-amber-200 hover:border-amber-500 shadow-amber-50/50 shadow-xs' 
                    : 'bg-white border-slate-200 hover:border-slate-400 shadow-xs'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-xs font-bold uppercase tracking-wider ${unreadNotifications > 0 ? 'text-amber-600' : 'text-slate-500'}`}>
                    Notifications
                  </span>
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform ${
                    unreadNotifications > 0 ? 'bg-amber-100 text-amber-600' : 'bg-slate-50 text-slate-500'
                  }`}>
                    <Bell className="w-4.5 h-4.5" />
                  </div>
                </div>
                <div>
                  <div className={`text-xl font-bold ${unreadNotifications > 0 ? 'text-amber-700' : 'text-slate-900'}`}>
                    {unreadNotifications} Unread
                  </div>
                  <p className={`text-[10px] font-medium mt-1 ${unreadNotifications > 0 ? 'text-amber-600' : 'text-slate-500'}`}>
                    {unreadNotifications > 0 ? 'View important announcements →' : 'No new notices →'}
                  </p>
                </div>
              </div>

            </div>
          </div>
        );
      default:
        return (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <h3 className="text-lg font-bold text-slate-900 capitalize mb-1">{activeTab.replace('_', ' ')} Module</h3>
            <p className="text-sm text-slate-500">This feature module is available under management options.</p>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-100">
      <Sidebar 
        user={user} 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        onLogout={onLogout}
        isMobileOpen={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar 
          user={user} 
          onLogout={onLogout} 
          title={`Reseller • ${activeTab.replace('_', ' ').toUpperCase()}`}
          onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          onNavigateTab={setActiveTab}
        />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 pb-20 md:pb-8 overflow-y-auto">
          {renderContent()}
        </main>
      </div>

      <FloatingHelpButtons isResellerMobile={true} />

      <BottomNavigation activeTab={activeTab} setActiveTab={setActiveTab} />

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
  );
};
