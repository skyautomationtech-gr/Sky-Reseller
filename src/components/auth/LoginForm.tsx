import React, { useState } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, setPersistence, browserLocalPersistence, browserSessionPersistence } from 'firebase/auth';
import { collection, query, where, getDocs, limit, doc, getDoc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { ForgotPasswordModal } from './ForgotPasswordModal';
import { SkyLogo } from '../common/SkyLogo';
import { Eye, EyeOff, Mail, Lock, Phone, AlertCircle, ArrowRight, WifiOff, ShieldCheck, Sparkles } from 'lucide-react';
import { useNetwork } from '../../context/NetworkContext';

interface LoginFormProps {
  onSwitchToRegister: () => void;
  onLoginSuccess: () => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onSwitchToRegister, onLoginSuccess }) => {
  const { isOnline } = useNetwork();
  const [identifier, setIdentifier] = useState(''); // Email or Mobile
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);

  const handleQuickDemoLogin = async (role: 'super_admin' | 'reseller') => {
    if (!isOnline) {
      setError('You are offline. An active internet connection is required to sign in.');
      return;
    }
    setLoading(true);
    setError('');

    const email = role === 'super_admin' ? 'admin@skyshebang.com' : 'reseller@skyshebang.com';
    const pass = 'shebang123';

    setIdentifier(email);
    setPassword(pass);

    try {
      try {
        await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
      } catch (pErr) {
        console.warn('Firebase Auth persistence warning (continuing login):', pErr);
      }

      let userCredential;
      try {
        userCredential = await signInWithEmailAndPassword(auth, email, pass);
      } catch (signInErr: any) {
        if (
          signInErr.code === 'auth/invalid-credential' ||
          signInErr.code === 'auth/user-not-found' ||
          signInErr.code === 'auth/wrong-password'
        ) {
          console.log(`Demo account ${email} not found in Auth or credentials mismatch. Provisioning...`);
          try {
            const createCredential = await createUserWithEmailAndPassword(auth, email, pass);
            const uid = createCredential.user.uid;
            
            const userDocRef = doc(db, 'users', uid);
            await setDoc(userDocRef, {
              uid,
              fullName: role === 'super_admin' ? 'Sky Admin' : 'Sky Reseller',
              shopName: role === 'super_admin' ? 'Sky HQ' : 'Sky Shop',
              mobile: role === 'super_admin' ? '01711111111' : '01722222222',
              email,
              role,
              status: 'approved',
              division: 'Dhaka',
              district: 'Dhaka',
              upazila: 'Tejgaon',
              address: 'Sky Shebang Tower, Dhaka',
              plainPassword: pass,
              createdAt: serverTimestamp()
            });
            userCredential = createCredential;
          } catch (createErr: any) {
            if (createErr.code !== 'auth/email-already-in-use') {
              throw createErr;
            }
          }
        } else {
          throw signInErr;
        }
      }

      if (userCredential && userCredential.user) {
        try {
          const userDocRef = doc(db, 'users', userCredential.user.uid);
          const userDocSnap = await getDoc(userDocRef);
          if (userDocSnap.exists()) {
            if (userDocSnap.data().plainPassword !== pass) {
              await updateDoc(userDocRef, { plainPassword: pass });
            }
          }
        } catch (syncErr) {
          console.warn('Could not sync password to Firestore:', syncErr);
        }
      }

      onLoginSuccess();
    } catch (err: any) {
      console.error('Demo login failed:', err);
      setError('Failed to log in with demo account: ' + (err.message || err));
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOnline) {
      setError('You are offline. An active internet connection is required to sign in.');
      return;
    }

    if (!identifier.trim() || !password) {
      setError('Please enter your email/mobile and password.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Set Auth persistence safely (Android WebView / APK fix: wrap in try-catch in case IndexedDB or local storage persistence is restricted)
      try {
        await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
      } catch (pErr) {
        console.warn('Firebase Auth persistence warning (continuing login):', pErr);
      }

      const rawInput = identifier.trim();
      let targetEmail = rawInput.toLowerCase();
      let isMobileLogin = false;

      // Check if identifier is a mobile number (does not contain @)
      if (!rawInput.includes('@')) {
        isMobileLogin = true;
        const cleanMobile = rawInput.replace(/[^0-9+]/g, ''); // Strip spaces, hyphens, parentheses

        // Prepare candidate mobile formats to check in Firestore
        let mobileCandidates = [rawInput, cleanMobile];

        if (cleanMobile.startsWith('+88')) {
          const noPrefix = cleanMobile.replace('+88', '');
          mobileCandidates.push(noPrefix);
          mobileCandidates.push('0' + noPrefix);
          mobileCandidates.push('88' + noPrefix);
        } else if (cleanMobile.startsWith('880')) {
          const noPrefix = cleanMobile.slice(2); // '017...'
          mobileCandidates.push(noPrefix);
          mobileCandidates.push('+' + cleanMobile);
        } else if (cleanMobile.startsWith('0')) {
          mobileCandidates.push('+88' + cleanMobile);
          mobileCandidates.push('88' + cleanMobile);
          mobileCandidates.push(cleanMobile.slice(1)); // 17... (10 digits)
        } else if (cleanMobile.length === 10 && cleanMobile.startsWith('1')) {
          mobileCandidates.push('0' + cleanMobile);
          mobileCandidates.push('+880' + cleanMobile);
          mobileCandidates.push('880' + cleanMobile);
        }

        // Deduplicate non-empty candidates
        mobileCandidates = Array.from(new Set(mobileCandidates.filter(Boolean)));

        let foundEmail = '';
        let foundUserDoc: any = null;

        for (const mNum of mobileCandidates) {
          try {
            const q = query(collection(db, 'users'), where('mobile', '==', mNum), limit(1));
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) {
              foundUserDoc = querySnapshot.docs[0].data();
              foundEmail = foundUserDoc.email;
              break;
            }
          } catch (qErr) {
            console.warn('Error querying mobile number candidate:', mNum, qErr);
          }
        }

        if (!foundEmail) {
          setError('এই মোবাইল নম্বরে কোনো অ্যাকাউন্ট পাওয়া যায়নি। অনুগ্রহ করে সঠিক মোবাইল বা ইমেইল দিয়ে চেষ্টা করুন। (No account found with this mobile number)');
          setLoading(false);
          return;
        }
        targetEmail = foundEmail.toLowerCase().trim();
      }

      const signInPromise = signInWithEmailAndPassword(auth, targetEmail, password);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 15000)
      );

      let userCredential;
      try {
        userCredential = await Promise.race([signInPromise, timeoutPromise]);
      } catch (authErr: any) {
        const cleanEmail = targetEmail.toLowerCase().trim();
        // Self-heal demo credentials on-the-fly
        if (
          (authErr.code === 'auth/invalid-credential' || authErr.code === 'auth/user-not-found' || authErr.code === 'auth/wrong-password') &&
          password === 'shebang123' &&
          (cleanEmail === 'admin@skyshebang.com' || cleanEmail === 'reseller@skyshebang.com')
        ) {
          console.log(`Demo account ${cleanEmail} not found in Auth. Provisioning now...`);
          const role = cleanEmail === 'admin@skyshebang.com' ? 'super_admin' : 'reseller';
          try {
            const createCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
            const uid = createCredential.user.uid;
            
            const userDocRef = doc(db, 'users', uid);
            await setDoc(userDocRef, {
              uid,
              fullName: role === 'super_admin' ? 'Sky Admin' : 'Sky Reseller',
              shopName: role === 'super_admin' ? 'Sky HQ' : 'Sky Shop',
              mobile: role === 'super_admin' ? '01711111111' : '01722222222',
              email: cleanEmail,
              role,
              status: 'approved',
              division: 'Dhaka',
              district: 'Dhaka',
              upazila: 'Tejgaon',
              address: 'Sky Shebang Tower, Dhaka',
              plainPassword: password,
              createdAt: serverTimestamp()
            });
            userCredential = createCredential;
          } catch (cErr) {
            throw authErr;
          }
        } else {
          // Check Firestore to see if account exists and give precise user feedback
          try {
            const q = query(collection(db, 'users'), where('email', '==', cleanEmail), limit(1));
            const snap = await getDocs(q);
            if (!snap.empty) {
              const uData = snap.docs[0].data();
              if (uData.status === 'pending') {
                setError('আপনার অ্যাকাউন্টটি এখনও অ্যাডমিন অনুমোদনের (Pending Approval) অপেক্ষায় রয়েছে। অনুমোদিত হলে লগইন করতে পারবেন।');
                setLoading(false);
                return;
              } else if (uData.status === 'rejected') {
                setError(`আপনার অ্যাকাউন্ট রেজিস্ট্রেশন বাতিল করা হয়েছে। কারণ: ${uData.rejectReason || 'বিস্তারিত তথ্যের জন্য সাপোর্টে যোগাযোগ করুন।'}`);
                setLoading(false);
                return;
              }
            }
          } catch (fsErr) {
            console.warn('Could not check user status in Firestore:', fsErr);
          }

          throw authErr;
        }
      }

      // Sync password to Firestore so Super Admin can view it
      if (userCredential && userCredential.user) {
        try {
          const userDocRef = doc(db, 'users', userCredential.user.uid);
          const userDocSnap = await getDoc(userDocRef);
          if (userDocSnap.exists()) {
            if (userDocSnap.data().plainPassword !== password) {
              await updateDoc(userDocRef, { plainPassword: password });
            }
          }
        } catch (syncErr) {
          console.warn('Could not sync password to Firestore:', syncErr);
        }
      }

      onLoginSuccess();
    } catch (err: any) {
      console.warn('Login attempt failed:', err?.code || err?.message);
      let msg = 'ভুল ইমেইল/মোবাইল বা পাসওয়ার্ড। অনুগ্রহ করে আবার চেষ্টা করুন।';
      if (err.message === 'timeout') {
        msg = 'সার্ভার সংযোগ সময় শেষ হয়ে গেছে। আপনার ইন্টারনেট কানেকশন চেক করে পুনরায় চেষ্টা করুন। (Connection timed out)';
      } else if (
        err.code === 'auth/invalid-credential' ||
        err.code === 'auth/user-not-found' ||
        err.code === 'auth/wrong-password'
      ) {
        msg = 'ইমেইল/মোবাইল অথবা পাসওয়ার্ড সঠিক নয়। পাসওয়ার্ড ভুলে গেলে নিচে "Forgot Password?" অপশনে ক্লিক করুন বা নতুন অ্যাকাউন্ট রেজিস্টার করুন।';
      } else if (err.code === 'auth/invalid-email') {
        msg = 'ইমেইল অ্যাড্রেসের ফরম্যাট সঠিক নয়। সঠিক ইমেইল বা ১১ ডিজিটের মোবাইল নম্বর দিন।';
      } else if (err.code === 'auth/network-request-failed') {
        msg = 'ইন্টারনেট সংযোগ পাওয়া যায়নি। আপনার ডিভাইস বা মোবাইল ডাটা/ওয়াইফাই চেক করে আবার চেষ্টা করুন।';
      } else if (err.code === 'auth/too-many-requests') {
        msg = 'অতিরিক্ত ভুল চেষ্টার কারণে অ্যাকাউন্ট সাময়িকভাবে বন্ধ রাখা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন বা পাসওয়ার্ড রিসেট করুন।';
      } else if (err.message && !err.message.includes('auth/')) {
        msg = err.message;
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 py-8 px-8 text-white text-center flex flex-col items-center justify-center border-b border-slate-800">
          <div className="mb-2">
            <SkyLogo size="lg" showText={true} />
          </div>
          <p className="text-blue-200/80 text-xs font-medium">B2B Reseller Portal • Official Storefront</p>
        </div>

        <form onSubmit={handleLogin} className="p-8 space-y-5">
          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3.5 rounded-xl text-xs flex items-center gap-3">
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Email Address or Mobile Number
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Mail className="w-4 h-4" />
              </div>
              <input
                type="text"
                required
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="name@example.com or 01712345678"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Password
              </label>
              <button
                type="button"
                onClick={() => setIsForgotPasswordOpen(true)}
                className="text-xs font-medium text-blue-600 hover:underline"
              >
                Forgot password?
              </button>
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex items-center">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
              />
              <span className="text-xs text-slate-600 font-medium">Remember Me on this device</span>
            </label>
          </div>

          <button
            type="submit"
            disabled={loading || !isOnline}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-xl transition-colors shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 text-sm disabled:opacity-50"
          >
            <span>{loading ? 'Signing In...' : !isOnline ? 'Offline - Connection Required' : 'Sign In to Portal'}</span>
            {!loading && isOnline && <ArrowRight className="w-4 h-4" />}
          </button>

          <div className="text-center pt-3 border-t border-slate-100">
            <span className="text-xs text-slate-500">Don't have a reseller account? </span>
            <button
              type="button"
              onClick={onSwitchToRegister}
              className="text-xs font-semibold text-blue-600 hover:underline"
            >
              Register Now
            </button>
          </div>
        </form>
      </div>

      <ForgotPasswordModal
        isOpen={isForgotPasswordOpen}
        onClose={() => setIsForgotPasswordOpen(false)}
      />
    </div>
  );
};
