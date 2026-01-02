import { createClient } from '@supabase/supabase-js';

// HARDCODED CREDENTIALS FOR TESTING
// Updated to your self-hosted instance (HTTPS)
const supabaseUrl = 'https://superbase.emmerce.io';

// The key provided contained whitespace/newlines which can cause header errors.
// We sanitize it here to ensure it is a valid single-line string.
const rawKey = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE`;

// Remove all whitespace/newlines from the key
const supabaseKey = rawKey.replace(/\s/g, '');

export const supabase = createClient(supabaseUrl.trim(), supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});