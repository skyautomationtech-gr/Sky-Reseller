import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserProfile } from '../../types';
import { Sidebar } from '../common/Sidebar';
import { Navbar } from '../common/Navbar';
import { ApprovalList } from '../admin/ApprovalList';
import { AllResellersList } from '../admin/AllResellersList';
import { AddAdminModal } from '../admin/AddAdminModal';
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
import { 
  LayoutDashboard, Users, CheckCircle2, Shield, ShoppingBag, Wallet, Percent, 
  Sparkles, DollarSign, TrendingUp, Clock, PackageCheck, AlertTriangle, 
  UserCheck, UserX, Package, CalendarDays, BarChart3, HelpCircle, RotateCw
} from 'lucide-react';
import { usePageRefresh, useRefresh } from '../../context/RefreshContext';

interface SuperAdminDashboardProps {
  user: UserProfile;
  onLogout: () => void;
}

export const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isAddAdminOpen, setIsAddAdminOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Real Stats States
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);
  const [totalResellersCount, setTotalResellersCount] = useState(0);
  const [activeResellersCount, setActiveResellersCount] = useState(0);
  const [suspendedCount, setSuspendedCount] = useState(0);
  const [totalAdminsCount, setTotalAdminsCount] = useState(0);
  const [totalProductsCount, setTotalProductsCount] = useState(0);
  const [totalOrdersCount, setTotalOrdersCount] = useState(0);
  const [todaysOrdersCount, setTodaysOrdersCount] = useState(0);
  const [monthlyOrdersCount, setMonthlyOrdersCount] = useState(0);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalCommission, setTotalCommission] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [loadingMetrics, setLoadingMetrics] = useState(true);

  const { isRefreshing, formattedLastUpdated, showToast, refreshCurrentPage } = useRefresh();

  const handleRefresh = async () => {
    await fetchDashboardMetrics();
    showToast('✓ Super Admin Dashboard refreshed', 'success');
  };

  usePageRefresh(activeTab, handleRefresh);

  useEffect(() => {
    fetchDashboardMetrics();

    const handlePushNav = (e: any) => {
      if (e.detail?.tab) {
        setActiveTab(e.detail.tab);
      }
    };
    window.addEventListener('sky_navigate_tab', handlePushNav);
    return () => window.removeEventListener('sky_navigate_tab', handlePushNav);
  }, []);

  const fetchDashboardMetrics = async () => {
    setLoadingMetrics(true);
    try {
      // 1. Fetch Users & calculate counts
      const usersSnap = await getDocs(collection(db, 'users'));
      let resellers = 0;
      let activeResellers = 0;
      let pendingApprovals = 0;
      let suspended = 0;
      let admins = 0;

      usersSnap.forEach((docSnap) => {
        const u = docSnap.data();
        if (u.role === 'reseller') {
          resellers++;
          if (u.status === 'approved') {
            activeResellers++;
          } else if (u.status === 'pending') {
            pendingApprovals++;
          }
        }
        if (u.status === 'suspended') {
          suspended++;
        }
        if (u.role === 'admin' || u.role === 'super_admin') {
          admins++;
        }
      });

      setTotalResellersCount(resellers);
      setActiveResellersCount(activeResellers);
      setPendingApprovalsCount(pendingApprovals);
      setSuspendedCount(suspended);
      setTotalAdminsCount(admins);

      // 2. Fetch Products & calculate counts
      const productsSnap = await getDocs(collection(db, 'products'));
      let prodCount = 0;
      let lowStock = 0;
      productsSnap.forEach((docSnap) => {
        const p = docSnap.data();
        if (p.status !== 'deleted') {
          prodCount++;
          const threshold = p.lowStockThreshold || 5;
          if (p.stock <= threshold) {
            lowStock++;
          }
        }
      });
      setTotalProductsCount(prodCount);
      setLowStockCount(lowStock);

      // 3. Fetch Orders & calculate counts
      const ordersSnap = await getDocs(collection(db, 'orders'));
      setTotalOrdersCount(ordersSnap.size);

      let revenueSum = 0;
      let commissionSum = 0;
      let todayCount = 0;
      let monthCount = 0;

      const today = new Date();
      const currentMonth = today.getMonth();
      const currentYear = today.getFullYear();

      ordersSnap.forEach((docSnap) => {
        const o = docSnap.data();
        
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
          // Check Today
          if (
            orderDate.getDate() === today.getDate() &&
            orderDate.getMonth() === currentMonth &&
            orderDate.getFullYear() === currentYear
          ) {
            todayCount++;
          }

          // Check Month
          if (
            orderDate.getMonth() === currentMonth &&
            orderDate.getFullYear() === currentYear
          ) {
            monthCount++;
          }
        }

        // Revenue & Commission (credited/earned on delivered)
        if (o.status === 'delivered') {
          revenueSum += o.totalAmount || 0;
          commissionSum += o.sellAmount || 0;
        }
      });

      setTodaysOrdersCount(todayCount);
      setMonthlyOrdersCount(monthCount);
      setTotalRevenue(revenueSum);
      setTotalCommission(commissionSum);
    } catch (err) {
      console.error('Error fetching dashboard metrics:', err);
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
      case 'admin':
        return (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Admin Management</h2>
                <p className="text-xs text-slate-500 mt-0.5">Create and manage administrative accounts for Sky Automation Tech.</p>
              </div>
              <button
                onClick={() => setIsAddAdminOpen(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-md flex items-center gap-2"
              >
                <Shield className="w-4 h-4" />
                <span>Add New Admin</span>
              </button>
            </div>
            <AllResellersList user={user} />
          </div>
        );
      case 'dashboard':
        return (
          <div className="space-y-6">
            {/* Banner */}
            <div className="bg-gradient-to-r from-blue-600 via-indigo-700 to-slate-900 rounded-2xl p-8 text-white shadow-xl">
              <div className="max-w-xl">
                <span className="bg-white/25 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider inline-block mb-3">
                  Super Admin Portal
                </span>
                <h2 className="text-2xl font-bold mb-2">Welcome back, {user.fullName}!</h2>
                <p className="text-blue-100 text-xs leading-relaxed">
                  Sky Reseller Enterprise Hub (Phases 1, 2, & 3 Active). Manage reseller approvals, product catalog & color variants, order fulfillment, wallet payouts, and global commission settings.
                </p>
              </div>
            </div>

            {/* Low Stock Alert Widget */}
            <LowStockAlertWidget onNavigateToProducts={() => setActiveTab('products')} />

            {/* Super Admin Dashboard Metrics Title & Refresh Header */}
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <LayoutDashboard className="w-5 h-5 text-blue-600" />
                  <span>Super Admin Dashboard Metrics</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">Real-time statistics across users, products, orders, and financial summaries.</p>
              </div>

              <div className="flex items-center gap-2.5">
                <span className="text-[11px] font-medium text-slate-500 hidden sm:inline">
                  Last updated: <strong className="text-slate-700 font-semibold">{formattedLastUpdated}</strong>
                </span>
                <button
                  onClick={() => refreshCurrentPage()}
                  disabled={isRefreshing || loadingMetrics}
                  className="flex items-center gap-1.5 bg-white border border-slate-200 hover:border-blue-400 text-slate-700 hover:text-blue-600 text-xs font-semibold py-2 px-3 rounded-xl shadow-2xs transition-all disabled:opacity-50"
                  title="Refresh Dashboard Metrics"
                >
                  <RotateCw className={`w-3.5 h-3.5 text-blue-600 ${isRefreshing || loadingMetrics ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">Refresh</span>
                </button>
              </div>
            </div>

            {/* Quick Metrics Grid - 12 Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-4">
              
              {/* Card 1: Total Resellers */}
              <div
                onClick={() => setActiveTab('resellers')}
                className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-indigo-500 transition-all cursor-pointer group flex flex-col justify-between active:scale-98"
              >
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider truncate">Total Resellers</span>
                  <div className="w-8 h-8 sm:w-9 sm:h-9 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                    <Users className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <div className="text-base sm:text-xl font-extrabold text-slate-900">{totalResellersCount} <span className="text-xs sm:text-sm font-semibold text-slate-500">Accounts</span></div>
                  <p className="text-[10px] text-indigo-600 font-bold mt-1 truncate">Manage directory →</p>
                </div>
              </div>

              {/* Card 2: Active Resellers */}
              <div
                onClick={() => setActiveTab('resellers')}
                className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-emerald-500 transition-all cursor-pointer group flex flex-col justify-between active:scale-98"
              >
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider truncate">Active Resellers</span>
                  <div className="w-8 h-8 sm:w-9 sm:h-9 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                    <UserCheck className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <div className="text-base sm:text-xl font-extrabold text-slate-900">{activeResellersCount} <span className="text-xs sm:text-sm font-semibold text-slate-500">Active</span></div>
                  <p className="text-[10px] text-emerald-600 font-bold mt-1 truncate">Approved users →</p>
                </div>
              </div>

              {/* Card 3: Pending Approval */}
              <div
                onClick={() => setActiveTab('approvals')}
                className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-amber-500 transition-all cursor-pointer group flex flex-col justify-between active:scale-98"
              >
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider truncate">Pending Approval</span>
                  <div className="w-8 h-8 sm:w-9 sm:h-9 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                    <Clock className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <div className="text-base sm:text-xl font-extrabold text-slate-900">{pendingApprovalsCount} <span className="text-xs sm:text-sm font-semibold text-slate-500">Queued</span></div>
                  <p className="text-[10px] text-amber-600 font-bold mt-1 truncate">Review requests →</p>
                </div>
              </div>

              {/* Card 4: Suspended Accounts */}
              <div
                onClick={() => setActiveTab('resellers')}
                className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-rose-500 transition-all cursor-pointer group flex flex-col justify-between active:scale-98"
              >
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider truncate">Suspended Accounts</span>
                  <div className="w-8 h-8 sm:w-9 sm:h-9 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                    <UserX className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <div className="text-base sm:text-xl font-extrabold text-slate-900">{suspendedCount} <span className="text-xs sm:text-sm font-semibold text-slate-500">Blocked</span></div>
                  <p className="text-[10px] text-rose-600 font-bold mt-1 truncate">View restrictions →</p>
                </div>
              </div>

              {/* Card 5: Total Admin */}
              <div
                onClick={() => setActiveTab('admin')}
                className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-blue-500 transition-all cursor-pointer group flex flex-col justify-between active:scale-98"
              >
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider truncate">Total Admin</span>
                  <div className="w-8 h-8 sm:w-9 sm:h-9 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                    <Shield className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <div className="text-base sm:text-xl font-extrabold text-slate-900">{totalAdminsCount} <span className="text-xs sm:text-sm font-semibold text-slate-500">Staff</span></div>
                  <p className="text-[10px] text-blue-600 font-bold mt-1 truncate">Manage staff →</p>
                </div>
              </div>

              {/* Card 6: Total Products */}
              <div
                onClick={() => setActiveTab('products')}
                className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-teal-500 transition-all cursor-pointer group flex flex-col justify-between active:scale-98"
              >
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider truncate">Total Products</span>
                  <div className="w-8 h-8 sm:w-9 sm:h-9 bg-teal-50 text-teal-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                    <Package className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <div className="text-base sm:text-xl font-extrabold text-slate-900">{totalProductsCount} <span className="text-xs sm:text-sm font-semibold text-slate-500">Items</span></div>
                  <p className="text-[10px] text-teal-600 font-bold mt-1 truncate">Manage catalog →</p>
                </div>
              </div>

              {/* Card 7: Total Orders */}
              <div
                onClick={() => setActiveTab('orders')}
                className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-violet-500 transition-all cursor-pointer group flex flex-col justify-between active:scale-98"
              >
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider truncate">Total Orders</span>
                  <div className="w-8 h-8 sm:w-9 sm:h-9 bg-violet-50 text-violet-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                    <ShoppingBag className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <div className="text-base sm:text-xl font-extrabold text-slate-900">{totalOrdersCount} <span className="text-xs sm:text-sm font-semibold text-slate-500">Orders</span></div>
                  <p className="text-[10px] text-violet-600 font-bold mt-1 truncate">Review orders →</p>
                </div>
              </div>

              {/* Card 8: Today's Orders */}
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
                  <div className="text-base sm:text-xl font-extrabold text-slate-900">{todaysOrdersCount} <span className="text-xs sm:text-sm font-semibold text-slate-500">New</span></div>
                  <p className="text-[10px] text-sky-600 font-bold mt-1 truncate">Fulfill orders →</p>
                </div>
              </div>

              {/* Card 9: Monthly Orders */}
              <div
                onClick={() => setActiveTab('orders')}
                className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-fuchsia-500 transition-all cursor-pointer group flex flex-col justify-between active:scale-98"
              >
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider truncate">Monthly Orders</span>
                  <div className="w-8 h-8 sm:w-9 sm:h-9 bg-fuchsia-50 text-fuchsia-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                    <BarChart3 className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <div className="text-base sm:text-xl font-extrabold text-slate-900">{monthlyOrdersCount} <span className="text-xs sm:text-sm font-semibold text-slate-500">This Month</span></div>
                  <p className="text-[10px] text-fuchsia-600 font-bold mt-1 truncate">Track growth →</p>
                </div>
              </div>

              {/* Card 10: Total Revenue */}
              <div
                onClick={() => setActiveTab('reports')}
                className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-emerald-600 transition-all cursor-pointer group flex flex-col justify-between active:scale-98"
              >
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider truncate">Total Revenue</span>
                  <div className="w-8 h-8 sm:w-9 sm:h-9 bg-emerald-50 text-emerald-700 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                    <DollarSign className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <div className="text-base sm:text-xl font-extrabold text-slate-900">৳{totalRevenue.toLocaleString()}</div>
                  <p className="text-[10px] text-emerald-700 font-bold mt-1 truncate">Gross revenue →</p>
                </div>
              </div>

              {/* Card 11: Total Commission */}
              <div
                onClick={() => setActiveTab('reports')}
                className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-cyan-500 transition-all cursor-pointer group flex flex-col justify-between active:scale-98"
              >
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider truncate">Total Commission</span>
                  <div className="w-8 h-8 sm:w-9 sm:h-9 bg-cyan-50 text-cyan-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                    <Percent className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <div className="text-base sm:text-xl font-extrabold text-slate-900">৳{totalCommission.toLocaleString()}</div>
                  <p className="text-[10px] text-cyan-600 font-bold mt-1 truncate">Reseller payouts →</p>
                </div>
              </div>

              {/* Card 12: Low Stock Alert */}
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
                    Low Stock Alert
                  </span>
                  <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform shrink-0 ${
                    lowStockCount > 0 ? 'bg-rose-100 text-rose-600' : 'bg-slate-50 text-slate-500'
                  }`}>
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <div className={`text-base sm:text-xl font-extrabold ${lowStockCount > 0 ? 'text-rose-700' : 'text-slate-900'}`}>
                    {lowStockCount} <span className="text-xs sm:text-sm font-semibold opacity-80">Products</span>
                  </div>
                  <p className={`text-[10px] font-bold mt-1 truncate ${lowStockCount > 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                    {lowStockCount > 0 ? 'Restock needed →' : 'All stocks good →'}
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
        onOpenAddAdmin={() => setIsAddAdminOpen(true)}
        isMobileOpen={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar 
          user={user} 
          onLogout={onLogout} 
          title={`Super Admin • ${activeTab.replace('_', ' ').toUpperCase()}`}
          onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          onNavigateTab={setActiveTab}
        />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          {renderContent()}
        </main>
      </div>

      <FloatingHelpButtons />

      <AddAdminModal
        isOpen={isAddAdminOpen}
        onClose={() => setIsAddAdminOpen(false)}
        onAdminCreated={() => {
          setActiveTab('resellers');
        }}
      />
    </div>
  );
};
