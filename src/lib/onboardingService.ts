// ============================================================================
// ReSellBD Onboarding Service & Content
// Stores completion flag in localStorage under "onboardingCompleted_v1"
// ============================================================================

export interface OnboardingSlide {
  id: number;
  badge: string;
  title: string;
  subtitle: string;
  description: string;
  highlights: string[];
  iconName: 'Store' | 'TrendingUp' | 'PackageCheck' | 'Truck' | 'Wallet';
  accentColor: string;
  accentBg: string;
  image?: string; // Optional custom illustration path (e.g. '/src/assets/onboarding/slide1.webp')
}

// Safely discover drop-in illustration images without failing if files are absent
const ONBOARDING_ASSET_MODULES = import.meta.glob<{ default: string }>(
  '/src/assets/onboarding/*.{webp,png,jpg,svg}',
  { eager: true }
);

/**
 * Returns the resolved image URL if present on disk, otherwise undefined.
 * Guarantees zero crash if image file does not exist.
 */
export function getResolvedSlideImage(slideId: number, configuredImage?: string): string | undefined {
  if (configuredImage && ONBOARDING_ASSET_MODULES[configuredImage]?.default) {
    return ONBOARDING_ASSET_MODULES[configuredImage].default;
  }
  const extensions = ['webp', 'png', 'svg', 'jpg'];
  for (const ext of extensions) {
    const directPath = `/src/assets/onboarding/slide${slideId}.${ext}`;
    if (ONBOARDING_ASSET_MODULES[directPath]?.default) {
      return ONBOARDING_ASSET_MODULES[directPath].default;
    }
  }
  return undefined;
}

/**
 * Lazy preloader for the next slide's custom illustration to eliminate flicker
 */
export function preloadNextSlideImage(nextSlideId: number): void {
  if (typeof window === 'undefined') return;
  const src = getResolvedSlideImage(nextSlideId);
  if (src) {
    const img = new Image();
    img.src = src;
  }
}

export const ONBOARDING_STORAGE_KEY = 'onboardingCompleted_v1';

export const ONBOARDING_SLIDES: OnboardingSlide[] = [
  {
    id: 1,
    image: '/src/assets/onboarding/slide1.webp',
    badge: 'জিরো ইনভেস্টমেন্ট',
    title: 'বিনা পুঁজিতে নিজের রিসেলিং ব্যবসা শুরু করুন',
    subtitle: 'কোনো পণ্য কেনা বা স্টক করার আর্থিক ঝুঁকি নেই',
    description: 'ReSellBD-র সাথে এক ক্লিকে যুক্ত হয়ে পাইকারি মূল্যে পণ্য নিয়ে ঘরে বসেই অনলাইনে বিক্রি করুন এবং নিশ্চিত মুনাফা অর্জন করুন।',
    highlights: ['০ টাকা ইনভেস্টমেন্ট', 'স্টক রাখার ঝামেলা নেই', 'সহজ স্মার্ট রেজিস্ট্রেশন'],
    iconName: 'Store',
    accentColor: '#3DD055',
    accentBg: 'rgba(61, 208, 85, 0.12)',
  },
  {
    id: 2,
    image: '/src/assets/onboarding/slide2.webp',
    badge: 'হোলসেল ক্যাটালগ',
    title: 'হাজারো ট্রেন্ডিং ও ভেরিফায়েড প্রোডাক্ট ক্যাটালগ',
    subtitle: 'ফ্যাশন, গ্যাজেট, লাইফস্টাইল ও হোম অ্যাপ্লায়েন্স',
    description: 'মানসম্মত এবং ট্রেন্ডিং হাজারো পণ্য থেকে আপনার পছন্দের পণ্য বেছে নিন। হাই-কোয়ালিটি ছবি ও বিস্তারিত বিবরণ সরাসরি কাস্টমারের সাথে শেয়ার করুন।',
    highlights: ['ভেরিফায়েড কোয়ালিটি', 'রিয়েল পাইকারি রেট', '১-ক্লিকে ছবি ও বিবরণ শেয়ার'],
    iconName: 'TrendingUp',
    accentColor: '#0E9AA7',
    accentBg: 'rgba(14, 154, 167, 0.15)',
  },
  {
    id: 3,
    image: '/src/assets/onboarding/slide3.webp',
    badge: 'স্মার্ট মার্জিন',
    title: 'নিজের ইচ্ছামতো লাভ বা মার্জিন নির্ধারণ করুন',
    subtitle: 'কমিশন = (সেলিং প্রাইস - রিসেলার প্রাইস) × পরিমাণ',
    description: 'পাইকারি দামের উপর আপনার সুবিধাজনক লাভ যোগ করে কাস্টমারের কাছে অর্ডার প্লেস করুন। কাস্টমার পণ্য গ্রহণ করলেই আপনার প্রফিট ক্রেডিট হবে।',
    highlights: ['নিজের মুনাফা নিজে ঠিক করুন', 'স্বচ্ছ হিসাব ও রিয়েল-টাইম ট্র্যাকিং', 'কোনো লুকানো চার্জ নেই'],
    iconName: 'PackageCheck',
    accentColor: '#F59E0B',
    accentBg: 'rgba(245, 158, 11, 0.15)',
  },
  {
    id: 4,
    image: '/src/assets/onboarding/slide4.webp',
    badge: 'সারা দেশে ডেলিভারি',
    title: 'ক্যাশ অন ডেলিভারি ও দ্রুত শিপিং সুবিধা',
    subtitle: 'ডেলিভারি, প্যাকিং ও কালেকশন সবই ReSellBD-র দায়িত্ব',
    description: 'সারা বাংলাদেশের ৬৪ জেলায় ডোর-টু-ডোর ক্যাশ অন ডেলিভারি। কাস্টমারের কাছে দ্রুততম সময়ে পণ্য পৌঁছানো এবং টাকা কালেকশন ReSellBD টিম সামলাবে।',
    highlights: ['৬৪ জেলায় হোম ডেলিভারি', '১০০% ক্যাশ অন ডেলিভারি (COD)', 'লাইভ কুরিয়ার ট্র্যাকিং'],
    iconName: 'Truck',
    accentColor: '#38BDF8',
    accentBg: 'rgba(56, 189, 248, 0.15)',
  },
  {
    id: 5,
    image: '/src/assets/onboarding/slide5.webp',
    badge: 'সহজ উইথড্র',
    title: 'বিকাশ, নগদ ও ব্যাংকে সরাসরি প্রফিট উত্তোলন',
    subtitle: 'সাপ্তাহিক ও দ্রুত পেআউট কোনো ঝামেলা ছাড়াই',
    description: 'অর্ডার সফলভাবে ডেলিভারি হওয়ার সাথে সাথেই আপনার ওয়ালেটে কমিশন যোগ হবে। বিকাশ, নগদ বা ব্যাংক একাউন্টে সহজেই উইথড্র রিকোয়েস্ট পাঠান।',
    highlights: ['বিকাশ ও নগদে ইনস্ট্যান্ট পেআউট', 'ব্যাংক ট্রান্সফার সুবিধা', 'সুরক্ষিত ও নির্ভরযোগ্য ওয়ালেট'],
    iconName: 'Wallet',
    accentColor: '#10B981',
    accentBg: 'rgba(16, 185, 129, 0.15)',
  },
];

export const FINAL_WELCOME_CONTENT = {
  brand: 'ReSellBD',
  headline: 'আপনার ব্যবসা, আপনার ভবিষ্যৎ!',
  subtitle: 'আজই শুরু হোক আপনার Zero Investment Business Journey.',
  subtext: 'হাজারো উদ্যমী রিসেলারের আস্থার প্ল্যাটফর্ম ReSellBD-তে যোগ দিন। এক ক্লিকে পণ্য বেছে নিন, অর্ডার দিন, আর আয় করুন স্বাধীনভাবে।',
  features: [
    'কোনো বিনিয়োগ বা অগ্রিম ফি নেই',
    'উন্নত ক্যাটালগ ও জেনুইন পাইকারি রেট',
    'দ্রুততম ক্যাশ অন ডেলিভারি ও নিয়মিত পেআউট'
  ],
  buttonText: 'Get Started',
  footer: 'Powered by Sky Automation Tech',
};

/**
 * Check if the user has completed the onboarding flow before.
 * Wrapped in try/catch to ensure resilient execution across incognito / restricted storage.
 */
export function isOnboardingCompleted(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_STORAGE_KEY) === 'true';
  } catch (err) {
    console.warn('[Onboarding] Unable to access localStorage:', err);
    return false;
  }
}

/**
 * Mark onboarding as completed.
 */
export function setOnboardingCompleted(): void {
  try {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
  } catch (err) {
    console.warn('[Onboarding] Unable to write localStorage:', err);
  }
}

/**
 * Reset onboarding state so it can be seen again on next unauthenticated launch.
 */
export function resetOnboarding(): void {
  try {
    localStorage.removeItem(ONBOARDING_STORAGE_KEY);
  } catch (err) {
    console.warn('[Onboarding] Unable to clear localStorage:', err);
  }
}

/**
 * Event-based trigger to replay the onboarding screen from Settings or anywhere in the app.
 */
export const ONBOARDING_REPLAY_EVENT = 'sky_replay_onboarding';

export function triggerOnboardingReplay(): void {
  try {
    window.dispatchEvent(new CustomEvent(ONBOARDING_REPLAY_EVENT));
  } catch (err) {
    console.warn('[Onboarding] Unable to dispatch replay event:', err);
  }
}
