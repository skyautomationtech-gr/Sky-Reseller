import React, { useState } from 'react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, collection, getDocs, query, where, limit } from 'firebase/firestore';
import { auth, db, storage } from '../../lib/firebase';
import { BANGLADESH_GEO } from '../../data/bangladeshGeo';
import { SkyLogo } from '../common/SkyLogo';
import { Eye, EyeOff, Upload, ShieldCheck, Store, MapPin, Phone, Mail, Lock, User, FileText, AlertCircle, CheckCircle, WifiOff, MessageCircle } from 'lucide-react';
import { useNetwork } from '../../context/NetworkContext';
import { generateRandomResellerSuffix } from '../../lib/resellerIdHelper';

interface RegisterFormProps {
  onSwitchToLogin: () => void;
  onRegistered: () => void;
}

// Utility to compress image to canvas data URL (~20-50KB) to prevent Firestore 1MB doc size error
const compressImage = (file: File, maxWidth = 600, maxHeight = 600, quality = 0.65): Promise<string> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        } else {
          resolve(e.target?.result as string || '');
        }
      };
      img.onerror = () => resolve(e.target?.result as string || '');
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
};

export const RegisterForm: React.FC<RegisterFormProps> = ({ onSwitchToLogin, onRegistered }) => {
  const { isOnline } = useNetwork();
  const [fullName, setFullName] = useState('');
  const [shopName, setShopName] = useState('');
  const [mobile, setMobile] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [sameAsMobile, setSameAsMobile] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [division, setDivision] = useState('');
  const [district, setDistrict] = useState('');
  const [upazila, setUpazila] = useState('');
  const [address, setAddress] = useState('');

  // Payout Account states
  const [payoutMethod, setPayoutMethod] = useState<'bkash' | 'nagad' | 'rocket' | 'bank'>('bkash');
  const [bkashNumber, setBkashNumber] = useState('');
  const [nagadNumber, setNagadNumber] = useState('');
  const [rocketNumber, setRocketNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [branchName, setBranchName] = useState('');

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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'profile' | 'shop' | 'nid') => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const compressedDataUrl = await compressImage(file, 600, 600, 0.65);
      if (type === 'profile') {
        setProfileFile(file);
        setProfilePreview(compressedDataUrl);
      } else if (type === 'shop') {
        setShopFile(file);
        setShopPreview(compressedDataUrl);
      } else if (type === 'nid') {
        setNidFile(file);
        setNidPreview(compressedDataUrl);
      }
    } catch (err) {
      console.error('Image compression error:', err);
    }
  };

  const validateBangladeshMobile = (num: string) => {
    const cleanNum = num.trim();
    const bdRegex = /^(?:\+88|88)?01[3-9]\d{8}$/;
    return bdRegex.test(cleanNum);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!isOnline) {
      setError('You are offline. An active internet connection is required to register.');
      return;
    }

    if (!fullName || !shopName || !mobile || !email || !password || !division || !district || !upazila || !address) {
      setError('Please fill in all required fields.');
      return;
    }

    if (!validateBangladeshMobile(mobile)) {
      setError('Please enter a valid Bangladesh mobile number (e.g., 01712345678 or +8801712345678).');
      return;
    }

    const actualWhatsApp = (sameAsMobile ? mobile : whatsappNumber).trim();
    if (!actualWhatsApp) {
      setError('Please enter your WhatsApp number.');
      return;
    }

    if (!validateBangladeshMobile(actualWhatsApp)) {
      setError('Please enter a valid Bangladesh WhatsApp number (e.g., 01712345678 or +8801712345678).');
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

      let uid = '';
      try {
        // Create Firebase Auth user
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        uid = userCredential.user.uid;
      } catch (authErr: any) {
        // If email already exists, try logging in to write the missing document
        if (authErr.code === 'auth/email-already-in-use') {
          try {
            const loginRes = await signInWithEmailAndPassword(auth, email, password);
            uid = loginRes.user.uid;
          } catch (loginErr) {
            throw authErr;
          }
        } else {
          throw authErr;
        }
      }

      // Compressed image base64 strings
      const profilePhotoUrl = profilePreview;
      const shopPhotoUrl = shopPreview;
      const nidUrl = nidPreview || '';

      // Generate unique SGR Reseller Code (e.g. SGR-ERTY)
      const randomSuffix = generateRandomResellerSuffix();
      const resellerCode = `SGR-${randomSuffix}`;

      // Create or update Firestore user doc
      await setDoc(doc(db, 'users', uid), {
        uid,
        resellerCode,
        fullName,
        shopName,
        mobile,
        whatsappNumber: actualWhatsApp,
        email,
        division,
        district,
        upazila,
        address,
        profilePhotoUrl,
        shopPhotoUrl,
        nidUrl,
        payoutMethod,
        bkashNumber: bkashNumber.trim(),
        nagadNumber: nagadNumber.trim(),
        rocketNumber: rocketNumber.trim(),
        bankName: bankName.trim(),
        accountNumber: accountNumber.trim(),
        accountHolderName: accountHolderName.trim(),
        branchName: branchName.trim(),
        role,
        status,
        rejectReason: null,
        plainPassword: password,
        createdAt: serverTimestamp(),
      });

      onRegistered();
    } catch (err: any) {
      console.error('Registration submit error:', err);
      let msg = 'Failed to register account. Please try again.';
      if (err.code === 'auth/email-already-in-use') {
        msg = 'This email address is already registered. If you registered before, please sign in.';
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
        <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 py-6 px-8 text-white text-center flex flex-col items-center justify-center border-b border-slate-800">
          <div className="mb-2">
            <SkyLogo size="lg" showText={true} />
          </div>
          <p className="text-blue-200/80 text-xs font-medium">B2B Reseller Portal • Registration Form</p>
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
                  onChange={(e) => {
                    const val = e.target.value;
                    setMobile(val);
                    if (sameAsMobile) {
                      setWhatsappNumber(val);
                    }
                  }}
                  placeholder="01712345678"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm"
                />
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">Used for login identification & verification</span>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  WhatsApp Number *
                </label>
                <label className="flex items-center gap-1 text-[11px] text-emerald-700 font-medium cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={sameAsMobile}
                    onChange={(e) => {
                      const isChecked = e.target.checked;
                      setSameAsMobile(isChecked);
                      if (isChecked) {
                        setWhatsappNumber(mobile);
                      }
                    }}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5 cursor-pointer"
                  />
                  <span>Same as mobile</span>
                </label>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-emerald-600">
                  <MessageCircle className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  value={sameAsMobile ? mobile : whatsappNumber}
                  disabled={sameAsMobile}
                  onChange={(e) => setWhatsappNumber(e.target.value)}
                  placeholder="01712345678"
                  className={`w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-600 focus:border-transparent text-sm ${
                    sameAsMobile ? 'bg-slate-50 text-slate-700 cursor-not-allowed' : 'bg-white'
                  }`}
                />
              </div>
              <span className="text-[10px] text-emerald-600 font-medium mt-1 block">For order updates & instant support</span>
            </div>
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

          {/* Payout Account Details (Optional / Recommended at Registration) */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
            <div>
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <span>Default Payout Account</span>
                <span className="text-[10px] text-blue-600 bg-blue-50 border border-blue-200 font-semibold px-2 py-0.5 rounded-full lowercase">
                  For earning withdrawals
                </span>
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">Select how you want to receive your commission earnings.</p>
            </div>

            {/* Payout Method Selection Tabs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { id: 'bkash', name: 'bKash', color: 'border-pink-500 bg-pink-50 text-pink-700' },
                { id: 'nagad', name: 'Nagad', color: 'border-amber-500 bg-amber-50 text-amber-700' },
                { id: 'rocket', name: 'Rocket', color: 'border-purple-500 bg-purple-50 text-purple-700' },
                { id: 'bank', name: 'Bank Transfer', color: 'border-blue-500 bg-blue-50 text-blue-700' },
              ].map((m) => (
                <button
                  type="button"
                  key={m.id}
                  onClick={() => setPayoutMethod(m.id as any)}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all text-center ${
                    payoutMethod === m.id
                      ? `${m.color} shadow-xs`
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {m.name}
                </button>
              ))}
            </div>

            {/* Method Inputs */}
            {payoutMethod === 'bkash' && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  bKash Personal / Agent Number
                </label>
                <input
                  type="text"
                  value={bkashNumber}
                  onChange={(e) => setBkashNumber(e.target.value)}
                  placeholder="01712345678"
                  className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-pink-500"
                />
              </div>
            )}

            {payoutMethod === 'nagad' && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Nagad Personal / Agent Number
                </label>
                <input
                  type="text"
                  value={nagadNumber}
                  onChange={(e) => setNagadNumber(e.target.value)}
                  placeholder="01812345678"
                  className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-amber-500"
                />
              </div>
            )}

            {payoutMethod === 'rocket' && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Rocket Mobile Number
                </label>
                <input
                  type="text"
                  value={rocketNumber}
                  onChange={(e) => setRocketNumber(e.target.value)}
                  placeholder="01912345678"
                  className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-purple-500"
                />
              </div>
            )}

            {payoutMethod === 'bank' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Bank Name
                  </label>
                  <input
                    type="text"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="Dutch Bangla Bank Ltd"
                    className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Account Holder Name
                  </label>
                  <input
                    type="text"
                    value={accountHolderName}
                    onChange={(e) => setAccountHolderName(e.target.value)}
                    placeholder="Md. Rahim Uddin"
                    className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Account Number
                  </label>
                  <input
                    type="text"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    placeholder="151.110.XXXXXX"
                    className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Branch Name
                  </label>
                  <input
                    type="text"
                    value={branchName}
                    onChange={(e) => setBranchName(e.target.value)}
                    placeholder="Gulshan Branch, Dhaka"
                    className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}
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
            disabled={loading || !isOnline}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-xl transition-colors shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 text-sm disabled:opacity-50"
          >
            {loading ? 'Submitting Application...' : !isOnline ? 'Offline - Connection Required' : 'Submit Reseller Registration'}
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
