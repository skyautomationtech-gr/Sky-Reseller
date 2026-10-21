const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

/**
 * 1. New Order Notification (to Admin/Super Admin)
 */
exports.sendNewOrderNotification = functions.firestore
  .document('orders/{orderId}')
  .onCreate(async (snap, context) => {
    const order = snap.data();
    if (!order) return null;

    const orderNumber = order.orderNumber || context.params.orderId;
    const amount = order.totalAmount || order.payableAmount || 0;
    const resellerName = order.resellerName || order.customerName || 'Reseller';

    // Find admins & super_admins
    const usersSnap = await admin.firestore()
      .collection('users')
      .where('role', 'in', ['admin', 'super_admin'])
      .get();

    const tokens = [];
    usersSnap.forEach((doc) => {
      const userData = doc.data();
      const notifPref = userData.notificationPreferences || {};
      if (notifPref.newOrder !== false && Array.isArray(userData.fcmTokens) && userData.fcmTokens.length > 0) {
        tokens.push(...userData.fcmTokens);
      }
    });

    if (tokens.length === 0) {
      console.log('No admin FCM tokens found for new order notification.');
      return null;
    }

    const uniqueTokens = [...new Set(tokens)];
    const payload = {
      notification: {
        title: 'New Order Received',
        body: `Order #${orderNumber} - ৳${amount} from ${resellerName}`,
      },
      data: {
        type: 'new_order',
        orderId: context.params.orderId,
        orderNumber: String(orderNumber),
      },
    };

    try {
      const response = await admin.messaging().sendToDevice(uniqueTokens, payload);
      console.log(`Successfully sent ${response.successCount} new order push notifications.`);
    } catch (error) {
      console.error('Error sending new order push notification:', error);
    }
    return null;
  });

/**
 * 2. Order Status Update Notification (to Reseller)
 */
exports.sendOrderStatusNotification = functions.firestore
  .document('orders/{orderId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();

    if (!before || !after) return null;
    if (before.status === after.status) return null; // Status didn't change

    const resellerId = after.resellerId || after.userId;
    if (!resellerId) return null;

    const userDoc = await admin.firestore().collection('users').doc(resellerId).get();
    if (!userDoc.exists) return null;

    const userData = userDoc.data();
    const notifPref = userData.notificationPreferences || {};
    if (notifPref.orderStatus === false || !Array.isArray(userData.fcmTokens) || userData.fcmTokens.length === 0) {
      return null;
    }

    const orderNumber = after.orderNumber || context.params.orderId;
    const status = after.status || 'Updated';

    const payload = {
      notification: {
        title: 'Order Status Updated',
        body: `Your order #${orderNumber} is now ${status}`,
      },
      data: {
        type: 'order_status',
        orderId: context.params.orderId,
        status: String(status),
      },
    };

    try {
      const response = await admin.messaging().sendToDevice(userData.fcmTokens, payload);
      console.log(`Successfully sent order status notification to reseller ${resellerId}:`, response.successCount);
    } catch (error) {
      console.error('Error sending order status notification:', error);
    }
    return null;
  });

/**
 * 3. Commission/Payout Notification (to Reseller)
 */
exports.sendCommissionPayoutNotification = functions.firestore
  .document('transactions/{txId}')
  .onCreate(async (snap, context) => {
    const tx = snap.data();
    if (!tx || !tx.userId) return null;

    const userDoc = await admin.firestore().collection('users').doc(tx.userId).get();
    if (!userDoc.exists) return null;

    const userData = userDoc.data();
    const notifPref = userData.notificationPreferences || {};
    if (!Array.isArray(userData.fcmTokens) || userData.fcmTokens.length === 0) return null;

    let title = 'Wallet Update';
    let body = `৳${tx.amount || 0} wallet update recorded.`;
    let sendNotif = true;

    if (tx.type === 'commission' || tx.type === 'credit') {
      if (notifPref.commission === false) sendNotif = false;
      title = 'Commission Credited';
      body = `৳${tx.amount || 0} added to your wallet!`;
    } else if (tx.type === 'withdrawal' || tx.type === 'payout') {
      if (notifPref.payout === false) sendNotif = false;
      title = 'Withdrawal Update';
      body = `Your withdrawal request of ৳${tx.amount || 0} is ${tx.status || 'processed'}`;
    }

    if (!sendNotif) return null;

    const payload = {
      notification: { title, body },
      data: {
        type: 'payout',
        txId: context.params.txId,
      },
    };

    try {
      await admin.messaging().sendToDevice(userData.fcmTokens, payload);
    } catch (err) {
      console.error('Error sending commission/payout push:', err);
    }
    return null;
  });

/**
 * 4. Important Notice Notification (to all or targeted users)
 */
exports.sendImportantNoticeNotification = functions.firestore
  .document('notices/{noticeId}')
  .onCreate(async (snap, context) => {
    const notice = snap.data();
    if (!notice) return null;

    const title = notice.title || 'Important Notice';
    const body = notice.message || notice.content || notice.preview || 'New announcement published.';

    const usersSnap = await admin.firestore().collection('users').get();
    const tokens = [];

    usersSnap.forEach((doc) => {
      const userData = doc.data();
      const notifPref = userData.notificationPreferences || {};
      if (notifPref.importantNotice !== false && Array.isArray(userData.fcmTokens) && userData.fcmTokens.length > 0) {
        tokens.push(...userData.fcmTokens);
      }
    });

    if (tokens.length === 0) return null;
    const uniqueTokens = [...new Set(tokens)];

    const payload = {
      notification: { title, body },
      data: {
        type: 'important_notice',
        noticeId: context.params.noticeId,
      },
    };

    try {
      await admin.messaging().sendToDevice(uniqueTokens, payload);
      console.log('Sent notice notification to', uniqueTokens.length, 'devices.');
    } catch (err) {
      console.error('Error sending notice push notification:', err);
    }
    return null;
  });

/**
 * 5. App Update Notification (to all)
 */
exports.sendAppUpdateNotification = functions.firestore
  .document('appVersions/{versionId}')
  .onCreate(async (snap, context) => {
    const versionData = snap.data();
    if (!versionData) return null;

    const versionNum = versionData.version || '1.0.0';
    const releaseTitle = versionData.title || versionData.changelog || 'New Features & Bug Fixes';

    const usersSnap = await admin.firestore().collection('users').get();
    const tokens = [];

    usersSnap.forEach((doc) => {
      const userData = doc.data();
      const notifPref = userData.notificationPreferences || {};
      if (notifPref.appUpdate !== false && Array.isArray(userData.fcmTokens) && userData.fcmTokens.length > 0) {
        tokens.push(...userData.fcmTokens);
      }
    });

    if (tokens.length === 0) return null;
    const uniqueTokens = [...new Set(tokens)];

    const payload = {
      notification: {
        title: 'App Update Available',
        body: `Version ${versionNum} is now available - ${releaseTitle}`,
      },
      data: {
        type: 'app_update',
        version: String(versionNum),
      },
    };

    try {
      await admin.messaging().sendToDevice(uniqueTokens, payload);
    } catch (err) {
      console.error('Error sending app update push notification:', err);
    }
    return null;
  });

/**
 * 6. Reseller Registration - Send Email OTP
 * Generates a cryptographically random 6-digit OTP, hashes it,
 * stores expiry (10 min) & attempt count in Firestore `emailOtps`,
 * and sends the transactional email.
 */
const crypto = require('crypto');

function hashOtp(code, salt = 'resellbd_otp_secret_salt_2026') {
  return crypto.createHash('sha256').update(code + salt).digest('hex');
}

exports.sendEmailOtp = functions.https.onCall(async (data, context) => {
  const email = (data?.email || '').trim().toLowerCase();

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Please provide a valid email address.'
    );
  }

  // Check if email is already in use by an approved reseller/admin
  const existingUserSnap = await admin.firestore()
    .collection('users')
    .where('email', '==', email)
    .limit(1)
    .get();

  if (!existingUserSnap.empty) {
    const existingUser = existingUserSnap.docs[0].data();
    if (existingUser.status === 'approved') {
      throw new functions.https.HttpsError(
        'already-exists',
        'This email address is already registered and approved. Please sign in.'
      );
    }
  }

  const otpDocRef = admin.firestore().collection('emailOtps').doc(email);
  const otpDocSnap = await otpDocRef.get();

  // Enforce 60-second cooldown
  if (otpDocSnap.exists) {
    const otpData = otpDocSnap.data();
    const lastSent = otpData?.lastSentAt?.toDate ? otpData.lastSentAt.toDate().getTime() : (otpData?.lastSentAt || 0);
    const now = Date.now();
    const elapsedSeconds = Math.floor((now - lastSent) / 1000);

    if (elapsedSeconds < 60) {
      const waitTime = 60 - elapsedSeconds;
      throw new functions.https.HttpsError(
        'resource-exhausted',
        `Please wait ${waitTime} seconds before requesting a new OTP.`
      );
    }
  }

  // Generate 6-digit code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const hashedCode = hashOtp(code);
  const expiresAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 10 * 60 * 1000)); // 10 minutes

  // Save to Firestore
  await otpDocRef.set({
    hashedCode,
    expiresAt,
    attemptsLeft: 5,
    lastSentAt: admin.firestore.FieldValue.serverTimestamp(),
    verified: false,
  });

  console.log(`[ReSellBD OTP Engine] Generated OTP for: ${email}`);

  // Send transactional email via Gmail SMTP with Google App Password
  const nodemailer = require('nodemailer');
  const gmailUser = process.env.GMAIL_USER || 'skyautomationtech@gmail.com';
  const gmailPass = (process.env.GMAIL_APP_PASSWORD || 'ealgyihwwtcxrsuz').replace(/\s+/g, '');

  const gmailTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: gmailUser,
      pass: gmailPass,
    },
  });

  try {
    await gmailTransporter.sendMail({
      from: `"ReSellBD Verification" <${gmailUser}>`,
      to: email,
      subject: `${code} is your ReSellBD Reseller Verification Code`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; background: #050B1A; color: #ffffff; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1);">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #3DD055; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">ReSellBD</h1>
            <p style="color: #0E9AA7; font-size: 13px; margin: 4px 0 0 0; text-transform: uppercase; font-weight: 700; letter-spacing: 1px;">Reseller Portal Verification</p>
          </div>
          <div style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 20px;">
            <p style="margin: 0 0 12px 0; color: #94a3b8; font-size: 14px;">Your 6-digit email verification code is:</p>
            <div style="font-size: 36px; font-weight: 900; letter-spacing: 8px; color: #3DD055; padding: 12px; background: rgba(0,0,0,0.3); border-radius: 8px; display: inline-block;">
              ${code}
            </div>
            <p style="margin: 12px 0 0 0; color: #cbd5e1; font-size: 12px;">This code will expire in <strong>10 minutes</strong>. Do not share this code with anyone.</p>
          </div>
          <p style="color: #64748b; font-size: 11px; text-align: center; margin: 0;">
            Sent automatically by ReSellBD via Gmail SMTP (skyautomationtech@gmail.com).
          </p>
        </div>
      `,
    });
    console.log(`[ReSellBD OTP Engine] Successfully dispatched email via Gmail SMTP to: ${email}`);
  } catch (emailErr) {
    console.error(`[ReSellBD OTP Engine] Error sending email via Gmail SMTP:`, emailErr);
  }

  return {
    success: true,
    message: 'Verification code sent to your email address.',
    email,
    expiresInSeconds: 600,
    cooldownSeconds: 60,
  };
});

/**
 * 7. Reseller Registration - Verify Email OTP
 * Verifies the 6-digit code against the stored SHA-256 hash,
 * decrements attempts, checks expiration, and marks email verified.
 */
exports.verifyEmailOtp = functions.https.onCall(async (data, context) => {
  const email = (data?.email || '').trim().toLowerCase();
  const code = (data?.code || '').trim();

  if (!email || !code || code.length !== 6) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Please enter the full 6-digit code.'
    );
  }

  const otpDocRef = admin.firestore().collection('emailOtps').doc(email);
  const otpDocSnap = await otpDocRef.get();

  if (!otpDocSnap.exists) {
    throw new functions.https.HttpsError(
      'not-found',
      'No active verification code found for this email. Please request a new code.'
    );
  }

  const otpData = otpDocSnap.data();

  // Check expiration (10 min)
  const expiresAt = otpData.expiresAt?.toDate ? otpData.expiresAt.toDate().getTime() : (otpData.expiresAt || 0);
  if (Date.now() > expiresAt) {
    await otpDocRef.delete();
    throw new functions.https.HttpsError(
      'deadline-exceeded',
      'This verification code has expired. Please request a new one.'
    );
  }

  // Check attempt limit (max 5)
  const attemptsLeft = otpData.attemptsLeft !== undefined ? otpData.attemptsLeft : 5;
  if (attemptsLeft <= 0) {
    await otpDocRef.delete();
    throw new functions.https.HttpsError(
      'resource-exhausted',
      'Maximum verification attempts exceeded. Please request a new code.'
    );
  }

  // Compare hash
  const inputHash = hashOtp(code);
  if (inputHash !== otpData.hashedCode) {
    const remaining = attemptsLeft - 1;
    await otpDocRef.update({ attemptsLeft: remaining });

    if (remaining <= 0) {
      await otpDocRef.delete();
      throw new functions.https.HttpsError(
        'resource-exhausted',
        'Invalid code. Maximum attempts exceeded. Please request a new code.'
      );
    }

    throw new functions.https.HttpsError(
      'invalid-argument',
      `Incorrect code. You have ${remaining} ${remaining === 1 ? 'attempt' : 'attempts'} remaining.`
    );
  }

  // Success: mark as verified
  const verifiedUntil = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 30 * 60 * 1000)); // 30 min window to finish registration
  await otpDocRef.update({
    verified: true,
    verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
    verifiedUntil,
    attemptsLeft: 0,
  });

  console.log(`[ReSellBD OTP Engine] Email verified successfully: ${email}`);

  return {
    success: true,
    verified: true,
    email,
    message: 'Email address verified successfully!',
  };
});

/**
 * In-memory rate limiting map for resolveLoginId
 * Key: IP or identifier -> { count, windowStart }
 */
const resolveIdRateLimitMap = new Map();

/**
 * 8. Reseller Login - Resolve Reseller ID to Email
 * Allows users to login using their sequential Reseller ID (e.g. RSB-000001 or legacy SGR-XXXX).
 * Has rate limiting and returns ONLY the email for Firebase Auth, or a generic error.
 */
exports.resolveLoginId = functions.https.onCall(async (data, context) => {
  const rawId = (data?.loginId || '').trim();
  if (!rawId) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid ID or password');
  }

  // Rate Limiting (max 15 attempts per minute per IP / caller)
  const callerKey = context.rawRequest?.ip || context.auth?.uid || 'anonymous';
  const now = Date.now();
  const limitWindow = 60 * 1000;
  const maxAttempts = 15;

  const currentRate = resolveIdRateLimitMap.get(callerKey) || { count: 0, windowStart: now };
  if (now - currentRate.windowStart > limitWindow) {
    currentRate.count = 1;
    currentRate.windowStart = now;
  } else {
    currentRate.count++;
  }
  resolveIdRateLimitMap.set(callerKey, currentRate);

  if (currentRate.count > maxAttempts) {
    throw new functions.https.HttpsError(
      'resource-exhausted',
      'Too many login attempts. Please wait a moment and try again.'
    );
  }

  const cleanId = rawId.toUpperCase();

  try {
    // 1. Search by resellerId
    let userSnap = await admin.firestore()
      .collection('users')
      .where('resellerId', '==', cleanId)
      .limit(1)
      .get();

    // 2. Fallback to resellerCode if not found
    if (userSnap.empty) {
      userSnap = await admin.firestore()
        .collection('users')
        .where('resellerCode', '==', cleanId)
        .limit(1)
        .get();
    }

    if (userSnap.empty) {
      // Generic error so IDs cannot be enumerated
      throw new functions.https.HttpsError('not-found', 'Invalid ID or password');
    }

    const userData = userSnap.docs[0].data();
    if (!userData.email) {
      throw new functions.https.HttpsError('not-found', 'Invalid ID or password');
    }

    return {
      success: true,
      email: userData.email,
    };
  } catch (err) {
    if (err instanceof functions.https.HttpsError) {
      throw err;
    }
    console.error('Error resolving reseller login ID:', err);
    throw new functions.https.HttpsError('not-found', 'Invalid ID or password');
  }
});

/**
 * 9. Reseller Registration - Finalize Registration & Assign Reseller ID
 * Performs atomic Firestore transaction on counters/resellerId to assign
 * sequential RSB-000001, RSB-000002...
 * Writes trusted fields (role, status: 'pending', resellerId, emailVerified, termsAcceptedAt)
 * that client security rules block from direct client modification.
 * Dispatches push notification to Admins.
 */
exports.finalizeRegistration = functions.https.onCall(async (data, context) => {
  const uid = data?.uid || context.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }

  const formData = data?.formData || {};
  const email = (data?.email || formData.email || '').trim().toLowerCase();

  const firestore = admin.firestore();
  const counterRef = firestore.collection('counters').doc('resellerId');
  const userRef = firestore.collection('users').doc(uid);

  let assignedResellerId = '';

  try {
    // Transaction to safely increment sequential resellerId
    await firestore.runTransaction(async (t) => {
      const counterDoc = await t.get(counterRef);
      let currentCount = 0;
      if (counterDoc.exists) {
        currentCount = counterDoc.data().lastCount || 0;
      }
      const nextCount = currentCount + 1;
      assignedResellerId = `RSB-${String(nextCount).padStart(6, '0')}`;

      // Update counter
      t.set(counterRef, {
        lastCount: nextCount,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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
        termsVersion: data?.termsVersion || '1.0',
        termsAcceptedAt: admin.firestore.FieldValue.serverTimestamp(),
        privacyAcceptedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),

        // Form Fields
        fullName: (formData.fullName || '').trim(),
        shopName: (formData.shopName || '').trim(),
        mobile: (formData.mobile || '').trim(),
        whatsappNumber: (formData.whatsappNumber || formData.mobile || '').trim(),
        whatsapp: (formData.whatsappNumber || formData.mobile || '').trim(),
        email,
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

      t.set(userRef, userPayload, { merge: true });
    });

    console.log(`[ReSellBD Registration] Successfully assigned ${assignedResellerId} to user ${uid}`);

    // Send push notification to all Admins & Super Admins
    try {
      const adminSnap = await firestore
        .collection('users')
        .where('role', 'in', ['admin', 'super_admin'])
        .get();

      const tokens = [];
      adminSnap.forEach((d) => {
        const u = d.data();
        if (Array.isArray(u.fcmTokens) && u.fcmTokens.length > 0) {
          tokens.push(...u.fcmTokens);
        }
      });

      if (tokens.length > 0) {
        const uniqueTokens = [...new Set(tokens)];
        const payload = {
          notification: {
            title: 'New Reseller Pending Approval',
            body: `${formData.shopName || 'New Reseller'} (${assignedResellerId}) has applied and is waiting for review.`,
          },
          data: {
            type: 'reseller_approval',
            uid,
            resellerId: assignedResellerId,
            shopName: formData.shopName || '',
          },
        };
        await admin.messaging().sendToDevice(uniqueTokens, payload);
        console.log(`Sent registration approval push notification to ${uniqueTokens.length} admin devices.`);
      }
    } catch (notifErr) {
      console.warn('Could not dispatch admin registration push notification:', notifErr);
    }

    return {
      success: true,
      resellerId: assignedResellerId,
      message: 'Registration finalized successfully! Your account is pending admin approval.',
    };
  } catch (err) {
    console.error('Error finalizing registration:', err);
    throw new functions.https.HttpsError('internal', err.message || 'Failed to finalize registration.');
  }
});

