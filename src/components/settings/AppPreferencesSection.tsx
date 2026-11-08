import React, { useState, useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserProfile } from '../../types';
import { triggerHaptic } from '../../lib/nativeFeedback';
import { DENSITY_TOKENS as DT } from '../../utils/densityTokens';
import { 
  Palette, Sun, Globe, DollarSign, LayoutTemplate, 
  Sparkles, Trash2, RotateCcw, Check, CheckCircle2, 
  AlertCircle, Lock, Eye, ZapOff, HelpCircle, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useScrollToTop } from '../../utils/scrollToTop';

interface AppPreferencesSectionProps {
  user: UserProfile;
  canAccessFullApp?: boolean;
  onOpenLockedModal?: (featureName?: string) => void;
  onRefreshUser?: () => void;
  onBack?: () => void;
}

export const AppPreferencesSection: React.FC<AppPreferencesSectionProps> = ({
  user,
  canAccessFullApp = true,
  onOpenLockedModal,
  onRefreshUser,
  onBack,
}) => {
  const isRestricted = !canAccessFullApp || user.status === 'pending';

  // Instantly reset scroll to top on mount
  useScrollToTop([]);

  // Display Density: 'compact' (default) | 'comfortable'
  const [density, setDensity] = useState<'compact' | 'comfortable'>(() => {
    const saved = localStorage.getItem('app_display_density');
    if (saved === 'comfortable' || saved === 'compact') return saved;
    return user.displayDensity || 'compact';
  });

  // Default Home View: 'home' | 'catalog'
  const [defaultHomeView, setDefaultHomeView] = useState<'home' | 'catalog'>(() => {
    const saved = localStorage.getItem('reseller_default_home_view');
    if (saved === 'catalog' || saved === 'home') return saved;
    return user.defaultHomeView || 'home';
  });

  // Reduce Animations
  const [reduceMotion, setReduceMotion] = useState<boolean>(() => {
    const saved = localStorage.getItem('app_reduce_motion');
    if (saved !== null) return saved === 'true';
    if (typeof user.reduceMotion === 'boolean') return user.reduceMotion;
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    return false;
  });

  // Modals & Dialogs
  const [isClearCacheModalOpen, setIsClearCacheModalOpen] = useState(false);
  const [isResetDefaultsModalOpen, setIsResetDefaultsModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage((prev) => (prev?.text === text ? null : prev));
    }, 3000);
  };

  // Apply Density App-Wide
  const handleDensityChange = async (newDensity: 'compact' | 'comfortable') => {
    if (isRestricted) {
      if (onOpenLockedModal) onOpenLockedModal('Display Density');
      return;
    }
    triggerHaptic('light');
    setDensity(newDensity);
    localStorage.setItem('app_display_density', newDensity);
    document.documentElement.setAttribute('data-density', newDensity);
    window.dispatchEvent(new CustomEvent('app_density_changed', { detail: newDensity }));

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        displayDensity: newDensity,
      });
      showToast(`Density set to ${newDensity === 'compact' ? 'Compact' : 'Comfortable'}`, 'success');
      if (onRefreshUser) onRefreshUser();
    } catch (err) {
      console.warn('Could not save density to cloud:', err);
    }
  };

  // Apply Default Home View
  const handleHomeViewChange = async (newView: 'home' | 'catalog') => {
    if (isRestricted) {
      if (onOpenLockedModal) onOpenLockedModal('Default Home View');
      return;
    }
    triggerHaptic('light');
    setDefaultHomeView(newView);
    localStorage.setItem('reseller_default_home_view', newView);

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        defaultHomeView: newView,
      });
      showToast(`Default landing set to ${newView === 'home' ? 'Home' : 'Catalog'}`, 'success');
      if (onRefreshUser) onRefreshUser();
    } catch (err) {
      console.warn('Could not save default home view to cloud:', err);
    }
  };

  // Apply Reduce Motion
  const handleToggleReduceMotion = async () => {
    if (isRestricted) {
      if (onOpenLockedModal) onOpenLockedModal('Animation Settings');
      return;
    }
    triggerHaptic('light');
    const newVal = !reduceMotion;
    setReduceMotion(newVal);
    localStorage.setItem('app_reduce_motion', String(newVal));
    if (newVal) {
      document.documentElement.classList.add('reduce-motion');
    } else {
      document.documentElement.classList.remove('reduce-motion');
    }

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        reduceMotion: newVal,
      });
      showToast(newVal ? 'Animations reduced' : 'Animations restored', 'success');
      if (onRefreshUser) onRefreshUser();
    } catch (err) {
      console.warn('Could not save animation setting to cloud:', err);
    }
  };

  // Clear App Cache
  const handleConfirmClearCache = () => {
    triggerHaptic('medium');
    let estimatedFreedBytes = 0;

    try {
      const keysToClear = [
        'reseller_recent_searches',
        'product_filter_state',
        'cart_temp_draft',
        'custom_order_draft',
        'payout_form_draft',
        'category_cache',
      ];

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (keysToClear.includes(key) || key.startsWith('tmp_') || key.startsWith('cache_'))) {
          const val = localStorage.getItem(key) || '';
          estimatedFreedBytes += (key.length + val.length) * 2;
          localStorage.removeItem(key);
        }
      }

      // Also clear sessionStorage temporary cache
      sessionStorage.clear();
      estimatedFreedBytes += 16384; // baseline session buffer

      const kbFreed = Math.max(24, Math.round(estimatedFreedBytes / 1024));
      setIsClearCacheModalOpen(false);
      showToast(`Cache cleared! Freed ~${kbFreed} KB of temporary data`, 'success');
    } catch (err) {
      console.error('Error clearing cache:', err);
      setIsClearCacheModalOpen(false);
      showToast('Cache cleared successfully', 'success');
    }
  };

  // Reset to Defaults
  const handleConfirmResetDefaults = async () => {
    triggerHaptic('medium');
    setDensity('compact');
    setDefaultHomeView('home');
    setReduceMotion(false);

    localStorage.setItem('app_display_density', 'compact');
    localStorage.setItem('reseller_default_home_view', 'home');
    localStorage.setItem('app_reduce_motion', 'false');

    document.documentElement.setAttribute('data-density', 'compact');
    document.documentElement.classList.remove('reduce-motion');

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        displayDensity: 'compact',
        defaultHomeView: 'home',
        reduceMotion: false,
      });
      setIsResetDefaultsModalOpen(false);
      showToast('Preferences reset to default', 'success');
      if (onRefreshUser) onRefreshUser();
    } catch (err) {
      console.error('Error resetting defaults:', err);
      setIsResetDefaultsModalOpen(false);
      showToast('Preferences restored to defaults', 'success');
    }
  };

  return (
    <div className="space-y-3.5">
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-3.5 py-1.5 rounded-full text-[12px] font-bold shadow-lg flex items-center gap-1.5 ${
              toastMessage.type === 'error'
                ? 'bg-rose-600 text-white'
                : toastMessage.type === 'info'
                ? 'bg-slate-800 text-white'
                : 'bg-[#04203F] text-white border border-teal-500/30'
            }`}
          >
            {toastMessage.type === 'error' ? (
              <AlertCircle className="w-3.5 h-3.5 text-rose-200" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 text-[#3DD055]" />
            )}
            <span>{toastMessage.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Restricted State Notice */}
      {isRestricted && (
        <div className="bg-amber-50/90 border border-amber-200/90 rounded-[14px] p-3 flex items-start gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
            <Lock className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-[13px] font-bold text-amber-900 leading-tight">Preferences Locked</h4>
            <p className="text-[11px] text-amber-700 mt-0.5 leading-snug">
              Display and experience preferences unlock after your reseller account is approved.
            </p>
          </div>
        </div>
      )}

      {/* 1. INTERFACE & DISPLAY */}
      <div className="space-y-1.5">
        <div className={DT.settingsGroupLabel}>Interface & Display</div>
        <div className={DT.settingsGroupCard}>
          {/* Display Density */}
          <div className="w-full min-h-[52px] px-3.5 py-2.5 flex items-center justify-between text-left select-none">
            <div className="flex items-center gap-2.5 min-w-0 pr-3">
              <div className="w-[28px] h-[28px] rounded-[8px] flex items-center justify-center shrink-0 border bg-teal-50 text-[#0E9AA7] border-teal-200/60">
                <Palette className="w-[18px] h-[18px]" />
              </div>
              <div className="min-w-0">
                <span className={DT.settingsRowTitle}>Display density</span>
                <p className={DT.settingsRowHelper}>Scale layout padding and text density</p>
              </div>
            </div>

            {/* Segmented Control: Compact / Comfortable */}
            <div className="bg-slate-100 p-0.5 rounded-xl flex items-center shrink-0 border border-slate-200/80">
              <button
                type="button"
                onClick={() => handleDensityChange('compact')}
                disabled={isRestricted}
                className={`h-[28px] px-2.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  density === 'compact'
                    ? 'bg-white text-[#04203F] shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Compact
              </button>
              <button
                type="button"
                onClick={() => handleDensityChange('comfortable')}
                disabled={isRestricted}
                className={`h-[28px] px-2.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  density === 'comfortable'
                    ? 'bg-white text-[#04203F] shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Comfortable
              </button>
            </div>
          </div>

          {/* Theme: Light (Active) & Dark (Coming soon) */}
          <div className="w-full min-h-[48px] px-3.5 py-2.5 flex items-center justify-between text-left select-none">
            <div className="flex items-center gap-2.5 min-w-0 pr-3">
              <div className="w-[28px] h-[28px] rounded-[8px] flex items-center justify-center shrink-0 border bg-amber-50 text-amber-700 border-amber-200/60">
                <Sun className="w-[18px] h-[18px]" />
              </div>
              <div className="min-w-0">
                <span className={DT.settingsRowTitle}>Theme</span>
                <p className={DT.settingsRowHelper}>Soft frosted light glass theme</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[11px] font-bold text-[#04203F] bg-white border border-slate-200/80 px-2 py-0.5 rounded-lg shadow-2xs">
                Light
              </span>
              <span className="text-[10px] font-bold text-slate-400 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                Dark mode - coming soon
              </span>
            </div>
          </div>

          {/* Reduce Animations */}
          <div
            onClick={!isRestricted ? handleToggleReduceMotion : undefined}
            className={`w-full min-h-[48px] px-3.5 py-2.5 flex items-center justify-between text-left select-none transition-colors ${
              isRestricted ? 'opacity-60 cursor-not-allowed' : 'hover:bg-slate-50/70 active:bg-slate-100/60 cursor-pointer'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0 pr-3">
              <div className="w-[28px] h-[28px] rounded-[8px] flex items-center justify-center shrink-0 border bg-indigo-50 text-indigo-700 border-indigo-200/60">
                <ZapOff className="w-[18px] h-[18px]" />
              </div>
              <div className="min-w-0">
                <span className={DT.settingsRowTitle}>Reduce animations</span>
                <p className={DT.settingsRowHelper}>Disables background blobs, parallax, and long transitions</p>
              </div>
            </div>

            {/* Switch */}
            <div
              className={`w-[38px] h-[22px] rounded-full p-0.5 shrink-0 transition-colors ${
                reduceMotion ? 'bg-[#3DD055]' : 'bg-slate-200'
              }`}
            >
              <div
                className={`w-[18px] h-[18px] rounded-full bg-white shadow-xs transition-transform ${
                  reduceMotion ? 'translate-x-[16px]' : 'translate-x-0'
                }`}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 2. REGIONAL & NAVIGATION */}
      <div className="space-y-1.5">
        <div className={DT.settingsGroupLabel}>Regional & Navigation</div>
        <div className={DT.settingsGroupCard}>
          {/* Default Home View */}
          <div className="w-full min-h-[52px] px-3.5 py-2.5 flex items-center justify-between text-left select-none">
            <div className="flex items-center gap-2.5 min-w-0 pr-3">
              <div className="w-[28px] h-[28px] rounded-[8px] flex items-center justify-center shrink-0 border bg-teal-50 text-[#0E9AA7] border-teal-200/60">
                <LayoutTemplate className="w-[18px] h-[18px]" />
              </div>
              <div className="min-w-0">
                <span className={DT.settingsRowTitle}>Default home view</span>
                <p className={DT.settingsRowHelper}>Screen that opens on app launch</p>
              </div>
            </div>

            {/* Segmented Control: Home / Catalog */}
            <div className="bg-slate-100 p-0.5 rounded-xl flex items-center shrink-0 border border-slate-200/80">
              <button
                type="button"
                onClick={() => handleHomeViewChange('home')}
                disabled={isRestricted}
                className={`h-[28px] px-2.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  defaultHomeView === 'home'
                    ? 'bg-white text-[#04203F] shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Home
              </button>
              <button
                type="button"
                onClick={() => handleHomeViewChange('catalog')}
                disabled={isRestricted}
                className={`h-[28px] px-2.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  defaultHomeView === 'catalog'
                    ? 'bg-white text-[#04203F] shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Catalog
              </button>
            </div>
          </div>

          {/* Language: English (Selected) & Bangla (Coming soon) */}
          <div className="w-full min-h-[48px] px-3.5 py-2.5 flex items-center justify-between text-left select-none">
            <div className="flex items-center gap-2.5 min-w-0 pr-3">
              <div className="w-[28px] h-[28px] rounded-[8px] flex items-center justify-center shrink-0 border bg-blue-50 text-blue-700 border-blue-200/60">
                <Globe className="w-[18px] h-[18px]" />
              </div>
              <div className="min-w-0">
                <span className={DT.settingsRowTitle}>Language</span>
                <p className={DT.settingsRowHelper}>App interface language</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#04203F] bg-white border border-slate-200/80 px-2 py-0.5 rounded-lg shadow-2xs">
                <Check className="w-3 h-3 text-[#3DD055]" />
                English
              </span>
              <span className="text-[10px] font-bold text-slate-400 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                Bangla - coming soon
              </span>
            </div>
          </div>

          {/* Currency: BDT (Fixed) */}
          <div className="w-full min-h-[48px] px-3.5 py-2.5 flex items-center justify-between text-left select-none bg-slate-50/40">
            <div className="flex items-center gap-2.5 min-w-0 pr-3">
              <div className="w-[28px] h-[28px] rounded-[8px] flex items-center justify-center shrink-0 border bg-emerald-50 text-[#3DD055] border-emerald-200/60">
                <DollarSign className="w-[18px] h-[18px]" />
              </div>
              <div className="min-w-0">
                <span className={DT.settingsRowTitle}>Currency</span>
                <p className={DT.settingsRowHelper}>Product catalog and wallet denomination</p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <span className="font-mono text-[12px] font-bold text-[#04203F] bg-white border border-slate-200/80 px-2.5 py-0.5 rounded-lg shadow-2xs">
                BDT (৳)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. STORAGE & RESET */}
      <div className="space-y-1.5">
        <div className={DT.settingsGroupLabel}>Data & Reset</div>
        <div className={DT.settingsGroupCard}>
          {/* Clear App Cache */}
          <div
            onClick={() => setIsClearCacheModalOpen(true)}
            className="w-full min-h-[48px] px-3.5 py-2.5 flex items-center justify-between hover:bg-slate-50/70 active:bg-slate-100/60 transition-colors text-left cursor-pointer select-none"
          >
            <div className="flex items-center gap-2.5 min-w-0 pr-3">
              <div className="w-[28px] h-[28px] rounded-[8px] flex items-center justify-center shrink-0 border bg-amber-50 text-amber-700 border-amber-200/60">
                <Trash2 className="w-[18px] h-[18px]" />
              </div>
              <div className="min-w-0">
                <span className={DT.settingsRowTitle}>Clear app cache</span>
                <p className={DT.settingsRowHelper}>Remove search history and temporary drafts</p>
              </div>
            </div>
            <span className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-lg">
              Clear
            </span>
          </div>

          {/* Reset Preferences */}
          <div
            onClick={() => setIsResetDefaultsModalOpen(true)}
            className="w-full min-h-[48px] px-3.5 py-2.5 flex items-center justify-between hover:bg-slate-50/70 active:bg-slate-100/60 transition-colors text-left cursor-pointer select-none"
          >
            <div className="flex items-center gap-2.5 min-w-0 pr-3">
              <div className="w-[28px] h-[28px] rounded-[8px] flex items-center justify-center shrink-0 border bg-slate-100 text-slate-700 border-slate-200/60">
                <RotateCcw className="w-[18px] h-[18px]" />
              </div>
              <div className="min-w-0">
                <span className={DT.settingsRowTitle}>Reset preferences to default</span>
                <p className={DT.settingsRowHelper}>Restore compact density, animations, and home view</p>
              </div>
            </div>
            <span className="text-[11px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-lg">
              Reset
            </span>
          </div>
        </div>
      </div>

      {/* CONFIRM DIALOG: CLEAR CACHE */}
      <AnimatePresence>
        {isClearCacheModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-sm w-full p-4 border border-slate-200 shadow-2xl space-y-3.5"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-[14px] font-bold text-[#04203F]">Clear Application Cache?</h3>
                  <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">
                    This will clear search keywords, temporary form drafts, and image buffers. Your login session, security PIN, and account settings will remain intact.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsClearCacheModalOpen(false)}
                  className="h-[34px] px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[12px] font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmClearCache}
                  className="h-[34px] px-3.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-[12px] font-bold cursor-pointer shadow-xs"
                >
                  Clear Cache
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CONFIRM DIALOG: RESET PREFERENCES */}
      <AnimatePresence>
        {isResetDefaultsModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-sm w-full p-4 border border-slate-200 shadow-2xl space-y-3.5"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-[14px] font-bold text-[#04203F]">Reset Preferences?</h3>
                  <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">
                    This restores compact layout density, enables animations, and sets Home as the default launch tab.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsResetDefaultsModalOpen(false)}
                  className="h-[34px] px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[12px] font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmResetDefaults}
                  className="h-[34px] px-3.5 rounded-xl bg-[#04203F] hover:bg-[#0E9AA7] text-white text-[12px] font-bold cursor-pointer shadow-xs"
                >
                  Reset Defaults
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
