import React from 'react';
import { Wrench, RefreshCw, Clock, ShieldAlert } from 'lucide-react';
import { SkyLogo } from './SkyLogo';

interface MaintenanceScreenProps {
  onRetry?: () => void;
  isAdmin?: boolean;
  onBypassAdmin?: () => void;
}

export const MaintenanceScreen: React.FC<MaintenanceScreenProps> = ({
  onRetry = () => window.location.reload(),
  isAdmin = false,
  onBypassAdmin,
}) => {
  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col justify-center items-center px-4 py-8 select-none">
      <div className="w-full max-w-md bg-slate-800/90 border border-slate-700/80 rounded-3xl p-6 sm:p-8 text-center shadow-2xl backdrop-blur-xl relative overflow-hidden">
        {/* Glow effect */}
        <div className="absolute -top-20 -right-20 w-44 h-44 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-44 h-44 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Brand Logo */}
        <div className="flex justify-center mb-6">
          <SkyLogo size="md" showText={true} lightMode={false} />
        </div>

        {/* Animated Maintenance Icon */}
        <div className="relative w-20 h-20 mx-auto mb-6 flex items-center justify-center">
          <div className="absolute inset-0 bg-amber-500/20 rounded-2xl animate-pulse" />
          <div className="w-16 h-16 bg-gradient-to-tr from-amber-500 to-amber-400 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/30">
            <Wrench className="w-8 h-8 text-slate-950 animate-bounce" />
          </div>
        </div>

        {/* Title & Badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold tracking-wide uppercase mb-3">
          <Clock className="w-3.5 h-3.5" />
          সিস্টেম আপডেট চলছে
        </div>

        <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white mb-2">
          System Under Maintenance
        </h1>

        <p className="text-sm text-slate-300 leading-relaxed mb-6">
          আমরা অ্যাপে নতুন আকর্ষণীয় ফিচার যোগ করার কাজ করছি। সাময়িক অসুবিধার জন্য আন্তরিকভাবে দুঃখিত। কিছুক্ষণের মধ্যেই সিস্টেম আবার সচল হবে!
        </p>

        {/* Feature status notice */}
        <div className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-3.5 mb-6 text-left">
          <div className="flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-400 leading-snug">
              আপনার ডেটা, ওয়ালেট ব্যালেন্স এবং অর্ডার হিস্ট্রি সম্পূর্ণ সুরক্ষিত আছে। আপডেট শেষ হলে স্বাভাবিকভাবেই কাজ করতে পারবেন।
            </p>
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={onRetry}
          className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-3.5 px-4 rounded-2xl transition-all shadow-lg shadow-blue-600/30 active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer text-sm"
        >
          <RefreshCw className="w-4 h-4" />
          রিফ্রেশ করে আবার চেষ্টা করুন
        </button>

        {/* Optional Admin Bypass button */}
        {isAdmin && onBypassAdmin && (
          <button
            onClick={onBypassAdmin}
            className="mt-4 text-xs text-slate-400 hover:text-white underline transition-colors"
          >
            অ্যাডমিন হিসেবে প্রবেশ করুন (Admin Bypass)
          </button>
        )}
      </div>

      <p className="text-xs text-slate-500 mt-6 font-medium">
        Sky Automation Tech &bull; All Rights Reserved
      </p>
    </div>
  );
};
