/**
 * Authentication & Super Admin Security Configuration
 */

// 🛡️ ========================================================
// 🛡️ ROLES REQUIRING MANDATORY TWO-STEP OTP ON LOGIN
// 🛡️ ========================================================
// Default: ['super_admin'] (Super Admin only).
// To later enforce 2-Step OTP for Admin accounts as well, simply add 'admin':
// -> export const OTP_REQUIRED_ROLES: ('super_admin' | 'admin')[] = ['super_admin', 'admin'];
export const OTP_REQUIRED_ROLES: ('super_admin' | 'admin')[] = ['super_admin'];

// ⏳ ========================================================
// ⏳ SESSION & TIMEOUT CONSTANTS (সহজে পরিবর্তনযোগ্য সময়সীমা)
// ⏳ ========================================================
/** Duration in hours that an OTP-verified Super Admin session remains valid (12 hours) */
export const SUPER_ADMIN_OTP_SESSION_HOURS = 12;

/** OTP code expiration duration in seconds (5 minutes = 300s) */
export const SUPER_ADMIN_OTP_EXPIRY_SECONDS = 300;

/** Maximum allowed wrong attempts before 15-minute account lock (5 attempts) */
export const SUPER_ADMIN_OTP_MAX_ATTEMPTS = 5;

/** Lockout duration after exceeding max attempts in minutes (15 minutes) */
export const SUPER_ADMIN_OTP_LOCKOUT_MINUTES = 15;

/** Cooldown between requesting new OTP codes in seconds (60 seconds) */
export const SUPER_ADMIN_OTP_RESEND_COOLDOWN_SECONDS = 60;
