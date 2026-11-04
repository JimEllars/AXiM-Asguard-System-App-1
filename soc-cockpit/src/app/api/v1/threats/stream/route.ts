import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'edge';

/** Heartbeat cadence. Cloudflare and most LBs cut idle SSE connections at ~60s. */
const KEEP_ALIVE_INTERVAL_MS = 15000;

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  'Connection': 'keep-alive',
  'X-Accel-Buffering': 'no',
};

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
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    /**
     * Idempotent teardown. Every exit path funnels through here so the heartbeat
     * interval, the realtime channel and the writer are released exactly once.
     *
     * Declared before `safeWrite` rather than after it: the old ordering closed
     * over `cleanup` from a callback that could in principle run first, which is
     * a temporal-dead-zone trap rather than a working guard.
     */
    const cleanup = async () => {
        if (isClosed) return;
        isClosed = true;

        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }

        if (channel) {
            const pending = channel;
            channel = null;
            try {
                await supabase.removeChannel(pending);
            } catch (e) {
                console.error('Channel teardown failed', e);
            }
        }

        try {
            await writer.close();
        } catch (e) {
            /* already closed by the consumer, or the client is gone */
        }
    };

    const safeWrite = async (data: string) => {
        if (isClosed) return;
        try {
            await writer.write(encoder.encode(data));
        } catch (e) {
            // The consumer vanished between the guard and the write.
            console.error('Stream write error', e);
            await cleanup();
        }
    };

    // A client that disconnected before this handler ran leaves `aborted` already
    // true and no `abort` event will ever fire — the listener below would never
    // run, the keep-alive interval would tick for the isolate's lifetime and the
    // writer would never close. Check the flag, not just the listener.
    if (req.signal.aborted) {
        await cleanup();
        return new NextResponse(stream.readable, { headers: SSE_HEADERS });
    }

    req.signal.addEventListener('abort', () => {
        void cleanup();
    });

    intervalId = setInterval(() => {
        void safeWrite(': keep-alive\n\n');
    }, KEEP_ALIVE_INTERVAL_MS);

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
                    if (isClosed) return;
                    await safeWrite(`data: ${JSON.stringify(event)}\n\n`);
                }
            }
        } catch (e) {
            console.error("Hydration failed", e);
        }
    };

    const subscribe = () => {
        if (isClosed) return;
        channel = supabase.channel('public:threat_events')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'threat_events' },
                (payload) => {
                    void safeWrite(`data: ${JSON.stringify(payload.new)}\n\n`);
                }
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log('Successfully subscribed to threat_events');
                }
            });
    };

    // Run hydration then subscribe
    hydrate().then(subscribe).catch((e) => {
        console.error('Threat stream bootstrap failed', e);
        void cleanup();
    });

    return new NextResponse(stream.readable, { headers: SSE_HEADERS });
}
