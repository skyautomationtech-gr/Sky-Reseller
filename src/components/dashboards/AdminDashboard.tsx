import React, { useState } from 'react';
import { UserProfile } from '../../types';
import { Sidebar } from '../common/Sidebar';
import { Navbar } from '../common/Navbar';
import { ApprovalList } from '../admin/ApprovalList';
import { AllResellersList } from '../admin/AllResellersList';
import { ProductManagement } from '../inventory/ProductManagement';
import { CategoryManagement } from '../inventory/CategoryManagement';
import { BrandManagement } from '../inventory/BrandManagement';
import { LowStockAlertWidget } from '../inventory/LowStockAlertWidget';
import { LayoutDashboard, Users, CheckCircle2, Sparkles, Package } from 'lucide-react';

interface AdminDashboardProps {
  user: UserProfile;
  onLogout: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState('dashboard');

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
      case 'dashboard':
        return (
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-indigo-600 to-blue-700 rounded-2xl p-8 text-white shadow-lg">
              <div className="max-w-xl">
                <span className="bg-white/25 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider inline-block mb-3">
                  Admin Portal
                </span>
                <h2 className="text-2xl font-bold mb-2">Welcome back, {user.fullName}!</h2>
                <p className="text-indigo-100 text-xs leading-relaxed">
                  Manage daily reseller operations, inventory catalog, categories, brands, and verify shop registrations for Sky Automation Tech.
                </p>
              </div>
            </div>

            {/* Low Stock Alert Widget */}
            <LowStockAlertWidget onNavigateToProducts={() => setActiveTab('products')} />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div
                onClick={() => setActiveTab('approvals')}
                className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:border-blue-500 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pending Approvals</span>
                  <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-slate-900">Review Queue</div>
                <p className="text-[11px] text-amber-600 font-medium mt-1">Click to process pending requests →</p>
              </div>

              <div
                onClick={() => setActiveTab('resellers')}
                className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:border-blue-500 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Resellers</span>
                  <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Users className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-slate-900">Directory</div>
                <p className="text-[11px] text-blue-600 font-medium mt-1">View all accounts & status →</p>
              </div>

              <div
                onClick={() => setActiveTab('products')}
                className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:border-blue-500 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Product Catalog</span>
                  <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Package className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-slate-900">Inventory</div>
                <p className="text-[11px] text-purple-600 font-medium mt-1">Manage items & stock →</p>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">System Phase</span>
                  <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                    <Sparkles className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-slate-900">Phase 2 Active</div>
                <p className="text-[11px] text-emerald-600 font-medium mt-1">Operations & Inventory</p>
              </div>
            </div>
          </div>
        );
      default:
        return (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <h3 className="text-lg font-bold text-slate-900 capitalize mb-1">{activeTab.replace('_', ' ')} Module</h3>
            <p className="text-sm text-slate-500">This feature module will be unlocked in upcoming system phases.</p>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-100">
      <Sidebar user={user} activeTab={activeTab} setActiveTab={setActiveTab} onLogout={onLogout} />
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar user={user} onLogout={onLogout} title={`Admin • ${activeTab.replace('_', ' ').toUpperCase()}`} />
        <main className="flex-1 p-8 overflow-y-auto">
          {renderContent()}
        </main>
      </div>
    </div>
  );
};
