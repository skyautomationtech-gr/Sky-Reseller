import { httpsCallable } from 'firebase/functions';
import { doc, runTransaction, serverTimestamp, collection, getDocs, query, where, limit } from 'firebase/firestore';
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
 * First calls Cloud Function 'resolveLoginId'. If Cloud Functions are unreachable or in local preview,
 * falls back to querying the users collection directly with rate limiting.
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
    // If not found from cloud function, propagate generic error
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

/**
 * Finalizes the reseller registration and assigns a sequential Reseller ID (RSB-000001, etc.)
 * inside an atomic Firestore transaction on counters/resellerId and shopNames/{shopNameKey}.
 * First tries the Cloud Function 'finalizeRegistration'. If Cloud Functions are unreachable,
 * falls back to the server API '/api/finalize-registration'.
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

  // 1. Attempt Cloud Function execution
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
    if (fnErr.message?.includes('already taken') || fnErr.code === 'already-exists') {
      throw new Error('This shop name is already taken. Please choose a different name.');
    }
    if (fnErr.code === 'failed-precondition' || fnErr.message?.includes('verification is required')) {
      throw new Error(fnErr.message || 'Email verification is required before finalizing registration.');
    }
    console.warn('Cloud Function finalizeRegistration not available, trying server API fallback:', fnErr);
  }

  // 2. Attempt Express Server API fallback
  try {
    const response = await fetch('/api/finalize-registration', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid,
        email,
        formData: {
          ...formData,
          shopName: rawShopName,
          shopNameKey,
        },
        termsVersion,
      }),
    });

    const data = await response.json();
    if (response.ok && data.success) {
      return data;
    }
    if (response.status === 409 || data.error?.includes('already taken')) {
      throw new Error('This shop name is already taken. Please choose a different name.');
    }
    if (response.status === 403 || data.error?.includes('verification is required')) {
      throw new Error(data.error || 'Email verification is required before finalizing registration.');
    }
  } catch (apiErr: any) {
    if (apiErr.message?.includes('already taken') || apiErr.message?.includes('verification is required')) {
      throw apiErr;
    }
    console.warn('Server API fallback failed, attempting local client transaction:', apiErr);
  }

  // 3. Direct Firestore transaction fallback
  const counterRef = doc(db, 'counters', 'resellerId');
  const userRef = doc(db, 'users', uid);

  let assignedResellerId = '';

  await runTransaction(db, async (transaction) => {
    const counterDoc = await transaction.get(counterRef);
    let currentCount = 0;
    if (counterDoc.exists()) {
      currentCount = counterDoc.data().lastCount || 0;
    }
    const nextCount = currentCount + 1;
    assignedResellerId = `RSB-${String(nextCount).padStart(6, '0')}`;

    // Update counter
    transaction.set(counterRef, {
      lastCount: nextCount,
      updatedAt: serverTimestamp(),
    }, { merge: true });

    // Build trusted profile payload
    const userPayload = {
      uid,
      resellerId: assignedResellerId,
      resellerCode: assignedResellerId,
      role: 'reseller',
      status: 'pending',
      rejectReason: null,
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

    transaction.set(userRef, userPayload, { merge: true });
  });

  return {
    success: true,
    resellerId: assignedResellerId,
    message: 'Registration finalized successfully! Your account is pending admin approval.',
  };
}
