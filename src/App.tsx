import React, { useState, useEffect } from 'react';
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
import { logUserSession } from './lib/auditLogger';
import { getCurrentAppVersion, getChangelogs, updateUserLastSeenVersion } from './lib/versionService';
import { WhatsNewModal } from './components/version/WhatsNewModal';
import { ChangelogEntry } from './types';
import { RefreshProvider } from './context/RefreshContext';
import { Store, Loader2 } from 'lucide-react';

export default function App() {
  const [firebaseUser, setFirebaseUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authView, setAuthView] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(true);

  // Version pop-up state
  const [whatsNewChangelog, setWhatsNewChangelog] = useState<ChangelogEntry | null>(null);
  const [currentAppVersion, setCurrentAppVersion] = useState<string>('');
  const [showWhatsNew, setShowWhatsNew] = useState(false);

  const fetchOrCreateUserProfile = async (currentUser: any): Promise<UserProfile | null> => {
    if (!currentUser) return null;
    try {
      const docRef = doc(db, 'users', currentUser.uid);
      const docSnap = await getDoc(docRef);
      let profile: UserProfile;
      if (docSnap.exists()) {
        profile = docSnap.data() as UserProfile;
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
        await setDoc(docRef, {
          ...fallbackProfile,
          createdAt: serverTimestamp(),
        });
        profile = fallbackProfile;
      }

      // Log login session for device history
      logUserSession(profile.uid, profile.fullName, profile.role);

      return profile;
    } catch (err) {
      console.error('Error fetching/creating user profile:', err);
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
        }
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const checkVersionPopup = async (profile: UserProfile) => {
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
      await updateUserLastSeenVersion(userProfile.uid, currentAppVersion);
      setUserProfile((prev) => prev ? { ...prev, lastSeenVersion: currentAppVersion } : null);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setUserProfile(null);
    setFirebaseUser(null);
    setAuthView('login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white">
        <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-blue-600/30">
          <Store className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-xl font-bold mb-2">Sky Reseller</h1>
        <p className="text-xs text-slate-400 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
          <span>Loading Sky Automation Tech Portal...</span>
        </p>
      </div>
    );
  }

  // Not logged in -> show Login or Register
  if (!firebaseUser || !userProfile) {
    if (authView === 'register') {
      return (
        <RegisterForm
          onSwitchToLogin={() => setAuthView('login')}
          onRegistered={async () => {
            if (auth.currentUser) {
              const profile = await fetchOrCreateUserProfile(auth.currentUser);
              setUserProfile(profile);
            }
          }}
        />
      );
    }
    return (
      <LoginForm
        onSwitchToRegister={() => setAuthView('register')}
        onLoginSuccess={async () => {
          if (auth.currentUser) {
            const profile = await fetchOrCreateUserProfile(auth.currentUser);
            setUserProfile(profile);
          }
        }}
      />
    );
  }

  // Logged in but status checks
  if (userProfile.status === 'pending') {
    return <PendingApprovalScreen user={userProfile} onLogout={handleLogout} />;
  }

  if (userProfile.status === 'rejected') {
    return <RejectedScreen user={userProfile} onLogout={handleLogout} />;
  }

  if (userProfile.status === 'suspended') {
    return <SuspendedScreen user={userProfile} onLogout={handleLogout} />;
  }

  // Approved role-based dashboards
  return (
    <RefreshProvider>
      {userProfile.role === 'super_admin' && (
        <SuperAdminDashboard user={userProfile} onLogout={handleLogout} />
      )}
      {userProfile.role === 'admin' && (
        <AdminDashboard user={userProfile} onLogout={handleLogout} />
      )}
      {userProfile.role === 'reseller' && (
        <ResellerDashboard user={userProfile} onLogout={handleLogout} />
      )}

      <WhatsNewModal
        isOpen={showWhatsNew}
        onClose={handleDismissWhatsNew}
        changelog={whatsNewChangelog}
        currentVersion={currentAppVersion || '1.0.0'}
      />
    </RefreshProvider>
  );
}
