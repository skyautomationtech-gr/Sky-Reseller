import React, { useState } from 'react';
import { Download, Smartphone, Share, X, CheckCircle2 } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'header' | 'banner' | 'sidebar' | 'compact';
  className?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ 
  variant = 'compact',
  className = ''
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [installing, setInstalling] = useState(false);

  // If already running as an installed PWA / standalone, suppress the button
  if (isInstalled) {
    return null;
  }

  const handleInstall = async () => {
    setInstalling(true);
    try {
      await install();
    } finally {
      setInstalling(false);
    }
  };

  // If not installable and not iOS (e.g. standard browser where prompt hasn't fired or not supported),
  // on mobile browsers we can also show a subtle option or only show when installable/iOS.
  if (!isInstallable && !isIOS) {
    return null;
  }

  return (
    <>
      {/* 1. Header / Navbar Variant */}
      {variant === 'header' && (
        <button
          onClick={isIOS ? () => setShowIOSGuide(true) : handleInstall}
          disabled={installing}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold shadow-sm transition-all cursor-pointer select-none ${className}`}
        >
          <Download className="w-3.5 h-3.5" />
          <span>{installing ? 'Installing...' : 'Install App'}</span>
        </button>
      )}

      {/* 2. Compact Button Variant */}
      {variant === 'compact' && (
        <button
          onClick={isIOS ? () => setShowIOSGuide(true) : handleInstall}
          disabled={installing}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold transition-all cursor-pointer ${className}`}
          title="Install Sky Reseller App on your device"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Install App</span>
        </button>
      )}

      {/* 3. Sidebar Variant */}
      {variant === 'sidebar' && (
        <button
          onClick={isIOS ? () => setShowIOSGuide(true) : handleInstall}
          disabled={installing}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs font-bold shadow-sm hover:from-blue-700 hover:to-indigo-700 active:scale-98 transition-all cursor-pointer ${className}`}
        >
          <div className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
            <Download className="w-3.5 h-3.5" />
          </div>
          <div className="text-left flex-1 min-w-0">
            <div className="leading-tight truncate">Install Sky App</div>
            <div className="text-[10px] font-normal text-blue-100 opacity-90 truncate">Quick home screen access</div>
          </div>
        </button>
      )}

      {/* 4. Banner Variant (e.g., top of Reseller or Settings page) */}
      {variant === 'banner' && (
        <div className={`bg-gradient-to-r from-blue-900 via-slate-900 to-indigo-950 border border-blue-800/40 rounded-2xl p-3.5 text-white flex items-center justify-between gap-3 shadow-md ${className}`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center shrink-0 text-blue-400">
              <Smartphone className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs sm:text-sm font-bold truncate">Install Sky Reseller App</h4>
              <p className="text-[11px] text-slate-300 truncate">Install on your phone or desktop for lightning-fast 1-tap access.</p>
            </div>
          </div>
          <button
            onClick={isIOS ? () => setShowIOSGuide(true) : handleInstall}
            disabled={installing}
            className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold text-xs shrink-0 shadow-sm transition-all cursor-pointer"
          >
            Install Now
          </button>
        </div>
      )}

      {/* iOS Safari Installation Guide Modal */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl border border-slate-200 text-slate-800 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Smartphone className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">Install on iPhone / iPad</h3>
              </div>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-600">
              <div className="flex items-start gap-2.5 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center shrink-0 text-[11px]">
                  1
                </div>
                <p className="leading-snug pt-0.5">
                  Tap the <strong className="text-slate-900 font-semibold inline-flex items-center gap-1 mx-0.5">Share <Share className="w-3 h-3 text-blue-600 inline" /></strong> button in your Safari browser bottom bar.
                </p>
              </div>

              <div className="flex items-start gap-2.5 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center shrink-0 text-[11px]">
                  2
                </div>
                <p className="leading-snug pt-0.5">
                  Scroll down the menu and tap <strong className="text-slate-900 font-semibold">"Add to Home Screen"</strong>.
                </p>
              </div>

              <div className="flex items-start gap-2.5 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center shrink-0 text-[11px]">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </div>
                <p className="leading-snug pt-0.5">
                  Tap <strong className="text-slate-900 font-semibold">"Add"</strong> in the top right corner. The Sky Reseller app icon will now appear on your home screen!
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowIOSGuide(false)}
              className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
};
