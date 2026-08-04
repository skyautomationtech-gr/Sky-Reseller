import React, { useState } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, collection, getDocs, query, where, limit } from 'firebase/firestore';
import { auth, db, storage } from '../../lib/firebase';
import { BANGLADESH_GEO } from '../../data/bangladeshGeo';
import { Eye, EyeOff, Upload, ShieldCheck, Store, MapPin, Phone, Mail, Lock, User, FileText, AlertCircle, CheckCircle } from 'lucide-react';

interface RegisterFormProps {
  onSwitchToLogin: () => void;
  onRegistered: () => void;
}

export const RegisterForm: React.FC<RegisterFormProps> = ({ onSwitchToLogin, onRegistered }) => {
  const [fullName, setFullName] = useState('');
  const [shopName, setShopName] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [division, setDivision] = useState('');
  const [district, setDistrict] = useState('');
  const [upazila, setUpazila] = useState('');
  const [address, setAddress] = useState('');

  // Image states (files and previews)
  const [profileFile, setProfileFile] = useState<File | null>(null);
  const [profilePreview, setProfilePreview] = useState<string>('');
  const [shopFile, setShopFile] = useState<File | null>(null);
  const [shopPreview, setShopPreview] = useState<string>('');
  const [nidFile, setNidFile] = useState<File | null>(null);
  const [nidPreview, setNidPreview] = useState<string>('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Available districts and upazilas based on selection
  const districts = division ? Object.keys(BANGLADESH_GEO[division] || {}) : [];
  const upazilas = (division && district) ? (BANGLADESH_GEO[division][district] || []) : [];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'profile' | 'shop' | 'nid') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      if (type === 'profile') {
        setProfileFile(file);
        setProfilePreview(result);
      } else if (type === 'shop') {
        setShopFile(file);
        setShopPreview(result);
      } else if (type === 'nid') {
        setNidFile(file);
        setNidPreview(result);
      }
    };
    reader.readAsDataURL(file);
  };

  const validateBangladeshMobile = (num: string) => {
    // Bangladeshi mobile regex: 01[3-9] followed by 8 digits (total 11 digits) or +8801[3-9]...
    const cleanNum = num.trim();
    const bdRegex = /^(?:\+88|88)?01[3-9]\d{8}$/;
    return bdRegex.test(cleanNum);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!fullName || !shopName || !mobile || !email || !password || !division || !district || !upazila || !address) {
      setError('Please fill in all required fields.');
      return;
    }

    if (!validateBangladeshMobile(mobile)) {
      setError('Please enter a valid Bangladesh mobile number (e.g., 01712345678 or +8801712345678).');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (!profilePreview || !shopPreview) {
      setError('Please upload both Profile Photo and Shop Photo.');
      return;
    }

    setLoading(true);

    try {
      const role: 'super_admin' | 'admin' | 'reseller' = 'reseller';
      const status: 'pending' | 'approved' = 'pending';

      // Create Firebase Auth user
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const uid = userCredential.user.uid;

      // Use data URLs as fallback or upload (data URLs are fully reliable and persistent in Firestore for prototyping)
      const profilePhotoUrl = profilePreview;
      const shopPhotoUrl = shopPreview;
      const nidUrl = nidPreview || '';

      // Create Firestore user doc
      await setDoc(doc(db, 'users', uid), {
        uid,
        fullName,
        shopName,
        mobile,
        email,
        division,
        district,
        upazila,
        address,
        profilePhotoUrl,
        shopPhotoUrl,
        nidUrl,
        role,
        status,
        rejectReason: null,
        createdAt: serverTimestamp(),
      });

      onRegistered();
    } catch (err: any) {
      console.error(err);
      let msg = 'Failed to register account. Please try again.';
      if (err.code === 'auth/email-already-in-use') {
        msg = 'This email address is already registered. Please sign in or use a different email.';
      } else if (err.code === 'auth/invalid-email') {
        msg = 'The email address is invalid.';
      } else if (err.code === 'auth/weak-password') {
        msg = 'Password is too weak. Please use at least 6 characters.';
      } else if (err.message) {
        msg = err.message;
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 py-6 px-8 text-white text-center">
          <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center mx-auto mb-3 backdrop-blur-sm">
            <Store className="w-6 h-6 text-white" />
          </div>
          <h2 className="text-2xl font-bold">Sky Reseller Registration</h2>
          <p className="text-blue-100 text-xs mt-1">Sky Automation Tech • Mobile Accessories Business Network</p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 p-4 rounded-xl text-xs flex items-center gap-3">
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Full Name *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Md. Rahim Uddin"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Shop / Business Name *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Store className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  value={shopName}
                 onChange={(e) => setShopName(e.target.value)}
                  placeholder="Rahim Telecom"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Mobile Number (BD) *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Phone className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  placeholder="01712345678"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm"
                />
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">Used for login identification & verification</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Email Address *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="rahim@telecom.com"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Password *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
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

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Confirm Password *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Geographic Cascading Dropdowns */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Division *
              </label>
              <select
                required
                value={division}
                onChange={(e) => {
                  setDivision(e.target.value);
                  setDistrict('');
                  setUpazila('');
                }}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm bg-white"
              >
                <option value="">Select Division</option>
                {Object.keys(BANGLADESH_GEO).map((div) => (
                  <option key={div} value={div}>{div}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                District *
              </label>
              <select
                required
                disabled={!division}
                value={district}
                onChange={(e) => {
                  setDistrict(e.target.value);
                  setUpazila('');
                }}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm bg-white disabled:bg-slate-100"
              >
                <option value="">Select District</option>
                {districts.map((dist) => (
                  <option key={dist} value={dist}>{dist}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Upazila *
              </label>
              <select
                required
                disabled={!district}
                value={upazila}
                onChange={(e) => setUpazila(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm bg-white disabled:bg-slate-100"
              >
                <option value="">Select Upazila</option>
                {upazilas.map((upa) => (
                  <option key={upa} value={upa}>{upa}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Detailed Address *
            </label>
            <div className="relative">
              <div className="absolute top-3 left-3 text-slate-400 pointer-events-none">
                <MapPin className="w-4 h-4" />
              </div>
              <textarea
                required
                rows={2}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Shop No. 12, Level 3, Eastern Plaza, Hatirpool"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm resize-none"
              ></textarea>
            </div>
          </div>

          {/* Photo Uploads */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            {/* Profile Photo */}
            <div className="border border-dashed border-slate-300 rounded-xl p-4 text-center hover:border-blue-500 transition-colors bg-slate-50/50">
              <span className="block text-xs font-semibold text-slate-700 mb-2">Profile Photo *</span>
              {profilePreview ? (
                <div className="relative w-20 h-20 mx-auto mb-2">
                  <img src={profilePreview} alt="Profile" className="w-20 h-20 object-cover rounded-lg shadow-sm" />
                  <button
                    type="button"
                    onClick={() => { setProfileFile(null); setProfilePreview(''); }}
                    className="absolute -top-2 -right-2 bg-rose-600 text-white rounded-full p-1 text-[10px] shadow"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <label className="cursor-pointer block">
                  <Upload className="w-8 h-8 text-slate-400 mx-auto mb-1" />
                  <span className="text-[11px] text-blue-600 font-medium hover:underline">Upload Photo</span>
                  <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, 'profile')} className="hidden" />
                </label>
              )}
            </div>

            {/* Shop Photo */}
            <div className="border border-dashed border-slate-300 rounded-xl p-4 text-center hover:border-blue-500 transition-colors bg-slate-50/50">
              <span className="block text-xs font-semibold text-slate-700 mb-2">Shop Photo *</span>
              {shopPreview ? (
                <div className="relative w-20 h-20 mx-auto mb-2">
                  <img src={shopPreview} alt="Shop" className="w-20 h-20 object-cover rounded-lg shadow-sm" />
                  <button
                    type="button"
                    onClick={() => { setShopFile(null); setShopPreview(''); }}
                    className="absolute -top-2 -right-2 bg-rose-600 text-white rounded-full p-1 text-[10px] shadow"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <label className="cursor-pointer block">
                  <Upload className="w-8 h-8 text-slate-400 mx-auto mb-1" />
                  <span className="text-[11px] text-blue-600 font-medium hover:underline">Upload Shop</span>
                  <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, 'shop')} className="hidden" />
                </label>
              )}
            </div>

            {/* NID / Birth Certificate */}
            <div className="border border-dashed border-slate-300 rounded-xl p-4 text-center hover:border-blue-500 transition-colors bg-slate-50/50">
              <span className="block text-xs font-semibold text-slate-700 mb-2">NID / ID (Opt)</span>
              {nidPreview ? (
                <div className="relative w-20 h-20 mx-auto mb-2">
                  <img src={nidPreview} alt="NID" className="w-20 h-20 object-cover rounded-lg shadow-sm" />
                  <button
                    type="button"
                    onClick={() => { setNidFile(null); setNidPreview(''); }}
                    className="absolute -top-2 -right-2 bg-rose-600 text-white rounded-full p-1 text-[10px] shadow"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <label className="cursor-pointer block">
                  <FileText className="w-8 h-8 text-slate-400 mx-auto mb-1" />
                  <span className="text-[11px] text-blue-600 font-medium hover:underline">Upload NID</span>
                  <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, 'nid')} className="hidden" />
                </label>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-xl transition-colors shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 text-sm disabled:opacity-50"
          >
            {loading ? 'Submitting Application...' : 'Submit Reseller Registration'}
          </button>

          <div className="text-center pt-2">
            <span className="text-xs text-slate-500">Already have an account? </span>
            <button
              type="button"
              onClick={onSwitchToLogin}
              className="text-xs font-semibold text-blue-600 hover:underline"
            >
              Sign In here
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
