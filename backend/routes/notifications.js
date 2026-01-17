import express from 'express';
import { supabase } from '../services/supabase.js';
import { sendPushNotification, sendPushNotifications, validateSubscription, vapidPublicKey } from '../services/pushNotification.js';
import { authenticate } from '../middleware/auth.js';
import { authenticatePortal } from '../middleware/portalAuth.js';

const router = express.Router();

// Get VAPID public key (needed for client-side subscription)
router.get('/vapid-public-key', (req, res) => {
  if (!vapidPublicKey) {
    return res.status(503).json({ error: 'Push notifications not configured' });
  }
  res.json({ publicKey: vapidPublicKey });
});

// Combined auth middleware that supports both portal tokens and JWT
const authenticateFlexible = async (req, res, next) => {
  const portalToken = req.headers['x-portal-token'] || req.body.portalToken;
  if (portalToken) {
    return authenticatePortal(req, res, next);
  } else {
    return authenticate(req, res, next);
  }
};

// Subscribe to push notifications (supports both JWT and portal token auth)
router.post('/subscribe', authenticateFlexible, async (req, res) => {
  try {
    const { subscription } = req.body;
    const userId = req.user?.id;

    if (!subscription) {
      return res.status(400).json({ error: 'Subscription object is required' });
    }

    if (!validateSubscription(subscription)) {
      return res.status(400).json({ error: 'Invalid subscription object' });
    }

    // Get client ID from user (assuming user is a client accessing via portal token)
    // For client portal, we need to get client_id from the portal_token
    let clientId = null;

    // Get client ID from authenticated user
    if (req.user?.clientId) {
      // Direct client ID (from portal auth)
      clientId = req.user.clientId;
    } else if (req.user?.portalToken) {
      // Client accessing via portal token (fallback)
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('id')
        .eq('portal_token', req.user.portalToken)
        .single();

      if (clientError || !clientData) {
        return res.status(404).json({ error: 'Client not found' });
      }

      clientId = clientData.id;
    } else {
      return res.status(400).json({ error: 'Unable to determine client ID' });
    }

    // Check if subscription already exists
    const { data: existingSub, error: checkError } = await supabase
      .from('push_subscriptions')
      .select('id, is_active')
      .eq('endpoint', subscription.endpoint)
      .single();

    if (existingSub) {
      // Update existing subscription
      const { error: updateError } = await supabase
        .from('push_subscriptions')
        .update({
          client_id: clientId,
          p256dh_key: subscription.keys.p256dh,
          auth_key: subscription.keys.auth,
          is_active: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingSub.id);

      if (updateError) {
        console.error('Error updating subscription:', updateError);
        return res.status(500).json({ error: 'Failed to update subscription' });
      }

      return res.json({ 
        success: true, 
        message: 'Subscription updated',
        id: existingSub.id
      });
    }

    // Create new subscription
    const { data: newSub, error: insertError } = await supabase
      .from('push_subscriptions')
      .insert({
        client_id: clientId,
        endpoint: subscription.endpoint,
        p256dh_key: subscription.keys.p256dh,
        auth_key: subscription.keys.auth,
        is_active: true
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating subscription:', insertError);
      return res.status(500).json({ error: 'Failed to create subscription' });
    }

    res.json({ 
      success: true, 
      message: 'Subscription created',
      id: newSub.id
    });
  } catch (error) {
    console.error('Error in subscribe endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Unsubscribe from push notifications (supports both JWT and portal token auth)
router.post('/unsubscribe', authenticateFlexible, async (req, res) => {
  try {
    const { endpoint } = req.body;

    if (!endpoint) {
      return res.status(400).json({ error: 'Endpoint is required' });
    }

    // Get client ID from authenticated user
    let clientId = null;
    if (req.user?.clientId) {
      clientId = req.user.clientId;
    } else if (req.user?.portalToken) {
      const { data: clientData } = await supabase
        .from('clients')
        .select('id')
        .eq('portal_token', req.user.portalToken)
        .single();
      clientId = clientData?.id;
    }

    if (!clientId) {
      return res.status(400).json({ error: 'Unable to determine client ID' });
    }

    // Deactivate subscription
    const { error } = await supabase
      .from('push_subscriptions')
      .update({ 
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('endpoint', endpoint)
      .eq('client_id', clientId);

    if (error) {
      console.error('Error unsubscribing:', error);
      return res.status(500).json({ error: 'Failed to unsubscribe' });
    }

    res.json({ success: true, message: 'Unsubscribed successfully' });
  } catch (error) {
    console.error('Error in unsubscribe endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Send push notification (for testing or admin use)
router.post('/send', authenticate, async (req, res) => {
  try {
    const { clientId, payload } = req.body;

    if (!clientId || !payload) {
      return res.status(400).json({ error: 'clientId and payload are required' });
    }

    // Get active subscriptions for the client
    const { data: subscriptions, error } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('client_id', clientId)
      .eq('is_active', true);

    if (error) {
      console.error('Error fetching subscriptions:', error);
      return res.status(500).json({ error: 'Failed to fetch subscriptions' });
    }

    if (!subscriptions || subscriptions.length === 0) {
      return res.status(404).json({ error: 'No active subscriptions found for client' });
    }

    // Send notifications
    const results = await sendPushNotifications(subscriptions, payload);

    res.json({
      success: true,
      sent: results.success,
      failed: results.failed,
      errors: results.errors
    });
  } catch (error) {
    console.error('Error in send endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
