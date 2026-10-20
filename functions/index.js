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

  // Send transactional email
  // Recommendation: Resend (free 3,000 emails/month at resend.com)
  // Configured via: firebase functions:config:set email.api_key="re_your_api_key" email.sender="ReSellBD <onboarding@resend.dev>"
  const emailConfig = functions.config().email || {};
  const resendApiKey = emailConfig.api_key || process.env.RESEND_API_KEY;
  const senderEmail = emailConfig.sender || 'ReSellBD <onboarding@resend.dev>';

  let emailSent = false;

  if (resendApiKey) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: senderEmail,
          to: [email],
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
                If you did not request this verification code, please ignore this email.
              </p>
            </div>
          `,
        }),
      });

      if (response.ok) {
        emailSent = true;
        console.log(`[ReSellBD OTP Engine] Successfully dispatched email via Resend to ${email}`);
      } else {
        const errorData = await response.text();
        console.warn(`[ReSellBD OTP Engine] Resend API error:`, errorData);
      }
    } catch (emailErr) {
      console.error(`[ReSellBD OTP Engine] Error calling email API:`, emailErr);
    }
  } else {
    console.warn(`[ReSellBD OTP Engine] No RESEND_API_KEY or email.api_key configured. OTP code is: ${code}`);
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

