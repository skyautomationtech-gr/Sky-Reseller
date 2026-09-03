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
