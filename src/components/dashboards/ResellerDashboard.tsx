import React, { useState } from 'react';
import { UserProfile } from '../../types';
import { Sidebar } from '../common/Sidebar';
import { Navbar } from '../common/Navbar';
import { ProductManagement } from '../inventory/ProductManagement';
import { Store, Package, ShoppingBag, Wallet, Percent, MapPin, Phone, Mail, CheckCircle2 } from 'lucide-react';

interface ResellerDashboardProps {
  user: UserProfile;
  onLogout: () => void;
}

export const ResellerDashboard: React.FC<ResellerDashboardProps> = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState('dashboard');

  const renderContent = () => {
    switch (activeTab) {
      case 'products':
        return <ProductManagement user={user} />;
      case 'profile':
        return (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-slate-900">Reseller Profile & Shop Details</h2>
            <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm max-w-2xl">
              <div className="flex items-center gap-4 pb-6 border-b border-slate-100 mb-6">
                {user.profilePhotoUrl ? (
                  <img src={user.profilePhotoUrl} alt={user.fullName} className="w-16 h-16 rounded-2xl object-cover border border-slate-200 shadow-sm" />
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xl">
                    {user.fullName.charAt(0)}
                  </div>
                )}
                <div>
                  <h3 className="text-lg font-bold text-slate-900">{user.fullName}</h3>
                  <div className="flex items-center gap-2 text-blue-600 font-medium text-xs mt-0.5">
                    <Store className="w-4 h-4" />
                    <span>{user.shopName}</span>
                  </div>
                  <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2.5 py-0.5 rounded-full mt-2 uppercase">
                    <CheckCircle2 className="w-3 h-3" /> Approved Reseller
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-600">
                <div className="bg-slate-50 p-4 rounded-xl space-y-1">
                  <span className="font-semibold text-slate-700 block uppercase tracking-wider text-[10px]">Contact Info</span>
                  <div className="flex items-center gap-2 pt-1 font-medium text-slate-900">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span>{user.mobile}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-500">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    <span>{user.email}</span>
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl space-y-1">
                  <span className="font-semibold text-slate-700 block uppercase tracking-wider text-[10px]">Location</span>
                  <div className="flex items-center gap-2 pt-1 text-slate-900">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{user.address}, {user.upazila}, {user.district}, {user.division}</span>
                  </div>
                </div>
              </div>

              {user.shopPhotoUrl && (
                <div className="mt-6">
                  <span className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">Shop Photo</span>
                  <img src={user.shopPhotoUrl} alt="Shop" className="w-full max-w-xs h-40 object-cover rounded-xl border border-slate-200 shadow-sm" />
                </div>
              )}
            </div>
          </div>
        );
      case 'dashboard':
        return (
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-8 text-white shadow-lg">
              <div className="max-w-xl">
                <span className="bg-white/25 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider inline-block mb-3">
                  Reseller Portal • Sky Automation Tech
                </span>
                <h2 className="text-2xl font-bold mb-2">Welcome, {user.fullName}!</h2>
                <p className="text-blue-100 text-xs leading-relaxed">
                  Your shop <span className="font-semibold text-white">{user.shopName}</span> is approved and active. Browse mobile accessories catalog, check reseller pricing, and view products.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div
                onClick={() => setActiveTab('products')}
                className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:border-blue-500 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Product Catalog</span>
                  <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Package className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-xl font-bold text-slate-900">Browse Catalog</div>
                <p className="text-[11px] text-blue-600 font-medium mt-1">View accessories & prices →</p>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Shop Location</span>
                  <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                    <MapPin className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-xl font-bold text-slate-900">{user.district}</div>
                <p className="text-[11px] text-blue-600 font-medium mt-1">{user.upazila}, {user.division}</p>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Business Network</span>
                  <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center">
                    <Store className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-xl font-bold text-slate-900">Sky Automation</div>
                <p className="text-[11px] text-purple-600 font-medium mt-1">Mobile Accessories Partner</p>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Wallet Balance</span>
                  <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                    <Wallet className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-slate-900">৳ 0.00</div>
                <p className="text-[11px] text-slate-400 font-medium mt-1">Ready for upcoming orders</p>
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
        <Navbar user={user} onLogout={onLogout} title={`Reseller • ${activeTab.replace('_', ' ').toUpperCase()}`} />
        <main className="flex-1 p-8 overflow-y-auto">
          {renderContent()}
        </main>
      </div>
    </div>
  );
};
