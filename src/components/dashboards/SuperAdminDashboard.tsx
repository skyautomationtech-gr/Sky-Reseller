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
import { SettingsPage } from '../settings/SettingsPage';
import { SecurityPage } from '../security/SecurityPage';
import { FloatingHelpButtons } from '../common/FloatingHelpButtons';
import { 
  LayoutDashboard, Users, CheckCircle2, Shield, ShoppingBag, Wallet, Percent, 
  Sparkles, DollarSign, TrendingUp, Clock, PackageCheck
} from 'lucide-react';

interface SuperAdminDashboardProps {
  user: UserProfile;
  onLogout: () => void;
}

export const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isAddAdminOpen, setIsAddAdminOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Real Stats State
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);
  const [totalResellersCount, setTotalResellersCount] = useState(0);
  const [totalOrdersCount, setTotalOrdersCount] = useState(0);
  const [deliveredOrdersCount, setDeliveredOrdersCount] = useState(0);
  const [totalRevenue, setTotalRevenue] = useState(0);

  useEffect(() => {
    fetchDashboardMetrics();
  }, []);

  const fetchDashboardMetrics = async () => {
    try {
      // Pending Approvals
      const pendingSnap = await getDocs(query(collection(db, 'users'), where('status', '==', 'pending')));
      setPendingApprovalsCount(pendingSnap.size);

      // Total Resellers
      const resellersSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'reseller')));
      setTotalResellersCount(resellersSnap.size);

      // Orders & Revenue
      const ordersSnap = await getDocs(collection(db, 'orders'));
      setTotalOrdersCount(ordersSnap.size);

      let rev = 0;
      let delivered = 0;
      ordersSnap.forEach((docSnap) => {
        const o = docSnap.data();
        if (o.status === 'delivered') {
          delivered++;
          rev += o.totalAmount || 0;
        }
      });
      setDeliveredOrdersCount(delivered);
      setTotalRevenue(rev);
    } catch (err) {
      console.error('Error fetching dashboard metrics:', err);
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
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
              <Shield className="w-12 h-12 text-blue-600 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-900 mb-1">Super Admin Control Center</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                You have full system privileges. Click the button above to provision new administrators with immediate approved status.
              </p>
            </div>
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

            {/* Quick Metrics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div
                onClick={() => setActiveTab('approvals')}
                className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:border-amber-500 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pending Approvals</span>
                  <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-slate-900">{pendingApprovalsCount} Accounts</div>
                <p className="text-[11px] text-amber-600 font-medium mt-1">Review pending reseller queue →</p>
              </div>

              <div
                onClick={() => setActiveTab('orders')}
                className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:border-blue-500 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Orders</span>
                  <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <ShoppingBag className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-slate-900">{totalOrdersCount} Total</div>
                <p className="text-[11px] text-blue-600 font-medium mt-1">{deliveredOrdersCount} Delivered • Manage orders →</p>
              </div>

              <div
                onClick={() => setActiveTab('wallet')}
                className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:border-emerald-500 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Gross Delivered Revenue</span>
                  <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-slate-900">৳{totalRevenue.toLocaleString()}</div>
                <p className="text-[11px] text-emerald-600 font-medium mt-1">View wallet balances & payouts →</p>
              </div>

              <div
                onClick={() => setActiveTab('resellers')}
                className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:border-purple-500 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Resellers</span>
                  <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Users className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-slate-900">{totalResellersCount} Registered</div>
                <p className="text-[11px] text-purple-600 font-medium mt-1">View reseller network →</p>
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
