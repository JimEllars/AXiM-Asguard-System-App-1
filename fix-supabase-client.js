const fs = require('fs');
let code = fs.readFileSync('soc-cockpit/src/utils/supabaseClient.ts', 'utf8');

// Update to defensively initialize supabase.
// "Focus on defensive initialization so that if NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY are missing or rotating at the Cloudflare edge/OpenNext SSR runtime, the client falls back gracefully without throwing unhandled top-level exceptions."

code = `import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'mock-anon-key';

// Defensive initialization wrapper
let client;
try {
  client = createClient(supabaseUrl, supabaseAnonKey);
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
`;

fs.writeFileSync('soc-cockpit/src/utils/supabaseClient.ts', code);
