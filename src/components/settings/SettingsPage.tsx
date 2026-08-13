import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserProfile, CompanySettings } from '../../types';
import { logAuditAction } from '../../lib/auditLogger';
import { SkyLogo } from '../common/SkyLogo';
import { VersionManagerForm } from '../version/VersionManagerForm';
import { 
  Settings, Building2, Phone, Mail, MapPin, DollarSign, 
  Percent, Truck, Image as ImageIcon, Save, ArrowRight, Loader2, CheckCircle2, Shield
} from 'lucide-react';

interface SettingsPageProps {
  user: UserProfile;
  onNavigateCommission?: () => void;
}

const DEFAULT_SETTINGS: CompanySettings = {
  companyName: 'Sky Automation Tech',
  logoUrl: '',
  address: 'House-12, Road-04, Block-B, Mirpur, Dhaka, Bangladesh',
  phoneNumbers: '01577351518, 01571542070',
  email: 'skyautomationtech@gmail.com',
  currencySymbol: '৳ BDT',
  vatPercentage: 0,
  defaultDeliveryCharge: 100,
};

export const SettingsPage: React.FC<SettingsPageProps> = ({ user, onNavigateCommission }) => {
  const isSuperAdmin = user.role === 'super_admin';
  const [settings, setSettings] = useState<CompanySettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const docRef = doc(db, 'settings', 'general');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setSettings({ ...DEFAULT_SETTINGS, ...docSnap.data() });
      }
    } catch (err) {
      console.error('Error fetching settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('Logo image size must be under 2MB.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setSettings((prev) => ({ ...prev, logoUrl: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleBannerUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 3 * 1024 * 1024) {
        alert('Banner image size must be under 3MB.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const newUrl = reader.result as string;
        setSettings((prev) => ({
          ...prev,
          bannerImages: [...(prev.bannerImages || []), newUrl],
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveBanner = (index: number) => {
    setSettings((prev) => ({
      ...prev,
      bannerImages: (prev.bannerImages || []).filter((_, i) => i !== index),
    }));
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin) return;

    setSaving(true);
    setSuccess('');
    setError('');

    try {
      const docRef = doc(db, 'settings', 'general');
      await setDoc(docRef, {
        ...settings,
        updatedAt: serverTimestamp(),
      });

      await logAuditAction(
        user.uid,
        user.fullName,
        user.role,
        'UPDATE_COMPANY_SETTINGS',
        'settings/general',
        `Updated company settings for ${settings.companyName}`
      );

      setSuccess('Company settings saved successfully!');
    } catch (err) {
      console.error('Error saving settings:', err);
      setError('Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400 space-y-2 bg-white rounded-2xl border border-slate-200">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <p className="text-xs font-medium">Loading system configuration...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-md shadow-blue-600/30">
            <Settings className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">General Portal Settings</h2>
            <p className="text-xs text-slate-500 mt-0.5">Configure company branding, support contacts, tax, and default delivery rates.</p>
          </div>
        </div>

        {!isSuperAdmin && (
          <div className="px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs font-bold flex items-center gap-2">
            <Shield className="w-4 h-4 text-amber-600" />
            <span>Read-Only Mode (Super Admin restricted)</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSaveSettings} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        {success && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{success}</span>
          </div>
        )}
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-bold">
            {error}
          </div>
        )}

        {/* Company Identity */}
        <div className="space-y-4">
          <h3 className="font-bold text-xs text-slate-400 uppercase tracking-wider">Company Identity & Logo</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Company / Brand Name</label>
              <input
                type="text"
                value={settings.companyName}
                onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
                disabled={!isSuperAdmin}
                className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-xs rounded-xl px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-70 font-semibold"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Company Logo</label>
              <div className="flex items-center gap-3">
                <div className="p-2 border border-slate-200 rounded-xl bg-slate-900">
                  <SkyLogo size="md" showText={true} customLogoUrl={settings.logoUrl} />
                </div>

                {isSuperAdmin && (
                  <label className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold text-xs rounded-xl cursor-pointer transition-colors shrink-0">
                    <span>Upload New Logo</span>
                    <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                  </label>
                )}
              </div>
            </div>
          </div>

          {/* Promotional Banner Images for Reseller Storefront */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold text-slate-700">Reseller Home Banner Carousel Images</label>
              {isSuperAdmin && (
                <label className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-xl cursor-pointer border border-blue-200 inline-flex items-center gap-1">
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>Add Banner Image</span>
                  <input type="file" accept="image/*" onChange={handleBannerUpload} className="hidden" />
                </label>
              )}
            </div>

            {(!settings.bannerImages || settings.bannerImages.length === 0) ? (
              <p className="text-xs text-slate-400 bg-slate-50 p-3 rounded-xl border border-dashed border-slate-200">
                No custom banner images uploaded. The reseller storefront is using default brand hero banner.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {settings.bannerImages.map((imgUrl, idx) => (
                  <div key={idx} className="relative group rounded-xl overflow-hidden border border-slate-200 bg-slate-100 aspect-[21/9]">
                    <img src={imgUrl} alt={`Banner ${idx + 1}`} className="w-full h-full object-cover" />
                    {isSuperAdmin && (
                      <button
                        type="button"
                        onClick={() => handleRemoveBanner(idx)}
                        className="absolute top-2 right-2 bg-rose-600 text-white text-[10px] font-bold px-2 py-1 rounded-md opacity-90 hover:opacity-100 shadow-md"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Contact Information */}
        <div className="space-y-4 pt-4 border-t border-slate-100">
          <h3 className="font-bold text-xs text-slate-400 uppercase tracking-wider">Contact & Location</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Support Phone Numbers (comma separated)</label>
              <input
                type="text"
                value={settings.phoneNumbers}
                onChange={(e) => setSettings({ ...settings, phoneNumbers: e.target.value })}
                disabled={!isSuperAdmin}
                className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-xs rounded-xl px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-70 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Official Email Address</label>
              <input
                type="email"
                value={settings.email}
                onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                disabled={!isSuperAdmin}
                className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-xs rounded-xl px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-70 font-mono"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">Head Office Address</label>
              <textarea
                rows={2}
                value={settings.address}
                onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                disabled={!isSuperAdmin}
                className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-xs rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-70"
              />
            </div>
          </div>
        </div>

        {/* Commerce & Billing Defaults */}
        <div className="space-y-4 pt-4 border-t border-slate-100">
          <h3 className="font-bold text-xs text-slate-400 uppercase tracking-wider">Commerce & Billing Rates</h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Currency Symbol</label>
              <input
                type="text"
                value={settings.currencySymbol}
                disabled
                className="w-full bg-slate-100 border border-slate-200 text-slate-500 text-xs rounded-xl px-3.5 py-2.5 outline-none font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">VAT Percentage (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={settings.vatPercentage}
                onChange={(e) => setSettings({ ...settings, vatPercentage: Number(e.target.value) })}
                disabled={!isSuperAdmin}
                className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-xs rounded-xl px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-70"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Default Delivery Charge (BDT)</label>
              <input
                type="number"
                min="0"
                value={settings.defaultDeliveryCharge}
                onChange={(e) => setSettings({ ...settings, defaultDeliveryCharge: Number(e.target.value) })}
                disabled={!isSuperAdmin}
                className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-xs rounded-xl px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-70"
              />
            </div>
          </div>
        </div>

        {/* Commission Settings Shortcut */}
        {onNavigateCommission && (
          <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 flex items-center justify-between">
            <div>
              <h4 className="font-bold text-xs text-blue-900">Commission & Bonus Logic</h4>
              <p className="text-[11px] text-blue-700 mt-0.5">Manage default commission percentages, fixed rules, and monthly bonus targets.</p>
            </div>
            <button
              type="button"
              onClick={onNavigateCommission}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs"
            >
              <span>Manage Commission</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Save Button */}
        {isSuperAdmin && (
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-600/20 transition-all"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>Save Settings</span>
            </button>
          </div>
        )}
      </form>

      {/* App Version & Changelog Management (Super Admin) */}
      {isSuperAdmin && (
        <div className="pt-4">
          <VersionManagerForm user={user} />
        </div>
      )}
    </div>
  );
};
