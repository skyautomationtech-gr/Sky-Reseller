import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State;
  public props: Props;

  constructor(props: Props) {
    super(props);
    this.props = props;
    this.state = {
      hasError: false,
      error: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in React Component tree:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleClearCacheAndReload = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (_) {}
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 text-white">
          <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-6 sm:p-8 max-w-md w-full shadow-2xl text-center space-y-5 animate-in fade-in zoom-in duration-200">
            <div className="w-14 h-14 bg-rose-500/20 text-rose-400 rounded-2xl border border-rose-500/30 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-7 h-7" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-bold text-white">Something went wrong</h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                An unexpected error occurred in the application display. Click below to reload or reset session cache.
              </p>
              {this.state.error?.message && (
                <div className="mt-3 p-3 bg-slate-900/80 border border-slate-700/60 rounded-xl text-left overflow-x-auto">
                  <span className="text-[10px] font-bold text-rose-400 block uppercase tracking-wider mb-1">Error details:</span>
                  <p className="text-xs font-mono text-slate-300 break-words">
                    {this.state.error.message}
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Reload App</span>
              </button>

              <button
                type="button"
                onClick={this.handleClearCacheAndReload}
                className="flex-1 py-3 px-4 bg-slate-700 hover:bg-slate-600 active:scale-95 text-white font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                Clear Cache & Reset
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
