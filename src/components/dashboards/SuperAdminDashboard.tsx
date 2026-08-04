import React, { useState } from 'react';
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
import { LayoutDashboard, Users, CheckCircle2, Shield, ShoppingBag, Wallet, Sparkles } from 'lucide-react';

interface SuperAdminDashboardProps {
  user: UserProfile;
  onLogout: () => void;
}

export const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isAddAdminOpen, setIsAddAdminOpen] = useState(false);

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
            <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-8 text-white shadow-lg">
              <div className="max-w-xl">
                <span className="bg-white/25 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider inline-block mb-3">
                  Super Admin Portal
                </span>
                <h2 className="text-2xl font-bold mb-2">Welcome back, {user.fullName}!</h2>
                <p className="text-blue-100 text-xs leading-relaxed">
                  Sky Automation Tech Reseller Management System (Phase 1 & Phase 2) is fully operational. Manage inventory, products, categories, brands, reseller registrations, and account approvals from this secure hub.
                </p>
              </div>
            </div>

            {/* Low Stock Alert Widget */}
            <LowStockAlertWidget onNavigateToProducts={() => setActiveTab('products')} />

            {/* Quick Stats Grid */}
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
                    <Shield className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-slate-900">Inventory</div>
                <p className="text-[11px] text-purple-600 font-medium mt-1">Manage items, pricing & barcodes →</p>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">System Phase</span>
                  <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                    <Sparkles className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-slate-900">Phase 2 Active</div>
                <p className="text-[11px] text-emerald-600 font-medium mt-1">Catalog & Inventory</p>
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
      <Sidebar
        user={user}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onLogout={onLogout}
        onOpenAddAdmin={() => setIsAddAdminOpen(true)}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar user={user} onLogout={onLogout} title={`Super Admin • ${activeTab.replace('_', ' ').toUpperCase()}`} />
        <main className="flex-1 p-8 overflow-y-auto">
          {renderContent()}
        </main>
      </div>

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
