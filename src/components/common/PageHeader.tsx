import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { triggerHaptic } from '../../lib/nativeFeedback';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  backTitle?: string;
  rightAction?: React.ReactNode;
  className?: string;
  sticky?: boolean;
  hideHeader?: boolean;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  onBack,
  backTitle = 'Go Back',
  rightAction,
  className = '',
  sticky = true,
  hideHeader = false,
}) => {
  if (hideHeader) return null;

  return (
    <header
      className={`${
        sticky ? 'sticky top-0 z-30' : 'relative'
      } bg-white/95 backdrop-blur-md border-b border-slate-200/80 min-h-[48px] px-3.5 py-1.5 flex items-center justify-between gap-2.5 shadow-2xs transition-all ${className}`}
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        {onBack && (
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onBack();
            }}
            className="w-9 h-9 min-h-[36px] min-w-[36px] rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-800 border border-slate-200/80 flex items-center justify-center transition-all cursor-pointer active:scale-95 shrink-0"
            title={backTitle}
            aria-label={backTitle}
          >
            <ArrowLeft className="w-4 h-4 text-slate-700" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-[16px] font-bold text-slate-900 leading-tight truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="text-[11px] font-medium text-slate-500 truncate leading-tight mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {rightAction && <div className="shrink-0 flex items-center gap-1.5">{rightAction}</div>}
    </header>
  );
};
