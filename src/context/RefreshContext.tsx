import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { RotateCw, CheckCircle2, AlertCircle, Info, X, RefreshCw } from 'lucide-react';

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
  retryFn?: () => void;
  timestamp: number;
}

interface RefreshContextType {
  isRefreshing: boolean;
  lastUpdated: Date | null;
  formattedLastUpdated: string;
  refreshCurrentPage: () => Promise<void>;
  registerPageRefresh: (pageId: string, refreshFn: () => Promise<void>) => () => void;
  activePageId: string;
  setActivePageId: (pageId: string) => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info', retryFn?: () => void) => void;
  autoRefreshInterval: number; // in seconds (0 = off)
  setAutoRefreshInterval: (seconds: number) => void;
  newOrderIds: string[];
  setNewOrderIds: React.Dispatch<React.SetStateAction<string[]>>;
}

const RefreshContext = createContext<RefreshContextType | null>(null);

export const RefreshProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(new Date());
  const [formattedLastUpdated, setFormattedLastUpdated] = useState<string>('Just now');
  const [activePageId, setActivePageId] = useState<string>('dashboard');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [autoRefreshInterval, setAutoRefreshIntervalState] = useState<number>(() => {
    const saved = localStorage.getItem('sky_auto_refresh_interval');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [newOrderIds, setNewOrderIds] = useState<string[]>([]);

  // Page refresh handlers dictionary
  const refreshHandlersRef = useRef<Record<string, () => Promise<void>>>({});

  // Helper function to format time relative to now
  const formatTimeAgo = (date: Date | null) => {
    if (!date) return 'Never';
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    if (seconds < 10) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min${minutes > 1 ? 's' : ''} ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours} hr${hours > 1 ? 's' : ''} ago`;
  };

  // Keep formattedLastUpdated updated every 10 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setFormattedLastUpdated(formatTimeAgo(lastUpdated));
    }, 10000);
    return () => clearInterval(timer);
  }, [lastUpdated]);

  const setAutoRefreshInterval = (seconds: number) => {
    setAutoRefreshIntervalState(seconds);
    localStorage.setItem('sky_auto_refresh_interval', seconds.toString());
  };

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success', retryFn?: () => void) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast: ToastMessage = { id, message, type, retryFn, timestamp: Date.now() };

    setToasts((prev) => [...prev, newToast]);

    // Auto-dismiss after 2.5s unless it's an error with a retry
    if (type !== 'error' || !retryFn) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 2500);
    }
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const registerPageRefresh = useCallback((pageId: string, refreshFn: () => Promise<void>) => {
    refreshHandlersRef.current[pageId] = refreshFn;
    return () => {
      delete refreshHandlersRef.current[pageId];
    };
  }, []);

  const refreshCurrentPage = useCallback(async () => {
    if (isRefreshing) return;

    setIsRefreshing(true);
    const currentHandler = refreshHandlersRef.current[activePageId] || refreshHandlersRef.current['global'];

    try {
      if (currentHandler) {
        await currentHandler();
      } else {
        // Fallback delay to show feedback if handler isn't registered yet
        await new Promise((res) => setTimeout(res, 800));
        showToast('✓ Data refreshed', 'success');
      }
      const now = new Date();
      setLastUpdated(now);
      setFormattedLastUpdated('Just now');
    } catch (err: any) {
      console.error('Refresh failed:', err);
      showToast('✗ Failed to refresh', 'error', () => refreshCurrentPage());
    } finally {
      setIsRefreshing(false);
    }
  }, [activePageId, isRefreshing, showToast]);

  // Global Keyboard Shortcut: Press "R" key to refresh
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in form inputs
      const activeEl = document.activeElement;
      const isInput = activeEl && (
        activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        activeEl.tagName === 'SELECT' ||
        (activeEl as HTMLElement).isContentEditable
      );

      if (isInput) return;

      if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        refreshCurrentPage();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [refreshCurrentPage]);

  // Optional Auto-Refresh Timer
  useEffect(() => {
    if (autoRefreshInterval <= 0) return;

    const interval = setInterval(() => {
      refreshCurrentPage();
    }, autoRefreshInterval * 1000);

    return () => clearInterval(interval);
  }, [autoRefreshInterval, refreshCurrentPage]);

  return (
    <RefreshContext.Provider
      value={{
        isRefreshing,
        lastUpdated,
        formattedLastUpdated,
        refreshCurrentPage,
        registerPageRefresh,
        activePageId,
        setActivePageId,
        showToast,
        autoRefreshInterval,
        setAutoRefreshInterval,
        newOrderIds,
        setNewOrderIds,
      }}
    >
      {children}

      {/* Floating Toast Notification Container (Top Right) */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full px-4 sm:px-0 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center justify-between gap-3 p-3.5 rounded-2xl shadow-xl border text-xs font-semibold animate-in slide-in-from-top-3 duration-200 ${
              toast.type === 'success'
                ? 'bg-slate-900 border-slate-800 text-white'
                : toast.type === 'error'
                ? 'bg-rose-900 border-rose-800 text-white'
                : 'bg-blue-900 border-blue-800 text-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
              {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-300 shrink-0" />}
              {toast.type === 'info' && <RotateCw className="w-4 h-4 text-blue-300 animate-spin shrink-0" />}
              <span>{toast.message}</span>
            </div>

            <div className="flex items-center gap-2">
              {toast.retryFn && (
                <button
                  type="button"
                  onClick={() => {
                    removeToast(toast.id);
                    toast.retryFn?.();
                  }}
                  className="px-2.5 py-1 bg-white/20 hover:bg-white/30 text-white font-bold rounded-lg transition-colors text-[11px]"
                >
                  Retry
                </button>
              )}
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                className="p-1 hover:bg-white/10 rounded-lg transition-colors text-white/70 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </RefreshContext.Provider>
  );
};

export const useRefresh = () => {
  const context = useContext(RefreshContext);
  if (!context) {
    throw new Error('useRefresh must be used within a RefreshProvider');
  }
  return context;
};

// Custom Hook to register a page refresh handler easily
export const usePageRefresh = (pageId: string, refreshFn: () => Promise<void>) => {
  const { registerPageRefresh, setActivePageId } = useRefresh();

  useEffect(() => {
    setActivePageId(pageId);
    const unregister = registerPageRefresh(pageId, refreshFn);
    return () => {
      unregister();
    };
  }, [pageId, refreshFn, registerPageRefresh, setActivePageId]);
};
