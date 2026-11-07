/**
 * Shared Density Tokens & Styling Classes for Reseller App UI
 * Compact mobile fintech app scale:
 * - Page title 16px, group label 10-11px uppercase muted, row height 48px
 * - Row title 13px, row helper text 11px, values 12px
 * - Buttons 34-36px, inputs 40px, side margin 12px, gaps 8-10px
 * - Min tap target 44px, responsive 320-430px
 */

export const DENSITY_TOKENS = {
  // Typography
  pageTitle: 'text-[16px] font-bold text-[#04203F] tracking-tight leading-tight',
  pageSubtitle: 'text-[11px] font-medium text-slate-500 truncate mt-0.5',
  sectionTitle: 'text-[13px] font-bold text-[#04203F] tracking-tight',
  bodyText: 'text-[12px] font-medium text-slate-700 leading-snug',
  metaLabel: 'text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider',
  
  // Settings Specific Typography
  settingsGroupLabel: 'text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider px-3 pb-1.5',
  settingsRowTitle: 'text-[13px] font-semibold text-[#04203F] tracking-tight leading-tight',
  settingsRowHelper: 'text-[11px] font-medium text-slate-500 leading-tight mt-0.5',
  settingsRowValue: 'text-[12px] font-medium text-slate-700 truncate',

  // Money numerals
  balanceAmount: 'text-[26px] font-black text-[#04203F] font-mono tabular-nums leading-none',
  moneyFigure: 'text-[14px] sm:text-[15px] font-extrabold font-mono tabular-nums',
  
  // Buttons
  primaryButton: 'h-[34px] sm:h-[36px] px-3.5 rounded-xl bg-[#04203F] hover:bg-[#0E9AA7] text-white text-[12px] font-bold transition-all shadow-2xs active:scale-[0.98] flex items-center justify-center gap-1.5 cursor-pointer min-h-[44px]',
  secondaryButton: 'h-[34px] sm:h-[36px] px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#04203F] text-[12px] font-bold border border-slate-200/80 transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 cursor-pointer min-h-[44px]',
  smallButton: 'h-[28px] px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold transition-colors flex items-center justify-center gap-1 cursor-pointer',
  iconButton: 'w-[32px] h-[32px] rounded-lg bg-white/80 hover:bg-white text-slate-600 border border-slate-200/80 flex items-center justify-center transition-all cursor-pointer active:scale-95',
  
  // Cards & Layout
  cardPadding: 'p-2.5 sm:p-3',
  cardRadius: 'rounded-[14px]',
  cardGlass: 'bg-white/70 backdrop-blur-xl border border-white/80 shadow-[0_2px_12px_rgba(4,32,63,0.03)]',
  settingsGroupCard: 'bg-white/70 backdrop-blur-xl border border-white/80 rounded-[14px] overflow-hidden divide-y divide-slate-100/90 shadow-[0_2px_12px_rgba(4,32,63,0.03)]',
  settingsRow: 'w-full min-h-[48px] px-3.5 py-2.5 flex items-center justify-between hover:bg-slate-50/70 active:bg-slate-100/60 transition-colors text-left cursor-pointer min-h-[44px] select-none',
  gap: 'gap-2 sm:gap-2.5',
  sideMargin: 'px-3 sm:px-3.5',
  
  // Inputs
  inputHeight: 'h-[40px] px-3 text-[12px] bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-[#0E9AA7] focus:bg-white transition-all',

  // Transaction & Ledger
  txRowHeight: 'h-[52px]',
  txIconSize: 'w-[28px] h-[28px]',
  iconTile: 'w-[28px] h-[28px] rounded-[8px] flex items-center justify-center shrink-0 border border-slate-200/60',
  iconSize: 'w-[18px] h-[18px]',
};
