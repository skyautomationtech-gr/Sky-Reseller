import React from 'react';
import { motion, useReducedMotion } from 'motion/react';

interface IllustrationProps {
  accentColor: string;
  accentBg: string;
}

// 1. Entrepreneur & Reselling Concept
export const EntrepreneurIllustration: React.FC<IllustrationProps> = ({ accentColor }) => {
  const shouldReduceMotion = useReducedMotion();

  const floatTransition = shouldReduceMotion
    ? {}
    : {
        repeat: Infinity,
        duration: 3.6,
        ease: 'easeInOut',
      };

  return (
    <div className="relative w-full h-full flex items-center justify-center pointer-events-none select-none">
      {/* Soft circular halo platform */}
      <div
        className="absolute w-44 h-44 rounded-full blur-2xl opacity-40 -bottom-4"
        style={{ backgroundColor: accentColor }}
      />
      <div className="absolute w-52 h-14 rounded-[100%] bg-[#021427]/80 border border-teal-500/20 bottom-1 blur-[1px]" />

      <motion.div
        className="relative z-10 w-full max-w-[280px] h-[220px] flex items-center justify-center"
        animate={shouldReduceMotion ? {} : { y: [-5, 5, -5] }}
        transition={floatTransition}
      >
        <svg
          viewBox="0 0 280 220"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full drop-shadow-2xl"
        >
          <defs>
            {/* Gradients */}
            <linearGradient id="phoneBody1" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#0B2A4A" />
              <stop offset="100%" stopColor="#041B33" />
            </linearGradient>
            <linearGradient id="phoneScreen1" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#07203D" />
              <stop offset="100%" stopColor="#021224" />
            </linearGradient>
            <linearGradient id="cardGrad1" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#0E9AA7" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#075E66" stopOpacity="0.95" />
            </linearGradient>
            <linearGradient id="accentGrad1" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#3DD055" />
              <stop offset="100%" stopColor="#10B981" />
            </linearGradient>
            <filter id="glow1" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#0E9AA7" floodOpacity="0.35" />
            </filter>
          </defs>

          {/* Isometric Ground Shadow */}
          <ellipse cx="140" cy="205" rx="90" ry="12" fill="#020E1C" fillOpacity="0.6" />

          {/* Central Smartphone */}
          <g transform="translate(85, 20)">
            {/* Phone Outer Chassis */}
            <rect
              x="0"
              y="0"
              width="110"
              height="180"
              rx="20"
              fill="url(#phoneBody1)"
              stroke="#1E3E62"
              strokeWidth="2"
            />
            {/* Inner Screen */}
            <rect
              x="5"
              y="7"
              width="100"
              height="166"
              rx="15"
              fill="url(#phoneScreen1)"
              stroke="#0A2544"
              strokeWidth="1"
            />

            {/* Speaker & camera pill */}
            <rect x="42" y="12" width="26" height="4" rx="2" fill="#143454" />

            {/* Storefront Header */}
            <rect x="14" y="24" width="82" height="18" rx="5" fill="#0D2D4F" />
            <circle cx="23" cy="33" r="5" fill="#0E9AA7" />
            <rect x="33" y="29" width="36" height="3.5" rx="1.75" fill="#E2E8F0" />
            <rect x="33" y="35" width="22" height="2.5" rx="1.25" fill="#64748B" />

            {/* Product Card 1 */}
            <rect x="14" y="48" width="82" height="52" rx="8" fill="#0B2642" stroke="#163C66" strokeWidth="1" />
            <rect x="20" y="54" width="30" height="30" rx="6" fill="#12365D" />
            {/* Mini bag/shirt illustration */}
            <path d="M28 66 L35 60 L42 66 L40 76 L30 76 Z" fill="#0E9AA7" opacity="0.85" />
            <rect x="56" y="56" width="34" height="4" rx="2" fill="#F8FAFC" />
            <rect x="56" y="63" width="24" height="3" rx="1.5" fill="#94A3B8" />
            {/* Price Chip */}
            <rect x="56" y="71" width="32" height="9" rx="4.5" fill="url(#accentGrad1)" />
            <text x="61" y="78" fontSize="6.5" fontWeight="bold" fill="#04203F">৳ পাইকারি</text>

            {/* Product Card 2 (Peek) */}
            <rect x="14" y="106" width="82" height="46" rx="8" fill="#0B2642" stroke="#163C66" strokeWidth="1" />
            <rect x="20" y="112" width="26" height="26" rx="6" fill="#12365D" />
            <rect x="52" y="115" width="38" height="4" rx="2" fill="#CBD5E1" />
            <rect x="52" y="122" width="24" height="3" rx="1.5" fill="#64748B" />
            <rect x="52" y="129" width="30" height="8" rx="4" fill="#0E9AA7" opacity="0.8" />
          </g>
        </svg>

        {/* Floating Item 1: Shopping Cart Card (Top-Left) */}
        <motion.div
          className="absolute -top-1 -left-2 sm:left-2 bg-gradient-to-br from-[#0B2E50] to-[#041E38] border border-teal-500/40 p-2.5 rounded-2xl shadow-xl flex items-center gap-2 backdrop-blur-md"
          animate={shouldReduceMotion ? {} : { y: [-6, 3, -6], rotate: [-2, 3, -2] }}
          transition={{ repeat: Infinity, duration: 4.2, ease: 'easeInOut' }}
        >
          <div className="w-7 h-7 rounded-xl bg-[#0E9AA7]/20 border border-[#0E9AA7]/40 flex items-center justify-center text-teal-300">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <div className="pr-1">
            <span className="block text-[10px] font-bold text-white tracking-tight leading-none">রিসেলার শপ</span>
            <span className="block text-[8px] font-semibold text-emerald-400 mt-0.5">অর্ডার রেডি</span>
          </div>
        </motion.div>

        {/* Floating Item 2: Taka Symbol Pill (Top-Right) */}
        <motion.div
          className="absolute top-6 -right-2 sm:right-2 bg-gradient-to-br from-[#062947] to-[#02172C] border border-emerald-400/50 px-3 py-2 rounded-2xl shadow-xl flex items-center gap-2 backdrop-blur-md"
          animate={shouldReduceMotion ? {} : { y: [4, -5, 4], rotate: [2, -2, 2] }}
          transition={{ repeat: Infinity, duration: 3.8, ease: 'easeInOut', delay: 0.3 }}
        >
          <div className="w-6 h-6 rounded-lg bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center text-emerald-400 font-extrabold text-[13px]">
            ৳
          </div>
          <div className="pr-0.5">
            <span className="block text-[11px] font-black text-emerald-400 leading-none">০ পুঁজি</span>
            <span className="block text-[8px] font-medium text-slate-300 mt-0.5">জিরো রিস্ক</span>
          </div>
        </motion.div>

        {/* Floating Item 3: Customer Chat Bubble (Bottom-Left) */}
        <motion.div
          className="absolute bottom-4 -left-3 sm:left-4 bg-[#0A2644]/90 border border-white/15 px-2.5 py-1.5 rounded-xl shadow-lg flex items-center gap-1.5 backdrop-blur-md"
          animate={shouldReduceMotion ? {} : { y: [-3, 4, -3], x: [-2, 2, -2] }}
          transition={{ repeat: Infinity, duration: 4.5, ease: 'easeInOut', delay: 0.6 }}
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <span className="text-[9px] font-semibold text-slate-200">কাস্টমার অর্ডার +১</span>
        </motion.div>
      </motion.div>
    </div>
  );
};

// 2. Zero Investment & Wholesale Catalog
export const ZeroInvestmentIllustration: React.FC<IllustrationProps> = ({ accentColor }) => {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="relative w-full h-full flex items-center justify-center pointer-events-none select-none">
      <div
        className="absolute w-44 h-44 rounded-full blur-2xl opacity-40 -bottom-4"
        style={{ backgroundColor: accentColor }}
      />
      <div className="absolute w-52 h-14 rounded-[100%] bg-[#021427]/80 border border-teal-500/20 bottom-1 blur-[1px]" />

      <motion.div
        className="relative z-10 w-full max-w-[280px] h-[220px] flex items-center justify-center"
        animate={shouldReduceMotion ? {} : { y: [-5, 5, -5] }}
        transition={shouldReduceMotion ? {} : { repeat: Infinity, duration: 3.5, ease: 'easeInOut' }}
      >
        <svg
          viewBox="0 0 280 220"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full drop-shadow-2xl"
        >
          <defs>
            <linearGradient id="phoneScreen2" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#082342" />
              <stop offset="100%" stopColor="#031326" />
            </linearGradient>
            <linearGradient id="boxGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#C28847" />
              <stop offset="100%" stopColor="#8C5824" />
            </linearGradient>
            <linearGradient id="boxTop" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#D99E5C" />
              <stop offset="100%" stopColor="#B07436" />
            </linearGradient>
          </defs>

          {/* Central Phone */}
          <g transform="translate(85, 20)">
            <rect x="0" y="0" width="110" height="180" rx="20" fill="#0B2A4A" stroke="#1E3E62" strokeWidth="2" />
            <rect x="5" y="7" width="100" height="166" rx="15" fill="url(#phoneScreen2)" />
            <rect x="42" y="12" width="26" height="4" rx="2" fill="#143454" />

            {/* 4-Tile Product Grid */}
            <rect x="12" y="26" width="40" height="48" rx="8" fill="#0D2E50" stroke="#1A4778" strokeWidth="1" />
            <rect x="16" y="30" width="32" height="26" rx="5" fill="#143B66" />
            <circle cx="32" cy="43" r="6" fill="#0E9AA7" />
            <rect x="16" y="60" width="22" height="4" rx="2" fill="#E2E8F0" />
            <rect x="16" y="66" width="14" height="3" rx="1.5" fill="#3DD055" />

            <rect x="58" y="26" width="40" height="48" rx="8" fill="#0D2E50" stroke="#1A4778" strokeWidth="1" />
            <rect x="62" y="30" width="32" height="26" rx="5" fill="#143B66" />
            <path d="M72 48 L78 36 L84 48 Z" fill="#38BDF8" opacity="0.9" />
            <rect x="62" y="60" width="20" height="4" rx="2" fill="#E2E8F0" />
            <rect x="62" y="66" width="16" height="3" rx="1.5" fill="#3DD055" />

            {/* Grid Row 2 */}
            <rect x="12" y="80" width="40" height="48" rx="8" fill="#0D2E50" stroke="#1A4778" strokeWidth="1" />
            <rect x="16" y="84" width="32" height="26" rx="5" fill="#143B66" />
            <rect x="58" y="80" width="40" height="48" rx="8" fill="#0D2E50" stroke="#1A4778" strokeWidth="1" />
            <rect x="62" y="84" width="32" height="26" rx="5" fill="#143B66" />
          </g>
        </svg>

        {/* Lifted Away Cardboard Box with dashed zero-stock trail */}
        <motion.div
          className="absolute -top-3 -right-2 sm:right-3 w-28 bg-[#0F2F4E]/95 border border-amber-500/50 rounded-2xl p-2.5 shadow-2xl backdrop-blur-md flex flex-col items-center"
          animate={shouldReduceMotion ? {} : { y: [-8, 2, -8], rotate: [2, -2, 2] }}
          transition={{ repeat: Infinity, duration: 4.0, ease: 'easeInOut' }}
        >
          {/* Stylized Box Icon */}
          <div className="w-12 h-10 relative">
            <svg viewBox="0 0 48 40" fill="none" className="w-full h-full">
              <path d="M24 2 L46 11 L24 20 L2 11 Z" fill="#D99E5C" stroke="#8C5824" strokeWidth="1" />
              <path d="M2 11 L24 20 L24 38 L2 29 Z" fill="#C28847" />
              <path d="M24 20 L46 11 L46 29 L24 38 Z" fill="#A86C2D" />
              <path d="M14 6.5 L34 15.5" stroke="#FDE68A" strokeWidth="2" strokeDasharray="2 1" />
            </svg>
          </div>
          <span className="text-[10px] font-bold text-amber-300 mt-1">স্টক তোলার চাপ নেই</span>
          <span className="text-[8px] text-slate-300">ReSellBD হ্যান্ডেল করবে</span>
        </motion.div>

        {/* ৳0 Invest Tag (Floating Bottom-Left) */}
        <motion.div
          className="absolute bottom-5 -left-3 sm:left-3 bg-gradient-to-r from-emerald-950 to-teal-950 border border-emerald-400/60 px-3.5 py-2 rounded-2xl shadow-xl flex items-center gap-2 backdrop-blur-md"
          animate={shouldReduceMotion ? {} : { y: [3, -5, 3] }}
          transition={{ repeat: Infinity, duration: 3.4, ease: 'easeInOut', delay: 0.4 }}
        >
          <div className="w-7 h-7 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-extrabold text-[14px]">
            ৳০
          </div>
          <div>
            <span className="block text-[11px] font-black text-white leading-tight">জিরো ইনভেস্ট</span>
            <span className="block text-[8px] font-semibold text-emerald-300">হোলসেল রেটে সেল</span>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
};

// 3. Order Management & Margin Setting
export const OrderManagementIllustration: React.FC<IllustrationProps> = ({ accentColor }) => {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="relative w-full h-full flex items-center justify-center pointer-events-none select-none">
      <div
        className="absolute w-44 h-44 rounded-full blur-2xl opacity-40 -bottom-4"
        style={{ backgroundColor: accentColor }}
      />
      <div className="absolute w-52 h-14 rounded-[100%] bg-[#021427]/80 border border-teal-500/20 bottom-1 blur-[1px]" />

      <motion.div
        className="relative z-10 w-full max-w-[280px] h-[220px] flex items-center justify-center"
        animate={shouldReduceMotion ? {} : { y: [-5, 5, -5] }}
        transition={shouldReduceMotion ? {} : { repeat: Infinity, duration: 3.6, ease: 'easeInOut' }}
      >
        <svg
          viewBox="0 0 280 220"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full drop-shadow-2xl"
        >
          <defs>
            <linearGradient id="phoneScreen3" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#092748" />
              <stop offset="100%" stopColor="#031427" />
            </linearGradient>
          </defs>

          {/* Central Phone */}
          <g transform="translate(85, 20)">
            <rect x="0" y="0" width="110" height="180" rx="20" fill="#0B2A4A" stroke="#1E3E62" strokeWidth="2" />
            <rect x="5" y="7" width="100" height="166" rx="15" fill="url(#phoneScreen3)" />
            <rect x="42" y="12" width="26" height="4" rx="2" fill="#143454" />

            {/* Screen Header: Orders */}
            <rect x="14" y="24" width="82" height="16" rx="5" fill="#0E2F52" />
            <rect x="22" y="29" width="34" height="4" rx="2" fill="#F8FAFC" />
            <circle cx="86" cy="32" r="3" fill="#3DD055" />

            {/* Order Card 1 */}
            <rect x="12" y="46" width="86" height="48" rx="8" fill="#0C2B4B" stroke="#1C4573" strokeWidth="1" />
            <text x="18" y="58" fontSize="7" fontWeight="bold" fill="#38BDF8">অর্ডার #RB-9104</text>
            <rect x="58" y="50" width="34" height="10" rx="5" fill="#3DD055" fillOpacity="0.2" />
            <text x="64" y="57" fontSize="5.5" fontWeight="bold" fill="#3DD055">কনফার্মড</text>
            <rect x="18" y="65" width="48" height="3.5" rx="1.75" fill="#CBD5E1" />
            <rect x="18" y="71" width="30" height="3" rx="1.5" fill="#64748B" />
            <text x="18" y="86" fontSize="7.5" fontWeight="bold" fill="#F59E0B">প্রফিট: +৳৩৫০</text>

            {/* Order Card 2 */}
            <rect x="12" y="100" width="86" height="48" rx="8" fill="#0C2B4B" stroke="#1C4573" strokeWidth="1" />
            <text x="18" y="112" fontSize="7" fontWeight="bold" fill="#38BDF8">অর্ডার #RB-9105</text>
            <rect x="58" y="104" width="34" height="10" rx="5" fill="#0E9AA7" fillOpacity="0.25" />
            <text x="64" y="111" fontSize="5.5" fontWeight="bold" fill="#0E9AA7">ডেলিভারিতে</text>
            <rect x="18" y="119" width="50" height="3.5" rx="1.75" fill="#CBD5E1" />
            <text x="18" y="140" fontSize="7.5" fontWeight="bold" fill="#3DD055">প্রফিট: +৳৫০০</text>
          </g>
        </svg>

        {/* Pulsing Notification Bell (Top-Left) */}
        <motion.div
          className="absolute top-2 -left-3 sm:left-3 bg-[#0B2B4C] border border-amber-400/50 p-2.5 rounded-2xl shadow-xl flex items-center gap-2 backdrop-blur-md"
          animate={shouldReduceMotion ? {} : { y: [-5, 4, -5], rotate: [-2, 2, -2] }}
          transition={{ repeat: Infinity, duration: 3.2, ease: 'easeInOut' }}
        >
          <div className="relative">
            <div className="w-7 h-7 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            {/* Pulsing red badge */}
            <motion.span
              className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-rose-500 text-[8px] font-bold text-white flex items-center justify-center"
              animate={shouldReduceMotion ? {} : { scale: [1, 1.25, 1] }}
              transition={{ repeat: Infinity, duration: 1.8 }}
            >
              1
            </motion.span>
          </div>
          <div className="pr-1">
            <span className="block text-[10px] font-bold text-white leading-tight">নতুন অর্ডার</span>
            <span className="block text-[8px] font-semibold text-amber-300">১ সেকেন্ড আগে</span>
          </div>
        </motion.div>

        {/* Smart Margin Formula Pill (Bottom-Right) */}
        <motion.div
          className="absolute bottom-5 -right-3 sm:right-3 bg-gradient-to-r from-[#072440] to-[#041A30] border border-teal-400/50 px-3.5 py-2 rounded-2xl shadow-xl backdrop-blur-md"
          animate={shouldReduceMotion ? {} : { y: [4, -4, 4] }}
          transition={{ repeat: Infinity, duration: 4.0, ease: 'easeInOut', delay: 0.5 }}
        >
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-teal-400" />
            <span className="text-[10px] font-black text-teal-300">মার্জিন ফর্মুলা</span>
          </div>
          <p className="text-[9px] font-medium text-slate-200 mt-0.5">
            মুনাফা = (সেলিং রেট - পাইকারি)
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
};

// 4. Nationwide Delivery & COD
export const DeliveryIllustration: React.FC<IllustrationProps> = ({ accentColor }) => {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="relative w-full h-full flex items-center justify-center pointer-events-none select-none">
      <div
        className="absolute w-44 h-44 rounded-full blur-2xl opacity-40 -bottom-4"
        style={{ backgroundColor: accentColor }}
      />
      <div className="absolute w-52 h-14 rounded-[100%] bg-[#021427]/80 border border-teal-500/20 bottom-1 blur-[1px]" />

      <motion.div
        className="relative z-10 w-full max-w-[280px] h-[220px] flex items-center justify-center"
        animate={shouldReduceMotion ? {} : { y: [-5, 5, -5] }}
        transition={shouldReduceMotion ? {} : { repeat: Infinity, duration: 3.5, ease: 'easeInOut' }}
      >
        <svg
          viewBox="0 0 280 220"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full drop-shadow-2xl"
        >
          <defs>
            <linearGradient id="phoneScreen4" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#08223F" />
              <stop offset="100%" stopColor="#021020" />
            </linearGradient>
            <linearGradient id="roadGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#0E9AA7" stopOpacity="0.1" />
              <stop offset="50%" stopColor="#0E9AA7" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#3DD055" stopOpacity="0.9" />
            </linearGradient>
          </defs>

          {/* Perspective Map Path */}
          <path
            d="M20 185 Q 90 140, 140 160 T 260 145"
            stroke="url(#roadGrad)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray="6 4"
          />

          {/* Central Phone showing Live Tracking */}
          <g transform="translate(85, 20)">
            <rect x="0" y="0" width="110" height="180" rx="20" fill="#0B2A4A" stroke="#1E3E62" strokeWidth="2" />
            <rect x="5" y="7" width="100" height="166" rx="15" fill="url(#phoneScreen4)" />
            <rect x="42" y="12" width="26" height="4" rx="2" fill="#143454" />

            {/* Simulated Live GPS Map */}
            <rect x="12" y="24" width="86" height="88" rx="8" fill="#0A1E35" stroke="#153B62" strokeWidth="1" />
            {/* Map grid streets */}
            <path d="M12 45 L98 45 M12 75 L98 75 M40 24 L40 112 M70 24 L70 112" stroke="#12365D" strokeWidth="1" />
            {/* Navigation Route */}
            <path d="M25 90 Q 55 50, 75 40" stroke="#38BDF8" strokeWidth="3" strokeLinecap="round" />
            <circle cx="25" cy="90" r="4" fill="#0E9AA7" />
            <circle cx="75" cy="40" r="5" fill="#3DD055" />
            <circle cx="75" cy="40" r="2" fill="#FFFFFF" />

            {/* Courier Status Pill */}
            <rect x="12" y="120" width="86" height="44" rx="8" fill="#0B2745" stroke="#18416D" strokeWidth="1" />
            <text x="18" y="132" fontSize="7" fontWeight="bold" fill="#FFFFFF">ক্যাশ অন ডেলিভারি</text>
            <text x="18" y="142" fontSize="6" fontWeight="medium" fill="#94A3B8">রাইডার পথে রয়েছে</text>
            <rect x="18" y="148" width="60" height="4" rx="2" fill="#3DD055" />
          </g>
        </svg>

        {/* Sliding Parcel Box along the Path */}
        <motion.div
          className="absolute -top-2 -right-3 sm:right-2 bg-gradient-to-br from-[#0B2F52] to-[#041D35] border border-sky-400/50 p-2.5 rounded-2xl shadow-2xl flex items-center gap-2 backdrop-blur-md"
          animate={shouldReduceMotion ? {} : { x: [-6, 6, -6], y: [-3, 3, -3] }}
          transition={{ repeat: Infinity, duration: 3.8, ease: 'easeInOut' }}
        >
          <div className="w-8 h-8 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
          </div>
          <div className="pr-1">
            <span className="block text-[10px] font-bold text-white leading-tight">ডোরস্টেপ শিপিং</span>
            <span className="block text-[8px] font-semibold text-sky-300 mt-0.5">১০০% ক্যাশ অন ডেলিভারি</span>
          </div>
        </motion.div>

        {/* 64 Districts Badge (Bottom-Left) */}
        <motion.div
          className="absolute bottom-5 -left-3 sm:left-3 bg-[#08223D]/95 border border-emerald-400/50 px-3 py-1.5 rounded-2xl shadow-xl flex items-center gap-1.5 backdrop-blur-md"
          animate={shouldReduceMotion ? {} : { y: [3, -4, 3] }}
          transition={{ repeat: Infinity, duration: 3.5, ease: 'easeInOut', delay: 0.3 }}
        >
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[10px] font-extrabold text-emerald-400">৬৪ জেলায় ডেলিভারি</span>
        </motion.div>
      </motion.div>
    </div>
  );
};

// 5. Commission & Easy Wallet Withdrawal
export const CommissionIllustration: React.FC<IllustrationProps> = ({ accentColor }) => {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="relative w-full h-full flex items-center justify-center pointer-events-none select-none">
      <div
        className="absolute w-44 h-44 rounded-full blur-2xl opacity-40 -bottom-4"
        style={{ backgroundColor: accentColor }}
      />
      <div className="absolute w-52 h-14 rounded-[100%] bg-[#021427]/80 border border-teal-500/20 bottom-1 blur-[1px]" />

      <motion.div
        className="relative z-10 w-full max-w-[280px] h-[220px] flex items-center justify-center"
        animate={shouldReduceMotion ? {} : { y: [-5, 5, -5] }}
        transition={shouldReduceMotion ? {} : { repeat: Infinity, duration: 3.6, ease: 'easeInOut' }}
      >
        <svg
          viewBox="0 0 280 220"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full drop-shadow-2xl"
        >
          <defs>
            <linearGradient id="phoneScreen5" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#082544" />
              <stop offset="100%" stopColor="#021223" />
            </linearGradient>
            <linearGradient id="coinGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#FDE047" />
              <stop offset="100%" stopColor="#EAB308" />
            </linearGradient>
            <linearGradient id="walletGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#0E365E" />
              <stop offset="100%" stopColor="#061D35" />
            </linearGradient>
          </defs>

          {/* Central Phone displaying Wallet Balance */}
          <g transform="translate(85, 20)">
            <rect x="0" y="0" width="110" height="180" rx="20" fill="#0B2A4A" stroke="#1E3E62" strokeWidth="2" />
            <rect x="5" y="7" width="100" height="166" rx="15" fill="url(#phoneScreen5)" />
            <rect x="42" y="12" width="26" height="4" rx="2" fill="#143454" />

            {/* Wallet Card */}
            <rect x="12" y="24" width="86" height="60" rx="10" fill="url(#walletGrad)" stroke="#1C4E7E" strokeWidth="1" />
            <text x="20" y="38" fontSize="6.5" fontWeight="bold" fill="#94A3B8">রিসেলার ওয়ালেট ব্যালেন্স</text>
            <text x="20" y="55" fontSize="13" fontWeight="900" fill="#3DD055">৳ ১২,৪৫০</text>
            <rect x="20" y="64" width="46" height="11" rx="5.5" fill="#3DD055" fillOpacity="0.2" />
            <text x="25" y="72" fontSize="6" fontWeight="bold" fill="#3DD055">উইথড্র রেডি</text>

            {/* Payout Channels Chips */}
            <rect x="12" y="92" width="86" height="24" rx="6" fill="#09223D" />
            <rect x="18" y="97" width="24" height="14" rx="4" fill="#E11D48" fillOpacity="0.8" />
            <text x="21" y="107" fontSize="6" fontWeight="bold" fill="#FFFFFF">বিকাশ</text>
            <rect x="46" y="97" width="22" height="14" rx="4" fill="#EA580C" fillOpacity="0.85" />
            <text x="50" y="107" fontSize="6" fontWeight="bold" fill="#FFFFFF">নগদ</text>
            <rect x="72" y="97" width="20" height="14" rx="4" fill="#0E9AA7" fillOpacity="0.85" />
            <text x="75" y="107" fontSize="6" fontWeight="bold" fill="#FFFFFF">ব্যাংক</text>

            {/* Mini Growth Bars */}
            <rect x="14" y="148" width="12" height="16" rx="2" fill="#0E9AA7" opacity="0.6" />
            <rect x="30" y="140" width="12" height="24" rx="2" fill="#0E9AA7" opacity="0.8" />
            <rect x="46" y="132" width="12" height="32" rx="2" fill="#10B981" />
            <rect x="62" y="124" width="12" height="40" rx="2" fill="#3DD055" />
            <rect x="78" y="118" width="12" height="46" rx="2" fill="#3DD055" />
          </g>
        </svg>

        {/* Rising Taka Coins with looping vertical animation */}
        <div className="absolute top-8 -right-2 sm:right-2 flex flex-col items-center">
          <motion.div
            className="w-10 h-10 rounded-full bg-gradient-to-tr from-yellow-500 to-amber-300 border-2 border-yellow-200 shadow-xl flex items-center justify-center text-[#04203F] font-black text-[16px]"
            animate={shouldReduceMotion ? {} : { y: [0, -18, 0], opacity: [0.3, 1, 0.3], scale: [0.9, 1.1, 0.9] }}
            transition={{ repeat: Infinity, duration: 2.8, ease: 'easeInOut' }}
          >
            ৳
          </motion.div>
          <span className="text-[9px] font-black text-amber-300 mt-1 shadow-xs bg-[#041B33]/90 px-2 py-0.5 rounded-full border border-amber-400/40">
            ইনস্ট্যান্ট ক্রেডিট
          </span>
        </div>

        {/* Payout channels pill (Bottom-Left) */}
        <motion.div
          className="absolute bottom-5 -left-3 sm:left-3 bg-gradient-to-r from-emerald-950 to-teal-950 border border-emerald-400/50 px-3 py-2 rounded-2xl shadow-xl flex items-center gap-2 backdrop-blur-md"
          animate={shouldReduceMotion ? {} : { y: [4, -4, 4] }}
          transition={{ repeat: Infinity, duration: 3.4, ease: 'easeInOut', delay: 0.4 }}
        >
          <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-[12px]">
            ✓
          </div>
          <div>
            <span className="block text-[10px] font-bold text-white leading-tight">বিকাশ ও নগদে পেআউট</span>
            <span className="block text-[8px] text-emerald-300">কোনো লুকানো ফি নেই</span>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
};
