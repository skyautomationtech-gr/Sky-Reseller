/**
 * Shared Density Tokens & Styling Classes for Reseller App UI
 * Compact mobile fintech app scale (16px titles, 12-13px text, 34-36px buttons, 10-12px padding)
 */

export const DENSITY_TOKENS = {
  // Typography
  pageTitle: 'text-[16px] font-bold text-[#04203F] tracking-tight leading-tight',
  pageSubtitle: 'text-[11px] font-medium text-slate-500 truncate mt-0.5',
  sectionTitle: 'text-[13px] font-bold text-[#04203F] tracking-tight',
  bodyText: 'text-[12px] font-medium text-slate-700 leading-snug',
  metaLabel: 'text-[10px] font-bold text-slate-400 uppercase tracking-wider',
  
  // Money numerals
  balanceAmount: 'text-[26px] font-black text-[#04203F] font-mono tabular-nums leading-none',
  moneyFigure: 'text-[14px] sm:text-[15px] font-extrabold font-mono tabular-nums',
  
  // Buttons
  primaryButton: 'h-[34px] sm:h-[36px] px-3.5 rounded-xl bg-[#04203F] hover:bg-[#0E9AA7] text-white text-[12px] font-bold transition-all shadow-2xs active:scale-[0.98] flex items-center justify-center gap-1.5 cursor-pointer',
  secondaryButton: 'h-[34px] sm:h-[36px] px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#04203F] text-[12px] font-bold border border-slate-200/80 transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 cursor-pointer',
  smallButton: 'h-[28px] px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold transition-colors flex items-center justify-center gap-1 cursor-pointer',
  iconButton: 'w-[32px] h-[32px] rounded-lg bg-white/80 hover:bg-white text-slate-600 border border-slate-200/80 flex items-center justify-center transition-all cursor-pointer active:scale-95',
  
  // Cards & Layout
  cardPadding: 'p-2.5 sm:p-3',
  cardRadius: 'rounded-[14px]',
  cardGlass: 'bg-white/75 backdrop-blur-xl border border-white/80 shadow-[0_2px_12px_rgba(4,32,63,0.03)]',
  gap: 'gap-2 sm:gap-2.5',
  sideMargin: 'px-3 sm:px-3.5',
  
  // Transaction & Ledger
  txRowHeight: 'h-[52px]',
  txIconSize: 'w-[28px] h-[28px]',
  iconSize: 'w-4 h-4',
};
