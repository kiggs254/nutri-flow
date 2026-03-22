import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Supabase client with end-user JWT (RLS applies; RPC match_nutrition_embeddings sees auth.uid())
 * @param {string} accessToken
 */
export function createUserSupabase(accessToken) {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
  }
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
    }
  });
}

/**
 * Service role client — bypasses RLS (USDA sync, food rows, bulk embedding inserts)
 */
export function createServiceSupabase() {
  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

export function requireServiceSupabase() {
  const client = createServiceSupabase();
  if (!client) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for this operation (USDA sync / food KB writes)');
  }
  return client;
}
