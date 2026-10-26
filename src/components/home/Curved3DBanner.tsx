import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { UserProfile } from '../../types';
import { formatResellerId } from '../../lib/resellerIdHelper';
import resellbdLogo from '../../assets/images/logo.png';
import { CheckCircle2, Sparkles, TrendingUp, ShieldCheck } from 'lucide-react';

interface Curved3DBannerProps {
  bannerImages: string[];
  user?: UserProfile;
  className?: string;
  autoPlayInterval?: number;
}

export const Curved3DBanner: React.FC<Curved3DBannerProps> = ({
  bannerImages = [],
  user,
  className = '',
  autoPlayInterval = 4500,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [tilt, setTilt] = useState({ rotateX: 0, rotateY: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const totalSlides = bannerImages.length;

  // Auto carousel rotation when multiple images exist
  useEffect(() => {
    if (totalSlides <= 1 || isHovered) return;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % totalSlides);
    }, autoPlayInterval);

    return () => clearInterval(timer);
  }, [totalSlides, isHovered, autoPlayInterval]);

  // Handle 3D Tilt based on pointer position (capped to max 4 degrees)
  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    if (!cardRef.current) return;

    const rect = cardRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5; // -0.5 to 0.5
    const y = (e.clientY - rect.top) / rect.height - 0.5; // -0.5 to 0.5

    // Max 4 degrees tilt
    const rotateY = Math.max(-4, Math.min(4, x * 8));
    const rotateX = Math.max(-4, Math.min(4, -y * 8));

    setTilt({ rotateX, rotateY });
  }, []);

  const handlePointerLeave = useCallback(() => {
    setIsHovered(false);
    setTilt({ rotateX: 0, rotateY: 0 });
  }, []);

  const handlePointerEnter = useCallback(() => {
    setIsHovered(true);
  }, []);

  // Touch Swipe Handlers for mobile carousel
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStart === null) return;
    const currentX = e.touches[0].clientX;
    const diff = touchStart - currentX;

    // Small interactive tilt on touch move
    if (Math.abs(diff) > 10) {
      const tiltVal = Math.max(-4, Math.min(4, (diff / 100) * 4));
      setTilt({ rotateX: 0, rotateY: -tiltVal });
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart === null) return;
    const endX = e.changedTouches[0].clientX;
    const diff = touchStart - endX;

    if (diff > 40 && totalSlides > 1) {
      // Swiped Left -> Next slide
      setCurrentIndex((prev) => (prev + 1) % totalSlides);
    } else if (diff < -40 && totalSlides > 1) {
      // Swiped Right -> Previous slide
      setCurrentIndex((prev) => (prev - 1 + totalSlides) % totalSlides);
    }

    setTouchStart(null);
    setTilt({ rotateX: 0, rotateY: 0 });
  };

  return (
    <div className={`w-full ${className}`}>
      {/* 3D Perspective Viewport */}
      <div
        className="w-full"
        style={{ perspective: '1000px' }}
      >
        <div
          ref={cardRef}
          onPointerMove={handlePointerMove}
          onPointerEnter={handlePointerEnter}
          onPointerLeave={handlePointerLeave}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{
            transform: `rotateX(${tilt.rotateX}deg) rotateY(${tilt.rotateY}deg)`,
            transition: isHovered ? 'transform 0.1s ease-out' : 'transform 0.45s cubic-bezier(0.2, 0.8, 0.2, 1)',
            transformStyle: 'preserve-3d',
            willChange: 'transform',
          }}
          className="relative w-full aspect-[2.2/1] rounded-[28px] overflow-hidden select-none cursor-pointer group shadow-[0_20px_42px_-12px_rgba(11,22,48,0.38),0_10px_22px_-6px_rgba(14,154,167,0.25)] border border-white/20 bg-slate-950"
        >
          {/* SLIDES OR DEFAULT HERO CONTENT */}
          {totalSlides > 0 ? (
            <div className="absolute inset-0 w-full h-full">
              <AnimatePresence initial={false} mode="wait">
                <motion.img
                  key={bannerImages[currentIndex]}
                  src={bannerImages[currentIndex]}
                  alt={`Promotional Banner ${currentIndex + 1}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.35, ease: 'easeInOut' }}
                  className="w-full h-full object-cover rounded-[28px]"
                  style={{ willChange: 'opacity' }}
                />
              </AnimatePresence>
            </div>
          ) : (
            /* DEFAULT WELCOME HERO BANNER (When no custom image is uploaded) */
            <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-[#0B1630] via-[#0E2046] to-[#0A3D4D] text-white p-4 sm:p-6 flex flex-col justify-between items-center text-center">
              {/* Subtle background ambient lights */}
              <div className="absolute -top-12 -left-12 w-48 h-48 bg-[#0E9AA7]/25 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-12 -right-12 w-48 h-48 bg-[#3DD055]/20 rounded-full blur-3xl pointer-events-none" />

              {/* Top Tag & ID */}
              <div className="relative z-10 w-full flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-white p-0.5 border border-white/20 shadow-xs flex items-center justify-center shrink-0">
                    <img src={resellbdLogo || '/resellbd-logo.png'} alt="ReSellBD" className="w-full h-full object-contain" />
                  </div>
                  <span className="text-[10px] sm:text-xs font-black tracking-wider text-amber-300 uppercase px-2 py-0.5 rounded-full bg-black/30 border border-amber-300/30">
                    WELCOME • UPGRADE BUSINESS NOW
                  </span>
                </div>

                {user && (
                  <div className="px-2.5 py-1 rounded-xl bg-white/10 backdrop-blur-md border border-white/15 text-[10px] sm:text-[11px] font-mono font-extrabold text-white">
                    {formatResellerId(user)}
                  </div>
                )}
              </div>

              {/* Center Core Message */}
              <div className="relative z-10 max-w-lg space-y-1 my-auto">
                <h2 className="text-sm sm:text-lg md:text-xl font-black text-white tracking-tight flex items-center justify-center gap-1.5">
                  <span>{user?.shopName || user?.fullName || 'ReSellBD Storefront'}</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                </h2>
                <p className="text-[11px] sm:text-xs text-slate-200/90 font-semibold line-clamp-1">
                  Wholesale Gadgets, Verified Warranty & Automated Wallet Payouts
                </p>
              </div>

              {/* Bottom Feature Badges */}
              <div className="relative z-10 flex items-center justify-center gap-2 sm:gap-3 flex-wrap text-[9px] sm:text-[10px] font-bold text-white/90">
                <span className="px-2.5 py-0.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-300" /> 100% Genuine
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3 text-emerald-400" /> High Margins
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-cyan-300" /> Fast Dispatch
                </span>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* CURVED 3D DISPLAY GLASS LAYERS (Applies to all slides and default banner) */}
          {/* ========================================================================= */}

          {/* 1. Curved Glass Inner Bulge: Radial glow in center fading to dark edge shadow */}
          <div
            className="absolute inset-0 pointer-events-none rounded-[28px]"
            style={{
              background:
                'radial-gradient(130% 120% at 50% 50%, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0) 50%, rgba(0, 0, 0, 0.32) 100%)',
              boxShadow:
                'inset 0 0 25px rgba(0, 0, 0, 0.35), inset 1.5px 1.5px 0px rgba(255, 255, 255, 0.5), inset -2px -2px 2px rgba(0, 0, 0, 0.38)',
            }}
          />

          {/* 2. Diagonal Glossy Reflection: Upper-left corner glass sheen (8-12% white) */}
          <div
            className="absolute inset-0 pointer-events-none rounded-[28px]"
            style={{
              background:
                'linear-gradient(130deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.05) 26%, rgba(255, 255, 255, 0) 58%)',
            }}
          />

          {/* 3. Subtle Lens Highlight Line along top and left perimeter */}
          <div
            className="absolute inset-0 pointer-events-none rounded-[28px] border-t border-l border-white/35"
          />
        </div>
      </div>

      {/* SLIDE INDICATOR DOTS UNDER THE BANNER (Outside the card, centered) */}
      {totalSlides > 1 && (
        <div className="mt-3 flex items-center justify-center gap-2">
          {bannerImages.map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setCurrentIndex(idx)}
              aria-label={`Go to banner slide ${idx + 1}`}
              className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${
                currentIndex === idx
                  ? 'w-6 bg-gradient-to-r from-[#0E9AA7] to-[#3DD055] shadow-xs'
                  : 'w-2 bg-slate-300 hover:bg-slate-400'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
};
