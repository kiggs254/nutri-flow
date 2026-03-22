import { createServiceSupabase } from '../services/supabaseClients.js';

/**
 * @param {string | undefined} userId
 * @returns {Promise<boolean>}
 */
export async function userIsSuperAdmin(userId) {
  const svc = createServiceSupabase();
  if (!svc || !userId) return false;
  const { data, error } = await svc.from('super_admins').select('user_id').eq('user_id', userId).maybeSingle();
  if (error || !data) return false;
  return true;
}

/**
 * Must run after authenticate. Sets req.isSuperAdmin when service role available.
 */
export async function requireSuperAdmin(req, res, next) {
  try {
    const svc = createServiceSupabase();
    if (!svc) {
      return res.status(503).json({
        error: 'Admin API unavailable: SUPABASE_SERVICE_ROLE_KEY is not configured on the server.'
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { data, error } = await svc.from('super_admins').select('user_id').eq('user_id', userId).maybeSingle();

    if (error) {
      console.error('[superAdmin] lookup failed:', error);
      return res.status(500).json({ error: 'Admin check failed' });
    }

    if (!data) {
      return res.status(403).json({ error: 'Forbidden: super admin only' });
    }

    req.isSuperAdmin = true;
    req.serviceSupabase = svc;
    next();
  } catch (e) {
    console.error('[superAdmin] middleware error:', e);
    res.status(500).json({ error: 'Admin check failed' });
  }
}
