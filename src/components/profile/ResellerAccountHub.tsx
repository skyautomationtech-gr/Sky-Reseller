import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserProfile, DEFAULT_DEMO_PRODUCT } from '../../types';
import { 
  User, Shield, Store, Phone, MapPin, MessagesSquare, 
  Percent, LifeBuoy, Bell, Star, MessageSquare, Lock, 
  LogOut, ChevronRight, Sparkles, HelpCircle, CheckCircle2,
  Share2, ArrowLeft, RefreshCw, Smartphone, Bot
} from 'lucide-react';
import { ResellerProfilePage } from './ResellerProfilePage';
import { SupportSystem } from '../support/SupportSystem';
import { ResellerNoticeList } from '../notifications/ResellerNoticeList';
import { LiveChatWindow } from '../chat/LiveChatWindow';
import { CommissionSummary } from '../commission/CommissionSummary';
import { ProductReviewForm } from '../reviews/ProductReviewForm';
import { FeedbackForm } from '../feedback/FeedbackForm';
import { ResellerSettings } from '../settings/ResellerSettings';
import { AIMarketingModal } from '../marketing/AIMarketingModal';
import { SocialShareModal } from '../inventory/SocialShareModal';

interface ResellerAccountHubProps {
  user: UserProfile;
  activeSubTab?: string;
  onNavigateTab: (tab: string) => void;
  onLogout: () => void;
  unreadChatCount?: number;
  unreadNotificationsCount?: number;
}

export const ResellerAccountHub: React.FC<ResellerAccountHubProps> = ({
  user,
  activeSubTab = 'menu',
  onNavigateTab,
  onLogout,
  unreadChatCount = 0,
  unreadNotificationsCount = 0,
}) => {
  const [currentView, setCurrentView] = useState<string>(activeSubTab === 'more' ? 'menu' : activeSubTab);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [showPosterModal, setShowPosterModal] = useState(false);
  const [selectedPosterProduct, setSelectedPosterProduct] = useState<any>(null);
  const [allProductsList, setAllProductsList] = useState<any[]>([]);

  useEffect(() => {
    const loadProducts = async () => {
      try {
        const snap = await getDocs(collection(db, 'products'));
        const prods = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setAllProductsList(prods);
        if (prods.length > 0) {
          setSelectedPosterProduct(prods[0]);
        }
      } catch (err) {
        console.error('Error fetching products for AI modal:', err);
      }
    };
    loadProducts();
  }, []);

  // If a subtab is requested from outside (e.g. from notifications bell or chat icon)
  React.useEffect(() => {
    if (activeSubTab && activeSubTab !== 'more') {
      setCurrentView(activeSubTab);
    } else {
      setCurrentView('menu');
    }
  }, [activeSubTab]);

  // If viewing a detailed sub-screen, render with a sticky mobile top bar and back button
  if (currentView !== 'menu') {
    const getSubScreenTitle = () => {
      switch (currentView) {
        case 'profile': return 'My Profile & Shop';
        case 'chat': return 'Live Chat with Support';
        case 'commission': return 'Commission Summary';
        case 'notifications': return 'Notices & Announcements';
        case 'support': return 'Support Tickets';
        case 'reviews': return 'Product Reviews';
        case 'feedback': return 'App Feedback';
        case 'security': return 'Security & PIN Lock';
        default: return 'Account';
      }
    };

    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        {/* Mobile Sub-Screen Top Bar */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 h-14 px-3 flex items-center gap-3 shadow-xs">
          <button
            onClick={() => {
              setCurrentView('menu');
              onNavigateTab('more');
            }}
            className="p-2 text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer"
            title="Back to Account Menu"
          >
            <ArrowLeft className="w-5 h-5 text-slate-800" />
          </button>
          <h2 className="text-base font-bold text-slate-900 truncate flex-1">
            {getSubScreenTitle()}
          </h2>
        </header>

        <div className="flex-1 p-3 sm:p-4 pb-24">
          {currentView === 'profile' && <ResellerProfilePage user={user} />}
          {currentView === 'chat' && (
            <div className="h-[calc(100vh-8.5rem)]">
              <LiveChatWindow
                chatId={`chat_${user.uid}`}
                currentUser={user}
                partnerInfo={{
                  name: 'Sky Admin Team',
                  shopName: 'Official Helpdesk & Order Support',
                  role: 'admin',
                }}
                onOpenOrder={(ordId) => onNavigateTab('orders')}
                onOpenProduct={(prodId) => onNavigateTab('products')}
                className="h-full"
              />
            </div>
          )}
          {currentView === 'commission' && <CommissionSummary user={user} />}
          {currentView === 'notifications' && <ResellerNoticeList user={user} />}
          {currentView === 'support' && <SupportSystem user={user} />}
          {currentView === 'reviews' && <ProductReviewForm user={user} />}
          {currentView === 'feedback' && <FeedbackForm user={user} />}
          {currentView === 'security' && <ResellerSettings user={user} onLogout={onLogout} />}
        </div>
      </div>
    );
  }

  // Primary Native Mobile Account Menu Screen
  return (
    <div className="min-h-screen bg-slate-50 pb-28 pt-2">
      <div className="max-w-xl mx-auto px-3.5 sm:px-4 space-y-3.5">
        
        {/* Profile Card */}
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-blue-950 text-white rounded-3xl p-5 shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 w-36 h-36 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="relative z-10 flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/10 p-0.5 border border-white/20 overflow-hidden shrink-0 shadow-inner">
              {user.profilePhotoUrl ? (
                <img src={user.profilePhotoUrl} alt={user.fullName} className="w-full h-full object-cover rounded-2xl" />
              ) : (
                <div className="w-full h-full bg-blue-600 text-white flex items-center justify-center font-bold text-xl uppercase rounded-2xl">
                  {user.fullName.charAt(0)}
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="text-lg font-extrabold text-white truncate">{user.fullName}</h2>
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              </div>
              <p className="text-xs text-blue-200 font-medium truncate flex items-center gap-1 mt-0.5">
                <Store className="w-3.5 h-3.5" />
                {user.shopName || 'Sky Verified Reseller'}
              </p>
              <p className="text-[11px] text-slate-300 truncate mt-0.5">
                {user.whatsappNumber || user.mobile || user.email}
              </p>
            </div>
          </div>

          <div className="mt-4 pt-3.5 border-t border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="bg-emerald-500/20 text-emerald-300 text-[11px] font-bold px-2.5 py-1 rounded-full border border-emerald-400/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Active Reseller
              </span>
            </div>
            <button
              onClick={() => setCurrentView('profile')}
              className="text-xs font-bold text-white bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-xl transition-colors flex items-center gap-1 active:scale-95"
            >
              Edit Profile
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* AI Marketing & Smart Tools Card (Compact Standard Size, SAT AI Badge & Mobile Responsive) */}
        <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-950 text-white rounded-2xl p-3.5 sm:p-4 shadow-md relative overflow-hidden border border-indigo-500/20">
          <div className="absolute top-0 right-0 w-36 h-36 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="relative z-10 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-amber-300 shrink-0">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-extrabold text-xs sm:text-sm text-white truncate">AI Marketing & Smart Tools</h3>
                  <p className="text-[10px] text-slate-300 truncate">Bengali & English captions, TikTok & Facebook posters</p>
                </div>
              </div>
              <span className="bg-amber-400/20 text-amber-300 border border-amber-400/30 text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 whitespace-nowrap">
                SAT AI
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-0.5">
              <button
                type="button"
                onClick={() => setShowAiModal(true)}
                className="p-2.5 bg-blue-600/90 hover:bg-blue-600 active:bg-blue-700 rounded-xl border border-blue-400/30 text-left transition-all active:scale-95 cursor-pointer flex flex-col justify-between gap-1.5 shadow-xs group"
              >
                <div className="w-6 h-6 rounded-lg bg-blue-700/80 text-amber-300 flex items-center justify-center border border-white/20 shadow-inner group-hover:scale-105 transition-transform">
                  <Bot className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-[11px] text-white flex items-center justify-between">
                    <span className="truncate">AI Copywriter</span>
                    <ChevronRight className="w-3 h-3 text-blue-200 shrink-0 ml-1" />
                  </div>
                  <p className="text-[9px] text-blue-100/80 mt-0.5 truncate leading-tight">Auto post captions</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  let prodToUse = selectedPosterProduct;
                  if (!prodToUse && allProductsList.length > 0) {
                    prodToUse = allProductsList[0];
                    setSelectedPosterProduct(prodToUse);
                  }
                  if (!prodToUse) {
                    prodToUse = DEFAULT_DEMO_PRODUCT;
                    setSelectedPosterProduct(prodToUse);
                  }
                  setShowPosterModal(true);
                }}
                className="p-2.5 bg-slate-900/90 hover:bg-slate-800 active:bg-slate-950 rounded-xl border border-slate-700 text-left transition-all active:scale-95 cursor-pointer flex flex-col justify-between gap-1.5 shadow-xs group"
              >
                <div className="w-6 h-6 rounded-lg bg-slate-800 text-amber-300 flex items-center justify-center border border-white/20 shadow-inner group-hover:scale-105 transition-transform">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-[11px] text-white flex items-center justify-between">
                    <span className="truncate">Poster Studio</span>
                    <ChevronRight className="w-3 h-3 text-amber-200 shrink-0 ml-1" />
                  </div>
                  <p className="text-[9px] text-slate-300 mt-0.5 truncate leading-tight">Watermarked posters</p>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Quick Hub Grid */}
        <div className="grid grid-cols-2 gap-2.5">
          <button
            onClick={() => onNavigateTab('wallet')}
            className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3 text-left hover:border-blue-400 active:scale-98 transition-all cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <span className="font-bold text-base">৳</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">My Wallet</div>
              <div className="text-sm font-extrabold text-slate-900 truncate">Withdraw & Balance</div>
            </div>
          </button>

          <button
            onClick={() => onNavigateTab('orders')}
            className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3 text-left hover:border-blue-400 active:scale-98 transition-all cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <span className="font-bold text-base">📦</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Orders</div>
              <div className="text-sm font-extrabold text-slate-900 truncate">Track Parcels</div>
            </div>
          </button>
        </div>

        {/* App Services & Business Section */}
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="px-4 py-3 bg-slate-50/70 border-b border-slate-100 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Business & Tools</span>
          </div>

          <div className="divide-y divide-slate-100">
            {/* Live Chat with Admin */}
            <button
              onClick={() => setCurrentView('chat')}
              className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-slate-50 active:bg-slate-100 transition-colors text-left group cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <MessagesSquare className="w-4.5 h-4.5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-900">Live Chat with Admin</div>
                  <div className="text-xs text-slate-500">Instant support & query resolution</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {unreadChatCount > 0 && (
                  <span className="bg-rose-500 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full animate-bounce">
                    {unreadChatCount} New
                  </span>
                )}
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-700" />
              </div>
            </button>

            {/* Commission Summary */}
            <button
              onClick={() => setCurrentView('commission')}
              className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-slate-50 active:bg-slate-100 transition-colors text-left group cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Percent className="w-4.5 h-4.5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-900">Commission & Performance</div>
                  <div className="text-xs text-slate-500">Tier rates, earnings breakdown</div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-700" />
            </button>

            {/* Notices & Announcements */}
            <button
              onClick={() => setCurrentView('notifications')}
              className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-slate-50 active:bg-slate-100 transition-colors text-left group cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Bell className="w-4.5 h-4.5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-900">Notices & Broadcasts</div>
                  <div className="text-xs text-slate-500">Official updates from management</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {unreadNotificationsCount > 0 && (
                  <span className="bg-amber-500 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                    {unreadNotificationsCount} New
                  </span>
                )}
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-700" />
              </div>
            </button>

            {/* Support Tickets */}
            <button
              onClick={() => setCurrentView('support')}
              className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-slate-50 active:bg-slate-100 transition-colors text-left group cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <LifeBuoy className="w-4.5 h-4.5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-900">Helpdesk & Support Tickets</div>
                  <div className="text-xs text-slate-500">Raise issues or order inquiries</div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-700" />
            </button>
          </div>
        </div>

        {/* Feedback & Preferences */}
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="px-4 py-3 bg-slate-50/70 border-b border-slate-100">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Preferences & Feedback</span>
          </div>

          <div className="divide-y divide-slate-100">
            {/* Rate & Review Products */}
            <button
              onClick={() => setCurrentView('reviews')}
              className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-slate-50 active:bg-slate-100 transition-colors text-left group cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-yellow-50 text-yellow-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Star className="w-4.5 h-4.5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-900">Product Reviews</div>
                  <div className="text-xs text-slate-500">Rate accessories & share experience</div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-700" />
            </button>

            {/* Send App Feedback */}
            <button
              onClick={() => setCurrentView('feedback')}
              className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-slate-50 active:bg-slate-100 transition-colors text-left group cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <MessageSquare className="w-4.5 h-4.5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-900">Send App Feedback</div>
                  <div className="text-xs text-slate-500">Suggest features or report app bugs</div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-700" />
            </button>

            {/* Security & PIN Lock */}
            <button
              onClick={() => setCurrentView('security')}
              className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-slate-50 active:bg-slate-100 transition-colors text-left group cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Lock className="w-4.5 h-4.5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-900">App Security & PIN Lock</div>
                  <div className="text-xs text-slate-500">Protect app with custom 4-digit PIN</div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-700" />
            </button>
          </div>
        </div>

        {/* Logout Button */}
        <div className="pt-2">
          {showLogoutConfirm ? (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-center space-y-3">
              <p className="text-sm font-bold text-rose-900">Are you sure you want to log out?</p>
              <div className="flex gap-2">
                <button
                  onClick={onLogout}
                  className="flex-1 bg-rose-600 text-white font-bold py-2.5 px-4 rounded-xl text-xs hover:bg-rose-700 active:scale-95 transition-all shadow-xs cursor-pointer"
                >
                  Yes, Log Out
                </button>
                <button
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 bg-white text-slate-700 font-bold py-2.5 px-4 rounded-xl text-xs border border-slate-200 hover:bg-slate-50 active:scale-95 transition-all cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowLogoutConfirm(true)}
              className="w-full bg-white hover:bg-rose-50/50 text-rose-600 font-bold py-3.5 px-4 rounded-2xl border border-slate-200 hover:border-rose-200 transition-all flex items-center justify-center gap-2 active:scale-98 shadow-xs cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Log Out Account</span>
            </button>
          )}
        </div>

        {/* App Version Info */}
        <div className="text-center py-2">
          <p className="text-[11px] font-semibold text-slate-400">Sky Reseller App • Mobile Edition v1.0.0</p>
          <p className="text-[10px] text-slate-400">Sky Automation Tech (Bangladesh)</p>
        </div>

      </div>

      {/* AI Marketing & Smart Assist Modal */}
      <AIMarketingModal
        isOpen={showAiModal}
        onClose={() => setShowAiModal(false)}
        user={user}
        allProducts={allProductsList}
        onOpenSocialShare={(prod) => {
          setSelectedPosterProduct(prod || DEFAULT_DEMO_PRODUCT);
          setShowPosterModal(true);
        }}
      />

      {/* Social Share / Poster Studio Modal */}
      {showPosterModal && (
        <SocialShareModal
          isOpen={showPosterModal}
          onClose={() => setShowPosterModal(false)}
          product={selectedPosterProduct || (allProductsList.length > 0 ? allProductsList[0] : DEFAULT_DEMO_PRODUCT)}
          user={user}
        />
      )}
    </div>
  );
};
