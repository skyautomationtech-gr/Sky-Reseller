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
import { SettingsPage } from '../settings/SettingsPage';
import { ResellerProfilePage } from '../profile/ResellerProfilePage';
import { ResellerHomePage } from '../home/ResellerHomePage';
import { FloatingHelpButtons } from '../common/FloatingHelpButtons';
import { 
  Store, Package, ShoppingBag, Wallet as WalletIcon, Percent, MapPin, Phone, Mail, 
  CheckCircle2, Plus, ArrowUpRight, TrendingUp, Clock, Bell, CalendarDays
} from 'lucide-react';

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

  useEffect(() => {
    fetchResellerStats();
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
      case 'commission':
        return <CommissionSummary user={user} />;
      case 'notifications':
        return <ResellerNoticeList user={user} />;
      case 'support':
        return <SupportSystem user={user} />;
      case 'profile':
        return <ResellerProfilePage user={user} />;
      case 'settings':
        return <SettingsPage user={user} />;
      case 'dashboard':
        return (
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-blue-600 via-indigo-700 to-slate-900 rounded-2xl p-8 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="max-w-xl">
                <span className="bg-white/25 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider inline-block mb-3">
                  Reseller Hub • Sky Automation Tech
                </span>
                <h2 className="text-2xl font-bold mb-2">Welcome back, {user.fullName}!</h2>
                <p className="text-blue-100 text-xs leading-relaxed">
                  Your shop <span className="font-semibold text-white">{user.shopName}</span> is active. Create customer orders, track fulfillment progress, and earn commissions directly to your wallet.
                </p>
              </div>

              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs px-6 py-3.5 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 shrink-0"
              >
                <Plus className="w-5 h-5" />
                <span>Create New Order</span>
              </button>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              
              {/* Card 1: Wallet Balance */}
              <div
                onClick={() => setActiveTab('wallet')}
                className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-emerald-500 transition-all cursor-pointer group flex flex-col justify-between"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Wallet Balance</span>
                  <div className="w-9 h-9 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <WalletIcon className="w-4.5 h-4.5" />
                  </div>
                </div>
                <div>
                  <div className="text-xl font-bold text-slate-900">৳{walletBalance.toLocaleString()}</div>
                  <p className="text-[10px] text-emerald-600 font-medium mt-1">Request withdrawal payout →</p>
                </div>
              </div>

              {/* Card 2: Today's Orders */}
              <div
                onClick={() => setActiveTab('orders')}
                className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-sky-500 transition-all cursor-pointer group flex flex-col justify-between"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Today's Orders</span>
                  <div className="w-9 h-9 bg-sky-50 text-sky-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <CalendarDays className="w-4.5 h-4.5" />
                  </div>
                </div>
                <div>
                  <div className="text-xl font-bold text-slate-900">{todaysOrders} Orders</div>
                  <p className="text-[10px] text-sky-600 font-medium mt-1">Orders placed today →</p>
                </div>
              </div>

              {/* Card 3: Total Orders */}
              <div
                onClick={() => setActiveTab('orders')}
                className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-indigo-500 transition-all cursor-pointer group flex flex-col justify-between"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Orders</span>
                  <div className="w-9 h-9 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <ShoppingBag className="w-4.5 h-4.5" />
                  </div>
                </div>
                <div>
                  <div className="text-xl font-bold text-slate-900">{totalOrders} Orders</div>
                  <p className="text-[10px] text-indigo-600 font-medium mt-1">Manage all customer orders →</p>
                </div>
              </div>

              {/* Card 4: Pending Orders */}
              <div
                onClick={() => setActiveTab('orders')}
                className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-blue-500 transition-all cursor-pointer group flex flex-col justify-between"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pending Orders</span>
                  <div className="w-9 h-9 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Clock className="w-4.5 h-4.5" />
                  </div>
                </div>
                <div>
                  <div className="text-xl font-bold text-slate-900">{pendingOrders} Orders</div>
                  <p className="text-[10px] text-blue-600 font-medium mt-1">Awaiting fulfillment →</p>
                </div>
              </div>

              {/* Card 5: Delivered Orders */}
              <div
                onClick={() => setActiveTab('orders')}
                className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-emerald-500 transition-all cursor-pointer group flex flex-col justify-between"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Delivered Orders</span>
                  <div className="w-9 h-9 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <CheckCircle2 className="w-4.5 h-4.5" />
                  </div>
                </div>
                <div>
                  <div className="text-xl font-bold text-slate-900">{deliveredOrders} Completed</div>
                  <p className="text-[10px] text-emerald-600 font-medium mt-1">Dispatched & completed →</p>
                </div>
              </div>

              {/* Card 6: Total Earnings */}
              <div
                onClick={() => setActiveTab('commission')}
                className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-purple-500 transition-all cursor-pointer group flex flex-col justify-between"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Earnings</span>
                  <div className="w-9 h-9 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <TrendingUp className="w-4.5 h-4.5" />
                  </div>
                </div>
                <div>
                  <div className="text-xl font-bold text-slate-900">৳{totalEarnings.toLocaleString()}</div>
                  <p className="text-[10px] text-purple-600 font-medium mt-1">Earned from delivered orders →</p>
                </div>
              </div>

              {/* Card 7: Commission */}
              <div
                onClick={() => setActiveTab('commission')}
                className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-cyan-500 transition-all cursor-pointer group flex flex-col justify-between"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Commission</span>
                  <div className="w-9 h-9 bg-cyan-50 text-cyan-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Percent className="w-4.5 h-4.5" />
                  </div>
                </div>
                <div>
                  <div className="text-xl font-bold text-slate-900">৳{pendingCommission.toLocaleString()}</div>
                  <p className="text-[10px] text-cyan-600 font-medium mt-1">In-progress / pending commission →</p>
                </div>
              </div>

              {/* Card 8: Notifications */}
              <div
                onClick={() => setActiveTab('notifications')}
                className={`p-5 rounded-2xl border transition-all cursor-pointer group flex flex-col justify-between ${
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
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          {renderContent()}
        </main>
      </div>

      <FloatingHelpButtons />

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
