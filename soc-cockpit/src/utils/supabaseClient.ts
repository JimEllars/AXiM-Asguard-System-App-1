import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(JSON.stringify({
    level: "warn",
    message: "Supabase credentials are empty or misconfigured. Falling back to dummy read-only client.",
    timestamp: new Date().toISOString()
  }));
}

try {
  if (supabaseUrl && supabaseAnonKey) {
    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });
  } else {
    throw new Error("Missing Supabase credentials");
  }
} catch (e) {
  console.warn(JSON.stringify({
    level: "warn",
    message: "Supabase client initialization failed; network latency or configuration issue. Falling back to dummy client.",
    error: e instanceof Error ? e.message : String(e),
    timestamp: new Date().toISOString()
  }));
  // Fallback dummy client to prevent unhandled top-level exceptions
  client = {
     channel: () => ({
        on: () => ({ subscribe: () => {} }),
        subscribe: () => {},
        unsubscribe: () => Promise.resolve()
     }),
     from: () => ({
        select: () => ({
           eq: () => ({
              single: () => Promise.resolve({ data: null, error: null }),
              limit: () => Promise.resolve({ data: [], error: null })
           }),
           order: () => ({
              range: () => Promise.resolve({ data: [], error: null }),
              limit: () => Promise.resolve({ data: [], error: null })
           })
        }),
        insert: () => Promise.resolve({ data: null, error: null }),
        delete: () => ({
           eq: () => Promise.resolve({ data: null, error: null })
        })
     }),
     auth: {
        getSession: () => Promise.resolve({ data: { session: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } })
     }
  };
}

export const supabase = client as ReturnType<typeof createClient>;
