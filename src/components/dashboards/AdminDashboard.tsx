import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserProfile } from '../../types';
import { Sidebar } from '../common/Sidebar';
import { Navbar } from '../common/Navbar';
import { ApprovalList } from '../admin/ApprovalList';
import { AllResellersList } from '../admin/AllResellersList';
import { ProductManagement } from '../inventory/ProductManagement';
import { CategoryManagement } from '../inventory/CategoryManagement';
import { BrandManagement } from '../inventory/BrandManagement';
import { LowStockAlertWidget } from '../inventory/LowStockAlertWidget';
import { OrderList } from '../orders/OrderList';
import { WalletView } from '../wallet/WalletView';
import { CommissionSettingsView } from '../commission/CommissionSettings';
import { ReportsPage } from '../reports/ReportsPage';
import { NoticeManager } from '../notifications/NoticeManager';
import { SupportSystem } from '../support/SupportSystem';
import { AdminLiveChatHub } from '../chat/AdminLiveChatHub';
import { SettingsPage } from '../settings/SettingsPage';
import { SecurityPage } from '../security/SecurityPage';
import { FloatingHelpButtons } from '../common/FloatingHelpButtons';
import { LayoutDashboard, Users, CheckCircle2, Sparkles, Package, ShoppingBag, Wallet, Percent, Clock, AlertTriangle, HelpCircle, RotateCw } from 'lucide-react';
import { usePageRefresh, useRefresh } from '../../context/RefreshContext';

interface AdminDashboardProps {
  user: UserProfile;
  onLogout: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Stats
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);
  const [pendingProductsCount, setPendingProductsCount] = useState(0);
  const [totalResellersCount, setTotalResellersCount] = useState(0);
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0);
  const [deliveredOrdersCount, setDeliveredOrdersCount] = useState(0);
  const [processingOrdersCount, setProcessingOrdersCount] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [openTicketsCount, setOpenTicketsCount] = useState(0);
  const [loadingMetrics, setLoadingMetrics] = useState(true);

  const { isRefreshing, formattedLastUpdated, showToast, refreshCurrentPage } = useRefresh();

  const handleRefresh = async () => {
    await fetchMetrics();
    showToast('✓ Admin Dashboard refreshed', 'success');
  };

  usePageRefresh(activeTab, handleRefresh);

  useEffect(() => {
    fetchMetrics();

    const handlePushNav = (e: any) => {
      if (e.detail?.tab) {
        setActiveTab(e.detail.tab);
      }
    };
    window.addEventListener('sky_navigate_tab', handlePushNav);
    return () => window.removeEventListener('sky_navigate_tab', handlePushNav);
  }, []);

  const fetchMetrics = async () => {
    setLoadingMetrics(true);
    try {
      // Pending Approvals
      const pendingSnap = await getDocs(query(collection(db, 'users'), where('status', '==', 'pending')));
      setPendingApprovalsCount(pendingSnap.size);

      // Total Resellers
      const resellersSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'reseller')));
      setTotalResellersCount(resellersSnap.size);

      // Orders (Pending, Processing, Delivered)
      const ordersSnap = await getDocs(collection(db, 'orders'));
      let pCount = 0;
      let dCount = 0;
      let prCount = 0;
      ordersSnap.forEach((d) => {
        const st = d.data().status;
        if (st === 'pending') pCount++;
        if (st === 'delivered') dCount++;
        if (st === 'processing') prCount++;
      });
      setPendingOrdersCount(pCount);
      setDeliveredOrdersCount(dCount);
      setProcessingOrdersCount(prCount);

      // Products / Low Stock Alerts
      const productsSnap = await getDocs(collection(db, 'products'));
      let lowStock = 0;
      let pendingProdCount = 0;
      productsSnap.forEach((docSnap) => {
        const p = docSnap.data();
        if (p.status !== 'deleted') {
          if (p.approvalStatus === 'pending') {
            pendingProdCount++;
          } else {
            const threshold = p.lowStockThreshold || 5;
            if (p.stock <= threshold) {
              lowStock++;
            }
          }
        }
      });
      setLowStockCount(lowStock);
      setPendingProductsCount(pendingProdCount);

      // Support Tickets (Unresolved: open or in_progress)
      const ticketsSnap = await getDocs(collection(db, 'supportTickets'));
      let openTix = 0;
      ticketsSnap.forEach((docSnap) => {
        const t = docSnap.data();
        if (t.status === 'open' || t.status === 'in_progress') {
          openTix++;
        }
      });
      setOpenTicketsCount(openTix);

    } catch (err) {
      console.error('Error fetching admin dashboard metrics:', err);
    } finally {
      setLoadingMetrics(false);
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'approvals':
        return <ApprovalList user={user} />;
      case 'resellers':
        return <AllResellersList user={user} />;
      case 'products':
        return <ProductManagement user={user} />;
      case 'categories':
        return <CategoryManagement isAdminOrSuperAdmin={true} />;
      case 'brands':
        return <BrandManagement isAdminOrSuperAdmin={true} user={user} />;
      case 'orders':
        return <OrderList user={user} />;
      case 'wallet':
        return <WalletView user={user} />;
      case 'commission':
        return <CommissionSettingsView />;
      case 'reports':
        return <ReportsPage user={user} />;
      case 'notifications':
        return <NoticeManager user={user} />;
      case 'support':
        return <SupportSystem user={user} />;
      case 'chat':
      case 'live_chat':
        return (
          <AdminLiveChatHub
            user={user}
            onOpenOrder={(ordId) => setActiveTab('orders')}
            onOpenProduct={(prodId) => setActiveTab('products')}
          />
        );
      case 'settings':
        return <SettingsPage user={user} onNavigateCommission={() => setActiveTab('commission')} onLogout={onLogout} />;
      case 'audit':
        return <SecurityPage user={user} />;
      case 'dashboard':
        return (
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-indigo-600 via-blue-700 to-slate-900 rounded-2xl p-8 text-white shadow-lg">
              <div className="max-w-xl">
                <span className="bg-white/25 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider inline-block mb-3">
                  Admin Portal
                </span>
                <h2 className="text-2xl font-bold mb-2">Welcome back, {user.fullName}!</h2>
                <p className="text-indigo-100 text-xs leading-relaxed">
                  Manage daily reseller operations, inventory catalog, order fulfillment, wallet withdrawal approvals, and category rules for Sky Automation Tech.
                </p>
              </div>
            </div>

            {/* Low Stock Alert Widget */}
            <LowStockAlertWidget onNavigateToProducts={() => setActiveTab('products')} />

            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-4">
              {/* Card 1: Pending Resellers */}
              <div
                onClick={() => setActiveTab('approvals')}
                className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-amber-500 transition-all cursor-pointer group flex flex-col justify-between active:scale-98"
              >
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider truncate">Pending Resellers</span>
                  <div className="w-8 h-8 sm:w-9 sm:h-9 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                    <Clock className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <div className="text-base sm:text-xl font-extrabold text-slate-900">{pendingApprovalsCount} <span className="text-xs sm:text-sm font-semibold text-slate-500">Queued</span></div>
                  <p className="text-[10px] text-amber-600 font-bold mt-1 truncate">Process approvals →</p>
                </div>
              </div>

              {/* Card 2: Pending Orders */}
              <div
                onClick={() => setActiveTab('orders')}
                className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-blue-500 transition-all cursor-pointer group flex flex-col justify-between active:scale-98"
              >
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider truncate">Pending Orders</span>
                  <div className="w-8 h-8 sm:w-9 sm:h-9 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                    <ShoppingBag className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <div className="text-base sm:text-xl font-extrabold text-slate-900">{pendingOrdersCount} <span className="text-xs sm:text-sm font-semibold text-slate-500">Unfulfilled</span></div>
                  <p className="text-[10px] text-blue-600 font-bold mt-1 truncate">Fulfill orders →</p>
                </div>
              </div>

              {/* Card 3: Processing Orders */}
              <div
                onClick={() => setActiveTab('orders')}
                className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-indigo-500 transition-all cursor-pointer group flex flex-col justify-between active:scale-98"
              >
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider truncate">Processing Orders</span>
                  <div className="w-8 h-8 sm:w-9 sm:h-9 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                    <RotateCw className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <div className="text-base sm:text-xl font-extrabold text-slate-900">{processingOrdersCount} <span className="text-xs sm:text-sm font-semibold text-slate-500">In Transit</span></div>
                  <p className="text-[10px] text-indigo-600 font-bold mt-1 truncate">Track status →</p>
                </div>
              </div>

              {/* Card 4: Delivered Orders */}
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
                  <div className="text-base sm:text-xl font-extrabold text-slate-900">{deliveredOrdersCount} <span className="text-xs sm:text-sm font-semibold text-slate-500">Done</span></div>
                  <p className="text-[10px] text-emerald-600 font-bold mt-1 truncate">Completed orders →</p>
                </div>
              </div>

              {/* Card 4.5: Pending Products */}
              <div
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('sky_navigate_tab', { detail: { tab: 'products' } }));
                  setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('sky_product_filter', { detail: { filter: 'pending_approvals' } }));
                  }, 50);
                }}
                className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-amber-500 transition-all cursor-pointer group flex flex-col justify-between active:scale-98 relative"
              >
                {pendingProductsCount > 0 && (
                  <span className="absolute -top-2 -right-2 flex h-5 w-5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-5 w-5 bg-amber-500 text-white text-[9px] font-bold items-center justify-center border-2 border-white">{pendingProductsCount}</span>
                  </span>
                )}
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider truncate">Product Approvals</span>
                  <div className="w-8 h-8 sm:w-9 sm:h-9 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                    <Package className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <div className="text-base sm:text-xl font-extrabold text-slate-900">{pendingProductsCount} <span className="text-xs sm:text-sm font-semibold text-slate-500">Staged</span></div>
                  <p className="text-[10px] text-amber-600 font-bold mt-1 truncate">Review queue →</p>
                </div>
              </div>

              {/* Card 5: Stock Alert */}
              <div
                onClick={() => setActiveTab('products')}
                className={`p-3.5 sm:p-5 rounded-2xl border transition-all cursor-pointer group flex flex-col justify-between active:scale-98 ${
                  lowStockCount > 0 
                    ? 'bg-rose-50/50 border-rose-200 hover:border-rose-500 shadow-rose-50/50 shadow-xs' 
                    : 'bg-white border-slate-200 hover:border-slate-400 shadow-xs'
                }`}
              >
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <span className={`text-[10px] sm:text-xs font-bold uppercase tracking-wider truncate ${lowStockCount > 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                    Stock Alert
                  </span>
                  <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform shrink-0 ${
                    lowStockCount > 0 ? 'bg-rose-100 text-rose-600' : 'bg-slate-50 text-slate-500'
                  }`}>
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <div className={`text-base sm:text-xl font-extrabold ${lowStockCount > 0 ? 'text-rose-700' : 'text-slate-900'}`}>
                    {lowStockCount} <span className="text-xs sm:text-sm font-semibold opacity-80">Items</span>
                  </div>
                  <p className={`text-[10px] font-bold mt-1 truncate ${lowStockCount > 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                    {lowStockCount > 0 ? 'Low stock alerts →' : 'Stock adequate →'}
                  </p>
                </div>
              </div>

              {/* Card 6: Support Tickets */}
              <div
                onClick={() => setActiveTab('support')}
                className={`p-3.5 sm:p-5 rounded-2xl border transition-all cursor-pointer group flex flex-col justify-between active:scale-98 ${
                  openTicketsCount > 0 
                    ? 'bg-amber-50/50 border-amber-200 hover:border-amber-500' 
                    : 'bg-white border-slate-200 hover:border-slate-400 shadow-xs'
                }`}
              >
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <span className={`text-[10px] sm:text-xs font-bold uppercase tracking-wider truncate ${openTicketsCount > 0 ? 'text-amber-600' : 'text-slate-500'}`}>
                    Support Tickets
                  </span>
                  <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform shrink-0 ${
                    openTicketsCount > 0 ? 'bg-amber-100 text-amber-600' : 'bg-slate-50 text-slate-500'
                  }`}>
                    <HelpCircle className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <div className={`text-base sm:text-xl font-extrabold ${openTicketsCount > 0 ? 'text-amber-700' : 'text-slate-900'}`}>
                    {openTicketsCount} <span className="text-xs sm:text-sm font-semibold opacity-80">Open</span>
                  </div>
                  <p className={`text-[10px] font-bold mt-1 truncate ${openTicketsCount > 0 ? 'text-amber-600' : 'text-slate-500'}`}>
                    {openTicketsCount > 0 ? 'Inquiries pending →' : 'No open tickets →'}
                  </p>
                </div>
              </div>

              {/* Card 7: Reseller Payouts */}
              <div
                onClick={() => setActiveTab('wallet')}
                className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-emerald-500 transition-all cursor-pointer group flex flex-col justify-between active:scale-98"
              >
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider truncate">Reseller Payouts</span>
                  <div className="w-8 h-8 sm:w-9 sm:h-9 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                    <Wallet className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <div className="text-base sm:text-xl font-extrabold text-slate-900">Wallet Hub</div>
                  <p className="text-[10px] text-emerald-600 font-bold mt-1 truncate">Process payouts →</p>
                </div>
              </div>

              {/* Card 8: Resellers Directory */}
              <div
                onClick={() => setActiveTab('resellers')}
                className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-purple-500 transition-all cursor-pointer group flex flex-col justify-between active:scale-98"
              >
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider truncate">Reseller Directory</span>
                  <div className="w-8 h-8 sm:w-9 sm:h-9 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                    <Users className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <div className="text-base sm:text-xl font-extrabold text-slate-900">{totalResellersCount} <span className="text-xs sm:text-sm font-semibold text-slate-500">Accounts</span></div>
                  <p className="text-[10px] text-purple-600 font-bold mt-1 truncate">View directory →</p>
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
          title={`Admin • ${activeTab.replace('_', ' ').toUpperCase()}`}
          onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          onNavigateTab={setActiveTab}
        />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          {renderContent()}
        </main>
      </div>
      <FloatingHelpButtons />
    </div>
  );
};
