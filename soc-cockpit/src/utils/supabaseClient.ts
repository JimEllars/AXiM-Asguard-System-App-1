import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'mock-anon-key';

// Defensive initialization wrapper
let client;
try {
  // Use options suitable for Edge environment
  client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
} catch (e) {
  console.error("Failed to initialize Supabase client gracefully:", e);
  // Fallback dummy client to prevent unhandled top-level exceptions
  client = {
     channel: () => ({
        on: () => ({ subscribe: () => {} }),
        subscribe: () => {}
     }),
     from: () => ({
        select: () => ({
           eq: () => ({
              single: () => Promise.resolve({ data: null, error: null }),
              limit: () => Promise.resolve({ data: [], error: null })
           })
        }),
        insert: () => Promise.resolve({ data: null, error: null })
     }),
     auth: {
        getSession: () => Promise.resolve({ data: { session: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } })
     }
  };
}

export const supabase = client as ReturnType<typeof createClient>;
