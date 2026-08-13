import React, { useState, useEffect } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './lib/firebase';
import { UserProfile } from './types';
import { LoginForm } from './components/auth/LoginForm';
import { RegisterForm } from './components/auth/RegisterForm';
import { PendingApprovalScreen } from './components/auth/PendingApprovalScreen';
import { RejectedScreen } from './components/auth/RejectedScreen';
import { SuspendedScreen } from './components/auth/SuspendedScreen';
import { SuperAdminDashboard } from './components/dashboards/SuperAdminDashboard';
import { AdminDashboard } from './components/dashboards/AdminDashboard';
import { ResellerDashboard } from './components/dashboards/ResellerDashboard';
import { AppLockScreen } from './components/common/AppLockScreen';
import { logUserSession } from './lib/auditLogger';
import { getCurrentAppVersion, getChangelogs, updateUserLastSeenVersion } from './lib/versionService';
import { WhatsNewModal } from './components/version/WhatsNewModal';
import { ChangelogEntry } from './types';
import { RefreshProvider } from './context/RefreshContext';
import { NetworkProvider, useNetwork } from './context/NetworkContext';
import { Store, Loader2, WifiOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { NoInternetOverlay, TopBannerIndicator } from './components/common/OfflineIndicators';
import { registerPushNotificationListeners, requestAndRegisterPushNotifications } from './lib/pushNotifications';
import { InAppPushBanner, PushBannerNotification } from './components/notifications/InAppPushBanner';

function AppContent() {
  const { isOnline } = useNetwork();
  const [firebaseUser, setFirebaseUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authView, setAuthView] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(true);

  // Version pop-up state
  const [whatsNewChangelog, setWhatsNewChangelog] = useState<ChangelogEntry | null>(null);
  const [currentAppVersion, setCurrentAppVersion] = useState<string>('');
  const [showWhatsNew, setShowWhatsNew] = useState(false);

  // In-App Push Banner state
  const [activePushBanner, setActivePushBanner] = useState<PushBannerNotification | null>(null);

  // App Lock PIN Screen state
  const [showLockScreen, setShowLockScreen] = useState<boolean>(false);

  // Check if PIN lock screen should be displayed
  const checkIfLockNeeded = async () => {
    if (!userProfile || userProfile.status !== 'approved') return;

    const isLocalPinEnabled = localStorage.getItem(`sky_app_pin_enabled_${userProfile.uid}`) === 'true';
    const isPinEnabled = userProfile.appLockEnabled || isLocalPinEnabled;

    if (!isPinEnabled) return;

    // Check time elapsed since app was backgrounded
    const backgroundedAt = localStorage.getItem('appBackgroundedAt');
    if (backgroundedAt) {
      const timeAway = Date.now() - parseInt(backgroundedAt, 10);
      if (timeAway > 10000) { // 10 seconds away
        setShowLockScreen(true);
        return;
      }
    }

    // Cold start check: require PIN on fresh app open if not already unlocked in current browser session
    const isUnlockedInSession = sessionStorage.getItem(`sky_app_unlocked_${userProfile.uid}`) === 'true';
    if (!isUnlockedInSession) {
      setShowLockScreen(true);
    }
  };

  // App background & resume listener
  useEffect(() => {
    if (!userProfile || userProfile.status !== 'approved') return;

    checkIfLockNeeded();

    let appListener: any = null;
    try {
      appListener = CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) {
          localStorage.setItem('appBackgroundedAt', Date.now().toString());
        } else {
          checkIfLockNeeded();
        }
      });
    } catch (err) {
      console.warn('Capacitor App listener not active:', err);
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        localStorage.setItem('appBackgroundedAt', Date.now().toString());
      } else {
        checkIfLockNeeded();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (appListener && typeof appListener.remove === 'function') {
        appListener.remove();
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [userProfile?.uid, userProfile?.appLockEnabled]);

  const handleUnlockPin = () => {
    if (userProfile) {
      sessionStorage.setItem(`sky_app_unlocked_${userProfile.uid}`, 'true');
    }
    localStorage.removeItem('appBackgroundedAt');
    setShowLockScreen(false);
  };

  const handlePushActionNavigation = (data: any) => {
    let targetTab = 'home';
    if (data?.type === 'new_order' || data?.type === 'order_status') {
      targetTab = 'orders';
    } else if (data?.type === 'payout' || data?.type === 'commission') {
      targetTab = 'wallet';
    } else if (data?.type === 'important_notice') {
      targetTab = 'notifications';
    } else if (data?.type === 'app_update') {
      targetTab = 'settings';
    }
    window.dispatchEvent(new CustomEvent('sky_navigate_tab', { detail: { tab: targetTab, data } }));
  };

  const fetchOrCreateUserProfile = async (currentUser: any): Promise<UserProfile | null> => {
    if (!currentUser) return null;
    const cacheKey = 'sky_user_profile_' + currentUser.uid;

    try {
      // 1. Try retrieving cached profile from local storage first to keep the app functional offline
      const cached = localStorage.getItem(cacheKey);
      let cachedProfile: UserProfile | null = null;
      if (cached) {
        try {
          cachedProfile = JSON.parse(cached) as UserProfile;
        } catch (_) {}
      }

      // If we are offline and have a cached profile, immediately return it
      if (!isOnline && cachedProfile) {
        console.log('App is offline: returning cached user profile');
        return cachedProfile;
      }

      // 2. Query Firestore but add a robust timeout to prevent getting stuck in poor/no internet scenarios
      const docRef = doc(db, 'users', currentUser.uid);
      const getDocPromise = getDoc(docRef);
      const timeoutPromise = new Promise<null>((_, reject) => 
        setTimeout(() => reject(new Error('Firestore fetch timeout')), 4000)
      );

      const docSnap = await Promise.race([getDocPromise, timeoutPromise]) as any;

      let profile: UserProfile;
      if (docSnap && docSnap.exists()) {
        profile = docSnap.data() as UserProfile;
      } else if (cachedProfile) {
        profile = cachedProfile;
      } else {
        // Auto-heal missing profile document so user isn't stuck
        const fallbackProfile: UserProfile = {
          uid: currentUser.uid,
          fullName: currentUser.displayName || currentUser.email?.split('@')[0] || 'Reseller User',
          shopName: 'Sky Reseller Shop',
          mobile: '01700000000',
          email: currentUser.email || '',
          division: 'Dhaka',
          district: 'Dhaka',
          upazila: 'Tejgaon',
          address: 'Main Market, Dhaka',
          profilePhotoUrl: '',
          shopPhotoUrl: '',
          nidUrl: '',
          role: 'reseller',
          status: 'pending',
          rejectReason: null,
          createdAt: new Date().toISOString(),
        };
        try {
          await setDoc(docRef, {
            ...fallbackProfile,
            createdAt: serverTimestamp(),
          });
        } catch (setErr) {
          console.warn('Could not set fallback profile to firestore (offline?):', setErr);
        }
        profile = fallbackProfile;
      }

      // Update local storage cache
      localStorage.setItem(cacheKey, JSON.stringify(profile));

      // Log login session for device history
      try {
        logUserSession(profile.uid, profile.fullName, profile.role);
      } catch (logErr) {
        console.warn('Could not log user session:', logErr);
      }

      return profile;
    } catch (err) {
      console.error('Error fetching/creating user profile:', err);
      // Fallback to cached profile if any error occurs
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        try {
          return JSON.parse(cached) as UserProfile;
        } catch (_) {}
      }
      return null;
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setFirebaseUser(currentUser);
      if (currentUser) {
        const profile = await fetchOrCreateUserProfile(currentUser);
        setUserProfile(profile);

        if (profile && profile.status === 'approved') {
          checkVersionPopup(profile);

          // Setup Push Notifications
          registerPushNotificationListeners(
            profile.uid,
            (payload) => {
              setActivePushBanner({
                id: Date.now().toString(),
                title: payload.title,
                body: payload.body,
                data: payload.data
              });
            },
            (data) => {
              handlePushActionNavigation(data);
            }
          );

          // Request push notification permission on first launch/login
          if (!localStorage.getItem('push_permission_prompted')) {
            requestAndRegisterPushNotifications(profile.uid);
          }
        }
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isOnline]);

  const checkVersionPopup = async (profile: UserProfile) => {
    if (!isOnline) return; // Skip checking new versions if offline
    try {
      const appVerConfig = await getCurrentAppVersion();
      const currentVerStr = appVerConfig.version || '1.0.0';
      setCurrentAppVersion(currentVerStr);

      if (profile.lastSeenVersion !== currentVerStr) {
        const logs = await getChangelogs();
        const latestLog = logs.find((l) => l.version === currentVerStr) || logs[0] || null;
        setWhatsNewChangelog(latestLog);
        setShowWhatsNew(true);
      }
    } catch (err) {
      console.error('Error checking version popup:', err);
    }
  };

  const handleDismissWhatsNew = async () => {
    setShowWhatsNew(false);
    if (userProfile && currentAppVersion) {
      try {
        await updateUserLastSeenVersion(userProfile.uid, currentAppVersion);
        setUserProfile((prev) => prev ? { ...prev, lastSeenVersion: currentAppVersion } : null);
      } catch (err) {
        console.warn('Could not update last seen version (offline?):', err);
      }
    }
  };

  const handleLogout = async () => {
    if (userProfile) {
      sessionStorage.removeItem(`sky_app_unlocked_${userProfile.uid}`);
    }
    localStorage.removeItem('appBackgroundedAt');
    setShowLockScreen(false);
    await signOut(auth);
    setUserProfile(null);
    setFirebaseUser(null);
    setAuthView('login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col text-white relative">
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-blue-600/30 animate-pulse">
            <Store className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-xl font-bold mb-2">Sky Reseller</h1>
          <p className="text-xs text-slate-400 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
            <span>Loading Sky Automation Tech Portal...</span>
          </p>
        </div>
      </div>
    );
  }

  // Not logged in -> show Login or Register (guarded by full screen overlay)
  if (!firebaseUser || !userProfile) {
    if (authView === 'register') {
      return (
        <div className="min-h-screen flex flex-col bg-slate-50 relative">
          <NoInternetOverlay />
          <div className="flex-1">
            <RegisterForm
              onSwitchToLogin={() => setAuthView('login')}
              onRegistered={async () => {
                if (auth.currentUser) {
                  const profile = await fetchOrCreateUserProfile(auth.currentUser);
                  setUserProfile(profile);
                }
              }}
            />
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-screen flex flex-col bg-slate-50 relative">
        <NoInternetOverlay />
        <div className="flex-1">
          <LoginForm
            onSwitchToRegister={() => setAuthView('register')}
            onLoginSuccess={async () => {
              if (auth.currentUser) {
                const profile = await fetchOrCreateUserProfile(auth.currentUser);
                setUserProfile(profile);
              }
            }}
          />
        </div>
      </div>
    );
  }

  // Logged in but status checks
  if (userProfile.status === 'pending') {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50 relative">
        <TopBannerIndicator />
        <div className="flex-1">
          <PendingApprovalScreen user={userProfile} onLogout={handleLogout} />
        </div>
      </div>
    );
  }

  if (userProfile.status === 'rejected') {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50 relative">
        <TopBannerIndicator />
        <div className="flex-1">
          <RejectedScreen user={userProfile} onLogout={handleLogout} />
        </div>
      </div>
    );
  }

  if (userProfile.status === 'suspended') {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50 relative">
        <TopBannerIndicator />
        <div className="flex-1">
          <SuspendedScreen user={userProfile} onLogout={handleLogout} />
        </div>
      </div>
    );
  }

  // Approved role-based dashboards with TopBannerIndicator
  return (
    <RefreshProvider>
      <InAppPushBanner
        notification={activePushBanner}
        onClose={() => setActivePushBanner(null)}
        onClickNotification={handlePushActionNavigation}
      />
      <div className="min-h-screen flex flex-col bg-slate-100 relative">
        <TopBannerIndicator />
        <div className="flex-1 flex flex-col min-h-0">
          {userProfile.role === 'super_admin' && (
            <SuperAdminDashboard user={userProfile} onLogout={handleLogout} />
          )}
          {userProfile.role === 'admin' && (
            <AdminDashboard user={userProfile} onLogout={handleLogout} />
          )}
          {userProfile.role === 'reseller' && (
            <ResellerDashboard user={userProfile} onLogout={handleLogout} />
          )}
        </div>
      </div>

      <WhatsNewModal
        isOpen={showWhatsNew}
        onClose={handleDismissWhatsNew}
        changelog={whatsNewChangelog}
        currentVersion={currentAppVersion || '1.0.0'}
      />

      {showLockScreen && userProfile && (
        <AppLockScreen
          user={userProfile}
          onUnlock={handleUnlockPin}
          onLogout={handleLogout}
        />
      )}
    </RefreshProvider>
  );
}

export default function App() {
  return (
    <NetworkProvider>
      <AppContent />
    </NetworkProvider>
  );
}
