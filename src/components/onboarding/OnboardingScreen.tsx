import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  ChevronRight,
  Flame,
  X,
} from 'lucide-react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import {
  ONBOARDING_SLIDES,
  FINAL_WELCOME_CONTENT,
  setOnboardingCompleted,
  getResolvedSlideImage,
  preloadNextSlideImage,
} from '../../lib/onboardingService';
import {
  EntrepreneurIllustration,
  ZeroInvestmentIllustration,
  OrderManagementIllustration,
  DeliveryIllustration,
  CommissionIllustration,
} from './OnboardingIllustrations';
import resellbdLogo from '../../assets/images/logo.png';

interface OnboardingScreenProps {
  onComplete: () => void;
  isReplay?: boolean;
}

export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({
  onComplete,
  isReplay = false,
}) => {
  // Step 0-4 are the 5 slides; Step 5 is the Final Welcome Screen
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [direction, setDirection] = useState<number>(1);
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);

  const shouldReduceMotion = useReducedMotion();
  const totalSlides = ONBOARDING_SLIDES.length; // 5
  const isFinalScreen = currentStep >= totalSlides;
  const currentSlide = !isFinalScreen ? ONBOARDING_SLIDES[currentStep] : null;

  // Preload next slide image when currentStep changes
  useEffect(() => {
    if (currentStep < totalSlides - 1) {
      preloadNextSlideImage(currentStep + 2);
    }
  }, [currentStep, totalSlides]);

  // Handle completion
  const handleFinish = useCallback(() => {
    if (!isReplay) {
      setOnboardingCompleted();
    }
    onComplete();
  }, [isReplay, onComplete]);

  // Navigate forward
  const handleNext = useCallback(() => {
    if (currentStep < totalSlides) {
      setDirection(1);
      setCurrentStep((prev) => prev + 1);
    } else {
      handleFinish();
    }
  }, [currentStep, totalSlides, handleFinish]);

  // Navigate backward
  const handleBack = useCallback(() => {
    if (currentStep > 0) {
      setDirection(-1);
      setCurrentStep((prev) => prev - 1);
    } else if (isReplay) {
      onComplete();
    }
  }, [currentStep, isReplay, onComplete]);

  // Skip straight to Final Welcome Screen (or exit if replay)
  const handleSkip = useCallback(() => {
    setDirection(1);
    setCurrentStep(totalSlides);
  }, [totalSlides]);

  // Capacitor Android Hardware Back Button Handling
  useEffect(() => {
    let backListenerHandle: any = null;

    const setupBackListener = async () => {
      try {
        if (Capacitor.isNativePlatform()) {
          backListenerHandle = await CapacitorApp.addListener('backButton', () => {
            if (currentStep === 0) {
              if (isReplay) {
                onComplete();
              } else {
                CapacitorApp.exitApp();
              }
            } else {
              handleBack();
            }
          });
        }
      } catch (err) {
        console.warn('[Onboarding] Back button listener error:', err);
      }
    };

    setupBackListener();

    return () => {
      if (backListenerHandle && typeof backListenerHandle.remove === 'function') {
        backListenerHandle.remove();
      }
    };
  }, [currentStep, handleBack, isReplay, onComplete]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleBack();
      } else if (e.key === 'Escape' && isReplay) {
        e.preventDefault();
        onComplete();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNext, handleBack, isReplay, onComplete]);

  // Touch Swipe Handlers (Mobile Friendly)
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null || touchStartYRef.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
    const deltaY = e.changedTouches[0].clientY - touchStartYRef.current;

    if (Math.abs(deltaX) > 45 && Math.abs(deltaX) > Math.abs(deltaY) * 1.3) {
      if (deltaX < 0) {
        handleNext();
      } else {
        handleBack();
      }
    }
    touchStartXRef.current = null;
    touchStartYRef.current = null;
  };

  // Helper to render slide illustration or custom image
  const renderIllustration = (slide: typeof ONBOARDING_SLIDES[0]) => {
    const customImage = getResolvedSlideImage(slide.id, slide.image);
    if (customImage) {
      return (
        <div className="relative w-full h-full flex items-center justify-center p-2">
          <div
            className="absolute w-44 h-44 rounded-full blur-2xl opacity-40 -bottom-4"
            style={{ backgroundColor: slide.accentColor }}
          />
          <img
            src={customImage}
            alt={slide.title}
            className="max-h-full max-w-full object-contain relative z-10 drop-shadow-xl"
            loading="eager"
          />
        </div>
      );
    }

    switch (slide.id) {
      case 1:
        return <EntrepreneurIllustration accentColor={slide.accentColor} accentBg={slide.accentBg} />;
      case 2:
        return <ZeroInvestmentIllustration accentColor={slide.accentColor} accentBg={slide.accentBg} />;
      case 3:
        return <OrderManagementIllustration accentColor={slide.accentColor} accentBg={slide.accentBg} />;
      case 4:
        return <DeliveryIllustration accentColor={slide.accentColor} accentBg={slide.accentBg} />;
      case 5:
        return <CommissionIllustration accentColor={slide.accentColor} accentBg={slide.accentBg} />;
      default:
        return <EntrepreneurIllustration accentColor={slide.accentColor} accentBg={slide.accentBg} />;
    }
  };

  // Parallax animation variants
  const illustrationVariants = {
    enter: (dir: number) => ({
      x: shouldReduceMotion ? 0 : dir > 0 ? 50 : -50,
      opacity: 0,
      scale: 0.94,
    }),
    center: {
      x: 0,
      opacity: 1,
      scale: 1,
      transition: {
        x: { type: 'spring', stiffness: 280, damping: 28 },
        opacity: { duration: 0.28 },
        scale: { duration: 0.3 },
      },
    },
    exit: (dir: number) => ({
      x: shouldReduceMotion ? 0 : dir > 0 ? -50 : 50,
      opacity: 0,
      scale: 0.94,
      transition: {
        x: { type: 'spring', stiffness: 280, damping: 28 },
        opacity: { duration: 0.2 },
      },
    }),
  };

  const textContainerVariants = {
    enter: { opacity: 0 },
    center: {
      opacity: 1,
      transition: {
        staggerChildren: shouldReduceMotion ? 0 : 0.06,
        delayChildren: 0.05,
      },
    },
    exit: { opacity: 0, transition: { duration: 0.15 } },
  };

  const textItemVariants = {
    enter: { opacity: 0, y: shouldReduceMotion ? 0 : 14 },
    center: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.28, ease: 'easeOut' },
    },
    exit: { opacity: 0, y: shouldReduceMotion ? 0 : -8, transition: { duration: 0.15 } },
  };

  // Background glow accent color based on slide
  const activeAccent = currentSlide ? currentSlide.accentColor : '#3DD055';

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="fixed inset-0 z-50 flex flex-col justify-between overflow-hidden select-none bg-gradient-to-b from-[#04203F] via-[#07192F] to-[#031022] text-white"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.5rem)',
      }}
    >
      {/* Thin Top Progress Bar */}
      <div className="w-full h-1 bg-white/10 relative overflow-hidden shrink-0">
        <motion.div
          className="h-full bg-gradient-to-r from-[#0E9AA7] via-[#10B981] to-[#3DD055]"
          initial={false}
          animate={{
            width: `${((Math.min(currentStep, totalSlides - 1) + 1) / totalSlides) * 100}%`,
          }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
        />
      </div>

      {/* Ambient background glowing orbs (max 2 for performance) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-20 -left-16 w-72 h-72 rounded-full blur-3xl transition-colors duration-700 opacity-25"
        style={{ backgroundColor: activeAccent }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-8 -right-16 w-80 h-80 rounded-full blur-3xl transition-colors duration-700 opacity-20"
        style={{ backgroundColor: '#0E9AA7' }}
      />

      {/* Top Header Bar */}
      <header className="relative z-10 flex items-center justify-between px-5 pt-3 shrink-0">
        {/* Brand logo & title */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg overflow-hidden bg-white/10 p-1 border border-white/15 flex items-center justify-center shadow-md">
            <img
              src={resellbdLogo}
              alt="ReSellBD Logo"
              className="w-full h-full object-contain"
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = 'none';
              }}
            />
          </div>
          <div>
            <span className="text-[15px] font-bold tracking-tight text-white">ReSellBD</span>
            <span className="block text-[9px] font-semibold text-teal-400 tracking-wider uppercase -mt-0.5">
              Wholesale Dropship
            </span>
          </div>
        </div>

        {/* Right side: Replay close button OR step pill & Skip button */}
        <div className="flex items-center gap-2">
          {!isFinalScreen && (
            <>
              <div className="px-2.5 py-1 rounded-full bg-white/10 border border-white/10 backdrop-blur-md text-[11px] font-semibold text-slate-300">
                {currentStep + 1} / {totalSlides}
              </div>
              <button
                type="button"
                onClick={handleSkip}
                className="px-3 py-1.5 rounded-full text-[12px] font-semibold text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition active:scale-95 flex items-center gap-1 cursor-pointer"
                aria-label="Skip to final welcome screen"
              >
                <span>স্কিপ</span>
                <ChevronRight className="w-3.5 h-3.5 opacity-70" />
              </button>
            </>
          )}

          {isReplay && (
            <button
              type="button"
              onClick={onComplete}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 text-slate-300 hover:text-white flex items-center justify-center transition active:scale-95 cursor-pointer ml-1"
              aria-label="Close tour"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* Main Slide Carousel Area */}
      <main className="relative z-10 flex-1 flex flex-col justify-center px-5 py-2 max-w-md mx-auto w-full overflow-hidden">
        <AnimatePresence mode="wait" custom={direction}>
          {!isFinalScreen && currentSlide ? (
            <div key={`slide-${currentSlide.id}`} className="w-full flex flex-col items-center text-center">
              {/* Illustration Platform (~40% of screen height) */}
              <motion.div
                custom={direction}
                variants={illustrationVariants}
                initial="enter"
                animate="center"
                exit="exit"
                className="w-full h-[36vh] min-h-[175px] max-h-[250px] flex items-center justify-center relative my-1"
              >
                {renderIllustration(currentSlide)}

                {/* Floating category badge at bottom of illustration */}
                <div
                  className="absolute bottom-1 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase shadow-lg flex items-center gap-1 whitespace-nowrap border z-20 backdrop-blur-md"
                  style={{
                    backgroundColor: '#071A31',
                    borderColor: `${currentSlide.accentColor}80`,
                    color: currentSlide.accentColor,
                  }}
                >
                  <Sparkles className="w-3 h-3" />
                  <span>{currentSlide.badge}</span>
                </div>
              </motion.div>

              {/* Text Area with Staggered Fade Up */}
              <motion.div
                variants={textContainerVariants}
                initial="enter"
                animate="center"
                exit="exit"
                className="space-y-1.5 pt-2 w-full"
              >
                <motion.h1
                  variants={textItemVariants}
                  className="text-[21px] sm:text-[22px] font-bold text-white tracking-tight leading-[1.38] px-1"
                >
                  {currentSlide.title}
                </motion.h1>

                <motion.p
                  variants={textItemVariants}
                  className="text-[13px] sm:text-[14px] font-semibold text-teal-300 leading-snug"
                >
                  {currentSlide.subtitle}
                </motion.p>

                <motion.p
                  variants={textItemVariants}
                  className="text-[12px] sm:text-[13px] text-slate-300 leading-relaxed px-2 font-normal"
                >
                  {currentSlide.description}
                </motion.p>

                {/* Compact Highlight Chips */}
                <motion.div
                  variants={textItemVariants}
                  className="flex flex-wrap items-center justify-center gap-1.5 pt-1.5 w-full max-w-sm mx-auto"
                >
                  {currentSlide.highlights.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-[11px] font-medium text-slate-200"
                    >
                      <CheckCircle2
                        className="w-3 h-3 flex-shrink-0"
                        style={{ color: currentSlide.accentColor }}
                      />
                      <span>{item}</span>
                    </div>
                  ))}
                </motion.div>
              </motion.div>
            </div>
          ) : (
            /* Final Welcome Screen */
            <motion.div
              key="slide-welcome"
              custom={direction}
              variants={illustrationVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="w-full flex flex-col items-center text-center space-y-3.5 relative"
            >
              {/* Subtle drifting sparkles (pure SVG / low opacity / no emoji) */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <motion.div
                  className="absolute top-4 left-8 w-1.5 h-1.5 rounded-full bg-teal-300"
                  animate={shouldReduceMotion ? {} : { y: [-10, 10, -10], opacity: [0.2, 0.6, 0.2] }}
                  transition={{ repeat: Infinity, duration: 4 }}
                />
                <motion.div
                  className="absolute top-12 right-10 w-2 h-2 rounded-full bg-emerald-400"
                  animate={shouldReduceMotion ? {} : { y: [8, -8, 8], opacity: [0.15, 0.5, 0.15] }}
                  transition={{ repeat: Infinity, duration: 3.5, delay: 0.5 }}
                />
                <motion.div
                  className="absolute bottom-16 left-12 w-1.5 h-1.5 rounded-full bg-cyan-300"
                  animate={shouldReduceMotion ? {} : { y: [-6, 6, -6], opacity: [0.2, 0.7, 0.2] }}
                  transition={{ repeat: Infinity, duration: 3.8, delay: 1 }}
                />
              </div>

              {/* Brand Centerpiece with Glow */}
              <motion.div
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                className="relative my-1"
              >
                <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl bg-gradient-to-tr from-[#0E9AA7]/20 to-[#3DD055]/20 border border-white/20 p-4 flex items-center justify-center shadow-2xl backdrop-blur-xl relative">
                  <div className="absolute -inset-1 rounded-[28px] bg-gradient-to-r from-teal-400 to-emerald-400 opacity-30 blur-md animate-pulse" />
                  <img
                    src={resellbdLogo}
                    alt="ReSellBD"
                    className="w-full h-full object-contain relative z-10"
                    onError={(e) => {
                      (e.currentTarget as HTMLElement).style.display = 'none';
                    }}
                  />
                </div>
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-[#05172C] border border-emerald-400/50 text-[10px] font-bold text-emerald-400 tracking-wider uppercase flex items-center gap-1 whitespace-nowrap shadow-md">
                  <Flame className="w-3 h-3 text-emerald-400" />
                  <span>Welcome to ReSellBD</span>
                </div>
              </motion.div>

              {/* Welcome Headlines with Word/Stagger Fade */}
              <motion.div
                variants={textContainerVariants}
                initial="enter"
                animate="center"
                className="space-y-1.5 pt-1"
              >
                <motion.h1
                  variants={textItemVariants}
                  className="text-[22px] sm:text-[23px] font-extrabold text-white tracking-tight leading-[1.35] px-1"
                >
                  {FINAL_WELCOME_CONTENT.headline}
                </motion.h1>
                <motion.p
                  variants={textItemVariants}
                  className="text-[13px] sm:text-[14px] font-semibold text-emerald-400 leading-snug"
                >
                  {FINAL_WELCOME_CONTENT.subtitle}
                </motion.p>
                <motion.p
                  variants={textItemVariants}
                  className="text-[12px] sm:text-[13px] text-slate-300 leading-relaxed px-2"
                >
                  {FINAL_WELCOME_CONTENT.subtext}
                </motion.p>
              </motion.div>

              {/* Value checklist card */}
              <div className="w-full max-w-sm rounded-xl bg-white/5 border border-white/10 p-3 space-y-1.5 text-left backdrop-blur-md">
                {FINAL_WELCOME_CONTENT.features.map((feat, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-[11px] sm:text-[12px] text-slate-200">
                    <div className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0">
                      <CheckCircle2 className="w-3 h-3" />
                    </div>
                    <span>{feat}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Footer & Navigation Controls */}
      <footer className="relative z-10 px-5 pt-1 pb-1 max-w-md mx-auto w-full space-y-2.5 shrink-0">
        {/* Navigation row on Slides 1-5 */}
        {!isFinalScreen && (
          <>
            {/* Dots / Stretchy Pill Progress Indicator */}
            <div className="flex items-center justify-center gap-2 py-1">
              {ONBOARDING_SLIDES.map((slide, index) => {
                const isActive = index === currentStep;
                return (
                  <button
                    key={slide.id}
                    type="button"
                    onClick={() => {
                      setDirection(index > currentStep ? 1 : -1);
                      setCurrentStep(index);
                    }}
                    className="focus:outline-none py-1 transition-all"
                    aria-label={`Go to slide ${index + 1}`}
                  >
                    <motion.span
                      layout
                      className={`block rounded-full transition-colors duration-300 ${
                        isActive
                          ? 'w-7 h-2 bg-gradient-to-r from-teal-400 to-emerald-400 shadow-md shadow-teal-500/40'
                          : 'w-2 h-2 bg-white/20 hover:bg-white/40'
                      }`}
                    />
                  </button>
                );
              })}
            </div>

            {/* Back & Next / Start Buttons */}
            <div className="flex items-center gap-2.5">
              {currentStep > 0 || isReplay ? (
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  type="button"
                  onClick={handleBack}
                  className="h-11 px-4 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-slate-200 text-[13px] font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                  aria-label="Previous slide"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>পেছনে</span>
                </motion.button>
              ) : (
                <div className="w-0" />
              )}

              {/* Next Button with Soft Repeating Shimmer Sweep */}
              <motion.button
                whileTap={{ scale: 0.97 }}
                type="button"
                onClick={handleNext}
                className="relative overflow-hidden flex-1 h-11 px-5 rounded-xl bg-gradient-to-r from-[#0E9AA7] via-[#10B981] to-[#3DD055] hover:opacity-95 text-white text-[14px] font-bold flex items-center justify-center gap-2 shadow-lg shadow-teal-500/25 transition cursor-pointer"
              >
                {/* Shimmer sweep */}
                {!shouldReduceMotion && (
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent -skew-x-12"
                    animate={{ x: ['-100%', '200%'] }}
                    transition={{
                      repeat: Infinity,
                      duration: 3.5,
                      ease: 'easeInOut',
                      repeatDelay: 1.2,
                    }}
                  />
                )}
                <span className="relative z-10">
                  {currentStep === totalSlides - 1 ? 'শুরু করুন' : 'পরবর্তী'}
                </span>
                <ArrowRight className="w-4 h-4 relative z-10" />
              </motion.button>
            </div>
          </>
        )}

        {/* Action Button on Final Welcome Screen */}
        {isFinalScreen && (
          <div className="space-y-2">
            <motion.button
              whileTap={{ scale: 0.97 }}
              initial={{ scale: 0.98 }}
              animate={shouldReduceMotion ? { scale: 1 } : { scale: [0.98, 1.02, 1] }}
              transition={{ duration: 0.8, delay: 0.2 }}
              type="button"
              onClick={handleFinish}
              className="relative overflow-hidden w-full h-12 rounded-xl bg-gradient-to-r from-[#0E9AA7] via-[#10B981] to-[#3DD055] hover:brightness-105 text-white text-[15px] font-bold flex items-center justify-center gap-2 shadow-xl shadow-emerald-500/30 transition cursor-pointer"
            >
              {!shouldReduceMotion && (
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent -skew-x-12"
                  animate={{ x: ['-100%', '200%'] }}
                  transition={{
                    repeat: Infinity,
                    duration: 3,
                    ease: 'easeInOut',
                    repeatDelay: 1,
                  }}
                />
              )}
              <span className="relative z-10">{FINAL_WELCOME_CONTENT.buttonText}</span>
              <ArrowRight className="w-4 h-4 relative z-10" />
            </motion.button>

            {/* Back button option on final screen */}
            <button
              type="button"
              onClick={handleBack}
              className="w-full py-1.5 text-[12px] font-medium text-slate-400 hover:text-slate-200 flex items-center justify-center gap-1 transition cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>স্লাইডগুলো পুনরায় দেখুন</span>
            </button>
          </div>
        )}

        {/* Bottom Attribution Branding */}
        <div className="pt-0.5 text-center">
          <p className="text-[10px] text-slate-400/80 font-medium tracking-wide flex items-center justify-center gap-1">
            <ShieldCheck className="w-3 h-3 text-teal-400" />
            <span>{FINAL_WELCOME_CONTENT.footer}</span>
          </p>
        </div>
      </footer>
    </div>
  );
};
