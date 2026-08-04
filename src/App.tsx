import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
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
import { Store, Loader2 } from 'lucide-react';

export default function App() {
  const [firebaseUser, setFirebaseUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authView, setAuthView] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setFirebaseUser(currentUser);
      if (currentUser) {
        try {
          const docRef = doc(db, 'users', currentUser.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setUserProfile(docSnap.data() as UserProfile);
          } else {
            setUserProfile(null);
          }
        } catch (err) {
          console.error('Error fetching user profile:', err);
          setUserProfile(null);
        }
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

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
            // Re-fetch user profile after successful registration
            if (auth.currentUser) {
              const docRef = doc(db, 'users', auth.currentUser.uid);
              const docSnap = await getDoc(docRef);
              if (docSnap.exists()) {
                setUserProfile(docSnap.data() as UserProfile);
              }
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
            const docRef = doc(db, 'users', auth.currentUser.uid);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
              setUserProfile(docSnap.data() as UserProfile);
            }
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
  if (userProfile.role === 'super_admin') {
    return <SuperAdminDashboard user={userProfile} onLogout={handleLogout} />;
  }

  if (userProfile.role === 'admin') {
    return <AdminDashboard user={userProfile} onLogout={handleLogout} />;
  }

  return <ResellerDashboard user={userProfile} onLogout={handleLogout} />;
}
