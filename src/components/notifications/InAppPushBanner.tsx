import React from 'react';
import { Bell, X, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export interface PushBannerNotification {
  id: string;
  title: string;
  body: string;
  data?: any;
}

interface InAppPushBannerProps {
  notification: PushBannerNotification | null;
  onClose: () => void;
  onClickNotification?: (data: any) => void;
}

export const InAppPushBanner: React.FC<InAppPushBannerProps> = ({
  notification,
  onClose,
  onClickNotification,
}) => {
  return (
    <AnimatePresence>
      {notification && (
        <motion.div
          key={notification.id || 'push-banner'}
          initial={{ opacity: 0, y: -60, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -60, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 400, damping: 28 }}
          className="fixed top-3 left-3 right-3 sm:left-auto sm:right-4 sm:max-w-md z-[9999] pointer-events-auto"
        >
          <div
            onClick={() => {
              if (onClickNotification && notification.data) {
                onClickNotification(notification.data);
              }
              onClose();
            }}
            className="bg-slate-900/95 backdrop-blur-md text-white p-4 rounded-2xl shadow-2xl border border-slate-700/80 flex items-start justify-between gap-3 cursor-pointer group transition-all hover:bg-slate-900"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600/30 text-indigo-400 border border-indigo-500/30 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-110 transition-transform">
                <Bell className="w-5 h-5 animate-pulse text-indigo-400" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 bg-indigo-500/20 text-indigo-300 rounded-md border border-indigo-500/30">
                    Sky Alert
                  </span>
                  <span className="text-[10px] text-slate-400">Just now</span>
                </div>
                <h4 className="font-extrabold text-sm text-white mt-1 group-hover:text-indigo-200 transition-colors">
                  {notification.title}
                </h4>
                <p className="text-xs text-slate-300 mt-0.5 leading-snug line-clamp-2">
                  {notification.body}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {notification.data && (
                <span className="p-1.5 text-slate-400 hover:text-white transition-colors">
                  <ExternalLink className="w-4 h-4" />
                </span>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
