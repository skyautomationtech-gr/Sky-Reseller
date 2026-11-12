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
 * Creates an admin account via server-authoritative Cloud Function / API
 */
export async function createAdminCall(payload: CreateAdminPayload): Promise<CreateAdminResponse> {
  // 1. Try Firebase Callable Cloud Function first
  try {
    const fn = httpsCallable<CreateAdminPayload, CreateAdminResponse>(functions, 'createAdmin');
    const res = await fn(payload);
    if (res.data && res.data.success) {
      return res.data;
    }
  } catch (fnErr: any) {
    // If it's a specific functional error, rethrow cleanly
    if (
      fnErr.code === 'already-exists' ||
      fnErr.code === 'permission-denied' ||
      fnErr.code === 'invalid-argument' ||
      fnErr.code === 'resource-exhausted'
    ) {
      throw new Error(fnErr.message);
    }
    console.warn('[adminManagementService] Cloud Function createAdmin failed or not deployed, trying server endpoint:', fnErr?.message || fnErr);
  }

  // 2. Try server Express API fallback
  try {
    const res = await fetch('/api/admin/create-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (res.ok && data.success) {
      return data;
    }
    throw new Error(data.error || 'Failed to create admin account.');
  } catch (apiErr: any) {
    throw new Error(apiErr.message || 'Could not create admin account. Please try again.');
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
  } catch (fnErr: any) {
    console.warn('[adminManagementService] Cloud Function resendAdminWelcomeEmail failed, trying server API:', fnErr?.message || fnErr);
  }

  try {
    const res = await fetch('/api/admin/resend-welcome-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminUid }),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      return data;
    }
    throw new Error(data.error || 'Failed to resend welcome email.');
  } catch (apiErr: any) {
    throw new Error(apiErr.message || 'Could not resend welcome email. Please try again.');
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
  } catch (fnErr: any) {
    console.warn('[adminManagementService] Cloud Function changeAdminPassword failed, trying server API:', fnErr?.message || fnErr);
  }

  try {
    const res = await fetch('/api/admin/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword, currentPassword }),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      return data;
    }
    throw new Error(data.error || 'Failed to update admin password.');
  } catch (apiErr: any) {
    throw new Error(apiErr.message || 'Could not update password. Please check your current password and try again.');
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
  } catch (fnErr: any) {
    console.warn('[adminManagementService] Cloud Function toggleAdminStatus failed, trying server API:', fnErr?.message || fnErr);
  }

  try {
    const res = await fetch('/api/admin/toggle-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminUid, status, reason }),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      return data;
    }
    throw new Error(data.error || 'Failed to update admin status.');
  } catch (apiErr: any) {
    throw new Error(apiErr.message || 'Failed to update admin status.');
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
  } catch (fnErr: any) {
    console.warn('[adminManagementService] Cloud Function updateAdminPermissions failed, trying server API:', fnErr?.message || fnErr);
  }

  try {
    const res = await fetch('/api/admin/update-permissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminUid, permissions }),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      return data;
    }
    throw new Error(data.error || 'Failed to update admin permissions.');
  } catch (apiErr: any) {
    throw new Error(apiErr.message || 'Failed to update admin permissions.');
  }
}
