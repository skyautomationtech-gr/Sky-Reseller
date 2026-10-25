import React, { useState, useEffect } from 'react';
import { updatePassword } from 'firebase/auth';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { UserProfile } from '../../types';
import { BANGLADESH_GEO } from '../../data/bangladeshGeo';
import { logAuditAction } from '../../lib/auditLogger';
import { formatResellerId } from '../../lib/resellerIdHelper';
import { checkShopNameAvailability, updateShopNameAtomic } from '../../lib/shopNameService';
import { normalizeShopName } from '../../utils/shopName';
import { 
  User, Store, Phone, MapPin, Key, Image as ImageIcon, 
  Save, Lock, CheckCircle2, AlertCircle, Loader2, Shield, MessageCircle, Tag
} from 'lucide-react';

interface ResellerProfilePageProps {
  user: UserProfile;
}

export const ResellerProfilePage: React.FC<ResellerProfilePageProps> = ({ user }) => {
  // Profile Form State
  const [shopName, setShopName] = useState(user.shopName || '');
  const [mobile, setMobile] = useState(user.mobile || '');
  const [whatsappNumber, setWhatsappNumber] = useState(user.whatsappNumber || user.mobile || '');
  const [division, setDivision] = useState(user.division || '');
  const [district, setDistrict] = useState(user.district || '');
  const [upazila, setUpazila] = useState(user.upazila || '');
  const [address, setAddress] = useState(user.address || '');
  const [profilePhotoUrl, setProfilePhotoUrl] = useState(user.profilePhotoUrl || '');
  const [shopPhotoUrl, setShopPhotoUrl] = useState(user.shopPhotoUrl || '');

  // Live shop name check state
  const [shopNameCheck, setShopNameCheck] = useState<{
    status: 'idle' | 'checking' | 'available' | 'taken';
    message: string;
  }>({ status: 'idle', message: '' });

  useEffect(() => {
    const raw = shopName.trim();
    if (!raw || raw.length < 2) {
      setShopNameCheck({ status: 'idle', message: '' });
      return;
    }
    // If it matches their existing name, allow keeping their own existing name
    if (normalizeShopName(raw) === normalizeShopName(user.shopName || '')) {
      setShopNameCheck({ status: 'available', message: 'Current shop name' });
      return;
    }

    setShopNameCheck({ status: 'checking', message: 'Checking...' });
    const timer = setTimeout(async () => {
      try {
        const res = await checkShopNameAvailability(raw, user.uid);
        if (res.available) {
          setShopNameCheck({ status: 'available', message: 'Shop name is available' });
        } else {
          setShopNameCheck({ status: 'taken', message: 'This shop name is already taken. Please choose a different name.' });
        }
      } catch (_e) {
        setShopNameCheck({ status: 'idle', message: '' });
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [shopName, user.shopName, user.uid]);

  // Password Form State
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // Save Profile State
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState('');
  const [profileError, setProfileError] = useState('');

  const divisions = Object.keys(BANGLADESH_GEO);
  const districts = division && BANGLADESH_GEO[division] ? Object.keys(BANGLADESH_GEO[division]) : [];
  const upazilas = division && district && BANGLADESH_GEO[division]?.[district] ? BANGLADESH_GEO[division][district] : [];

  const handleImageUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: React.Dispatch<React.SetStateAction<string>>
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('Image file size must be under 2MB.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setter(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (shopNameCheck.status === 'taken') {
      setProfileError('This shop name is already taken. Please choose a different name.');
      return;
    }

    setSavingProfile(true);
    setProfileSuccess('');
    setProfileError('');

    try {
      const cleanShopName = shopName.trim();
      const shopNameKey = normalizeShopName(cleanShopName);
      const oldKey = user.shopNameKey || normalizeShopName(user.shopName || '');

      // If shop name changed, update reservation atomically in one transaction
      if (shopNameKey !== oldKey) {
        try {
          await updateShopNameAtomic(cleanShopName, user.uid);
        } catch (resErr: any) {
          if (resErr.message?.includes('already taken')) {
            setProfileError('This shop name is already taken. Please choose a different name.');
            setSavingProfile(false);
            return;
          }
          throw resErr;
        }
      }

      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        shopName: cleanShopName,
        shopNameKey,
        mobile,
        whatsappNumber,
        division,
        district,
        upazila,
        address,
        profilePhotoUrl,
        shopPhotoUrl,
        updatedAt: serverTimestamp(),
      });

      await logAuditAction(
        user.uid,
        user.fullName,
        user.role,
        'UPDATE_RESELLER_PROFILE',
        user.uid,
        `Updated reseller profile details for ${user.fullName}`
      );

      setProfileSuccess('Profile updated successfully!');
    } catch (err: any) {
      console.error('Error updating profile:', err);
      setProfileError(err.message || 'Failed to update profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }

    setPasswordSubmitting(true);
    setPasswordSuccess('');
    setPasswordError('');

    try {
      if (auth.currentUser) {
        await updatePassword(auth.currentUser, newPassword);
        setPasswordSuccess('Password updated successfully!');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setPasswordError('User auth session invalid. Please log in again.');
      }
    } catch (err: any) {
      console.error('Error changing password:', err);
      setPasswordError(err.message || 'Failed to update password. You may need to re-authenticate.');
    } finally {
      setPasswordSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-md shadow-blue-600/30">
            <User className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900">Reseller Profile Settings</h2>
              <span className="inline-flex items-center gap-1 font-mono text-xs font-extrabold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-lg border border-blue-200">
                <Tag className="w-3 h-3 text-blue-500" />
                {formatResellerId(user)}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">Manage shop branding, contact information, and account security.</p>
          </div>
        </div>
        <span className="px-3 py-1 bg-emerald-50 text-emerald-700 font-bold text-xs rounded-xl border border-emerald-200 uppercase">
          Status: {user.status}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Profile Information Form */}
        <form onSubmit={handleSaveProfile} className="lg:col-span-8 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5">
          <h3 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
            <Store className="w-4 h-4 text-blue-600" />
            <span>Business & Personal Information</span>
          </h3>

          {profileSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{profileSuccess}</span>
            </div>
          )}
          {profileError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-bold">
              {profileError}
            </div>
          )}

          {/* Photos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Profile Photo</label>
              <div className="flex items-center gap-3">
                {profilePhotoUrl ? (
                  <img src={profilePhotoUrl} alt="Profile" className="w-12 h-12 rounded-xl object-cover border" />
                ) : (
                  <div className="w-12 h-12 bg-slate-100 text-slate-500 font-bold text-lg rounded-xl flex items-center justify-center border">
                    {(user.fullName || 'U').charAt(0)}
                  </div>
                )}
                <label className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer">
                  <span>Change Photo</span>
                  <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, setProfilePhotoUrl)} className="hidden" />
                </label>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Shop / Store Banner</label>
              <div className="flex items-center gap-3">
                {shopPhotoUrl ? (
                  <img src={shopPhotoUrl} alt="Shop" className="w-12 h-12 rounded-xl object-cover border" />
                ) : (
                  <div className="w-12 h-12 bg-slate-100 text-slate-500 font-bold text-xs rounded-xl flex items-center justify-center border">
                    No Image
                  </div>
                )}
                <label className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer">
                  <span>Change Banner</span>
                  <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, setShopPhotoUrl)} className="hidden" />
                </label>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Full Name (Registered)</label>
              <input
                type="text"
                value={user.fullName}
                disabled
                className="w-full bg-slate-100 border border-slate-200 text-slate-500 text-xs rounded-xl px-3.5 py-2.5 font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
              <input
                type="text"
                value={user.email}
                disabled
                className="w-full bg-slate-100 border border-slate-200 text-slate-500 text-xs rounded-xl px-3.5 py-2.5 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                <span>Reseller Shop Name</span>
                {shopNameCheck.status === 'available' && (
                  <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-0.5">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Available
                  </span>
                )}
                {shopNameCheck.status === 'taken' && (
                  <span className="text-[10px] text-red-600 font-bold flex items-center gap-0.5">
                    <AlertCircle className="w-3 h-3 text-red-600" /> Taken
                  </span>
                )}
              </label>
              <input
                type="text"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                className={`w-full bg-slate-50 border text-slate-900 text-xs rounded-xl px-3.5 py-2.5 outline-none font-semibold transition-all ${
                  shopNameCheck.status === 'taken'
                    ? 'border-red-400 focus:ring-2 focus:ring-red-400'
                    : shopNameCheck.status === 'available'
                    ? 'border-emerald-500 focus:ring-2 focus:ring-emerald-400'
                    : 'border-slate-300 focus:ring-2 focus:ring-blue-500'
                }`}
                required
              />
              {shopNameCheck.status === 'checking' && (
                <p className="text-[11px] text-amber-600 flex items-center gap-1 font-medium mt-1">
                  <Loader2 className="w-3 h-3 animate-spin text-amber-500 shrink-0" />
                  Checking availability...
                </p>
              )}
              {shopNameCheck.status === 'available' && (
                <p className="text-[11px] text-emerald-600 flex items-center gap-1 font-medium mt-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                  Shop name is available
                </p>
              )}
              {shopNameCheck.status === 'taken' && (
                <p className="text-[11px] text-red-600 flex items-center gap-1 font-medium mt-1">
                  <AlertCircle className="w-3 h-3 text-red-500 shrink-0" />
                  This shop name is already taken. Please choose a different name.
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Mobile Phone Number</label>
              <input
                type="text"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-xs rounded-xl px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-600 inline" />
                  <span>WhatsApp Number</span>
                </span>
                <button
                  type="button"
                  onClick={() => setWhatsappNumber(mobile)}
                  className="text-[10px] text-emerald-600 hover:text-emerald-700 font-medium"
                >
                  Copy from mobile
                </button>
              </label>
              <input
                type="text"
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(e.target.value)}
                placeholder="01712345678"
                className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-xs rounded-xl px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                required
              />
            </div>

            {/* Division, District, Upazila */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Division</label>
              <select
                value={division}
                onChange={(e) => {
                  setDivision(e.target.value);
                  setDistrict('');
                  setUpazila('');
                }}
                className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-xs rounded-xl px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select Division</option>
                {divisions.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">District</label>
              <select
                value={district}
                onChange={(e) => {
                  setDistrict(e.target.value);
                  setUpazila('');
                }}
                disabled={!division}
                className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-xs rounded-xl px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select District</option>
                {districts.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">Upazila / Thana</label>
              <select
                value={upazila}
                onChange={(e) => setUpazila(e.target.value)}
                disabled={!district}
                className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-xs rounded-xl px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select Upazila</option>
                {upazilas.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">Full Shop Address</label>
              <textarea
                rows={2}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-xs rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={savingProfile}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-md transition-all"
            >
              {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>Save Profile Details</span>
            </button>
          </div>
        </form>

        {/* Change Password Box */}
        <form onSubmit={handleChangePassword} className="lg:col-span-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4 h-fit">
          <h3 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
            <Key className="w-4 h-4 text-blue-600" />
            <span>Change Account Password</span>
          </h3>

          {passwordSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{passwordSuccess}</span>
            </div>
          )}
          {passwordError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-bold">
              {passwordError}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">New Password</label>
            <input
              type="password"
              placeholder="At least 6 characters"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-xs rounded-xl px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Confirm New Password</label>
            <input
              type="password"
              placeholder="Re-type password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-xs rounded-xl px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <button
            type="submit"
            disabled={passwordSubmitting}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-sm transition-all"
          >
            {passwordSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
            <span>Update Password</span>
          </button>
        </form>
      </div>
    </div>
  );
};
