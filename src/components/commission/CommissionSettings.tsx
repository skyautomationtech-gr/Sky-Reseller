import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, serverTimestamp, collection, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Category, CategoryCommissionOverride, CommissionSettings, CommissionType } from '../../types';
import { 
  Percent, DollarSign, Award, Check, Loader2, AlertCircle, Sparkles, Layers, Plus, Trash2, Settings
} from 'lucide-react';

export const CommissionSettingsView: React.FC = () => {
  const [settings, setSettings] = useState<CommissionSettings>({
    defaultType: 'sell_amount',
    percentageValue: 10,
    fixedValue: 100,
    monthlyBonusThresholdOrders: 50,
    monthlyBonusAmount: 1000,
    categoryOverrides: [],
  });

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Category Override state
  const [selectedCatId, setSelectedCatId] = useState('');
  const [overrideType, setOverrideType] = useState<CommissionType>('percentage');
  const [overrideVal, setOverrideVal] = useState<number>(10);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      // Fetch global settings
      const setDocRef = doc(db, 'commissionSettings', 'global');
      const setSnap = await getDoc(setDocRef);
      if (setSnap.exists()) {
        setSettings(setSnap.data() as CommissionSettings);
      }

      // Fetch active categories
      const catSnap = await getDocs(collection(db, 'categories'));
      const catList: Category[] = [];
      catSnap.forEach((d) => catList.push(Object.assign({ id: d.id }, d.data()) as unknown as Category));
      setCategories(catList);
    } catch (err: any) {
      console.error('Error loading commission settings:', err);
      setError('Failed to load settings.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccessMsg('');

    try {
      const setDocRef = doc(db, 'commissionSettings', 'global');
      await setDoc(setDocRef, {
        ...settings,
        updatedAt: serverTimestamp(),
      });

      setSuccessMsg('Commission & bonus settings updated successfully!');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      console.error('Save error:', err);
      setError(err.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddOverride = () => {
    if (!selectedCatId) return;
    const cat = categories.find((c) => c.id === selectedCatId);
    if (!cat) return;

    const existingOverrides = settings.categoryOverrides || [];
    const filtered = existingOverrides.filter((o) => o.categoryId !== selectedCatId);

    const newOverride: CategoryCommissionOverride = {
      categoryId: cat.id,
      categoryName: cat.name,
      commissionType: overrideType,
      value: overrideVal,
    };

    setSettings({
      ...settings,
      categoryOverrides: [...filtered, newOverride],
    });

    setSelectedCatId('');
  };

  const handleRemoveOverride = (catId: string) => {
    setSettings({
      ...settings,
      categoryOverrides: (settings.categoryOverrides || []).filter((o) => o.categoryId !== catId),
    });
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2 bg-white rounded-2xl border border-slate-200">
        <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
        <span>Loading commission configuration...</span>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <Percent className="w-6 h-6 text-blue-600" />
          <span>Commission & Monthly Bonus Rules</span>
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Configure default reseller earnings, category-specific rule overrides, and monthly performance targets
        </p>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-2 font-bold">
          <Check className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* 1. Default Commission Type Selector */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <label className="block text-xs font-bold text-slate-900 uppercase tracking-wider">
            1. System Default Commission Calculation Mode
          </label>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              {
                type: 'sell_amount',
                title: 'Sell Amount Based',
                desc: 'Reseller earns full (Retail Price - Reseller Price) margin set on product. Default & Recommended.',
              },
              {
                type: 'percentage',
                title: 'Percentage of Retail',
                desc: 'Calculates commission as a percentage of total retail order amount.',
              },
              {
                type: 'fixed',
                title: 'Fixed Amount per Unit',
                desc: 'Fixed BDT amount credited to reseller for each delivered order item.',
              },
            ].map((item) => {
              const isSelected = settings.defaultType === item.type;
              return (
                <div
                  key={item.type}
                  onClick={() => setSettings({ ...settings, defaultType: item.type as CommissionType })}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-blue-50/80 border-blue-600 ring-2 ring-blue-500/30'
                      : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-xs text-slate-900">{item.title}</span>
                    {isSelected && <Sparkles className="w-4 h-4 text-blue-600" />}
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">{item.desc}</p>
                </div>
              );
            })}
          </div>

          {/* Conditional Inputs */}
          {settings.defaultType === 'percentage' && (
            <div className="pt-2 max-w-xs">
              <label className="block text-xs font-bold text-slate-700 mb-1">Default Commission Percentage (%)</label>
              <div className="relative">
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={settings.percentageValue}
                  onChange={(e) => setSettings({ ...settings, percentageValue: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  required
                />
                <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-bold">%</span>
              </div>
            </div>
          )}

          {settings.defaultType === 'fixed' && (
            <div className="pt-2 max-w-xs">
              <label className="block text-xs font-bold text-slate-700 mb-1">Fixed Commission Amount per Unit (BDT)</label>
              <div className="relative">
                <input
                  type="number"
                  min={1}
                  value={settings.fixedValue}
                  onChange={(e) => setSettings({ ...settings, fixedValue: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  required
                />
                <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-bold">BDT</span>
              </div>
            </div>
          )}
        </div>

        {/* 2. Monthly Bonus Settings */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <label className="block text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-500" />
            <span>2. Monthly Reseller Performance Bonus</span>
          </label>

          <p className="text-xs text-slate-500">
            Automatically award a bonus payout when a reseller reaches a target count of delivered orders in a calendar month.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Delivered Orders Target Threshold</label>
              <input
                type="number"
                min={1}
                placeholder="e.g. 50"
                value={settings.monthlyBonusThresholdOrders}
                onChange={(e) => setSettings({ ...settings, monthlyBonusThresholdOrders: parseInt(e.target.value) || 0 })}
                className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Bonus Reward Amount (BDT)</label>
              <input
                type="number"
                min={0}
                placeholder="e.g. 1000"
                value={settings.monthlyBonusAmount}
                onChange={(e) => setSettings({ ...settings, monthlyBonusAmount: parseFloat(e.target.value) || 0 })}
                className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                required
              />
            </div>
          </div>
        </div>

        {/* 3. Category Overrides */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <label className="block text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <Layers className="w-4 h-4 text-purple-600" />
            <span>3. Category-Wise Commission Overrides (Optional)</span>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div className="sm:col-span-1">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Category</label>
              <select
                value={selectedCatId}
                onChange={(e) => setSelectedCatId(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none"
              >
                <option value="">Select Category...</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Type</label>
              <select
                value={overrideType}
                onChange={(e) => setOverrideType(e.target.value as CommissionType)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none"
              >
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed BDT</option>
                <option value="sell_amount">Sell Amount Margin</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Value</label>
              <input
                type="number"
                value={overrideVal}
                onChange={(e) => setOverrideVal(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none"
              />
            </div>

            <button
              type="button"
              onClick={handleAddOverride}
              className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs px-3 py-2 rounded-xl flex items-center justify-center gap-1"
            >
              <Plus className="w-4 h-4" />
              <span>Add Rule</span>
            </button>
          </div>

          {settings.categoryOverrides && settings.categoryOverrides.length > 0 && (
            <div className="space-y-2 pt-2">
              {settings.categoryOverrides.map((ov) => (
                <div key={ov.categoryId} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl text-xs">
                  <div>
                    <span className="font-bold text-slate-900">{ov.categoryName}</span>
                    <span className="text-[11px] text-slate-500 ml-2">
                      ({ov.commissionType === 'percentage' ? `${ov.value}%` : ov.commissionType === 'fixed' ? `৳${ov.value} Fixed` : 'Sell Amount'})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveOverride(ov.categoryId)}
                    className="p-1 text-slate-400 hover:text-rose-600 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-600/30 flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            <span>Save Settings</span>
          </button>
        </div>
      </form>
    </div>
  );
};
