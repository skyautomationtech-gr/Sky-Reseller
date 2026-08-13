import React from 'react';
import { ChangelogEntry, ReleaseType } from '../../types';
import { Sparkles, CheckCircle2, X, Tag, Calendar, ArrowRight } from 'lucide-react';

interface WhatsNewModalProps {
  isOpen: boolean;
  onClose: () => void;
  changelog: ChangelogEntry | null;
  currentVersion: string;
}

export const WhatsNewModal: React.FC<WhatsNewModalProps> = ({
  isOpen,
  onClose,
  changelog,
  currentVersion
}) => {
  if (!isOpen) return null;

  const getBadgeStyle = (type: ReleaseType) => {
    switch (type) {
      case 'major':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'minor':
        return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'patch':
        return 'bg-slate-100 text-slate-700 border-slate-200';
      case 'hotfix':
        return 'bg-rose-100 text-rose-700 border-rose-200';
      default:
        return 'bg-blue-100 text-blue-700 border-blue-200';
    }
  };

  const formattedDate = changelog?.publishedAt
    ? (changelog.publishedAt.toDate ? changelog.publishedAt.toDate() : new Date(changelog.publishedAt)).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      })
    : new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  // Parse description text into bullet points
  const bulletPoints = changelog?.description
    ? changelog.description
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => line.startsWith('•') || line.startsWith('-') ? line.substring(1).trim() : line)
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-slate-900/80 backdrop-blur-xs">
      <div className="bg-white sm:rounded-3xl border-0 sm:border border-slate-200 max-w-lg w-full h-full sm:h-auto overflow-hidden shadow-2xl animate-in zoom-in-95 duration-150 flex flex-col sm:max-h-[85vh]">
        
        {/* Header Hero Banner (Sticky on Mobile) */}
        <div className="bg-gradient-to-r from-blue-600 via-indigo-700 to-slate-900 p-5 sm:p-6 text-white relative shrink-0 sticky top-0 z-10">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/80 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="space-y-2 pr-8">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 bg-amber-400/20 text-amber-300 border border-amber-400/30 text-[10px] font-extrabold px-3 py-0.5 rounded-full uppercase tracking-wider">
                <Sparkles className="w-3 h-3 text-amber-300" /> What's New
              </span>
              <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase border ${getBadgeStyle(changelog?.releaseType || 'minor')}`}>
                {changelog?.releaseType || 'Update'}
              </span>
            </div>

            <h2 className="text-lg sm:text-2xl font-extrabold tracking-tight leading-snug">
              {changelog?.title || `Welcome to Version ${currentVersion}`}
            </h2>

            <div className="flex items-center gap-4 text-xs text-blue-100/80 pt-1">
              <div className="flex items-center gap-1">
                <Tag className="w-3.5 h-3.5" />
                <span className="font-mono font-bold">v{changelog?.version || currentVersion}</span>
              </div>
              <div className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                <span>{formattedDate}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Key Improvements & New Features
          </h3>

          {bulletPoints.length > 0 ? (
            <ul className="space-y-2.5">
              {bulletPoints.map((point, index) => (
                <li key={index} className="flex items-start gap-3 text-xs text-slate-700 leading-relaxed bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-4 rounded-2xl border border-slate-100">
              {changelog?.description || 'General performance enhancements, bug fixes, and stability improvements.'}
            </p>
          )}
        </div>

        {/* Sticky Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0 sticky bottom-0 z-10">
          <span className="text-[11px] text-slate-500 font-medium text-center sm:text-left">
            Sky Reseller • v{currentVersion}
          </span>
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl shadow-md shadow-blue-600/20 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer min-h-[44px]"
          >
            <span>Got it, thanks!</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
