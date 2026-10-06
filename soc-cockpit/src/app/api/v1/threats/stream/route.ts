import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'edge';

function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.AXIM_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'dummy_key_for_build';
  return createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false }
  });
}

export async function GET(req: Request) {
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const supabase = getSupabaseClient();

    let isClosed = false;

    const safeWrite = async (data: string) => {
        if (isClosed) return;
        try {
            await writer.write(encoder.encode(data));
        } catch (e) {
            console.error('Stream write error', e);
            cleanup();
        }
    };

    const sendKeepAlive = async () => {
        await safeWrite(': keep-alive\n\n');
    };

    const intervalId = setInterval(sendKeepAlive, 15000);

    let channel: ReturnType<typeof supabase.channel> | null = null;

    const cleanup = async () => {
        if (isClosed) return;
        isClosed = true;
        clearInterval(intervalId);
        if (channel) {
            supabase.removeChannel(channel).catch(console.error);
        }
        try {
            await writer.close();
        } catch(e) {}
    };

    req.signal.addEventListener('abort', cleanup);

    // Initial hydration
    const hydrate = async () => {
        try {
            const { data, error } = await supabase
                .from('threat_events')
                .select('*')
                .gte('timestamp', new Date(Date.now() - 60 * 60 * 1000).toISOString())
                .order('timestamp', { ascending: false })
                .limit(50);

            if (error) {
                console.error("Error fetching initial threats:", error);
                return;
            }

            if (data) {
                for (const event of [...data].reverse()) {
                    await safeWrite(`data: ${JSON.stringify(event)}\n\n`);
                }
            }
        } catch (e) {
            console.error("Hydration failed", e);
        }
    };

    const subscribe = () => {
        channel = supabase.channel('public:threat_events')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'threat_events' },
                (payload) => {
                    safeWrite(`data: ${JSON.stringify(payload.new)}\n\n`).catch(console.error);
                }
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log('Successfully subscribed to threat_events');
                }
            });
    };

    // Run hydration then subscribe
    hydrate().then(subscribe).catch(console.error);

    return new Response(stream.readable, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
        },
    });
}
