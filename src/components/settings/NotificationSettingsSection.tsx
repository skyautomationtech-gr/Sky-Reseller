import React, { useState, useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserProfile, NotificationPreferences } from '../../types';
import { 
  checkPushNotificationPermission, 
  requestAndRegisterPushNotifications 
} from '../../lib/pushNotifications';
import { triggerHaptic } from '../../lib/nativeFeedback';
import { DENSITY_TOKENS as DT } from '../../utils/densityTokens';
import { 
  Bell, CheckCircle2, AlertCircle, ShieldCheck, Volume2, 
  Vibrate, Moon, Clock, Send, Lock, Smartphone, ExternalLink,
  ChevronRight, RefreshCw, Sparkles, Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useScrollToTop } from '../../utils/scrollToTop';

interface NotificationSettingsSectionProps {
  user: UserProfile;
  canAccessFullApp?: boolean;
  onOpenLockedModal?: (featureName?: string) => void;
  onRefreshUser?: () => void;
  onBack?: () => void;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  // Orders & Money
  orderUpdates: true,
  walletActivity: true,
  payoutUpdates: true,
  commissionCredited: true,
  // Updates & News
  newProducts: true,
  importantNotices: true,
  appUpdates: true,
  promotions: false,
  // Alerts
  securityAlerts: true, // Always locked ON
  // Sound & Vibration
  sound: true,
  vibration: true,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
  // Backwards compatibility legacy keys
  newOrder: true,
  payout: true,
  commission: true,
  importantNotice: true,
  appUpdate: true,
  promotional: false,
};

export const NotificationSettingsSection: React.FC<NotificationSettingsSectionProps> = ({
  user,
  canAccessFullApp = true,
  onOpenLockedModal,
  onRefreshUser,
  onBack,
}) => {
  const isRestricted = !canAccessFullApp || user.status === 'pending';

  // Instantly reset scroll to top on mount
  useScrollToTop([]);

  // Permission State: 'granted' | 'denied' | 'prompt' | 'loading'
  const [permissionStatus, setPermissionStatus] = useState<'granted' | 'denied' | 'prompt' | 'loading'>('loading');
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [showSettingsGuidance, setShowSettingsGuidance] = useState(false);

  // Notification Preferences
  const [prefs, setPrefs] = useState<NotificationPreferences>(() => {
    const existing = user.notificationPreferences || {};
    return {
      ...DEFAULT_PREFERENCES,
      ...existing,
      securityAlerts: true, // Always enforced ON
    };
  });

  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [isTestingPush, setIsTestingPush] = useState(false);

  // Check push permission on mount
  useEffect(() => {
    let isMounted = true;
    const fetchPerm = async () => {
      try {
        const res = await checkPushNotificationPermission();
        if (isMounted) setPermissionStatus(res);
      } catch (e) {
        if (isMounted) setPermissionStatus('prompt');
      }
    };
    fetchPerm();
    return () => {
      isMounted = false;
    };
  }, []);

  const showToast = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage((prev) => (prev?.text === text ? null : prev));
    }, 2800);
  };

  // Immediate toggle handler
  const handleToggle = async (key: keyof NotificationPreferences) => {
    if (isRestricted) {
      if (onOpenLockedModal) onOpenLockedModal('Notification Preferences');
      return;
    }

    if (key === 'securityAlerts') {
      showToast('Security alerts are mandatory and cannot be disabled.', 'info');
      return;
    }

    triggerHaptic('light');
    const updatedValue = !prefs[key];
    const newPrefs: NotificationPreferences = {
      ...prefs,
      [key]: updatedValue,
      // Keep legacy keys in sync
      ...(key === 'orderUpdates' ? { newOrder: updatedValue } : {}),
      ...(key === 'payoutUpdates' ? { payout: updatedValue } : {}),
      ...(key === 'commissionCredited' ? { commission: updatedValue } : {}),
      ...(key === 'importantNotices' ? { importantNotice: updatedValue } : {}),
      ...(key === 'appUpdates' ? { appUpdate: updatedValue } : {}),
      ...(key === 'promotions' ? { promotional: updatedValue } : {}),
    };

    setPrefs(newPrefs);
    setSavingKey(String(key));

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        notificationPreferences: newPrefs,
      });
      showToast('Saved', 'success');
      if (onRefreshUser) onRefreshUser();
    } catch (err) {
      console.error('Failed to save notification preferences:', err);
      showToast('Failed to save setting', 'error');
      // Revert on error
      setPrefs(prefs);
    } finally {
      setTimeout(() => setSavingKey(null), 800);
    }
  };

  // Time change handler for quiet hours
  const handleTimeChange = async (field: 'quietHoursStart' | 'quietHoursEnd', value: string) => {
    if (isRestricted) return;
    const newPrefs = { ...prefs, [field]: value };
    setPrefs(newPrefs);

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        notificationPreferences: newPrefs,
      });
      showToast('Quiet hours updated', 'success');
      if (onRefreshUser) onRefreshUser();
    } catch (err) {
      console.error('Failed to save quiet hours:', err);
      showToast('Failed to save time', 'error');
    }
  };

  // Request Permission
  const handleEnablePermission = async () => {
    if (isRestricted) {
      if (onOpenLockedModal) onOpenLockedModal('Push Notifications');
      return;
    }

    triggerHaptic('medium');
    setIsRequestingPermission(true);
    try {
      const granted = await requestAndRegisterPushNotifications(user.uid);
      const newStatus = await checkPushNotificationPermission();
      setPermissionStatus(newStatus);
      if (granted || newStatus === 'granted') {
        showToast('Push notifications enabled!', 'success');
        if (onRefreshUser) onRefreshUser();
      } else if (newStatus === 'denied') {
        setShowSettingsGuidance(true);
      }
    } catch (err) {
      console.error('Permission error:', err);
      showToast('Permission request failed', 'error');
    } finally {
      setIsRequestingPermission(false);
    }
  };

  // Test Notification
  const handleSendTestPush = async () => {
    if (isRestricted) {
      if (onOpenLockedModal) onOpenLockedModal('Test Notification');
      return;
    }

    triggerHaptic('medium');
    setIsTestingPush(true);
    try {
      // 1. Try server proxy endpoint
      const response = await fetch('/api/notifications/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          title: '🔔 Test Notification',
          body: 'ReSellBD push alerts are working properly on your device!',
        }),
      }).catch(() => null);

      let serverHandled = false;
      if (response && response.ok) {
        const data = await response.json();
        serverHandled = data.success;
      }

      // 2. Client-side Notification fallback (if in browser or web mode)
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification('🔔 ReSellBD Test Notification', {
            body: 'Push alerts are working properly on this device!',
            icon: '/favicon.ico',
          });
        } catch (_) {}
      }

      showToast('Test notification dispatched!', 'success');
    } catch (err) {
      console.error('Error sending test notification:', err);
      showToast('Test notification sent', 'info');
    } finally {
      setIsTestingPush(false);
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

      {/* Restricted State Notice for Pending Resellers */}
      {isRestricted && (
        <div className="bg-amber-50/90 border border-amber-200/90 rounded-[14px] p-3 flex items-start gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
            <Lock className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-[13px] font-bold text-amber-900 leading-tight">Notification Settings Locked</h4>
            <p className="text-[11px] text-amber-700 mt-0.5 leading-snug">
              Notifications will be delivered with default settings until your reseller account is verified by administrators.
            </p>
          </div>
        </div>
      )}

      {/* 1. TOP PUSH PERMISSION STATUS CARD */}
      <div className={`${DT.settingsGroupCard} p-3.5`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-[32px] h-[32px] rounded-[10px] flex items-center justify-center shrink-0 border ${
              permissionStatus === 'granted'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80'
                : permissionStatus === 'denied'
                ? 'bg-rose-50 text-rose-700 border-rose-200/80'
                : 'bg-teal-50 text-[#0E9AA7] border-teal-200/80'
            }`}>
              <Bell className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[13px] font-bold text-[#04203F] leading-tight">Push Notifications</span>
                {permissionStatus === 'granted' ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-[#3DD055] bg-emerald-50 border border-emerald-200/70 px-2 py-0.2 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#3DD055]" />
                    Allowed
                  </span>
                ) : permissionStatus === 'denied' ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-rose-600 bg-rose-50 border border-rose-200/70 px-2 py-0.2 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
                    Blocked
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.2 rounded-full">
                    Not Enabled
                  </span>
                )}
              </div>
              <p className="text-[11px] font-medium text-slate-500 truncate mt-0.5">
                {permissionStatus === 'granted'
                  ? 'Real-time alerts active on this device'
                  : permissionStatus === 'denied'
                  ? 'Notifications are blocked in your settings'
                  : 'Tap below to receive instant order updates'}
              </p>
            </div>
          </div>

          {/* Action Button */}
          {permissionStatus === 'denied' ? (
            <button
              onClick={() => setShowSettingsGuidance(true)}
              className="h-[32px] px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-bold border border-rose-200 transition-all flex items-center gap-1 shrink-0 cursor-pointer active:scale-95"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Fix Settings</span>
            </button>
          ) : permissionStatus !== 'granted' ? (
            <button
              onClick={handleEnablePermission}
              disabled={isRequestingPermission}
              className="h-[32px] px-3 rounded-xl bg-[#04203F] hover:bg-[#0E9AA7] text-white text-[11px] font-bold transition-all shadow-2xs flex items-center gap-1 shrink-0 cursor-pointer active:scale-95 disabled:opacity-50"
            >
              {isRequestingPermission ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              <span>Enable</span>
            </button>
          ) : null}
        </div>

        {/* Guidance Sheet / Expander when Blocked */}
        {showSettingsGuidance && (
          <div className="mt-3 pt-3 border-t border-slate-100 space-y-2 text-[11px] text-slate-600">
            <p className="font-semibold text-slate-800">How to unblock notifications:</p>
            <ol className="list-decimal pl-4 space-y-1 text-slate-600">
              <li>On Mobile: Go to <strong>Phone Settings → Apps → ReSellBD → Notifications</strong> and toggle ON.</li>
              <li>On Chrome/Browser: Tap the lock icon in the address bar and set <strong>Notifications → Allow</strong>.</li>
            </ol>
            <div className="flex justify-end pt-1">
              <button
                onClick={() => setShowSettingsGuidance(false)}
                className="text-[11px] font-bold text-[#0E9AA7] hover:underline cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 2. ORDERS & MONEY */}
      <div className="space-y-1.5">
        <div className={DT.settingsGroupLabel}>Orders & Money</div>
        <div className={DT.settingsGroupCard}>
          {/* Order Updates */}
          <ToggleRow
            title="Order updates"
            subtitle="Status changes of my orders"
            icon={Bell}
            colorClass="bg-teal-50 text-[#0E9AA7] border-teal-200/60"
            enabled={!!prefs.orderUpdates}
            disabled={isRestricted}
            onToggle={() => handleToggle('orderUpdates')}
          />

          {/* Wallet Activity */}
          <ToggleRow
            title="Wallet activity"
            subtitle="Deposits, balance adjustments & refunds"
            icon={CheckCircle2}
            colorClass="bg-emerald-50 text-emerald-700 border-emerald-200/60"
            enabled={!!prefs.walletActivity}
            disabled={isRestricted}
            onToggle={() => handleToggle('walletActivity')}
          />

          {/* Withdrawal / Payout Updates */}
          <ToggleRow
            title="Withdrawal / payout updates"
            subtitle="Approval and disbursement notifications"
            icon={CheckCircle2}
            colorClass="bg-blue-50 text-blue-700 border-blue-200/60"
            enabled={!!prefs.payoutUpdates}
            disabled={isRestricted}
            onToggle={() => handleToggle('payoutUpdates')}
          />

          {/* Commission Credited */}
          <ToggleRow
            title="Commission credited"
            subtitle="Immediate alerts when reseller profit is added"
            icon={CheckCircle2}
            colorClass="bg-emerald-50 text-[#3DD055] border-emerald-200/60"
            enabled={!!prefs.commissionCredited}
            disabled={isRestricted}
            onToggle={() => handleToggle('commissionCredited')}
          />
        </div>
      </div>

      {/* 3. UPDATES & NEWS */}
      <div className="space-y-1.5">
        <div className={DT.settingsGroupLabel}>Updates & News</div>
        <div className={DT.settingsGroupCard}>
          {/* New Products */}
          <ToggleRow
            title="New products"
            subtitle="Wholesale catalog arrivals and stock additions"
            icon={Bell}
            colorClass="bg-teal-50 text-[#0E9AA7] border-teal-200/60"
            enabled={!!prefs.newProducts}
            disabled={isRestricted}
            onToggle={() => handleToggle('newProducts')}
          />

          {/* Important Notices */}
          <ToggleRow
            title="Important notices & announcements"
            subtitle="Official system notices, maintenance and policy changes"
            icon={AlertCircle}
            colorClass="bg-amber-50 text-amber-700 border-amber-200/60"
            enabled={!!prefs.importantNotices}
            disabled={isRestricted}
            onToggle={() => handleToggle('importantNotices')}
          />

          {/* App Updates */}
          <ToggleRow
            title="App updates"
            subtitle="New feature releases and version updates"
            icon={Smartphone}
            colorClass="bg-blue-50 text-blue-700 border-blue-200/60"
            enabled={!!prefs.appUpdates}
            disabled={isRestricted}
            onToggle={() => handleToggle('appUpdates')}
          />

          {/* Promotions & Offers */}
          <ToggleRow
            title="Promotions & offers"
            subtitle="Special seasonal bonuses and exclusive reseller discounts"
            icon={Sparkles}
            colorClass="bg-teal-50 text-[#0E9AA7] border-teal-200/60"
            enabled={!!prefs.promotions}
            disabled={isRestricted}
            onToggle={() => handleToggle('promotions')}
          />
        </div>
      </div>

      {/* 4. ALERTS */}
      <div className="space-y-1.5">
        <div className={DT.settingsGroupLabel}>Alerts</div>
        <div className={DT.settingsGroupCard}>
          {/* Security Alerts (Mandatory, strictly locked ON) */}
          <div className="w-full min-h-[48px] px-3.5 py-2.5 flex items-center justify-between text-left select-none bg-slate-50/50">
            <div className="flex items-center gap-2.5 min-w-0 pr-3">
              <div className="w-[28px] h-[28px] rounded-[8px] flex items-center justify-center shrink-0 border bg-rose-50 text-rose-700 border-rose-200/60">
                <ShieldCheck className="w-[18px] h-[18px]" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={DT.settingsRowTitle}>Security alerts</span>
                  <span className="text-[10px] font-bold text-slate-500 bg-slate-200/80 px-1.5 py-0.2 rounded flex items-center gap-0.5">
                    <Lock className="w-2.5 h-2.5" />
                    Always ON
                  </span>
                </div>
                <p className={DT.settingsRowHelper}>
                  New device logins, password or security PIN changes. Required for account security.
                </p>
              </div>
            </div>

            {/* Locked Switch */}
            <div className="w-[38px] h-[22px] rounded-full bg-[#3DD055] p-0.5 shrink-0 opacity-80 cursor-not-allowed">
              <div className="w-[18px] h-[18px] rounded-full bg-white shadow-xs translate-x-[16px] transition-transform" />
            </div>
          </div>
        </div>
      </div>

      {/* 5. SOUND & VIBRATION */}
      <div className="space-y-1.5">
        <div className={DT.settingsGroupLabel}>Sound & Vibration</div>
        <div className={DT.settingsGroupCard}>
          {/* Sound */}
          <ToggleRow
            title="Notification sound"
            subtitle="Play alert chime for incoming orders and payouts"
            icon={Volume2}
            colorClass="bg-teal-50 text-[#0E9AA7] border-teal-200/60"
            enabled={!!prefs.sound}
            disabled={isRestricted}
            onToggle={() => handleToggle('sound')}
          />

          {/* Vibration */}
          <ToggleRow
            title="Vibration"
            subtitle="Vibrate device on order and money notifications"
            icon={Vibrate}
            colorClass="bg-teal-50 text-[#0E9AA7] border-teal-200/60"
            enabled={!!prefs.vibration}
            disabled={isRestricted}
            onToggle={() => handleToggle('vibration')}
          />

          {/* Quiet Hours Toggle */}
          <ToggleRow
            title="Quiet hours"
            subtitle="Non-urgent notifications will be delivered silently"
            icon={Moon}
            colorClass="bg-indigo-50 text-indigo-700 border-indigo-200/60"
            enabled={!!prefs.quietHoursEnabled}
            disabled={isRestricted}
            onToggle={() => handleToggle('quietHoursEnabled')}
          />

          {/* Time Range Inputs (shown when Quiet Hours is ON) */}
          {prefs.quietHoursEnabled && (
            <div className="px-3.5 py-2.5 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-1.5 text-slate-600 font-semibold">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>Active hours:</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={prefs.quietHoursStart || '22:00'}
                  onChange={(e) => handleTimeChange('quietHoursStart', e.target.value)}
                  disabled={isRestricted}
                  className="h-[30px] px-2 bg-white border border-slate-200 rounded-lg text-[11px] font-mono font-bold text-[#04203F] outline-none focus:border-[#0E9AA7]"
                />
                <span className="text-slate-400 font-bold">to</span>
                <input
                  type="time"
                  value={prefs.quietHoursEnd || '07:00'}
                  onChange={(e) => handleTimeChange('quietHoursEnd', e.target.value)}
                  disabled={isRestricted}
                  className="h-[30px] px-2 bg-white border border-slate-200 rounded-lg text-[11px] font-mono font-bold text-[#04203F] outline-none focus:border-[#0E9AA7]"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 6. SEND TEST NOTIFICATION BUTTON */}
      <div className="pt-1">
        <button
          onClick={handleSendTestPush}
          disabled={isTestingPush || isRestricted}
          className="w-full h-[40px] rounded-xl bg-white/80 hover:bg-white text-[#04203F] hover:text-[#0E9AA7] border border-slate-200/90 text-[12px] font-bold shadow-2xs transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] disabled:opacity-50"
        >
          {isTestingPush ? (
            <RefreshCw className="w-4 h-4 animate-spin text-[#0E9AA7]" />
          ) : (
            <Send className="w-3.5 h-3.5 text-[#0E9AA7]" />
          )}
          <span>{isTestingPush ? 'Sending Test Alert...' : 'Send a Test Notification'}</span>
        </button>
        <p className="text-[10px] text-center text-slate-400 mt-1.5">
          Sends an instant test push to verify sound, badge, and vibration on this device.
        </p>
      </div>
    </div>
  );
};

// Reusable Compact iOS-style Toggle Row
interface ToggleRowProps {
  title: string;
  subtitle: string;
  icon: React.ElementType;
  colorClass: string;
  enabled: boolean;
  disabled?: boolean;
  onToggle: () => void;
}

const ToggleRow: React.FC<ToggleRowProps> = ({
  title,
  subtitle,
  icon: Icon,
  colorClass,
  enabled,
  disabled = false,
  onToggle,
}) => {
  return (
    <div
      onClick={!disabled ? onToggle : undefined}
      className={`w-full min-h-[48px] px-3.5 py-2.5 flex items-center justify-between text-left select-none transition-colors ${
        disabled
          ? 'opacity-60 cursor-not-allowed'
          : 'hover:bg-slate-50/70 active:bg-slate-100/60 cursor-pointer'
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0 pr-3">
        <div className={`w-[28px] h-[28px] rounded-[8px] flex items-center justify-center shrink-0 border ${colorClass}`}>
          <Icon className="w-[18px] h-[18px]" />
        </div>
        <div className="min-w-0">
          <span className={DT.settingsRowTitle}>{title}</span>
          <p className={DT.settingsRowHelper}>{subtitle}</p>
        </div>
      </div>

      {/* iOS-Style Pill Switch */}
      <div
        className={`w-[38px] h-[22px] rounded-full p-0.5 shrink-0 transition-colors ${
          enabled ? 'bg-[#3DD055]' : 'bg-slate-200'
        }`}
      >
        <div
          className={`w-[18px] h-[18px] rounded-full bg-white shadow-xs transition-transform ${
            enabled ? 'translate-x-[16px]' : 'translate-x-0'
          }`}
        />
      </div>
    </div>
  );
};
