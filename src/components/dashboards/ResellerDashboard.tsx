import React, { useState, useEffect } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserProfile, Wallet } from '../../types';
import { ProductManagement } from '../inventory/ProductManagement';
import { OrderList } from '../orders/OrderList';
import { WalletView } from '../wallet/WalletView';
import { CreateOrderModal } from '../orders/CreateOrderModal';
import { ResellerHomePage } from '../home/ResellerHomePage';
import { ResellerAccountHub } from '../profile/ResellerAccountHub';
import { BottomNavigation } from '../common/BottomNavigation';
import { NotificationBellDropdown } from '../notifications/NotificationBellDropdown';
import { subscribeToTotalUnreadChatCount } from '../../lib/chatService';
import { RotateCw, MessagesSquare, Store, Lock } from 'lucide-react';
import { usePageRefresh, useRefresh } from '../../context/RefreshContext';
import { triggerHaptic } from '../../lib/nativeFeedback';
import { useAccess } from '../../hooks/useAccess';
import { PendingHomeBanner } from '../auth/PendingHomeBanner';
import { AccessLockedModal } from '../auth/AccessLockedModal';

interface ResellerDashboardProps {
  user: UserProfile;
  onLogout: () => void;
}

export const ResellerDashboard: React.FC<ResellerDashboardProps> = ({ user, onLogout }) => {
  const { isPending, canAccessFullApp } = useAccess(user);
  const [activeTab, setActiveTab] = useState('home');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isLockedModalOpen, setIsLockedModalOpen] = useState(false);
  const [lockedFeatureName, setLockedFeatureName] = useState('This feature');

  const handleOpenLocked = (featName = 'This feature') => {
    setLockedFeatureName(featName);
    setIsLockedModalOpen(true);
  };

  // Live Metrics
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [totalOrders, setTotalOrders] = useState<number>(0);
  const [pendingOrders, setPendingOrders] = useState<number>(0);
  const [deliveredOrders, setDeliveredOrders] = useState<number>(0);
  const [todaysOrders, setTodaysOrders] = useState<number>(0);
  const [totalEarnings, setTotalEarnings] = useState<number>(0);
  const [pendingCommission, setPendingCommission] = useState<number>(0);
  const [unreadNotifications, setUnreadNotifications] = useState<number>(0);
  const [unreadChatCount, setUnreadChatCount] = useState<number>(0);
  const [loadingMetrics, setLoadingMetrics] = useState<boolean>(true);
  const [shopImgError, setShopImgError] = useState<boolean>(false);

  const { isRefreshing, formattedLastUpdated, showToast, refreshCurrentPage } = useRefresh();

  const handleRefresh = async () => {
    await fetchResellerStats();
    showToast('✓ Data refreshed', 'success');
  };

  usePageRefresh(activeTab, handleRefresh);

  useEffect(() => {
    fetchResellerStats();

    const unsubChat = subscribeToTotalUnreadChatCount(user.role, user.uid, (cnt) => {
      setUnreadChatCount(cnt);
    });

    const handlePushNav = (e: any) => {
      if (e.detail?.tab) {
        setActiveTab(e.detail.tab);
      }
    };
    window.addEventListener('sky_navigate_tab', handlePushNav);
    return () => {
      unsubChat();
      window.removeEventListener('sky_navigate_tab', handlePushNav);
    };
  }, [user.uid]);

  // Native Android Hardware Back Button Handling
  useEffect(() => {
    let backHandle: any = null;
    let isSubscribed = true;

    try {
      CapacitorApp.addListener('backButton', () => {
        if (isCreateModalOpen) {
          setIsCreateModalOpen(false);
          return;
        }

        if (activeTab !== 'home') {
          setActiveTab('home');
          return;
        }

        if (Capacitor.isNativePlatform()) {
          CapacitorApp.exitApp();
        }
      }).then((handle) => {
        if (isSubscribed) {
          backHandle = handle;
        } else if (handle && typeof handle.remove === 'function') {
          handle.remove();
        }
      }).catch(() => {});
    } catch (_) {}

    return () => {
      isSubscribed = false;
      if (backHandle && typeof backHandle.remove === 'function') {
        try {
          backHandle.remove();
        } catch (_) {}
      }
    };
  }, [activeTab, isCreateModalOpen]);

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
    // If user is pending and tries to directly access locked tabs
    if (!canAccessFullApp && (activeTab === 'orders' || activeTab === 'wallet')) {
      return (
        <div className="py-12 px-4 text-center">
          <div className="bg-white/80 backdrop-blur-xl border border-slate-200/80 p-8 rounded-3xl shadow-sm max-w-md mx-auto space-y-4">
            <div className="w-14 h-14 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-center mx-auto text-amber-500">
              <Lock className="w-7 h-7" />
            </div>
            <h3 className="text-base font-extrabold text-slate-900 capitalize">
              {activeTab} is Locked
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              This feature unlocks automatically once your reseller registration is approved by an administrator.
            </p>
            <button
              onClick={() => handleOpenLocked(activeTab === 'orders' ? 'Orders Tracking' : 'My Wallet')}
              className="py-2.5 px-5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs active:scale-95 transition cursor-pointer"
            >
              View Verification Timeline
            </button>
          </div>
        </div>
      );
    }

    switch (activeTab) {
      case 'home':
        return (
          <ResellerHomePage 
            user={user} 
            onNavigateTab={setActiveTab} 
            canAccessFullApp={canAccessFullApp}
            onOpenLockedModal={handleOpenLocked}
          />
        );
      case 'products':
        return <ProductManagement user={user} />;
      case 'orders':
        return <OrderList user={user} />;
      case 'wallet':
        return <WalletView user={user} />;
      case 'reviews':
      case 'feedback':
      case 'commission':
      case 'notifications':
      case 'support':
      case 'chat':
      case 'live_chat':
      case 'profile':
      case 'settings':
      case 'security':
      case 'more':
        return (
          <ResellerAccountHub
            user={user}
            activeSubTab={activeTab}
            onNavigateTab={setActiveTab}
            onLogout={onLogout}
            unreadChatCount={unreadChatCount}
            unreadNotificationsCount={unreadNotifications}
            canAccessFullApp={canAccessFullApp}
            onOpenLockedModal={handleOpenLocked}
          />
        );
      default:
        return (
          <ResellerHomePage 
            user={user} 
            onNavigateTab={setActiveTab} 
            canAccessFullApp={canAccessFullApp}
            onOpenLockedModal={handleOpenLocked}
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex justify-center selection:bg-blue-500 selection:text-white">
      {/* Mobile-First App Container (Full width on phone/tablet, sleek centered app shell on wide desktop) */}
      <div className="w-full max-w-2xl min-h-screen bg-slate-50 flex flex-col relative shadow-2xl md:border-x border-slate-200/80 overflow-hidden">
        
        {/* Subtle Ambient Background Gradients for Glassmorphism Depth */}
        <div className="absolute top-0 right-0 w-72 h-72 bg-gradient-to-bl from-blue-400/10 via-indigo-400/5 to-transparent rounded-full blur-3xl pointer-events-none -z-0" />
        <div className="absolute top-80 -left-20 w-80 h-80 bg-gradient-to-tr from-amber-400/10 via-orange-400/5 to-transparent rounded-full blur-3xl pointer-events-none -z-0" />

        {/* Native Mobile App Header (Transparent Sticky Top Bar) */}
        <header className="sticky top-0 z-30 bg-white/70 backdrop-blur-md border-b border-slate-200/40 px-3.5 py-2.5 pt-[calc(env(safe-area-inset-top,0px)+0.625rem)] flex items-center justify-between transition-colors">
          <div 
            onClick={() => {
              triggerHaptic('light');
              setActiveTab('home');
            }}
            className="flex items-center gap-2 cursor-pointer select-none fluid-spring max-w-[55%]"
          >
            {/* Account Holder's Shop Logo / Photo */}
            {(user.shopPhotoUrl || user.profilePhotoUrl) && !shopImgError ? (
              <div className="w-8.5 h-8.5 rounded-xl overflow-hidden border border-slate-200/80 bg-white/70 shadow-2xs flex items-center justify-center shrink-0">
                <img
                  src={user.shopPhotoUrl || user.profilePhotoUrl}
                  alt={user.shopName || user.fullName}
                  className="w-full h-full object-cover"
                  onError={() => setShopImgError(true)}
                />
              </div>
            ) : (
              <div className="w-8.5 h-8.5 rounded-xl border border-blue-500/20 bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-2xs shrink-0">
                <Store className="w-4 h-4 text-white" />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-sm font-black text-slate-900 tracking-tight leading-none truncate">
                  {user.shopName || user.fullName}
                </span>
              </div>
              <p className="text-[11px] font-medium text-slate-500 truncate leading-tight mt-0.5">
                {user.shopName && user.fullName && user.shopName !== user.fullName
                  ? user.fullName
                  : (user.resellerCode ? `ID: ${user.resellerCode}` : (isPending ? 'Pending Approval' : 'Verified Reseller'))}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Live Wallet Balance Glass Pill */}
            <button
              onClick={() => {
                triggerHaptic('light');
                if (!canAccessFullApp) {
                  handleOpenLocked('My Wallet');
                  return;
                }
                setActiveTab('wallet');
              }}
              className="bg-emerald-500/10 hover:bg-emerald-500/20 backdrop-blur-md border border-emerald-500/25 text-emerald-800 px-2.5 py-1.5 rounded-full flex items-center gap-1.5 transition-all fluid-spring cursor-pointer shadow-2xs"
              title={canAccessFullApp ? "Wallet Balance - Click to View" : "Wallet Locked until Approval"}
            >
              {canAccessFullApp ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-extrabold tracking-tight tabular-nums">৳{walletBalance.toLocaleString()}</span>
                </>
              ) : (
                <>
                  <Lock className="w-3 h-3 text-amber-600" />
                  <span className="text-xs font-bold text-slate-600">Locked</span>
                </>
              )}
            </button>

            {/* Live Chat Direct Button */}
            <button
              onClick={() => {
                triggerHaptic('light');
                if (!canAccessFullApp) {
                  handleOpenLocked('Live Chat');
                  return;
                }
                setActiveTab('chat');
              }}
              className="relative p-2 text-slate-600 hover:text-blue-600 hover:bg-slate-900/5 backdrop-blur-md rounded-xl transition-all min-w-[38px] min-h-[38px] flex items-center justify-center cursor-pointer fluid-spring border border-slate-200/60 bg-transparent"
              title="Support"
            >
              <MessagesSquare className="w-5 h-5 text-slate-700 hover:text-blue-600" />
              {unreadChatCount > 0 && (
                <span className="absolute top-1 right-1 bg-rose-500 text-white font-black text-[10px] w-4 h-4 rounded-full flex items-center justify-center ring-2 ring-white animate-bounce shadow-xs">
                  {unreadChatCount > 9 ? '9+' : unreadChatCount}
                </span>
              )}
            </button>

            {/* Realtime Notification Bell */}
            <NotificationBellDropdown
              user={user}
              onNavigateNotifications={() => {
                triggerHaptic('light');
                setActiveTab('notifications');
              }}
            />

            {/* Quick Refresh Icon */}
            <button
              onClick={() => {
                triggerHaptic('medium');
                refreshCurrentPage();
              }}
              disabled={isRefreshing}
              className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-900/5 backdrop-blur-md rounded-xl transition-all min-w-[38px] min-h-[38px] flex items-center justify-center cursor-pointer fluid-spring border border-slate-200/60 bg-transparent"
              title="Refresh"
            >
              <RotateCw className={`w-4 h-4 text-slate-600 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`} />
            </button>
          </div>
        </header>

        {/* Sticky Pending Approval Notice Banner on Home / All Views */}
        {isPending && (
          <PendingHomeBanner 
            user={user} 
            onOpenLockedModal={() => handleOpenLocked('Account Review')} 
          />
        )}

        {/* Main Content Area */}
        <main className="flex-1 pb-24 px-3.5 sm:px-4.5 py-3.5 sm:py-4 overflow-x-hidden">
          {renderContent()}
        </main>

        {/* Fixed Mobile Bottom Navigation Bar */}
        <BottomNavigation 
          activeTab={activeTab} 
          setActiveTab={setActiveTab} 
          pendingOrdersCount={pendingOrders}
          unreadChatCount={unreadChatCount}
          unreadNotificationsCount={unreadNotifications}
          isRestricted={!canAccessFullApp}
          onOpenLockedModal={handleOpenLocked}
        />

        {/* Create Order Modal (only opens if approved) */}
        {canAccessFullApp && (
          <CreateOrderModal
            isOpen={isCreateModalOpen}
            onClose={() => setIsCreateModalOpen(false)}
            user={user}
            onOrderCreated={() => {
              fetchResellerStats();
              setActiveTab('orders');
            }}
          />
        )}

        {/* Friendly Glass Bottom-Sheet for Locked Features */}
        <AccessLockedModal
          isOpen={isLockedModalOpen}
          onClose={() => setIsLockedModalOpen(false)}
          featureName={lockedFeatureName}
        />
      </div>
    </div>
  );
};
