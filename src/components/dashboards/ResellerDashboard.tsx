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
  CheckCircle2, Plus, ArrowUpRight, TrendingUp, Clock
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

  useEffect(() => {
    fetchResellerStats();
  }, [user.uid]);

  const fetchResellerStats = async () => {
    try {
      // Wallet
      const wSnap = await getDoc(doc(db, 'wallets', user.uid));
      if (wSnap.exists()) {
        const wData = wSnap.data() as Wallet;
        setWalletBalance(wData.balance || 0);
      }

      // Orders
      const q = query(collection(db, 'orders'), where('resellerId', '==', user.uid));
      const ordersSnap = await getDocs(q);
      setTotalOrders(ordersSnap.size);

      let p = 0;
      let d = 0;
      ordersSnap.forEach((docSnap) => {
        const st = docSnap.data().status;
        if (st === 'pending') p++;
        if (st === 'delivered') d++;
      });
      setPendingOrders(p);
      setDeliveredOrders(d);
    } catch (err) {
      console.error('Error fetching reseller dashboard metrics:', err);
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div
                onClick={() => setActiveTab('wallet')}
                className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:border-emerald-500 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Available Wallet</span>
                  <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <WalletIcon className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-slate-900">৳{walletBalance.toLocaleString()}</div>
                <p className="text-[11px] text-emerald-600 font-medium mt-1">Request withdrawal payout →</p>
              </div>

              <div
                onClick={() => setActiveTab('orders')}
                className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:border-blue-500 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Customer Orders</span>
                  <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <ShoppingBag className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-slate-900">{totalOrders} Orders</div>
                <p className="text-[11px] text-blue-600 font-medium mt-1">{pendingOrders} Pending • View all orders →</p>
              </div>

              <div
                onClick={() => setActiveTab('commission')}
                className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:border-purple-500 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Delivered Orders</span>
                  <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-slate-900">{deliveredOrders} Completed</div>
                <p className="text-[11px] text-purple-600 font-medium mt-1">View commission summary →</p>
              </div>

              <div
                onClick={() => setActiveTab('products')}
                className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:border-amber-500 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Products Catalog</span>
                  <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Package className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-xl font-bold text-slate-900">Browse Catalog</div>
                <p className="text-[11px] text-amber-600 font-medium mt-1">Check stock & variants →</p>
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
