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
import { SettingsPage } from '../settings/SettingsPage';
import { SecurityPage } from '../security/SecurityPage';
import { FloatingHelpButtons } from '../common/FloatingHelpButtons';
import { LayoutDashboard, Users, CheckCircle2, Sparkles, Package, ShoppingBag, Wallet, Percent, Clock, AlertTriangle, HelpCircle, RefreshCw } from 'lucide-react';

interface AdminDashboardProps {
  user: UserProfile;
  onLogout: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Stats
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);
  const [totalResellersCount, setTotalResellersCount] = useState(0);
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0);
  const [deliveredOrdersCount, setDeliveredOrdersCount] = useState(0);
  const [processingOrdersCount, setProcessingOrdersCount] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [openTicketsCount, setOpenTicketsCount] = useState(0);
  const [loadingMetrics, setLoadingMetrics] = useState(true);

  useEffect(() => {
    fetchMetrics();
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
      productsSnap.forEach((docSnap) => {
        const p = docSnap.data();
        if (p.status !== 'deleted') {
          const threshold = p.lowStockThreshold || 5;
          if (p.stock <= threshold) {
            lowStock++;
          }
        }
      });
      setLowStockCount(lowStock);

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
        return <ApprovalList />;
      case 'resellers':
        return <AllResellersList />;
      case 'products':
        return <ProductManagement user={user} />;
      case 'categories':
        return <CategoryManagement isAdminOrSuperAdmin={true} />;
      case 'brands':
        return <BrandManagement isAdminOrSuperAdmin={true} />;
      case 'orders':
        return <OrderList user={user} />;
      case 'wallet':
        return <WalletView user={user} />;
      case 'commission':
        return <CommissionSettingsView />;
      case 'reports':
        return <ReportsPage />;
      case 'notifications':
        return <NoticeManager user={user} />;
      case 'support':
        return <SupportSystem user={user} />;
      case 'settings':
        return <SettingsPage user={user} onNavigateCommission={() => setActiveTab('commission')} />;
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

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {/* Card 1: Pending Resellers */}
              <div
                onClick={() => setActiveTab('approvals')}
                className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-amber-500 transition-all cursor-pointer group flex flex-col justify-between"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pending Resellers</span>
                  <div className="w-9 h-9 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Clock className="w-4.5 h-4.5" />
                  </div>
                </div>
                <div>
                  <div className="text-xl font-bold text-slate-900">{pendingApprovalsCount} Queued</div>
                  <p className="text-[10px] text-amber-600 font-medium mt-1">Process registration approvals →</p>
                </div>
              </div>

              {/* Card 2: Pending Orders */}
              <div
                onClick={() => setActiveTab('orders')}
                className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-blue-500 transition-all cursor-pointer group flex flex-col justify-between"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pending Orders</span>
                  <div className="w-9 h-9 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <ShoppingBag className="w-4.5 h-4.5" />
                  </div>
                </div>
                <div>
                  <div className="text-xl font-bold text-slate-900">{pendingOrdersCount} Unfulfilled</div>
                  <p className="text-[10px] text-blue-600 font-medium mt-1">Pending verification & packaging →</p>
                </div>
              </div>

              {/* Card 3: Processing Orders */}
              <div
                onClick={() => setActiveTab('orders')}
                className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-indigo-500 transition-all cursor-pointer group flex flex-col justify-between"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Processing Orders</span>
                  <div className="w-9 h-9 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <RefreshCw className="w-4.5 h-4.5" />
                  </div>
                </div>
                <div>
                  <div className="text-xl font-bold text-slate-900">{processingOrdersCount} Shipments</div>
                  <p className="text-[10px] text-indigo-600 font-medium mt-1">In transit / processing →</p>
                </div>
              </div>

              {/* Card 4: Delivered Orders */}
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
                  <div className="text-xl font-bold text-slate-900">{deliveredOrdersCount} Completed</div>
                  <p className="text-[10px] text-emerald-600 font-medium mt-1">Fully dispatched & delivered →</p>
                </div>
              </div>

              {/* Card 5: Stock Alert */}
              <div
                onClick={() => setActiveTab('products')}
                className={`p-5 rounded-2xl border transition-all cursor-pointer group flex flex-col justify-between ${
                  lowStockCount > 0 
                    ? 'bg-rose-50/50 border-rose-200 hover:border-rose-500 shadow-rose-50/50 shadow-xs' 
                    : 'bg-white border-slate-200 hover:border-slate-400 shadow-xs'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-xs font-bold uppercase tracking-wider ${lowStockCount > 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                    Stock Alert
                  </span>
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform ${
                    lowStockCount > 0 ? 'bg-rose-100 text-rose-600' : 'bg-slate-50 text-slate-500'
                  }`}>
                    <AlertTriangle className="w-4.5 h-4.5" />
                  </div>
                </div>
                <div>
                  <div className={`text-xl font-bold ${lowStockCount > 0 ? 'text-rose-700' : 'text-slate-900'}`}>
                    {lowStockCount} Products
                  </div>
                  <p className={`text-[10px] font-medium mt-1 ${lowStockCount > 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                    {lowStockCount > 0 ? 'Critical low stock alerts →' : 'All stocks adequate →'}
                  </p>
                </div>
              </div>

              {/* Card 6: Support Tickets */}
              <div
                onClick={() => setActiveTab('support')}
                className={`p-5 rounded-2xl border transition-all cursor-pointer group flex flex-col justify-between ${
                  openTicketsCount > 0 
                    ? 'bg-amber-50/50 border-amber-200 hover:border-amber-500' 
                    : 'bg-white border-slate-200 hover:border-slate-400 shadow-xs'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-xs font-bold uppercase tracking-wider ${openTicketsCount > 0 ? 'text-amber-600' : 'text-slate-500'}`}>
                    Support Tickets
                  </span>
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform ${
                    openTicketsCount > 0 ? 'bg-amber-100 text-amber-600' : 'bg-slate-50 text-slate-500'
                  }`}>
                    <HelpCircle className="w-4.5 h-4.5" />
                  </div>
                </div>
                <div>
                  <div className={`text-xl font-bold ${openTicketsCount > 0 ? 'text-amber-700' : 'text-slate-900'}`}>
                    {openTicketsCount} Unresolved
                  </div>
                  <p className={`text-[10px] font-medium mt-1 ${openTicketsCount > 0 ? 'text-amber-600' : 'text-slate-500'}`}>
                    {openTicketsCount > 0 ? 'Pending staff responses →' : 'No active inquiries →'}
                  </p>
                </div>
              </div>

              {/* Card 7: Reseller Payouts */}
              <div
                onClick={() => setActiveTab('wallet')}
                className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-emerald-500 transition-all cursor-pointer group flex flex-col justify-between"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Reseller Payouts</span>
                  <div className="w-9 h-9 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Wallet className="w-4.5 h-4.5" />
                  </div>
                </div>
                <div>
                  <div className="text-xl font-bold text-slate-900">Wallet Hub</div>
                  <p className="text-[10px] text-emerald-600 font-medium mt-1">Approve pending withdrawals →</p>
                </div>
              </div>

              {/* Card 8: Resellers Directory */}
              <div
                onClick={() => setActiveTab('resellers')}
                className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-purple-500 transition-all cursor-pointer group flex flex-col justify-between"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Resellers Directory</span>
                  <div className="w-9 h-9 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Users className="w-4.5 h-4.5" />
                  </div>
                </div>
                <div>
                  <div className="text-xl font-bold text-slate-900">{totalResellersCount} Accounts</div>
                  <p className="text-[10px] text-purple-600 font-medium mt-1">View entire reseller list →</p>
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
