import webpush from 'web-push';
import dotenv from 'dotenv';

dotenv.config();

// Initialize VAPID keys
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@nutritherapy.co.ke';

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(
    vapidSubject,
    vapidPublicKey,
    vapidPrivateKey
  );
} else {
  console.warn('VAPID keys not configured. Push notifications will not work.');
}

/**
 * Send a push notification to a subscription
 * @param {Object} subscription - Push subscription object with endpoint, keys
 * @param {Object} payload - Notification payload
 * @returns {Promise<void>}
 */
export async function sendPushNotification(subscription, payload) {
  if (!vapidPublicKey || !vapidPrivateKey) {
    throw new Error('VAPID keys not configured');
  }

  if (!subscription || !subscription.endpoint) {
    throw new Error('Invalid subscription: endpoint is required');
  }

  // Prepare notification payload
  const notificationPayload = JSON.stringify({
    title: payload.title || 'NutriTherapy Solutions',
    body: payload.body || 'You have a new notification',
    icon: payload.icon || '/icons/icon-192x192.png',
    badge: payload.badge || '/icons/icon-192x192.png',
    data: payload.data || {},
    tag: payload.tag,
    requireInteraction: payload.requireInteraction || false,
    actions: payload.actions || []
  });

  try {
    // Convert subscription keys from base64url to Buffer if needed
    const pushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh_key || subscription.keys?.p256dh,
        auth: subscription.auth_key || subscription.keys?.auth
      }
    };

    await webpush.sendNotification(pushSubscription, notificationPayload);
    console.log('Push notification sent successfully to:', subscription.endpoint);
  } catch (error) {
    console.error('Error sending push notification:', error);
    
    // Handle specific error cases
    if (error.statusCode === 410) {
      // Subscription expired or no longer valid
      throw new Error('Subscription expired or invalid');
    } else if (error.statusCode === 429) {
      // Too many requests
      throw new Error('Rate limit exceeded');
    } else if (error.statusCode === 400) {
      // Bad request
      throw new Error('Invalid subscription or payload');
    } else {
      throw error;
    }
  }
}

/**
 * Send push notifications to multiple subscriptions
 * @param {Array} subscriptions - Array of push subscription objects
 * @param {Object} payload - Notification payload
 * @returns {Promise<{success: number, failed: number, errors: Array}>}
 */
export async function sendPushNotifications(subscriptions, payload) {
  const results = {
    success: 0,
    failed: 0,
    errors: []
  };

  if (!Array.isArray(subscriptions) || subscriptions.length === 0) {
    return results;
  }

  const promises = subscriptions.map(async (subscription) => {
    try {
      await sendPushNotification(subscription, payload);
      results.success++;
    } catch (error) {
      results.failed++;
      results.errors.push({
        subscription: subscription.endpoint,
        error: error.message
      });
      console.error(`Failed to send notification to ${subscription.endpoint}:`, error.message);
    }
  });

  await Promise.allSettled(promises);

  return results;
}

/**
 * Validate a push subscription
 * @param {Object} subscription - Push subscription object
 * @returns {boolean}
 */
export function validateSubscription(subscription) {
  if (!subscription) return false;
  if (!subscription.endpoint) return false;
  if (!subscription.p256dh_key && !subscription.keys?.p256dh) return false;
  if (!subscription.auth_key && !subscription.keys?.auth) return false;
  return true;
}

export { vapidPublicKey };
