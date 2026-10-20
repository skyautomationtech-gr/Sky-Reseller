import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, ChevronDown, Check, X, MapPin } from 'lucide-react';

export interface SelectOption {
  id: string;
  name: string;
  bn_name?: string;
}

interface SearchableSelectProps {
  label: string;
  placeholder?: string;
  options: SelectOption[];
  value: string; // Current name or ID
  onChange: (option: SelectOption | null, customText?: string) => void;
  disabled?: boolean;
  required?: boolean;
  error?: string;
  allowCustom?: boolean;
  customValue?: string;
  onCustomChange?: (val: string) => void;
  helperText?: string;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  label,
  placeholder = 'Select option...',
  options,
  value,
  onChange,
  disabled = false,
  required = false,
  error,
  allowCustom = true,
  customValue = '',
  onCustomChange,
  helperText,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCustomMode, setIsCustomMode] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  const filteredOptions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return options.slice(0, 50); // limit to top 50 for max speed
    return options
      .filter((opt) => {
        const en = (opt.name || '').toLowerCase();
        const bn = (opt.bn_name || '').toLowerCase();
        return en.includes(q) || bn.includes(q);
      })
      .slice(0, 50);
  }, [options, searchQuery]);

  const selectedOption = useMemo(() => {
    return options.find((opt) => opt.name.toLowerCase() === value.toLowerCase() || opt.id === value);
  }, [options, value]);

  const handleSelect = (option: SelectOption) => {
    setIsCustomMode(false);
    onChange(option);
    setIsOpen(false);
  };

  const handleChooseCustom = () => {
    setIsCustomMode(true);
    onChange(null, customValue || '');
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-full space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-slate-200 tracking-wide flex items-center gap-1">
          {label} {required && <span className="text-[#3DD055] font-black">*</span>}
        </label>
        {isCustomMode && (
          <button
            type="button"
            onClick={() => {
              setIsCustomMode(false);
              onChange(null);
            }}
            className="text-[10px] text-[#0E9AA7] hover:underline font-semibold cursor-pointer"
          >
            ← Back to list
          </button>
        )}
      </div>

      {isCustomMode ? (
        <div className="relative">
          <input
            type="text"
            placeholder={`Enter custom ${label.toLowerCase()}...`}
            value={customValue}
            onChange={(e) => {
              if (onCustomChange) onCustomChange(e.target.value);
            }}
            className="w-full min-h-[50px] px-4 py-3 bg-white/[0.08] backdrop-blur-[24px] border border-white/20 rounded-2xl text-white placeholder-slate-400 text-sm font-semibold outline-none focus:border-[#3DD055] focus:ring-2 focus:ring-[#0E9AA7]/50 transition-all shadow-[0_4px_20px_rgba(0,0,0,0.15)]"
          />
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setIsOpen(!isOpen)}
          className={`w-full min-h-[50px] px-4 py-3 bg-white/[0.08] backdrop-blur-[24px] border rounded-2xl text-left flex items-center justify-between transition-all cursor-pointer select-none ${
            disabled
              ? 'opacity-40 cursor-not-allowed border-white/10'
              : error
              ? 'border-rose-500/80 ring-2 ring-rose-500/20'
              : isOpen
              ? 'border-[#3DD055] ring-2 ring-[#0E9AA7]/50 shadow-[0_0_20px_rgba(14,154,167,0.25)]'
              : 'border-white/20 hover:border-white/35 hover:bg-white/[0.11]'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0 pr-2">
            <MapPin className={`w-4 h-4 shrink-0 ${value ? 'text-[#3DD055]' : 'text-slate-400'}`} />
            <span className={`text-sm truncate font-medium ${value ? 'text-white font-semibold' : 'text-slate-400'}`}>
              {selectedOption ? (
                <>
                  {selectedOption.name}
                  {selectedOption.bn_name && (
                    <span className="text-slate-400 ml-1.5 font-normal text-xs">({selectedOption.bn_name})</span>
                  )}
                </>
              ) : value ? (
                value
              ) : (
                placeholder
              )}
            </span>
          </div>
          <ChevronDown className={`w-4 h-4 text-slate-300 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180 text-[#3DD055]' : ''}`} />
        </button>
      )}

      {helperText && !error && (
        <p className="text-[11px] text-slate-400">{helperText}</p>
      )}
      {error && (
        <p className="text-[11px] font-semibold text-rose-400 flex items-center gap-1 mt-1">
          <span>⚠</span> {error}
        </p>
      )}

      {/* Dropdown Menu Modal */}
      <AnimatePresence>
        {isOpen && !disabled && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="absolute left-0 right-0 top-full mt-2 bg-[#09152C]/95 backdrop-blur-[28px] border border-white/25 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.6),0_0_25px_rgba(14,154,167,0.2)] z-50 overflow-hidden"
          >
            {/* Search Input Header */}
            <div className="p-2.5 border-b border-white/10 relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder={`Search ${options.length} ${label.toLowerCase()}...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-2 bg-white/[0.08] border border-white/15 rounded-xl text-xs sm:text-sm text-white placeholder-slate-400 outline-none focus:border-[#3DD055] transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-4.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Options List */}
            <div className="max-h-60 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700/80 p-1 divide-y divide-white/[0.04]">
              {filteredOptions.length > 0 ? (
                filteredOptions.map((opt) => {
                  const isSelected = (value || '').toLowerCase() === opt.name.toLowerCase() || value === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleSelect(opt)}
                      className={`w-full px-3.5 py-2.5 rounded-xl text-left text-xs sm:text-sm flex items-center justify-between transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-[#3DD055]/20 text-[#3DD055] font-bold'
                          : 'text-slate-200 hover:bg-white/[0.08] hover:text-white font-medium'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate pr-2">
                        <span>{opt.name}</span>
                        {opt.bn_name && (
                          <span className="text-slate-400 text-xs">({opt.bn_name})</span>
                        )}
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-[#3DD055] shrink-0" />}
                    </button>
                  );
                })
              ) : (
                <div className="p-4 text-center text-xs text-slate-400">
                  No matching {label.toLowerCase()} found.
                </div>
              )}

              {/* Allow Custom / Other Option */}
              {allowCustom && (
                <div className="p-1 pt-1.5 border-t border-white/10">
                  <button
                    type="button"
                    onClick={handleChooseCustom}
                    className="w-full px-3.5 py-2 rounded-xl text-left text-xs text-[#0E9AA7] hover:bg-[#0E9AA7]/15 transition-colors font-bold flex items-center justify-between cursor-pointer"
                  >
                    <span>+ Not listed / Type Other</span>
                    <span className="text-[10px] bg-[#0E9AA7]/20 px-1.5 py-0.5 rounded text-[#0E9AA7]">Custom</span>
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
