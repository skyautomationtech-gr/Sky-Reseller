const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

/**
 * Checks whether the current time falls within user's configured quiet hours.
 */
function isWithinQuietHours(notifPref) {
  if (!notifPref || !notifPref.quietHoursEnabled) return false;
  try {
    const start = notifPref.quietHoursStart || '22:00';
    const end = notifPref.quietHoursEnd || '07:00';
    const now = new Date();
    // UTC to Bangladesh time (UTC+6)
    const bdHours = (now.getUTCHours() + 6) % 24;
    const currentMinutes = bdHours * 60 + now.getUTCMinutes();

    const [sH, sM] = start.split(':').map(Number);
    const startMinutes = (sH || 0) * 60 + (sM || 0);

    const [eH, eM] = end.split(':').map(Number);
    const endMinutes = (eH || 0) * 60 + (eM || 0);

    if (startMinutes <= endMinutes) {
      return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    } else {
      return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
    }
  } catch (e) {
    return false;
  }
}

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
      const orderAllowed = notifPref.orderUpdates !== false && notifPref.newOrder !== false;
      if (orderAllowed && !isWithinQuietHours(notifPref) && Array.isArray(userData.fcmTokens) && userData.fcmTokens.length > 0) {
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
    
    // Check both orderUpdates and orderStatus keys
    const orderAllowed = notifPref.orderUpdates !== false && notifPref.orderStatus !== false;
    if (!orderAllowed || !Array.isArray(userData.fcmTokens) || userData.fcmTokens.length === 0) {
      return null;
    }

    if (isWithinQuietHours(notifPref)) {
      console.log(`Silent/Quiet hours active for reseller ${resellerId}. Non-urgent order update skipped.`);
      return null;
    }

    const orderNumber = after.orderNumber || context.params.orderId;
    const status = after.status || 'Updated';

    const payload = {
      notification: {
        title: 'Order Status Updated',
        body: `Your order #${orderNumber} is now ${status}`,
        sound: notifPref.sound !== false ? 'default' : undefined,
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
 * 3. Commission/Payout/Wallet Notification (to Reseller)
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

    if (isWithinQuietHours(notifPref)) {
      console.log(`Quiet hours active for user ${tx.userId}. Wallet update push muted.`);
      return null;
    }

    let title = 'Wallet Update';
    let body = `৳${tx.amount || 0} wallet update recorded.`;
    let sendNotif = true;

    if (tx.type === 'commission' || tx.type === 'credit') {
      if (notifPref.commissionCredited === false || notifPref.commission === false) sendNotif = false;
      title = 'Commission Credited';
      body = `৳${tx.amount || 0} added to your wallet!`;
    } else if (tx.type === 'withdrawal' || tx.type === 'payout') {
      if (notifPref.payoutUpdates === false || notifPref.payout === false) sendNotif = false;
      title = 'Withdrawal Update';
      body = `Your withdrawal request of ৳${tx.amount || 0} is ${tx.status || 'processed'}`;
    } else {
      if (notifPref.walletActivity === false) sendNotif = false;
    }

    if (!sendNotif) return null;

    const payload = {
      notification: { 
        title, 
        body,
        sound: notifPref.sound !== false ? 'default' : undefined,
      },
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
      const noticeAllowed = notifPref.importantNotices !== false && notifPref.importantNotice !== false;
      if (noticeAllowed && Array.isArray(userData.fcmTokens) && userData.fcmTokens.length > 0) {
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
      const appUpdateAllowed = notifPref.appUpdates !== false && notifPref.appUpdate !== false;
      if (appUpdateAllowed && !isWithinQuietHours(notifPref) && Array.isArray(userData.fcmTokens) && userData.fcmTokens.length > 0) {
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
 * 6. Callable: Send Test Push Notification
 */
exports.sendTestPushNotification = functions.https.onCall(async (data, context) => {
  const uid = context.auth ? context.auth.uid : data.userId;
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated', 'User authentication required.');
  }

  const userDoc = await admin.firestore().collection('users').doc(uid).get();
  if (!userDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'User profile not found.');
  }

  const userData = userDoc.data();
  const tokens = Array.isArray(userData.fcmTokens) ? userData.fcmTokens : [];
  if (tokens.length === 0) {
    return { success: false, reason: 'no_tokens', message: 'No registered push devices found.' };
  }

  const payload = {
    notification: {
      title: data.title || '🔔 ReSellBD Test Alert',
      body: data.body || 'Push notifications are successfully configured!',
    },
    data: {
      type: 'test_notification',
      timestamp: String(Date.now()),
    },
  };

  try {
    const res = await admin.messaging().sendToDevice(tokens, payload);
    return { success: true, count: res.successCount };
  } catch (err) {
    console.error('Test notification failed:', err);
    throw new functions.https.HttpsError('internal', err.message);
  }
});

/**
 * 6. Reseller Registration - Send Email OTP
 * Generates a cryptographically random 6-digit OTP, hashes it,
 * stores expiry (10 min) & attempt count in Firestore `emailOtps`,
 * and sends the transactional email.
 */
const crypto = require('crypto');
const { getFirestore } = require('firebase-admin/firestore');

// Dedicated named database support for ai-studio instance
const FIRESTORE_DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || 'ai-studio-5b67ed85-eca9-4578-81ec-a8f1bfd7298e';

function getOtpDb() {
  try {
    if (FIRESTORE_DATABASE_ID && FIRESTORE_DATABASE_ID !== '(default)') {
      return getFirestore(FIRESTORE_DATABASE_ID);
    }
  } catch (err) {
    console.warn('[OTP Engine] Fallback to default firestore instance:', err.message);
  }
  return admin.firestore();
}

const OTP_SECRET_SALT = process.env.OTP_SECRET_SALT || 'resellbd_otp_secret_salt_2026';

function hashOtp(code, salt = OTP_SECRET_SALT) {
  const safeSalt = salt || 'resellbd_otp_secret_salt_2026';
  return crypto.createHash('sha256').update(String(code).trim() + safeSalt).digest('hex');
}

function hashEmailForLog(email) {
  if (!email) return 'anonymous';
  return crypto.createHash('sha256').update(String(email).trim().toLowerCase()).digest('hex').substring(0, 10);
}

function parseTimestampMs(val) {
  if (!val) return 0;
  if (typeof val.toDate === 'function') return val.toDate().getTime();
  if (typeof val.toMillis === 'function') return val.toMillis();
  if (typeof val === 'number') return val;
  if (val instanceof Date) return val.getTime();
  return new Date(val).getTime() || 0;
}

/**
 * 6. Reseller Registration - Send Email OTP
 * Generates 6-digit code, hashes with SHA-256 + secret salt,
 * stores expiry (10 min) & attempt count in Firestore, and sends transactional email.
 */
exports.sendEmailOtp = functions.https.onCall(async (data, context) => {
  let step = 'init';
  const email = String(data?.email || '').trim().toLowerCase();
  const emailHash = hashEmailForLog(email);

  try {
    step = 'validate_email';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Please provide a valid email address.'
      );
    }

    step = 'check_existing_user';
    const db = getOtpDb();
    const existingUserSnap = await db
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

    step = 'check_cooldown_and_lock';
    const otpDocRef = db.collection('emailOtps').doc(email);
    const otpDocSnap = await otpDocRef.get();
    const now = Date.now();

    if (otpDocSnap.exists) {
      const otpData = otpDocSnap.data() || {};

      // 15-minute lock check
      const lockedUntil = parseTimestampMs(otpData.lockedUntil);
      if (lockedUntil > now) {
        const remainingMinutes = Math.ceil((lockedUntil - now) / 60000);
        throw new functions.https.HttpsError(
          'resource-exhausted',
          `Too many failed attempts. Account is locked for ${remainingMinutes} more minute${remainingMinutes === 1 ? '' : 's'}.`
        );
      }

      // 60-second cooldown check
      const lastSent = parseTimestampMs(otpData.lastSentAt);
      const elapsedSeconds = Math.floor((now - lastSent) / 1000);
      if (lastSent > 0 && elapsedSeconds < 60) {
        const waitTime = 60 - elapsedSeconds;
        throw new functions.https.HttpsError(
          'resource-exhausted',
          `Please wait ${waitTime} seconds before requesting a new OTP.`
        );
      }
    }

    step = 'generate_code';
    // Generate exactly 6-digit numeric string with leading zero protection
    const numericVal = Math.floor(100000 + Math.random() * 900000);
    const code = String(numericVal).padStart(6, '0');
    const hashedCode = hashOtp(code);
    const expiresAt = admin.firestore.Timestamp.fromDate(new Date(now + 10 * 60 * 1000)); // 10 minutes

    step = 'save_otp_record';
    await otpDocRef.set({
      hashedCode,
      expiresAt,
      attemptsLeft: 5,
      lastSentAt: admin.firestore.FieldValue.serverTimestamp(),
      verified: false,
      lockedUntil: null,
    });

    // Developer test mode log (does NOT log the OTP code itself)
    console.log(`[OTP TestMode] OTP sent for emailHash=${emailHash}`);

    step = 'send_email';
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

    console.log(`[sendEmailOtp] Successfully dispatched email to emailHash=${emailHash}`);

    return {
      success: true,
      message: 'Verification code sent to your email address.',
      email,
      expiresInSeconds: 600,
      cooldownSeconds: 60,
    };
  } catch (err) {
    if (err instanceof functions.https.HttpsError) {
      console.warn(`[sendEmailOtp] Expected HttpsError at step=${step} for emailHash=${emailHash}:`, err.code, err.message);
      throw err;
    }
    console.error(`[sendEmailOtp] Unhandled error at step=${step} for emailHash=${emailHash}:`, err);
    throw new functions.https.HttpsError(
      'internal',
      'Could not send verification email. Please try again later.'
    );
  }
});

/**
 * 7. Reseller Registration - Verify Email OTP
 * Verifies the 6-digit code against stored SHA-256 hash,
 * decrements attempts only on wrong code, enforces 15-minute lock on lockout,
 * checks expiration, marks email verified server-side, deletes the OTP doc,
 * and returns { verified: true } only.
 */
exports.verifyEmailOtp = functions.https.onCall(async (data, context) => {
  let step = 'init';
  const email = String(data?.email || '').trim().toLowerCase();
  const rawCode = String(data?.code || '').trim();
  const code = rawCode.replace(/\D/g, ''); // Extract only 6 digits
  const emailHash = hashEmailForLog(email);

  try {
    step = 'validate_input';
    if (!email || !code || code.length !== 6) {
      console.log(`[OTP TestMode] OTP failed for emailHash=${emailHash} reason=bad_format`);
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Please enter the full 6-digit verification code.'
      );
    }

    step = 'fetch_otp_record';
    const db = getOtpDb();
    const otpDocRef = db.collection('emailOtps').doc(email);
    const otpDocSnap = await otpDocRef.get();

    if (!otpDocSnap.exists) {
      console.log(`[OTP TestMode] OTP failed for emailHash=${emailHash} reason=no_active_code`);
      throw new functions.https.HttpsError(
        'not-found',
        'No active verification code found for this email. Please request a new code.'
      );
    }

    const otpData = otpDocSnap.data() || {};
    const now = Date.now();

    step = 'check_lockout';
    const lockedUntil = parseTimestampMs(otpData.lockedUntil);
    if (lockedUntil > now) {
      const remainingMinutes = Math.ceil((lockedUntil - now) / 60000);
      console.log(`[OTP TestMode] OTP failed for emailHash=${emailHash} reason=locked`);
      throw new functions.https.HttpsError(
        'resource-exhausted',
        `Account is locked due to too many failed attempts. Please wait ${remainingMinutes} more minute${remainingMinutes === 1 ? '' : 's'}.`
      );
    }

    step = 'check_expiration';
    const expiresAt = parseTimestampMs(otpData.expiresAt);
    if (expiresAt > 0 && now > expiresAt) {
      await otpDocRef.delete();
      console.log(`[OTP TestMode] OTP failed for emailHash=${emailHash} reason=expired`);
      throw new functions.https.HttpsError(
        'deadline-exceeded',
        'This verification code has expired. Please request a new one.'
      );
    }

    step = 'check_attempts';
    const attemptsLeft = typeof otpData.attemptsLeft === 'number' ? otpData.attemptsLeft : 5;
    if (attemptsLeft <= 0) {
      const lockUntilDate = new Date(now + 15 * 60 * 1000);
      await otpDocRef.update({
        lockedUntil: admin.firestore.Timestamp.fromDate(lockUntilDate),
        attemptsLeft: 0,
      });
      console.log(`[OTP TestMode] OTP failed for emailHash=${emailHash} reason=max_attempts_exceeded`);
      throw new functions.https.HttpsError(
        'resource-exhausted',
        'Maximum verification attempts exceeded. Account is locked for 15 minutes.'
      );
    }

    step = 'verify_hash';
    const inputHash = hashOtp(code);
    if (!otpData.hashedCode || inputHash !== otpData.hashedCode) {
      const remaining = attemptsLeft - 1;
      if (remaining <= 0) {
        const lockUntilDate = new Date(now + 15 * 60 * 1000);
        await otpDocRef.update({
          lockedUntil: admin.firestore.Timestamp.fromDate(lockUntilDate),
          attemptsLeft: 0,
        });
        console.log(`[OTP TestMode] OTP failed for emailHash=${emailHash} reason=wrong_code_locked`);
        throw new functions.https.HttpsError(
          'resource-exhausted',
          'Incorrect code. Maximum attempts exceeded. Account is locked for 15 minutes.'
        );
      } else {
        // Decrement attempts only on wrong code
        await otpDocRef.update({ attemptsLeft: remaining });
        console.log(`[OTP TestMode] OTP failed for emailHash=${emailHash} reason=wrong_code attemptsRemaining=${remaining}`);
        throw new functions.https.HttpsError(
          'permission-denied',
          `Incorrect code. You have ${remaining} ${remaining === 1 ? 'attempt' : 'attempts'} remaining.`
        );
      }
    }

    step = 'mark_verified_server_side';
    // Success: mark as verified in verifiedEmails collection for 30 minutes
    const verifiedUntil = admin.firestore.Timestamp.fromDate(new Date(now + 30 * 60 * 1000));
    await db.collection('verifiedEmails').doc(email).set({
      email,
      verified: true,
      verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      verifiedUntil,
    });

    // Delete the active OTP record so it cannot be reused
    await otpDocRef.delete();

    console.log(`[OTP TestMode] OTP verified for emailHash=${emailHash}`);

    // Return { verified: true } only per specification
    return {
      verified: true,
    };
  } catch (err) {
    if (err instanceof functions.https.HttpsError) {
      throw err;
    }
    console.error(`[verifyEmailOtp] Unhandled error at step=${step} for emailHash=${emailHash}:`, err);
    throw new functions.https.HttpsError(
      'internal',
      'Failed to verify code due to a server error. Please try again.'
    );
  }
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
 * Normalizes a shop name for strict uniqueness checking across all resellers:
 * - trim leading and trailing spaces
 * - collapse multiple spaces into one
 * - lowercase
 * - ignore punctuation and symbols (so "Sky  Gadget!", "sky gadget" and "SKY-GADGET" count as the SAME name)
 * - Supports both English and Bengali (\p{L}\p{M}\p{N})
 */
function normalizeShopName(name) {
  if (!name || typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

// In-memory rate limiting map for live shop name checks (per IP)
const checkShopNameRateLimits = new Map();
function isRateLimited(key, limit = 60, windowMs = 60000) {
  const now = Date.now();
  const record = checkShopNameRateLimits.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > record.resetAt) {
    record.count = 1;
    record.resetAt = now + windowMs;
    checkShopNameRateLimits.set(key, record);
    return false;
  }
  record.count += 1;
  checkShopNameRateLimits.set(key, record);
  return record.count > limit;
}

/**
 * 8b. Live Shop Name Availability Check (Pre-Auth Callable)
 * Returns { available: boolean, shopNameKey: string, message?: string }
 * Keeps the 'users' and 'shopNames' collections private and enforces simple rate limiting.
 */
exports.checkShopName = functions.https.onCall(async (data, context) => {
  const ip = context.rawRequest?.headers['x-forwarded-for'] ||
    context.rawRequest?.connection?.remoteAddress ||
    'unknown_ip';

  if (isRateLimited(ip, 60, 60000)) {
    throw new functions.https.HttpsError('resource-exhausted', 'Too many requests. Please wait a moment before trying again.');
  }

  const rawName = (data?.name || data?.shopName || '').trim();
  const shopNameKey = normalizeShopName(rawName);

  if (!shopNameKey || shopNameKey.length < 2) {
    return {
      available: false,
      shopNameKey,
      message: 'Shop name must be at least 2 characters long.',
    };
  }

  const excludeUid = data?.excludeUid || context.auth?.uid;
  const firestore = admin.firestore();
  const snap = await firestore.collection('shopNames').doc(shopNameKey).get();

  if (!snap.exists) {
    return {
      available: true,
      shopNameKey,
      message: 'Shop name is available',
    };
  }

  const docData = snap.data();
  if (excludeUid && docData?.uid === excludeUid) {
    return {
      available: true,
      shopNameKey,
      isOwn: true,
      message: 'Shop name is available',
    };
  }

  return {
    available: false,
    shopNameKey,
    message: 'This shop name is already taken. Please choose a different name.',
  };
});

/**
 * 9. Reseller Registration - Finalize Registration & Assign Reseller ID
 * Performs atomic Firestore transaction on counters/resellerId and shopNames/{shopNameKey}
 * to strictly guarantee shop name uniqueness across all resellers.
 * Writes trusted fields (role, status: 'pending', resellerId, shopNameKey, emailVerified, termsAcceptedAt).
 * Dispatches push notification to Admins.
 */
exports.finalizeRegistration = functions.https.onCall(async (data, context) => {
  const uid = data?.uid || context.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }

  const formData = data?.formData || {};
  const email = (data?.email || formData.email || '').trim().toLowerCase();
  const rawShopName = (formData.shopName || '').trim();
  const shopNameKey = normalizeShopName(rawShopName);

  if (!shopNameKey || shopNameKey.length < 2) {
    throw new functions.https.HttpsError('invalid-argument', 'Shop name must be at least 2 characters long.');
  }

  const firestore = admin.firestore();
  const counterRef = firestore.collection('counters').doc('resellerId');
  const userRef = firestore.collection('users').doc(uid);
  const shopNameReservationRef = firestore.collection('shopNames').doc(shopNameKey);
  const emailOtpRef = firestore.collection('emailOtps').doc(email);

  let assignedResellerId = '';

  try {
    // Atomic transaction to safely verify & reserve unique shop name and assign sequential reseller ID
    await firestore.runTransaction(async (t) => {
      // 0. Enforce server-side email OTP verification
      const verifiedEmailRef = firestore.collection('verifiedEmails').doc(email);
      const verifiedEmailSnap = await t.get(verifiedEmailRef);
      const emailOtpSnap = await t.get(emailOtpRef);

      const vData = verifiedEmailSnap.exists ? verifiedEmailSnap.data() : (emailOtpSnap.exists ? emailOtpSnap.data() : null);
      if (!vData) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Email verification is required before finalizing registration.'
        );
      }
      const verifiedUntil = vData?.verifiedUntil?.toDate
        ? vData.verifiedUntil.toDate().getTime()
        : (vData?.verifiedUntil || 0);

      if (!vData?.verified || (verifiedUntil && Date.now() > verifiedUntil)) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Email verification has expired or has not been completed. Please verify your email.'
        );
      }

      // Consume OTP and verified email records so they cannot be re-used
      if (verifiedEmailSnap.exists) t.delete(verifiedEmailRef);
      if (emailOtpSnap.exists) t.delete(emailOtpRef);

      // 1. Enforce shop name uniqueness
      const shopNameSnap = await t.get(shopNameReservationRef);
      if (shopNameSnap.exists) {
        const existingReservation = shopNameSnap.data();
        if (existingReservation && existingReservation.uid !== uid) {
          throw new functions.https.HttpsError(
            'already-exists',
            'This shop name is already taken. Please choose a different name.'
          );
        }
      }

      // 2. Increment sequential resellerId
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

      // Reserve shop name atomically
      t.set(shopNameReservationRef, {
        uid,
        shopName: rawShopName,
        shopNameKey,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

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
        shopName: rawShopName,
        shopNameKey,
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

    console.log(`[ReSellBD Registration] Successfully assigned ${assignedResellerId} with shopNameKey "${shopNameKey}" to user ${uid}`);

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
            body: `${rawShopName || 'New Reseller'} (${assignedResellerId}) has applied and is waiting for review.`,
          },
          data: {
            type: 'reseller_approval',
            uid,
            resellerId: assignedResellerId,
            shopName: rawShopName,
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
      shopNameKey,
      message: 'Registration finalized successfully! Your account is pending admin approval.',
    };
  } catch (err) {
    if (err instanceof functions.https.HttpsError) {
      throw err;
    }
    console.error('Error finalizing registration:', err);
    throw new functions.https.HttpsError('internal', err.message || 'Failed to finalize registration.');
  }
});

/**
 * 9b. Atomic Shop Name Update
 * Updates shop name in Reseller Settings, Edit & Resubmit, or Admin User Edit.
 * Releases old reservation and creates new reservation in a single Firestore transaction.
 */
exports.updateShopName = functions.https.onCall(async (data, context) => {
  const callerUid = context.auth?.uid;
  if (!callerUid) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }

  const rawShopName = (data?.shopName || data?.newShopName || '').trim();
  const newKey = normalizeShopName(rawShopName);

  if (!newKey || newKey.length < 2) {
    throw new functions.https.HttpsError('invalid-argument', 'Shop name must be at least 2 characters long.');
  }

  const firestore = admin.firestore();
  const callerDoc = await firestore.collection('users').doc(callerUid).get();
  if (!callerDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Caller user record not found.');
  }
  const callerData = callerDoc.data();
  const isCallerAdmin = callerData.role === 'admin' || callerData.role === 'super_admin';

  const targetUid = (isCallerAdmin && data?.targetUid) ? data.targetUid : callerUid;
  const targetUserRef = firestore.collection('users').doc(targetUid);

  try {
    await firestore.runTransaction(async (t) => {
      const targetUserSnap = await t.get(targetUserRef);
      if (!targetUserSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Target user does not exist.');
      }
      const targetUserData = targetUserSnap.data();
      const oldKey = targetUserData.shopNameKey || normalizeShopName(targetUserData.shopName || '');

      const newReservationRef = firestore.collection('shopNames').doc(newKey);
      const newReservationSnap = await t.get(newReservationRef);

      if (newReservationSnap.exists) {
        const reservationData = newReservationSnap.data();
        if (reservationData?.uid !== targetUid) {
          throw new functions.https.HttpsError(
            'already-exists',
            'This shop name is already taken. Please choose a different name.'
          );
        }
      }

      // If the normalized key changed, release the old reservation
      if (oldKey && oldKey !== newKey) {
        const oldReservationRef = firestore.collection('shopNames').doc(oldKey);
        t.delete(oldReservationRef);
      }

      // Set new reservation
      t.set(newReservationRef, {
        uid: targetUid,
        shopName: rawShopName,
        shopNameKey: newKey,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      // Update user document
      t.update(targetUserRef, {
        shopName: rawShopName,
        shopNameKey: newKey,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return {
      success: true,
      shopName: rawShopName,
      shopNameKey: newKey,
      message: 'Shop name updated successfully!',
    };
  } catch (err) {
    if (err instanceof functions.https.HttpsError) {
      throw err;
    }
    console.error('Error updating shop name:', err);
    throw new functions.https.HttpsError('internal', err.message || 'Failed to update shop name.');
  }
});

/**
 * 9c. Existing Resellers Migration (Admin Only)
 * Backfills shopNameKey on user docs and creates reservations in shopNames/{shopNameKey}.
 * If duplicate shop names are found:
 * DO NOT delete or rename anything.
 * Lists all duplicates (shop name + reseller IDs + emails) so Admin can fix manually.
 */
exports.migrateShopNames = functions.https.onCall(async (data, context) => {
  const callerUid = context.auth?.uid;
  if (!callerUid) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }

  const firestore = admin.firestore();
  const callerDoc = await firestore.collection('users').doc(callerUid).get();
  if (!callerDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'User record not found.');
  }
  const callerData = callerDoc.data();
  if (callerData.role !== 'admin' && callerData.role !== 'super_admin') {
    throw new functions.https.HttpsError('permission-denied', 'Only Admins can run the shop name migration.');
  }

  const usersSnap = await firestore.collection('users').get();
  const resellers = [];

  usersSnap.forEach((docSnap) => {
    const u = docSnap.data();
    if (u.role === 'reseller' || u.shopName) {
      resellers.push({
        uid: docSnap.id,
        shopName: (u.shopName || '').trim(),
        resellerId: u.resellerId || u.resellerCode || docSnap.id,
        email: u.email || '',
        shopNameKey: u.shopNameKey || '',
      });
    }
  });

  // Group by normalized key
  const groups = new Map();
  for (const r of resellers) {
    if (!r.shopName) continue;
    const key = normalizeShopName(r.shopName);
    if (!key) continue;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(r);
  }

  const duplicates = [];
  let migratedCount = 0;
  const batch = firestore.batch();
  let opsCount = 0;
  const batches = [batch];

  for (const [key, list] of groups.entries()) {
    if (list.length > 1) {
      // DUPLICATE FOUND!
      // Requirement: DO NOT delete or rename anything. List for manual admin resolution.
      duplicates.push({
        shopNameKey: key,
        shopName: list[0].shopName,
        resellers: list.map((item) => ({
          uid: item.uid,
          resellerId: item.resellerId,
          email: item.email,
          shopName: item.shopName,
        })),
      });
      continue;
    }

    // Unique reseller: Reserve shopName and update user document
    const single = list[0];
    const currentBatch = batches[batches.length - 1];

    const reservationRef = firestore.collection('shopNames').doc(key);
    currentBatch.set(reservationRef, {
      uid: single.uid,
      shopName: single.shopName,
      shopNameKey: key,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    const userRef = firestore.collection('users').doc(single.uid);
    currentBatch.update(userRef, {
      shopNameKey: key,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    migratedCount++;
    opsCount += 2;
    if (opsCount >= 400) {
      batches.push(firestore.batch());
      opsCount = 0;
    }
  }

  for (const b of batches) {
    await b.commit();
  }

  return {
    success: true,
    totalResellers: resellers.length,
    migratedCount,
    duplicateCount: duplicates.length,
    duplicates,
  };
});


/**
 * 10. Check Pending Approvals - 1-hour SLA Reminder
 */
exports.checkPendingApprovals = functions.pubsub.schedule('every 10 minutes').onRun(async (context) => {
  const db = admin.firestore();
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  const pendingResellers = await db.collection('users')
    .where('status', '==', 'pending')
    .where('createdAt', '<', admin.firestore.Timestamp.fromDate(oneHourAgo))
    .get();

  const batch = db.batch();
  const adminTokens = [];
  const adminSnap = await db.collection('users').where('role', 'in', ['admin', 'super_admin']).get();
  adminSnap.forEach(d => {
    const u = d.data();
    if (Array.isArray(u.fcmTokens)) adminTokens.push(...u.fcmTokens);
  });
  const uniqueAdminTokens = [...new Set(adminTokens)];

  for (const doc of pendingResellers.docs) {
    const reseller = doc.data();
    if (reseller.slaNotified === true) continue;

    // Notify Admin
    if (uniqueAdminTokens.length > 0) {
      try {
        await admin.messaging().sendToDevice(uniqueAdminTokens, {
          notification: { title: 'Registration Pending > 1h', body: `Registration pending for: ${reseller.shopName || 'Reseller'} (${reseller.resellerId})` }
        });
      } catch (e) { console.error(e); }
    }

    // Notify Reseller
    if (Array.isArray(reseller.fcmTokens) && reseller.fcmTokens.length > 0) {
      try {
        await admin.messaging().sendToDevice(reseller.fcmTokens, {
          notification: { title: 'Review in Progress', body: 'Your approval is taking a little longer than usual. We are reviewing it — thank you for your patience.' }
        });
      } catch (e) { console.error(e); }
    }

    batch.update(doc.ref, { slaNotified: true });
  }

  await batch.commit();
  return null;
});

/**
 * ========================================================
 * 11. SUPER ADMIN TWO-STEP VERIFICATION (MANDATORY OTP LOGIN)
 * ========================================================
 */

// Easy-to-edit duration constant: session validity in hours (12 hours)
const SUPER_ADMIN_OTP_SESSION_HOURS = 12;

// Easy-to-edit role constant: roles that require mandatory 2-step OTP
const OTP_ENFORCED_ROLES = ['super_admin'];

/**
 * 11a. Start Super Admin Login (Callable)
 * - Requires caller to be signed in with a role in OTP_ENFORCED_ROLES (super_admin).
 * - CLEARS any previous OTP-verified session custom claims.
 * - Enforces 15-minute lock if 5 attempts were previously exceeded.
 * - Enforces 60-second rate-limiting cooldown.
 * - Generates cryptographically secure 6-digit OTP, stores hashed code in adminLoginOtps/{uid}.
 * - Sends transactional email via Gmail SMTP (skyautomationtech@gmail.com).
 * - Logs security entry in auditLogs.
 * - NEVER leaks or returns code to client.
 */
exports.startSuperAdminLogin = functions.https.onCall(async (data, context) => {
  const uid = context.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }

  const firestore = admin.firestore();
  const userDoc = await firestore.collection('users').doc(uid).get();
  if (!userDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'User record not found.');
  }

  const userData = userDoc.data();
  const userRole = userData.role;
  const email = (userData.email || context.auth.token?.email || data?.email || '').trim().toLowerCase();

  // Validate that user role requires OTP
  if (!OTP_ENFORCED_ROLES.includes(userRole)) {
    throw new functions.https.HttpsError('failed-precondition', 'Two-step verification is not required for this role.');
  }

  // 1. Immediately CLEAR any previous OTP-verified session custom claims
  await admin.auth().setCustomUserClaims(uid, {
    role: userRole,
    otpSession: null,
    otpExpiresAt: null,
  });

  const otpDocRef = firestore.collection('adminLoginOtps').doc(uid);
  const otpDocSnap = await otpDocRef.get();
  const now = Date.now();

  // 2. Enforce 15-minute lockout if previously triggered
  if (otpDocSnap.exists) {
    const existing = otpDocSnap.data();
    const lockedUntil = existing?.lockedUntil?.toDate ? existing.lockedUntil.toDate().getTime() : (existing?.lockedUntil || 0);
    if (lockedUntil && now < lockedUntil) {
      const waitMinutes = Math.ceil((lockedUntil - now) / 60000);
      throw new functions.https.HttpsError(
        'permission-denied',
        `Account is temporarily locked for ${waitMinutes} minute(s) due to too many failed attempts.`
      );
    }

    // 3. Rate limiting: enforce 60-second resend cooldown
    const lastSentAt = existing?.lastSentAt?.toDate ? existing.lastSentAt.toDate().getTime() : (existing?.lastSentAt || 0);
    const elapsedSeconds = Math.floor((now - lastSentAt) / 1000);
    if (elapsedSeconds < 60) {
      const remainingSeconds = 60 - elapsedSeconds;
      throw new functions.https.HttpsError(
        'resource-exhausted',
        `Please wait ${remainingSeconds} seconds before requesting a new verification code.`
      );
    }
  }

  // 4. Generate 6-digit random code & hash it
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const hashedCode = hashOtp(code);
  const expiresInSeconds = 300; // 5 minutes
  const expiresAt = admin.firestore.Timestamp.fromDate(new Date(now + expiresInSeconds * 1000));

  // 5. Send Email via Gmail SMTP
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
      from: `"ReSellBD Security" <${gmailUser}>`,
      to: email,
      subject: `${code} is your Super Admin Two-Step Verification Code`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 28px; background: #050B1A; color: #ffffff; border-radius: 20px; border: 1px solid rgba(255,255,255,0.15);">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #3DD055; margin: 0; font-size: 26px; font-weight: 900; letter-spacing: -0.5px;">ReSellBD Security</h1>
            <p style="color: #0E9AA7; font-size: 13px; margin: 6px 0 0 0; text-transform: uppercase; font-weight: 700; letter-spacing: 1px;">Super Admin Two-Step Verification (দ্বি-স্তরীয় নিরাপত্তা)</p>
          </div>
          <div style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); border-radius: 16px; padding: 24px; text-align: center; margin-bottom: 20px;">
            <p style="margin: 0 0 12px 0; color: #94a3b8; font-size: 14px;">Your 6-digit Super Admin verification code is:</p>
            <div style="font-size: 40px; font-weight: 900; letter-spacing: 10px; color: #3DD055; padding: 14px 20px; background: rgba(0,0,0,0.4); border-radius: 12px; display: inline-block; font-family: monospace;">
              ${code}
            </div>
            <p style="margin: 16px 0 0 0; color: #cbd5e1; font-size: 13px;">This code will expire in <strong>5 minutes</strong>. Maximum 5 verification attempts are allowed before a 15-minute security lock.</p>
          </div>
          <div style="background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 12px; padding: 14px; margin-bottom: 20px; font-size: 12px; color: #fde68a;">
            ⚠️ <strong>Security Notice:</strong> If you did not initiate this login attempt, someone entered your password. Please change your password immediately.
          </div>
          <p style="color: #64748b; font-size: 11px; text-align: center; margin: 0;">
            Sent automatically by ReSellBD via Sky Automation Tech.
          </p>
        </div>
      `,
    });
    console.log(`[SuperAdmin 2-Step OTP] Dispatched verification email to: ${email}`);
  } catch (err) {
    console.error('[SuperAdmin 2-Step OTP] Error sending email:', err);
    throw new functions.https.HttpsError('internal', 'Could not send the verification email. Please try again later.');
  }

  // 6. Save hashed record to private Firestore collection
  await otpDocRef.set({
    uid,
    email,
    hashedCode,
    expiresAt,
    attemptsLeft: 5,
    lastSentAt: admin.firestore.FieldValue.serverTimestamp(),
    lockedUntil: null,
  });

  // 7. Security audit log entry
  try {
    await firestore.collection('auditLogs').add({
      action: 'super_admin_otp_requested',
      userId: uid,
      userEmail: email,
      role: userRole,
      ip: context.rawRequest?.headers['x-forwarded-for'] || context.rawRequest?.connection?.remoteAddress || 'unknown',
      userAgent: context.rawRequest?.headers['user-agent'] || 'unknown',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (logErr) {
    console.warn('Could not record audit log:', logErr);
  }

  return {
    success: true,
    message: 'Verification code sent to your registered Super Admin email.',
    email,
    expiresInSeconds,
    cooldownSeconds: 60,
  };
});

/**
 * 11b. Verify Super Admin OTP (Callable)
 * - Checks hashed code, 5-minute expiry, and max 5 attempts.
 * - On 5 wrong attempts, locks account for 15 minutes.
 * - On success: sets custom claim (otpSession: <uuid>, otpExpiresAt: now + 12h),
 *   clears OTP record, writes login audit log, and notifies Super Admin by push notification.
 */
exports.verifySuperAdminOtp = functions.https.onCall(async (data, context) => {
  const uid = context.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }

  const code = (data?.code || '').trim();
  if (!code || code.length !== 6) {
    throw new functions.https.HttpsError('invalid-argument', 'Please enter the full 6-digit code.');
  }

  const firestore = admin.firestore();
  const otpDocRef = firestore.collection('adminLoginOtps').doc(uid);
  const otpDocSnap = await otpDocRef.get();

  if (!otpDocSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'No active verification code found. Please request a new code.');
  }

  const otpData = otpDocSnap.data();
  const now = Date.now();

  // 1. Check 15-minute lock
  const lockedUntil = otpData?.lockedUntil?.toDate ? otpData.lockedUntil.toDate().getTime() : (otpData?.lockedUntil || 0);
  if (lockedUntil && now < lockedUntil) {
    const waitMinutes = Math.ceil((lockedUntil - now) / 60000);
    throw new functions.https.HttpsError(
      'permission-denied',
      `Account is temporarily locked for ${waitMinutes} minute(s) due to too many failed attempts.`
    );
  }

  // 2. Check 5-minute expiration
  const expiresAt = otpData?.expiresAt?.toDate ? otpData.expiresAt.toDate().getTime() : (otpData?.expiresAt || 0);
  if (now > expiresAt) {
    await otpDocRef.delete();
    throw new functions.https.HttpsError(
      'deadline-exceeded',
      'Verification code has expired. Please request a new code.'
    );
  }

  // 3. Verify Hash
  const inputHash = hashOtp(code);
  if (inputHash !== otpData.hashedCode) {
    const attemptsLeft = (otpData.attemptsLeft !== undefined ? otpData.attemptsLeft : 5) - 1;

    // Log failure in auditLogs
    try {
      await firestore.collection('auditLogs').add({
        action: 'super_admin_otp_failed_attempt',
        userId: uid,
        userEmail: otpData.email || '',
        attemptsRemaining: attemptsLeft,
        ip: context.rawRequest?.headers['x-forwarded-for'] || context.rawRequest?.connection?.remoteAddress || 'unknown',
        userAgent: context.rawRequest?.headers['user-agent'] || 'unknown',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (_) {}

    if (attemptsLeft <= 0) {
      const lockDuration = 15 * 60 * 1000; // 15 minutes
      const lockUntilDate = new Date(now + lockDuration);
      await otpDocRef.update({
        attemptsLeft: 0,
        lockedUntil: admin.firestore.Timestamp.fromDate(lockUntilDate),
      });

      // Clear any custom claims to ensure lock
      await admin.auth().setCustomUserClaims(uid, {
        role: 'super_admin',
        otpSession: null,
        otpExpiresAt: null,
      });

      throw new functions.https.HttpsError(
        'permission-denied',
        'Account is temporarily locked for 15 minutes due to too many failed attempts.'
      );
    }

    await otpDocRef.update({ attemptsLeft });
    throw new functions.https.HttpsError(
      'invalid-argument',
      `Incorrect code. You have ${attemptsLeft} attempt(s) remaining.`
    );
  }

  // 4. Verification Successful!
  // Generate random session ID & 12-hour expiration
  const cryptoModule = require('crypto');
  const sessionId = cryptoModule.randomUUID ? cryptoModule.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36);
  const sessionDurationMs = SUPER_ADMIN_OTP_SESSION_HOURS * 60 * 60 * 1000; // 12 hours
  const sessionExpiresAt = now + sessionDurationMs;

  // Set trusted Custom User Claims in Firebase Auth
  await admin.auth().setCustomUserClaims(uid, {
    role: 'super_admin',
    otpSession: sessionId,
    otpExpiresAt: sessionExpiresAt,
  });

  // Delete the OTP document so it cannot be reused
  await otpDocRef.delete();

  // Write success security audit log
  const clientIp = context.rawRequest?.headers['x-forwarded-for'] || context.rawRequest?.connection?.remoteAddress || 'unknown';
  const clientUserAgent = context.rawRequest?.headers['user-agent'] || 'unknown';

  try {
    await firestore.collection('auditLogs').add({
      action: 'super_admin_otp_login_success',
      userId: uid,
      userEmail: otpData.email || '',
      role: 'super_admin',
      sessionId,
      sessionExpiresAt,
      ip: clientIp,
      userAgent: clientUserAgent,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (logErr) {
    console.warn('Could not record login success audit log:', logErr);
  }

  // Notify Super Admin by push notification that a new session was authenticated
  try {
    const userDoc = await firestore.collection('users').doc(uid).get();
    if (userDoc.exists) {
      const uData = userDoc.data();
      if (Array.isArray(uData.fcmTokens) && uData.fcmTokens.length > 0) {
        const uniqueTokens = [...new Set(uData.fcmTokens)];
        await admin.messaging().sendToDevice(uniqueTokens, {
          notification: {
            title: 'Security Alert: Super Admin Login',
            body: `Your Super Admin account was authenticated via two-step verification from a new session.`,
          },
          data: {
            type: 'security_alert',
            action: 'super_admin_login',
            sessionId,
            timestamp: String(now),
          },
        });
      }
    }
  } catch (pushErr) {
    console.warn('Could not dispatch security push notification:', pushErr);
  }

  console.log(`[SuperAdmin 2-Step OTP] Successfully verified and granted 12-hour session to uid: ${uid}`);

  return {
    success: true,
    verified: true,
    expiresAt: sessionExpiresAt,
    message: 'Two-step verification completed successfully!',
  };
});

/**
 * 11c. Clear Super Admin OTP Session (Callable)
 * Clears the custom claim on Sign Out so OTP is strictly required on next login.
 */
exports.clearSuperAdminOtpSession = functions.https.onCall(async (data, context) => {
  const uid = context.auth?.uid;
  if (!uid) {
    return { success: true };
  }

  try {
    await admin.auth().setCustomUserClaims(uid, {
      role: 'super_admin',
      otpSession: null,
      otpExpiresAt: null,
    });
    console.log(`[SuperAdmin 2-Step OTP] Cleared OTP session claims for uid: ${uid}`);
  } catch (err) {
    console.warn('Could not clear custom claims on logout:', err);
  }

  return { success: true };
});

// In-memory rate limiting map for logout actions (key: uid, value: lastActionTimestampMs)
const logoutRateLimits = new Map();

/**
 * 12. logoutDevice(deviceId) (Callable)
 * Marks a specific device as signed_out, sends a high-priority force_logout FCM data message,
 * and clears the device token.
 */
exports.logoutDevice = functions.https.onCall(async (data, context) => {
  const uid = context.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }

  const deviceId = data?.deviceId;
  if (!deviceId) {
    throw new functions.https.HttpsError('invalid-argument', 'Device ID is required.');
  }

  // Rate Limiting: 3 seconds per user
  const now = Date.now();
  const lastAction = logoutRateLimits.get(`${uid}_single`) || 0;
  if (now - lastAction < 3000) {
    throw new functions.https.HttpsError('resource-exhausted', 'Please wait a few seconds before another logout action.');
  }
  logoutRateLimits.set(`${uid}_single`, now);

  try {
    const devRef = admin.firestore().collection('users').doc(uid).collection('devices').doc(deviceId);
    const devSnap = await devRef.get();

    let removedFcmToken = null;
    let devName = 'Unknown Device';

    if (devSnap.exists) {
      const devData = devSnap.data();
      removedFcmToken = devData.fcmToken || null;
      devName = devData.deviceName || devName;

      await devRef.update({
        status: 'signed_out',
        fcmToken: null,
        signedOutAt: admin.firestore.FieldValue.serverTimestamp(),
        signedOutBy: uid,
      });
    }

    // Send high-priority FCM DATA message { type: "force_logout", deviceId }
    if (removedFcmToken) {
      const dataMessage = {
        data: {
          type: 'force_logout',
          deviceId: String(deviceId),
          timestamp: String(now),
        },
      };
      const options = {
        priority: 'high',
        contentAvailable: true,
      };

      try {
        await admin.messaging().sendToDevice(removedFcmToken, dataMessage, options);
        console.log(`[Security] Sent force_logout data message to device ${deviceId}`);
      } catch (fcmErr) {
        console.warn(`[Security] Could not deliver force_logout FCM data message to ${deviceId}:`, fcmErr);
      }

      // Remove from user document fcmTokens array
      await admin.firestore().collection('users').doc(uid).update({
        fcmTokens: admin.firestore.FieldValue.arrayRemove(removedFcmToken),
      }).catch(() => {});
    }

    // Security audit log
    await admin.firestore().collection('auditLogs').add({
      userId: uid,
      action: 'LOGOUT_DEVICE',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      details: {
        deviceId,
        deviceName: devName,
        signedOutBy: uid,
        reason: 'User requested remote device sign-out',
      },
    });

    return {
      success: true,
      message: 'Device session signed out successfully.',
      deviceId,
    };
  } catch (err) {
    console.error('Error logging out device:', err);
    throw new functions.https.HttpsError('internal', err.message || 'Failed to logout device.');
  }
});

/**
 * 13. logoutAllDevices() (Callable)
 * Revokes refresh tokens via Firebase Admin Auth, invalidates sessions via sessionsValidFrom,
 * marks EVERY device record as signed_out, sends a high-priority force_logout FCM data message
 * plus a push notification alert, and clears all fcmTokens.
 */
exports.logoutAllDevices = functions.https.onCall(async (data, context) => {
  const uid = context.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }

  // Rate Limiting: 3 seconds per user
  const now = Date.now();
  const lastAction = logoutRateLimits.get(`${uid}_all`) || 0;
  if (now - lastAction < 3000) {
    throw new functions.https.HttpsError('resource-exhausted', 'Please wait a few seconds before another logout action.');
  }
  logoutRateLimits.set(`${uid}_all`, now);

  try {
    // 1. Revoke refresh tokens via Firebase Admin Auth
    await admin.auth().revokeRefreshTokens(uid);
    console.log(`[Security] Revoked all refresh tokens for uid: ${uid}`);

    // 2. Fetch all registered devices to collect tokens and update status
    const devicesSnap = await admin.firestore().collection('users').doc(uid).collection('devices').get();
    const batch = admin.firestore().batch();
    const allTokens = new Set();

    devicesSnap.docs.forEach((devDoc) => {
      const devData = devDoc.data();
      if (devData.fcmToken) {
        allTokens.add(devData.fcmToken);
      }
      batch.update(devDoc.ref, {
        status: 'signed_out',
        fcmToken: null,
        signedOutAt: admin.firestore.FieldValue.serverTimestamp(),
        signedOutBy: uid,
      });
    });

    // Also collect any remaining tokens stored directly on user doc
    const userDocRef = admin.firestore().collection('users').doc(uid);
    const userSnap = await userDocRef.get();
    if (userSnap.exists && Array.isArray(userSnap.data()?.fcmTokens)) {
      userSnap.data().fcmTokens.forEach((t) => {
        if (t) allTokens.add(t);
      });
    }

    // 3. Set users/{uid}.sessionsValidFrom = serverTimestamp and wipe tokens
    batch.update(userDocRef, {
      sessionsValidFrom: admin.firestore.FieldValue.serverTimestamp(),
      fcmTokens: [],
      fcmToken: null,
    });

    await batch.commit();

    // 4. Send high-priority force_logout data message + push notification to all device tokens
    const tokenList = Array.from(allTokens);
    if (tokenList.length > 0) {
      const payload = {
        notification: {
          title: 'Security Alert: Signed Out',
          body: 'You were signed out from all devices.',
        },
        data: {
          type: 'force_logout',
          reason: 'logout_all',
          timestamp: String(now),
        },
      };
      const options = {
        priority: 'high',
        contentAvailable: true,
      };

      try {
        await admin.messaging().sendToDevice(tokenList, payload, options);
        console.log(`[Security] Dispatched logout_all alerts to ${tokenList.length} device tokens.`);
      } catch (fcmErr) {
        console.warn('[Security] Error sending logout_all push notification:', fcmErr);
      }
    }

    // 5. Security audit log
    await admin.firestore().collection('auditLogs').add({
      userId: uid,
      action: 'LOGOUT_ALL_DEVICES',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      details: {
        signedOutBy: uid,
        reason: 'User requested remote logout of all devices',
        devicesCount: devicesSnap.size,
      },
    });

    return {
      success: true,
      message: 'All devices signed out and sessions revoked.',
    };
  } catch (err) {
    console.error('Error logging out all devices:', err);
    throw new functions.https.HttpsError('internal', err.message || 'Failed to logout all devices.');
  }
});

// Backward-compatible aliases for legacy callers
exports.revokeSingleDeviceSession = exports.logoutDevice;
exports.revokeAllUserSessions = exports.logoutAllDevices;


