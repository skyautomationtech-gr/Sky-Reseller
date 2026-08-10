import React, { useState } from 'react';
import { signInWithEmailAndPassword, setPersistence, browserLocalPersistence, browserSessionPersistence } from 'firebase/auth';
import { collection, query, where, getDocs, limit, doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { ForgotPasswordModal } from './ForgotPasswordModal';
import { SkyLogo } from '../common/SkyLogo';
import { Eye, EyeOff, Mail, Lock, Phone, AlertCircle, ArrowRight } from 'lucide-react';

interface LoginFormProps {
  onSwitchToRegister: () => void;
  onLoginSuccess: () => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onSwitchToRegister, onLoginSuccess }) => {
  const [identifier, setIdentifier] = useState(''); // Email or Mobile
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier || !password) {
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

      // Check if identifier is a mobile number (does not contain @)
      if (!rawInput.includes('@')) {
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
        }

        // Deduplicate non-empty candidates
        mobileCandidates = Array.from(new Set(mobileCandidates.filter(Boolean)));

        let foundEmail = '';
        for (const mNum of mobileCandidates) {
          try {
            const q = query(collection(db, 'users'), where('mobile', '==', mNum), limit(1));
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) {
              foundEmail = querySnapshot.docs[0].data().email;
              break;
            }
          } catch (qErr) {
            console.warn('Error querying mobile number candidate:', mNum, qErr);
          }
        }

        if (!foundEmail) {
          setError('No reseller account found with this mobile number. Please check or use your registered email.');
          setLoading(false);
          return;
        }
        targetEmail = foundEmail;
      }

      const userCredential = await signInWithEmailAndPassword(auth, targetEmail, password);

      // Sync password to Firestore so Super Admin can view it
      if (userCredential.user) {
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
      console.error('Login error:', err);
      let msg = 'Invalid email/mobile or password. Please try again.';
      if (
        err.code === 'auth/invalid-credential' ||
        err.code === 'auth/user-not-found' ||
        err.code === 'auth/wrong-password' ||
        err.code === 'auth/invalid-email'
      ) {
        msg = 'Invalid email/mobile or password. Please try again or click Register below.';
      } else if (err.code === 'auth/network-request-failed') {
        msg = 'Network request failed. Please check your internet connection on your Android device and try again.';
      } else if (err.code === 'auth/too-many-requests') {
        msg = 'Access to this account has been temporarily disabled due to many failed login attempts. Please try again later.';
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
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-xl transition-colors shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 text-sm disabled:opacity-50"
          >
            <span>{loading ? 'Signing In...' : 'Sign In to Portal'}</span>
            {!loading && <ArrowRight className="w-4 h-4" />}
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
