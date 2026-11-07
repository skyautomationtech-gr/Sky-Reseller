import React from 'react';
import { DENSITY_TOKENS as DT } from '../../utils/densityTokens';
import { Clock, ChevronRight, Wrench, ArrowLeft, Shield } from 'lucide-react';

interface SectionPlaceholderProps {
  title: string;
  description: string;
  partNotice?: string;
  icon?: React.ElementType;
  existingComponent?: React.ReactNode;
}

export const SectionPlaceholder: React.FC<SectionPlaceholderProps> = ({
  title,
  description,
  partNotice = 'Coming in the next step',
  icon: Icon = Wrench,
  existingComponent,
}) => {
  const [showLegacy, setShowLegacy] = React.useState(false);

  return (
    <div className="space-y-3 pb-16">
      {/* Compact Info Strip */}
      <div className={`${DT.cardRadius} ${DT.cardGlass} p-4 text-center space-y-2`}>
        <div className="w-10 h-10 rounded-2xl bg-teal-50 border border-teal-200 text-[#0E9AA7] flex items-center justify-center mx-auto">
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-[14px] font-bold text-[#04203F]">{title}</h3>
          <p className="text-[11px] text-slate-500 max-w-xs mx-auto mt-0.5 leading-relaxed">
            {description}
          </p>
        </div>
        <div className="pt-1">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-extrabold bg-blue-50 text-blue-700 border border-blue-200">
            <Clock className="w-3 h-3 text-[#0E9AA7]" />
            <span>{partNotice}</span>
          </span>
        </div>

        {existingComponent && (
          <div className="pt-2 border-t border-slate-100">
            <button
              onClick={() => setShowLegacy(!showLegacy)}
              className="text-[11px] font-bold text-[#0E9AA7] hover:underline cursor-pointer"
            >
              {showLegacy ? 'Hide functional controls' : 'Show existing functional controls →'}
            </button>
          </div>
        )}
      </div>

      {/* Optional Existing Component view */}
      {existingComponent && showLegacy && (
        <div className="pt-1">
          {existingComponent}
        </div>
      )}
    </div>
  );
};
