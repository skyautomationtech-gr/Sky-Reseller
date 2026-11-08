import React, { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserProfile, AppVersionConfig, ChangelogEntry, CompanySettings } from '../../types';
import { getCurrentAppVersion, getChangelogs, updateUserLastSeenVersion } from '../../lib/versionService';
import { triggerHaptic } from '../../lib/nativeFeedback';
import { DENSITY_TOKENS as DT } from '../../utils/densityTokens';
import { 
  Smartphone, RefreshCw, CheckCircle2, AlertTriangle, 
  Sparkles, History, ChevronRight, ChevronDown, Share2, 
  ExternalLink, Phone, Mail, Globe, Building2, Info, Check, AlertCircle, Copy
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { WhatsNewModal } from '../version/WhatsNewModal';
import { ChangelogModal } from '../version/ChangelogModal';
import { useScrollToTop } from '../../utils/scrollToTop';

interface AppVersionSectionProps {
  user: UserProfile;
  canAccessFullApp?: boolean;
  onRefreshUser?: () => void;
  onBack?: () => void;
}

// Current installed client package version
const INSTALLED_VERSION = '1.0.0';
const INSTALLED_BUILD_NUMBER = '100';

export const AppVersionSection: React.FC<AppVersionSectionProps> = ({
  user,
  canAccessFullApp = true,
  onRefreshUser,
  onBack,
}) => {
  const [appVersionInfo, setAppVersionInfo] = useState<AppVersionConfig | null>(null);
  const [changelogs, setChangelogs] = useState<ChangelogEntry[]>([]);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);

  // Instantly reset scroll to top on mount
  useScrollToTop([]);

  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [lastCheckedTime, setLastCheckedTime] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);

  // Accordion state for past changelogs
  const [expandedChangelogIds, setExpandedChangelogIds] = useState<Record<string, boolean>>({});

  // Modals
  const [showWhatsNewModal, setShowWhatsNewModal] = useState(false);
  const [showChangelogModal, setShowChangelogModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage((prev) => (prev?.text === text ? null : prev));
    }, 3000);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      if (!navigator.onLine) {
        setIsOffline(true);
      } else {
        setIsOffline(false);
      }

      // 1. Current App Version
      const vConfig = await getCurrentAppVersion();
      setAppVersionInfo(vConfig);

      // 2. Changelogs List
      const logs = await getChangelogs();
      setChangelogs(logs);

      // 3. Company Settings
      const compSnap = await getDoc(doc(db, 'settings', 'general'));
      if (compSnap.exists()) {
        setCompanySettings(compSnap.data() as CompanySettings);
      }

      setLastCheckedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch (err) {
      console.error('Error fetching version data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Check For Updates Action
  const handleCheckForUpdates = async () => {
    triggerHaptic('medium');
    setIsCheckingUpdate(true);

    if (!navigator.onLine) {
      setIsOffline(true);
      setIsCheckingUpdate(false);
      showToast('You are currently offline. Unable to reach update server.', 'error');
      return;
    }

    try {
      const latest = await getCurrentAppVersion();
      setAppVersionInfo(latest);
      setLastCheckedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      setIsOffline(false);

      const isNewer = latest.version && latest.version !== INSTALLED_VERSION;
      if (isNewer) {
        showToast(`Update available: v${latest.version}`, 'info');
      } else {
        showToast('You are up to date!', 'success');
      }
    } catch (err) {
      console.error('Error checking updates:', err);
      showToast('Failed to check for updates', 'error');
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  // Toggle single accordion item
  const toggleChangelog = (id: string) => {
    triggerHaptic('light');
    setExpandedChangelogIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Share App link
  const handleShareApp = async () => {
    triggerHaptic('light');
    const shareUrl = appVersionInfo?.apkUrl || appVersionInfo?.storeUrl || window.location.origin;
    const shareData = {
      title: 'ReSellBD - Reseller & Wholesale Commerce',
      text: 'Join ReSellBD to start your zero-investment wholesale dropshipping business in Bangladesh!',
      url: shareUrl,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        // User dismissed share dialog
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareUrl);
        showToast('App link copied to clipboard!', 'success');
      } catch (_) {
        showToast('Could not copy link', 'error');
      }
    }
  };

  const isUpdateAvailable = !!appVersionInfo?.version && appVersionInfo.version !== INSTALLED_VERSION;
  const isMandatory = !!appVersionInfo?.isMandatory;
  const latestChangelog = changelogs[0] || null;

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
                ? 'bg-[#04203F] text-white border border-[#0E9AA7]/50'
                : 'bg-[#04203F] text-white border border-[#3DD055]/50'
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

      {/* Mandatory Update Critical Banner */}
      {isUpdateAvailable && isMandatory && (
        <div className="bg-rose-50 border border-rose-200 rounded-[14px] p-3 flex items-start gap-2.5 shadow-2xs">
          <div className="w-7 h-7 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h4 className="text-[13px] font-bold text-rose-900 leading-tight">Mandatory Update Required</h4>
              <span className="text-[10px] font-extrabold text-white bg-rose-600 px-1.5 py-0.2 rounded uppercase">
                Critical
              </span>
            </div>
            <p className="text-[11px] text-rose-700 mt-0.5 leading-snug">
              Version v{appVersionInfo?.version} contains critical security & wallet integrity fixes. Please update now to continue placing orders.
            </p>
            {appVersionInfo?.apkUrl && (
              <a
                href={appVersionInfo.apkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 h-[30px] px-3 bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold rounded-lg shadow-xs transition-colors"
              >
                <span>Update Now (APK)</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
      )}

      {/* 1. CURRENT VERSION CARD */}
      <div className={`${DT.settingsGroupCard} p-3.5 space-y-3`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-[36px] h-[36px] rounded-[10px] flex items-center justify-center shrink-0 border bg-teal-50 text-[#0E9AA7] border-teal-200/80">
              <Smartphone className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[15px] font-bold text-[#04203F] leading-tight">ReSellBD</span>
                <span className="font-mono text-[12px] font-bold text-slate-700 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200/80">
                  v{INSTALLED_VERSION}
                </span>
              </div>
              <p className="text-[11px] font-medium text-slate-500 truncate mt-0.5">
                Build #{INSTALLED_BUILD_NUMBER} • Production Mobile Release
              </p>
            </div>
          </div>

          {/* Status Badge */}
          {isUpdateAvailable ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-amber-700 bg-amber-50 border border-amber-200/80 px-2.5 py-1 rounded-full shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              Update v{appVersionInfo?.version} Available
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-[#3DD055] bg-emerald-50 border border-emerald-200/80 px-2.5 py-1 rounded-full shrink-0">
              <Check className="w-3 h-3 text-[#3DD055]" />
              You are up to date
            </span>
          )}
        </div>

        {/* Check for Updates Action Bar */}
        <div className="pt-2 border-t border-slate-100/90 flex items-center justify-between gap-3">
          <span className="text-[11px] text-slate-400 font-medium">
            {lastCheckedTime ? `Last checked today at ${lastCheckedTime}` : 'Checking automatically...'}
          </span>

          <button
            type="button"
            onClick={handleCheckForUpdates}
            disabled={isCheckingUpdate}
            className="h-[32px] px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#04203F] text-[11px] font-bold border border-slate-200 transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#0E9AA7] ${isCheckingUpdate ? 'animate-spin' : ''}`} />
            <span>{isCheckingUpdate ? 'Checking...' : 'Check for Updates'}</span>
          </button>
        </div>

        {/* Update Now Action if Available */}
        {isUpdateAvailable && (
          <div className="bg-amber-50/80 border border-amber-200/80 rounded-xl p-2.5 flex items-center justify-between gap-2">
            <div className="text-[11px] text-amber-900 leading-tight">
              <strong>v{appVersionInfo?.version} is ready to install.</strong>
              <div className="text-amber-700 text-[10px] truncate mt-0.5">
                {appVersionInfo?.releaseNotes || 'Includes new features and performance enhancements.'}
              </div>
            </div>
            {appVersionInfo?.apkUrl ? (
              <a
                href={appVersionInfo.apkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="h-[30px] px-3 bg-[#04203F] hover:bg-[#0E9AA7] text-white text-[11px] font-bold rounded-lg transition-colors flex items-center gap-1 shrink-0 shadow-2xs"
              >
                <span>Update Now</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            ) : (
              <button
                type="button"
                onClick={() => showToast('Update link will be provided by Admin', 'info')}
                className="h-[30px] px-3 bg-[#04203F] hover:bg-[#0E9AA7] text-white text-[11px] font-bold rounded-lg transition-colors shrink-0"
              >
                Update Now
              </button>
            )}
          </div>
        )}
      </div>

      {/* 2. WHAT'S NEW & CHANGELOG GROUP */}
      <div className="space-y-1.5">
        <div className={DT.settingsGroupLabel}>Release Highlights & Notes</div>
        <div className={DT.settingsGroupCard}>
          {/* What's New Row */}
          <div
            onClick={() => {
              triggerHaptic('light');
              setShowWhatsNewModal(true);
            }}
            className={DT.settingsRow}
          >
            <div className="flex items-center gap-2.5 min-w-0 pr-3">
              <div className="w-[28px] h-[28px] rounded-[8px] flex items-center justify-center shrink-0 border bg-teal-50 text-[#0E9AA7] border-teal-200/60">
                <Sparkles className="w-[18px] h-[18px]" />
              </div>
              <div className="min-w-0">
                <span className={DT.settingsRowTitle}>What's new</span>
                <p className={DT.settingsRowHelper}>View latest highlights & features</p>
              </div>
            </div>

            <button
              type="button"
              className="text-[11px] font-bold text-[#0E9AA7] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>Show again</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Full Changelog Modal Trigger */}
          <div
            onClick={() => {
              triggerHaptic('light');
              setShowChangelogModal(true);
            }}
            className={DT.settingsRow}
          >
            <div className="flex items-center gap-2.5 min-w-0 pr-3">
              <div className="w-[28px] h-[28px] rounded-[8px] flex items-center justify-center shrink-0 border bg-blue-50 text-blue-700 border-blue-200/60">
                <History className="w-[18px] h-[18px]" />
              </div>
              <div className="min-w-0">
                <span className={DT.settingsRowTitle}>Changelog history</span>
                <p className={DT.settingsRowHelper}>Complete timeline of past releases</p>
              </div>
            </div>

            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
          </div>
        </div>
      </div>

      {/* 3. RECENT RELEASES ACCORDION LIST */}
      {changelogs.length > 0 && (
        <div className="space-y-1.5">
          <div className={DT.settingsGroupLabel}>Previous Versions ({changelogs.length})</div>
          <div className={DT.settingsGroupCard}>
            {changelogs.slice(0, 5).map((log) => {
              const isExpanded = !!expandedChangelogIds[log.id];
              return (
                <div key={log.id} className="transition-colors">
                  <div
                    onClick={() => toggleChangelog(log.id)}
                    className="w-full min-h-[48px] px-3.5 py-2.5 flex items-center justify-between hover:bg-slate-50/70 active:bg-slate-100/60 text-left cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-[12px] font-bold text-[#04203F]">
                        v{log.version}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded">
                        {log.releaseType || 'minor'}
                      </span>
                      <span className="text-[11px] font-medium text-slate-500 truncate">
                        {log.title}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] font-medium text-slate-400 hidden sm:inline">
                        {log.publishedAt?.toDate ? log.publishedAt.toDate().toLocaleDateString() : 'Recent'}
                      </span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                          isExpanded ? 'rotate-180 text-[#0E9AA7]' : ''
                        }`}
                      />
                    </div>
                  </div>

                  {/* Expanded Accordion Body */}
                  {isExpanded && (
                    <div className="px-3.5 py-2.5 bg-slate-50/70 border-t border-slate-100 text-[11px] text-slate-600 leading-relaxed whitespace-pre-line font-normal">
                      {log.description}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. ABOUT & COMPANY SUPPORT (Read from settings/general) */}
      <div className="space-y-1.5">
        <div className={DT.settingsGroupLabel}>About & Support</div>
        <div className={DT.settingsGroupCard}>
          {/* Company Info Line */}
          <div className="px-3.5 py-2.5 bg-slate-50/40">
            <span className="text-[12px] font-bold text-[#04203F] block">
              {companySettings?.companyName || 'Sky Automation Technologies Ltd.'}
            </span>
            <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">
              ReSellBD is Bangladesh's premier wholesale dropshipping & reseller commerce network.
            </p>
          </div>

          {/* Support Phone (Dynamic from DB) */}
          {companySettings?.phoneNumbers && (
            <a
              href={`tel:${companySettings.phoneNumbers.split(',')[0].trim()}`}
              className={DT.settingsRow}
            >
              <div className="flex items-center gap-2.5 min-w-0 pr-3">
                <div className="w-[28px] h-[28px] rounded-[8px] flex items-center justify-center shrink-0 border bg-teal-50 text-[#0E9AA7] border-teal-200/60">
                  <Phone className="w-[18px] h-[18px]" />
                </div>
                <div className="min-w-0">
                  <span className={DT.settingsRowTitle}>Customer Support</span>
                  <p className={DT.settingsRowHelper}>Direct phone line</p>
                </div>
              </div>

              <span className="font-mono text-[12px] font-bold text-[#04203F] shrink-0">
                {companySettings.phoneNumbers.split(',')[0].trim()}
              </span>
            </a>
          )}

          {/* Support Email (Dynamic from DB) */}
          {companySettings?.email && (
            <a
              href={`mailto:${companySettings.email}`}
              className={DT.settingsRow}
            >
              <div className="flex items-center gap-2.5 min-w-0 pr-3">
                <div className="w-[28px] h-[28px] rounded-[8px] flex items-center justify-center shrink-0 border bg-blue-50 text-blue-700 border-blue-200/60">
                  <Mail className="w-[18px] h-[18px]" />
                </div>
                <div className="min-w-0">
                  <span className={DT.settingsRowTitle}>Support Email</span>
                  <p className={DT.settingsRowHelper}>Send inquiries & feedback</p>
                </div>
              </div>

              <span className="text-[11px] font-medium text-slate-600 truncate max-w-[160px] shrink-0">
                {companySettings.email}
              </span>
            </a>
          )}

          {/* Rate / Share App */}
          <div
            onClick={handleShareApp}
            className={DT.settingsRow}
          >
            <div className="flex items-center gap-2.5 min-w-0 pr-3">
              <div className="w-[28px] h-[28px] rounded-[8px] flex items-center justify-center shrink-0 border bg-emerald-50 text-[#3DD055] border-emerald-200/60">
                <Share2 className="w-[18px] h-[18px]" />
              </div>
              <div className="min-w-0">
                <span className={DT.settingsRowTitle}>Rate / share the app</span>
                <p className={DT.settingsRowHelper}>Share installation link with fellow resellers</p>
              </div>
            </div>

            <ExternalLink className="w-4 h-4 text-slate-400 shrink-0" />
          </div>
        </div>
      </div>

      {/* Version Modals (reusing existing system modals) */}
      <WhatsNewModal
        isOpen={showWhatsNewModal}
        onClose={() => setShowWhatsNewModal(false)}
        changelog={latestChangelog}
        currentVersion={appVersionInfo?.version || INSTALLED_VERSION}
      />

      <ChangelogModal
        isOpen={showChangelogModal}
        onClose={() => setShowChangelogModal(false)}
        currentVersion={appVersionInfo?.version || INSTALLED_VERSION}
      />
    </div>
  );
};
