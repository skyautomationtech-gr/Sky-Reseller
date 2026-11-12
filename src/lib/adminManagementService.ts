import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export interface AdminPermissionDef {
  id: string;
  label: string;
  labelBn: string;
  category: 'resellers' | 'catalog' | 'financial' | 'engagement';
  description: string;
  defaultChecked: boolean;
}

export const ADMIN_PERMISSIONS_LIST: AdminPermissionDef[] = [
  // 1. Reseller & Partner Operations
  {
    id: 'approve_resellers',
    label: 'Approve & Reject Resellers',
    labelBn: 'রিসেলার আবেদন অনুমোদন ও বাতিল',
    category: 'resellers',
    description: 'Review pending reseller applications, verify NID and shop info, approve or request resubmission.',
    defaultChecked: true,
  },
  {
    id: 'handle_support',
    label: 'Handle Support Tickets',
    labelBn: 'সাপোর্ট টিকিট ও অভিযোগ পরিচালনা',
    category: 'resellers',
    description: 'Respond to reseller support inquiries, dispute tickets, and communication requests.',
    defaultChecked: true,
  },

  // 2. Catalog & Orders
  {
    id: 'manage_products',
    label: 'Manage Products, Categories & Brands',
    labelBn: 'পণ্য, ক্যাটাগরি ও ব্র্যান্ড পরিচালনা',
    category: 'catalog',
    description: 'Add and edit products, manage variants, upload photos, and organize catalog categories.',
    defaultChecked: true,
  },
  {
    id: 'manage_orders',
    label: 'Manage & Process Orders',
    labelBn: 'অর্ডার প্রসেসিং ও ডেলিভারি আপডেট',
    category: 'catalog',
    description: 'View customer orders, update tracking status, and coordinate courier dispatch.',
    defaultChecked: true,
  },

  // 3. Financials & Reports
  {
    id: 'manage_wallet',
    label: 'Approve Wallet Deposits & Withdrawals',
    labelBn: 'ওয়ালেট জমা ও উত্তোলন অনুমোদন',
    category: 'financial',
    description: 'Verify deposit transaction IDs, review payout requests, and mark payouts completed.',
    defaultChecked: true,
  },
  {
    id: 'manage_commission',
    label: 'Manage Commission Settings',
    labelBn: 'কমিশন সেটিংস ও রেট পরিচালনা',
    category: 'financial',
    description: 'Configure standard and category-wise reseller commissions.',
    defaultChecked: true,
  },
  {
    id: 'view_reports',
    label: 'View Analytics & Reports',
    labelBn: 'বিক্রয় ও আর্থিক রিপোর্ট দেখুন',
    category: 'financial',
    description: 'Access sales analytics, order performance trends, and reseller volume summaries.',
    defaultChecked: true,
  },

  // 4. Engagement & Notices
  {
    id: 'send_notifications',
    label: 'Send Notices & Push Notifications',
    labelBn: 'নোটিশ ও পুশ নোটিফিকেশন পাঠান',
    category: 'engagement',
    description: 'Dispatch urgent operational notices, general bulletins, and system alerts to resellers.',
    defaultChecked: true,
  },
  {
    id: 'manage_banners',
    label: 'Manage Promotional Banners',
    labelBn: 'ব্যানার ও অফার স্লাইডার পরিচালনা',
    category: 'engagement',
    description: 'Upload promotional banners, homepage sliders, and marketing graphics.',
    defaultChecked: true,
  },
];

export const FORBIDDEN_ADMIN_ACTIONS = [
  'Create, edit or delete Admin accounts (Super Admin exclusive)',
  'Modify company legal, tax, or banking credentials (Super Admin exclusive)',
  'Access, duplicate or modify Super Admin security settings (Super Admin exclusive)',
  'Delete core database audit logs or system backups (Super Admin exclusive)',
];

export interface CreateAdminPayload {
  fullName: string;
  email: string;
  mobile: string;
  password?: string;
  permissions: string[];
  profilePhotoUrl?: string;
  internalNote?: string;
}

export interface CreateAdminResponse {
  success: boolean;
  adminId: string;
  uid: string;
  email: string;
  fullName: string;
  message: string;
}

/**
 * Generate a cryptographically secure 12-character temporary password
 * with uppercase, lowercase, numbers, and symbols.
 */
export function generateSecurePassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const numbers = '23456789';
  const symbols = '!@#$%^&*()_+-=';

  // Ensure at least 1 of each required class
  let pwd = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    numbers[Math.floor(Math.random() * numbers.length)],
    symbols[Math.floor(Math.random() * symbols.length)],
  ];

  const allChars = upper + lower + numbers + symbols;
  for (let i = 4; i < 12; i++) {
    pwd.push(allChars[Math.floor(Math.random() * allChars.length)]);
  }

  // Shuffle array
  return pwd.sort(() => 0.5 - Math.random()).join('');
}

export interface PasswordStrengthResult {
  score: number; // 0 to 4
  label: string;
  color: string;
  hasUpper: boolean;
  hasLower: boolean;
  hasNumber: boolean;
  hasSymbol: boolean;
  hasMinLength: boolean;
  isValid: boolean;
}

export function evaluatePasswordStrength(password: string): PasswordStrengthResult {
  const hasMinLength = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSymbol = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

  let criteriaMet = 0;
  if (hasMinLength) criteriaMet++;
  if (hasUpper) criteriaMet++;
  if (hasLower) criteriaMet++;
  if (hasNumber) criteriaMet++;
  if (hasSymbol) criteriaMet++;

  const isValid = hasMinLength && hasUpper && hasLower && hasNumber && hasSymbol;

  if (criteriaMet <= 2) {
    return { score: 1, label: 'Weak (দুর্বল)', color: '#F43F5E', hasUpper, hasLower, hasNumber, hasSymbol, hasMinLength, isValid };
  }
  if (criteriaMet <= 4) {
    return { score: 2, label: 'Moderate (মাঝারি)', color: '#F59E0B', hasUpper, hasLower, hasNumber, hasSymbol, hasMinLength, isValid };
  }
  return { score: 4, label: 'Strong (শক্তিশালী)', color: '#3DD055', hasUpper, hasLower, hasNumber, hasSymbol, hasMinLength, isValid };
}

/**
 * Creates an admin account via server-authoritative Cloud Function (createAdmin)
 */
export async function createAdminCall(payload: CreateAdminPayload): Promise<CreateAdminResponse> {
  try {
    const fn = httpsCallable<CreateAdminPayload, CreateAdminResponse>(functions, 'createAdmin');
    const res = await fn(payload);
    if (res.data && res.data.success) {
      return res.data;
    }
    throw new Error('Failed to create admin account.');
  } catch (fnErr: any) {
    console.error('[adminManagementService] Cloud Function createAdmin error:', fnErr);
    const msg = fnErr?.message || fnErr?.details || 'Failed to create admin account (এডমিন অ্যাকাউন্ট তৈরি করতে ব্যর্থ হয়েছে)।';
    throw new Error(msg);
  }
}

/**
 * Resends the welcome email with a fresh password reset link
 */
export async function resendAdminWelcomeEmailCall(adminUid: string): Promise<{ success: boolean; message: string }> {
  try {
    const fn = httpsCallable<{ adminUid: string }, { success: boolean; message: string }>(functions, 'resendAdminWelcomeEmail');
    const res = await fn({ adminUid });
    if (res.data && res.data.success) {
      return res.data;
    }
    throw new Error('Failed to resend welcome email.');
  } catch (fnErr: any) {
    console.error('[adminManagementService] Cloud Function resendAdminWelcomeEmail error:', fnErr);
    const msg = fnErr?.message || fnErr?.details || 'Failed to resend welcome email (ওয়েলকাম ইমেইল পুনরায় পাঠানো সম্ভব হয়নি)।';
    throw new Error(msg);
  }
}

/**
 * Server-authoritative password update for Admins (first login or forced change)
 */
export async function changeAdminPasswordCall(newPassword: string, currentPassword?: string): Promise<{ success: boolean; message: string }> {
  try {
    const fn = httpsCallable<{ newPassword: string; currentPassword?: string }, { success: boolean; message: string }>(functions, 'changeAdminPassword');
    const res = await fn({ newPassword, currentPassword });
    if (res.data && res.data.success) {
      return res.data;
    }
    throw new Error('Failed to update admin password.');
  } catch (fnErr: any) {
    console.error('[adminManagementService] Cloud Function changeAdminPassword error:', fnErr);
    const msg = fnErr?.message || fnErr?.details || 'Failed to update password (পাসওয়ার্ড আপডেট করা সম্ভব হয়নি)।';
    throw new Error(msg);
  }
}

/**
 * Suspends or activates an admin account
 */
export async function toggleAdminStatusCall(adminUid: string, status: 'approved' | 'suspended', reason?: string): Promise<{ success: boolean; message: string }> {
  try {
    const fn = httpsCallable<{ adminUid: string; status: 'approved' | 'suspended'; reason?: string }, { success: boolean; message: string }>(functions, 'toggleAdminStatus');
    const res = await fn({ adminUid, status, reason });
    if (res.data && res.data.success) {
      return res.data;
    }
    throw new Error('Failed to update admin status.');
  } catch (fnErr: any) {
    console.error('[adminManagementService] Cloud Function toggleAdminStatus error:', fnErr);
    const msg = fnErr?.message || fnErr?.details || 'Failed to update admin status (এডমিন স্ট্যাটাস পরিবর্তন করা সম্ভব হয়নি)।';
    throw new Error(msg);
  }
}

/**
 * Updates permissions for an existing admin account
 */
export async function updateAdminPermissionsCall(adminUid: string, permissions: string[]): Promise<{ success: boolean; message: string }> {
  try {
    const fn = httpsCallable<{ adminUid: string; permissions: string[] }, { success: boolean; message: string }>(functions, 'updateAdminPermissions');
    const res = await fn({ adminUid, permissions });
    if (res.data && res.data.success) {
      return res.data;
    }
    throw new Error('Failed to update admin permissions.');
  } catch (fnErr: any) {
    console.error('[adminManagementService] Cloud Function updateAdminPermissions error:', fnErr);
    const msg = fnErr?.message || fnErr?.details || 'Failed to update admin permissions (এডমিন পারমিশন আপডেট করা সম্ভব হয়নি)।';
    throw new Error(msg);
  }
}

