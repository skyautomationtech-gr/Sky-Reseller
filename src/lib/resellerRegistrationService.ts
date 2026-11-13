import { httpsCallable } from 'firebase/functions';
import { doc, getDoc, setDoc, serverTimestamp, collection, getDocs, query, where, limit } from 'firebase/firestore';
import { db, functions } from './firebase';

export interface FinalizeRegistrationInput {
  uid: string;
  email: string;
  formData: any;
  termsVersion?: string;
  password?: string;
}

export interface FinalizeRegistrationResult {
  success: boolean;
  resellerId: string;
  message?: string;
}

/**
 * Resolves a Reseller ID (e.g. RSB-000001 or legacy SGR-XXXX) to the registered email.
 * First calls Cloud Function 'resolveLoginId'. If Cloud Functions are unreachable (Spark plan / preview),
 * falls back to querying the users collection directly.
 */
export async function resolveLoginIdentifier(loginId: string): Promise<string> {
  const cleanId = loginId.trim().toUpperCase();

  // 1. Try Cloud Function first
  try {
    const resolveCallable = httpsCallable<{ loginId: string }, { success: boolean; email: string }>(
      functions,
      'resolveLoginId'
    );
    const res = await resolveCallable({ loginId: cleanId });
    if (res.data && res.data.email) {
      return res.data.email;
    }
  } catch (fnErr: any) {
    if (fnErr.code === 'functions/not-found' || fnErr.message?.includes('Invalid ID or password')) {
      throw new Error('Invalid ID or password');
    }
    console.warn('Cloud function resolveLoginId not available, using client query fallback:', fnErr);
  }

  // 2. Client fallback
  try {
    const usersCol = collection(db, 'users');
    let q = query(usersCol, where('resellerId', '==', cleanId), limit(1));
    let snap = await getDocs(q);

    if (snap.empty) {
      q = query(usersCol, where('resellerCode', '==', cleanId), limit(1));
      snap = await getDocs(q);
    }

    if (!snap.empty) {
      const email = snap.docs[0].data().email;
      if (email) return email;
    }
  } catch (err) {
    console.warn('Fallback resolve error:', err);
  }

  // Generic message so IDs cannot be enumerated
  throw new Error('Invalid ID or password');
}

import { normalizeShopName } from '../utils/shopName';

async function generateUniqueFallbackResellerId(uid: string): Promise<string> {
  let baseCount = 0;
  try {
    const counterSnap = await getDoc(doc(db, 'counters', 'resellerId'));
    if (counterSnap.exists()) {
      baseCount = Number(counterSnap.data()?.lastCount || 0);
    }
  } catch {
    // Ignore read error
  }

  // Try sequential candidate first if counter exists, then salted random candidates
  const candidates: string[] = [];
  if (baseCount > 0) {
    candidates.push(`RSB-${String(baseCount + 1).padStart(6, '0')}`);
    candidates.push(`RSB-${String(baseCount + 2).padStart(6, '0')}`);
  }
  for (let i = 0; i < 6; i++) {
    const randNum = 100000 + Math.floor(Math.random() * 899999);
    candidates.push(`RSB-${randNum}`);
  }

  for (const candidate of candidates) {
    try {
      const snap = await getDocs(query(collection(db, 'users'), where('resellerId', '==', candidate), limit(1)));
      if (snap.empty) {
        return candidate;
      }
    } catch {
      return candidate;
    }
  }

  return `RSB-${uid.slice(0, 6).toUpperCase()}`;
}

/**
 * Finalizes the reseller registration and assigns a Reseller ID (RSB-XXXXXX).
 * Uses Cloud Function 'finalizeRegistration' if deployed (Blaze), otherwise uses
 * Spark-Free-Plan Firestore create conforming strictly to firestore.rules.
 */
export async function finalizeResellerRegistration(
  input: FinalizeRegistrationInput
): Promise<FinalizeRegistrationResult> {
  const { uid, email, formData, termsVersion = '1.0' } = input;
  const rawShopName = (formData?.shopName || '').trim();
  const shopNameKey = normalizeShopName(rawShopName);

  if (!shopNameKey || shopNameKey.length < 2) {
    throw new Error('Shop name must be at least 2 characters long.');
  }

  // 1. Attempt Cloud Function execution (if deployed on Blaze)
  try {
    const finalizeCallable = httpsCallable<FinalizeRegistrationInput, FinalizeRegistrationResult>(
      functions,
      'finalizeRegistration'
    );
    const res = await finalizeCallable({
      ...input,
      formData: {
        ...formData,
        shopName: rawShopName,
        shopNameKey,
      },
    });
    if (res.data && res.data.resellerId) {
      return res.data;
    }
  } catch (fnErr: any) {
    if (
      fnErr.message?.includes('already taken') ||
      fnErr.code === 'already-exists' ||
      fnErr.code === 'functions/already-exists'
    ) {
      throw new Error('This shop name is already taken. Please choose a different name.');
    }
    if (
      fnErr.code === 'failed-precondition' ||
      fnErr.code === 'functions/failed-precondition' ||
      fnErr.message?.includes('verification is required')
    ) {
      throw new Error(fnErr.message || 'Email verification is required before finalizing registration.');
    }
    console.warn('Cloud Function finalizeRegistration not available, using Spark-plan Firestore fallback:', fnErr?.message || fnErr);
  }

  // 2. Spark-Free-Plan Firestore fallback (authenticated user after createUserWithEmailAndPassword)
  // Check shop name uniqueness across existing users
  try {
    const shopSnap = await getDocs(
      query(collection(db, 'users'), where('shopNameKey', '==', shopNameKey), limit(2))
    );
    const conflict = shopSnap.docs.find((d) => d.id !== uid);
    if (conflict) {
      throw new Error('This shop name is already taken. Please choose a different name.');
    }
  } catch (checkErr: any) {
    if (checkErr?.message?.includes('already taken')) {
      throw checkErr;
    }
  }

  const assignedResellerId = await generateUniqueFallbackResellerId(uid);
  const userRef = doc(db, 'users', uid);

  // Note: Omit rejectReason, permissions, createdBy, mustChangePassword, adminId, approvedAt, sessionsValidFrom
  // to comply strictly with firestore.rules allow create for self-registering resellers.
  const userPayload = {
    uid,
    resellerId: assignedResellerId,
    resellerCode: assignedResellerId,
    role: 'reseller',
    status: 'pending',
    emailVerified: true,
    termsVersion,
    termsAcceptedAt: serverTimestamp(),
    privacyAcceptedAt: serverTimestamp(),
    createdAt: serverTimestamp(),

    // Form Fields
    fullName: (formData.fullName || '').trim(),
    shopName: rawShopName,
    shopNameKey,
    mobile: (formData.mobile || '').trim(),
    whatsappNumber: (formData.whatsappNumber || formData.mobile || '').trim(),
    whatsapp: (formData.whatsappNumber || formData.mobile || '').trim(),
    email: email.trim().toLowerCase(),
    dob: formData.dob || '',
    gender: formData.gender || 'male',

    // Address
    division: formData.division || formData.customDivision || '',
    divisionId: formData.divisionId || '',
    district: formData.district || formData.customDistrict || '',
    districtId: formData.districtId || '',
    upazila: formData.upazila || formData.customUpazila || '',
    upazilaId: formData.upazilaId || '',
    union: formData.union || formData.customUnion || '',
    unionId: formData.unionId || '',
    ward: formData.ward || '',
    postalCode: (formData.postalCode || '').trim(),
    address: (formData.address || '').trim(),

    // Payout Information
    payoutMethod: formData.payoutMethod || 'bkash',
    payoutMethods: formData.payoutMethods || [],
    accountHolderName: (formData.accountHolderName || formData.fullName || '').trim(),
    accountNumber: (formData.accountNumber || '').trim(),
    bkashNumber: formData.payoutMethod === 'bkash' ? formData.accountNumber : '',
    nagadNumber: formData.payoutMethod === 'nagad' ? formData.accountNumber : '',
    rocketNumber: formData.payoutMethod === 'rocket' ? formData.accountNumber : '',
    upayNumber: formData.payoutMethod === 'upay' ? formData.accountNumber : '',
    bankName: formData.bankName || formData.customBankName || '',
    branchName: formData.branchName || '',
    routingNumber: formData.routingNumber || '',

    // Business Information
    facebookPage: (formData.facebookPage || '').trim(),
    tiktokUrl: (formData.tiktokUrl || '').trim(),
    instagramUrl: (formData.instagramUrl || '').trim(),
    youtubeUrl: (formData.youtubeUrl || '').trim(),

    // Photography & Documents
    shopLogoUrl: formData.shopLogoUrl || '',
    documentType: formData.documentType || 'nid',
    nidFrontUrl: formData.nidFrontUrl || '',
    nidBackUrl: formData.nidBackUrl || '',
    birthCertificateUrl: formData.birthCertificateUrl || '',

    // Legacy compatibility
    profilePhotoUrl: formData.shopLogoUrl || '',
    shopPhotoUrl: formData.shopLogoUrl || '',
    nidUrl: formData.nidFrontUrl || formData.birthCertificateUrl || '',
    plainPassword: formData.password || '',
  };

  await setDoc(userRef, userPayload);

  return {
    success: true,
    resellerId: assignedResellerId,
    message: 'Registration finalized successfully! Your account is pending admin approval.',
  };
}
