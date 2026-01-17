import { supabase } from '../services/supabase.js';

/**
 * Middleware to authenticate requests using portal tokens (for client portal)
 */
export const authenticatePortal = async (req, res, next) => {
  try {
    const portalToken = req.headers['x-portal-token'] || req.body.portalToken || req.query.portalToken;

    if (!portalToken) {
      return res.status(401).json({ error: 'Portal token is required' });
    }

    // Verify portal token by checking if client exists
    const { data: clientData, error } = await supabase
      .from('clients')
      .select('id, portal_token')
      .eq('portal_token', portalToken)
      .single();

    if (error || !clientData) {
      return res.status(401).json({ error: 'Invalid portal token' });
    }

    // Attach client info to request object
    req.user = {
      id: clientData.id,
      portalToken: portalToken,
      clientId: clientData.id
    };

    next();
  } catch (error) {
    console.error('Portal authentication error:', error);
    return res.status(401).json({ error: 'Authentication failed' });
  }
};
