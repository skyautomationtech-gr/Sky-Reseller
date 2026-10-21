import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Globe, Shield, CheckCircle2, ChevronDown, AlertCircle } from 'lucide-react';
import { PolicyDoc } from '../../../data/defaultPolicies';

interface PolicyModalProps {
  isOpen: boolean;
  policy: PolicyDoc | null;
  onClose: () => void;
  onScrolledToBottom: () => void;
  alreadyScrolled: boolean;
}

export const PolicyModal: React.FC<PolicyModalProps> = ({
  isOpen,
  policy,
  onClose,
  onScrolledToBottom,
  alreadyScrolled,
}) => {
  const [lang, setLang] = useState<'bn' | 'en'>('bn');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrolledToBottom, setScrolledToBottom] = useState(alreadyScrolled);

  useEffect(() => {
    if (alreadyScrolled) {
      setScrolledToBottom(true);
    }
  }, [alreadyScrolled]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const reached = el.scrollTop + el.clientHeight >= el.scrollHeight - 30;
    if (reached && !scrolledToBottom) {
      setScrolledToBottom(true);
      onScrolledToBottom();
    }
  };

  if (!isOpen || !policy) return null;

  const title = lang === 'bn' ? policy.titleBn : policy.titleEn;
  const sections = lang === 'bn' ? policy.sectionsBn : policy.sectionsEn;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2 }}
          className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl bg-[#09152C]/95 border border-white/20 shadow-[0_20px_50px_rgba(0,0,0,0.7)] backdrop-blur-2xl overflow-hidden text-white"
        >
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between gap-3 bg-white/[0.03]">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#0E9AA7] to-[#3DD055] flex items-center justify-center shrink-0 shadow-md">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <div className="truncate">
                <h2 className="text-sm sm:text-base font-extrabold truncate text-white">{title}</h2>
                <div className="flex items-center gap-2 text-[10px] text-slate-400">
                  <span>Version {policy.version}</span>
                  <span>•</span>
                  <span>{policy.lastUpdated}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Language Switcher */}
              <div className="flex items-center rounded-xl bg-white/10 p-0.5 border border-white/15">
                <button
                  type="button"
                  onClick={() => setLang('bn')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    lang === 'bn'
                      ? 'bg-gradient-to-r from-[#0E9AA7] to-[#3DD055] text-white shadow-xs'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  বাংলা
                </button>
                <button
                  type="button"
                  onClick={() => setLang('en')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    lang === 'en'
                      ? 'bg-gradient-to-r from-[#0E9AA7] to-[#3DD055] text-white shadow-xs'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  English
                </button>
              </div>

              {/* Close Button */}
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Legal Notice Header */}
          <div className="px-4 py-2.5 bg-amber-500/10 border-b border-amber-500/20 flex items-center gap-2 text-[11px] text-amber-300">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
            <span className="leading-tight">{policy.legalDisclaimer}</span>
          </div>

          {/* Scrollable Body */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 text-xs sm:text-sm text-slate-200 leading-relaxed scrollbar-thin scrollbar-thumb-white/20"
          >
            {sections.map((sec, idx) => (
              <div key={idx} className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 space-y-1.5">
                <h3 className="font-bold text-white text-xs sm:text-sm flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#3DD055]" />
                  {sec.title}
                </h3>
                <p className="text-slate-300 text-xs sm:text-[13px] leading-relaxed">
                  {sec.content}
                </p>
              </div>
            ))}

            <div className="py-4 text-center text-xs text-slate-400">
              — End of Document —
            </div>
          </div>

          {/* Footer with Scroll Status & Confirm */}
          <div className="p-4 border-t border-white/10 bg-white/[0.02] flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs">
              {scrolledToBottom ? (
                <span className="text-[#3DD055] font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> You have reviewed the full document. Checkbox unlocked!
                </span>
              ) : (
                <span className="text-amber-400 font-medium flex items-center gap-1">
                  <ChevronDown className="w-4 h-4 animate-bounce" /> Please scroll to the bottom of the document to unlock agreement.
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                if (scrolledToBottom) {
                  onClose();
                } else {
                  // Scroll to bottom
                  scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
                }
              }}
              className={`w-full sm:w-auto px-5 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                scrolledToBottom
                  ? 'bg-gradient-to-r from-[#0E9AA7] to-[#3DD055] text-white shadow-md hover:brightness-110'
                  : 'bg-white/15 text-slate-300 hover:bg-white/25'
              }`}
            >
              {scrolledToBottom ? 'I Have Read & Understand' : 'Scroll to Bottom'}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
