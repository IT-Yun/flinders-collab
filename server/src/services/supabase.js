const { createClient } = require('@supabase/supabase-js');
const config = require('../config');

const SUPABASE_URL = config.supabase.url || 'https://placeholder.supabase.co';
const SUPABASE_SERVICE_KEY = config.supabase.serviceRoleKey || 'placeholder';
const SUPABASE_ANON_KEY = config.supabase.anonKey || 'placeholder';

if (!config.supabase.url) {
  console.warn('WARNING: SUPABASE_URL is not set. Set it in .env for the server to work properly.');
}

// Admin client with service role key — for server-side operations (bypasses RLS)
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  db: {
    schema: 'public',
  },
  global: {
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
  },
});

// Public client with anon key — for user-scoped operations
const supabasePublic = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    flowType: 'implicit',
  },
});

/**
 * Create a Supabase client scoped to a specific user's JWT.
 * Used for RLS-protected queries.
 */
function createUserClient(accessToken) {
  return createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

module.exports = {
  supabaseAdmin,
  supabasePublic,
  createUserClient,
};
