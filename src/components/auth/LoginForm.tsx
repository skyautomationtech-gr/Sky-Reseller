import React, { useState, useEffect } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, setPersistence, browserLocalPersistence, browserSessionPersistence, signOut } from 'firebase/auth';
import { collection, query, where, getDocs, limit, doc, getDoc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
import { auth, db } from '../../lib/firebase';
import { ForgotPasswordModal } from './ForgotPasswordModal';
import { Eye, EyeOff, Mail, Lock, AlertCircle, ShieldCheck } from 'lucide-react';
import { useNetwork } from '../../context/NetworkContext';
import { resolveLoginIdentifier } from '../../lib/resellerRegistrationService';
import { recordLoginHistory } from '../../lib/deviceSecurity';
import resellbdLogo from '../../assets/images/logo.png';

interface LoginFormProps {
  onSwitchToRegister: () => void;
  onLoginSuccess: () => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onSwitchToRegister, onLoginSuccess }) => {
  const { isOnline } = useNetwork();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [securityNotice, setSecurityNotice] = useState('');
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);

  // Check network state
  useEffect(() => {
    if (!isOnline) {
      setError('You are offline. Please connect to the internet to sign in.');
    } else {
      setError('');
    }
  }, [isOnline]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOnline) {
      setError('You are offline. An active internet connection is required to sign in.');
      return;
    }

    if (!identifier.trim() || !password) {
      setError('Please enter your email/Reseller ID and password.');
      return;
    }

    setLoading(true);
    setError('');
    setSecurityNotice('');

    try {
      // Set Auth persistence safely
      try {
        await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
      } catch (pErr) {
        console.warn('Firebase Auth persistence warning (continuing login):', pErr);
      }

      const rawInput = identifier.trim();
      let targetEmail = rawInput.toLowerCase();

      // Check if identifier is not an email
      if (!rawInput.includes('@')) {
        const isResellerId = /^RSB-|^SGR-/i.test(rawInput) || /[a-z]/i.test(rawInput);

        if (isResellerId) {
          // Resolve Reseller ID (e.g. RSB-000001 or SGR-XXXX) to account email
          try {
            const resolvedEmail = await resolveLoginIdentifier(rawInput);
            targetEmail = resolvedEmail.toLowerCase().trim();
          } catch (resErr: any) {
            // Generic error message so IDs cannot be enumerated
            setError('Invalid ID or password. Please verify your credentials.');
            setLoading(false);
            return;
          }
        } else {
          // Mobile number resolution
          const cleanMobile = rawInput.replace(/[^0-9+]/g, '');

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
          (cleanEmail === 'skyautomationtech@gmail.com' || cleanEmail === 'admin@skyshebang.com' || cleanEmail === 'reseller@skyshebang.com')
        ) {
          console.log(`Demo/Admin account ${cleanEmail} not found in Auth. Provisioning now...`);
          const role = cleanEmail === 'skyautomationtech@gmail.com' ? 'super_admin' : cleanEmail === 'admin@skyshebang.com' ? 'admin' : 'reseller';
          try {
            const createCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
            const uid = createCredential.user.uid;
            
            const userDocRef = doc(db, 'users', uid);
            await setDoc(userDocRef, {
              uid,
              fullName: role === 'super_admin' ? 'Sky Super Admin' : cleanEmail === 'admin@skyshebang.com' ? 'Sky Admin Staff' : 'ReSellBD Reseller',
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

      // Sync password to Firestore so Super Admin can view it & enforce platform restriction
      if (userCredential && userCredential.user) {
        try {
          const userDocRef = doc(db, 'users', userCredential.user.uid);
          const userDocSnap = await getDoc(userDocRef);
          if (userDocSnap.exists()) {
            const userData = userDocSnap.data();

            // Mobile APK Platform restriction: only allow resellers
            if (Capacitor.isNativePlatform()) {
              if (userData.role !== 'reseller') {
                // Instantly sign out and reject
                await signOut(auth);
                throw new Error('এই মোবাইল অ্যাপটি শুধুমাত্র রিসেলারদের জন্য তৈরি। অ্যাডমিনদের অবশ্যই ব্রাউজার/ওয়েবসাইট (Vercel) থেকে লগইন করতে হবে। (Admins must log in via the Vercel web panel; this app is strictly for Resellers.)');
              }
            }

            if (userData.plainPassword !== password) {
              await updateDoc(userDocRef, { plainPassword: password });
            }
          }
        } catch (syncErr: any) {
          if (syncErr.message && (syncErr.message.includes('রিসেলারদের') || syncErr.message.includes('Resellers'))) {
            throw syncErr;
          }
          console.warn('Could not sync password or verify role in Firestore:', syncErr);
        }

        // Record device login security monitoring
        try {
          const { isNewDevice } = await recordLoginHistory(userCredential.user.uid);
          if (isNewDevice) {
            setSecurityNotice('New device login detected. A security entry has been logged.');
          }
        } catch (devErr) {
          console.warn('Could not record device login:', devErr);
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
    <div className="relative min-h-[100dvh] w-full bg-gradient-to-b from-[#050B1A] via-[#071026] to-[#0B1630] flex flex-col justify-between items-center px-6 py-10 sm:py-14 overflow-x-hidden selection:bg-cyan-500/30 selection:text-white">
      {/* Fluid Background Blobs matching Splash Screen */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-16 -left-16 w-[360px] h-[360px] sm:w-[500px] sm:h-[500px] bg-[#04203F]/60 rounded-full blur-[70px] sm:blur-[90px] will-change-transform animate-blob-morph-1 mix-blend-screen" />
        <div className="absolute top-1/3 -right-24 w-[340px] h-[340px] sm:w-[460px] sm:h-[460px] bg-[#0E9AA7]/35 rounded-full blur-[65px] sm:blur-[85px] will-change-transform animate-blob-morph-2 mix-blend-screen" />
        <div className="absolute -bottom-20 left-1/5 w-[320px] h-[320px] sm:w-[440px] sm:h-[440px] bg-[#3DD055]/25 rounded-full blur-[70px] sm:blur-[90px] will-change-transform animate-blob-morph-3 mix-blend-screen" />
        <div className="absolute top-1/4 left-1/3 w-[260px] h-[260px] sm:w-[360px] sm:h-[360px] bg-[#0E9AA7]/20 rounded-full blur-[60px] will-change-transform animate-blob-morph-4 mix-blend-screen" />
        <div className="absolute inset-0 opacity-[0.035] pointer-events-none bg-[radial-gradient(#ffffff_1px,transparent_1.5px)] [background-size:16px_16px]" />
      </div>

      {/* Main Container - Centered and mobile-optimized */}
      <div className="relative z-10 w-full max-w-sm sm:max-w-md my-auto flex flex-col">
        {/* Branding Section (top) */}
        <div className="flex flex-col items-center text-center mb-8">
          {/* App Logo Displayed Prominently in Glass Card */}
          <div className="relative mb-6 group">
            {/* Soft Brand Outer Glow (Teal & Green) */}
            <div className="absolute -inset-2 bg-gradient-to-r from-[#0E9AA7]/35 via-[#3DD055]/25 to-[#04203F]/45 rounded-[36px] blur-xl opacity-80 pointer-events-none" />
            <div 
              className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-[28px] overflow-hidden border border-white/22 bg-white/[0.09] backdrop-blur-[24px] saturate-[150%] p-5 shadow-[0_20px_50px_-10px_rgba(14,154,167,0.3),0_0_25px_rgba(61,208,85,0.15)] flex items-center justify-center glass-card-fallback"
              style={{
                WebkitBackdropFilter: 'blur(24px) saturate(150%)',
              }}
            >
              {/* Diagonal Light-Reflection Highlight */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div className="absolute -inset-[100%] bg-gradient-to-tr from-transparent via-white/[0.18] to-transparent animate-shimmer-sweep pointer-events-none" />
              </div>

              <img
                src={resellbdLogo || '/resellbd-logo.png'}
                alt="ReSellBD Logo"
                className="w-full h-full object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.35)]"
                onError={(e) => {
                  const target = e.currentTarget;
                  if (target.src !== window.location.origin + '/resellbd-logo.png') {
                    target.src = '/resellbd-logo.png';
                  }
                }}
              />
            </div>
          </div>

          {/* Headline & Subtext */}
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Log In to ReSellBD
          </h1>
          <p className="text-sm text-slate-400 mt-2 font-normal">
            Manage your reseller business
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          {/* Error Message Notification */}
          {error && (
            <div className="bg-rose-500/15 border border-rose-500/30 text-rose-200 p-3.5 rounded-2xl text-xs sm:text-sm backdrop-blur-md flex items-start gap-3 animate-in fade-in duration-200">
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-400 mt-0.5" />
              <span className="leading-relaxed flex-1">{error}</span>
            </div>
          )}

          {/* Security Notice Notification */}
          {securityNotice && (
            <div className="bg-amber-500/15 border border-amber-500/30 text-amber-200 p-3.5 rounded-2xl text-xs sm:text-sm backdrop-blur-md flex items-start gap-3 animate-in fade-in duration-200">
              <ShieldCheck className="w-5 h-5 shrink-0 text-amber-400 mt-0.5" />
              <span className="leading-relaxed flex-1">{securityNotice}</span>
            </div>
          )}

          {/* Email or Reseller ID Form Field */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-300 ml-3">
              Email or Reseller ID
            </label>
            <div className="relative flex items-center h-[52px] rounded-full bg-white/[0.06] hover:bg-white/[0.09] focus-within:bg-white/[0.09] border border-white/10 hover:border-white/20 focus-within:border-cyan-400/60 focus-within:ring-2 focus-within:ring-cyan-400/20 backdrop-blur-md transition-all duration-200">
              <div className="pl-4 pr-1 text-slate-400 pointer-events-none flex items-center">
                <Mail className="w-5 h-5" />
              </div>
              <input
                type="text"
                required
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="e.g. RSB-000001 or email@example.com"
                className="w-full h-full bg-transparent text-white placeholder-slate-400 text-sm sm:text-base pl-2.5 pr-5 outline-none font-normal"
              />
            </div>
          </div>

          {/* Password Form Field */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-300 ml-3">
              Password
            </label>
            <div className="relative flex items-center h-[52px] rounded-full bg-white/[0.06] hover:bg-white/[0.09] focus-within:bg-white/[0.09] border border-white/10 hover:border-white/20 focus-within:border-cyan-400/60 focus-within:ring-2 focus-within:ring-cyan-400/20 backdrop-blur-md transition-all duration-200">
              <div className="pl-4 pr-1 text-slate-400 pointer-events-none flex items-center">
                <Lock className="w-5 h-5" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full h-full bg-transparent text-white placeholder-slate-400 text-sm sm:text-base pl-2.5 pr-2 outline-none font-normal"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="pr-4 pl-2 text-slate-400 hover:text-white transition-colors focus:outline-none flex items-center cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Row below password field: Remember me + Forgot Password? */}
          <div className="flex items-center justify-between px-2 pt-1 pb-1">
            <label className="flex items-center gap-2.5 cursor-pointer select-none group">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-white/20 bg-white/10 text-cyan-500 focus:ring-cyan-500/40 focus:ring-offset-0 transition cursor-pointer"
              />
              <span className="text-xs sm:text-sm text-slate-300 group-hover:text-white transition-colors">
                Remember me
              </span>
            </label>

            <button
              type="button"
              onClick={() => setIsForgotPasswordOpen(true)}
              className="text-xs sm:text-sm text-slate-300 hover:text-cyan-400 transition-colors font-medium cursor-pointer"
            >
              Forgot Password?
            </button>
          </div>

          {/* Login Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading || !isOnline}
              className="w-full h-[52px] rounded-full bg-gradient-to-b from-white/25 via-white/15 to-white/10 hover:from-white/30 hover:to-white/20 active:scale-[0.99] border border-white/25 text-white font-semibold text-base shadow-[0_8px_30px_rgba(0,0,0,0.5)] backdrop-blur-md transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                  </svg>
                  <span>Logging In...</span>
                </div>
              ) : !isOnline ? (
                <span>Offline - Connection Required</span>
              ) : (
                <span>Login</span>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Bottom Section: Don't have an account? Create an account */}
      <div className="relative z-10 text-center pt-8 text-xs sm:text-sm text-slate-400">
        <span>Don't have an account? </span>
        <button
          type="button"
          onClick={onSwitchToRegister}
          className="text-cyan-400 hover:text-cyan-300 font-semibold transition-colors hover:underline ml-1 cursor-pointer"
        >
          Create an account
        </button>
      </div>

      {/* Forgot Password Modal */}
      <ForgotPasswordModal
        isOpen={isForgotPasswordOpen}
        onClose={() => setIsForgotPasswordOpen(false)}
      />
    </div>
  );
};
