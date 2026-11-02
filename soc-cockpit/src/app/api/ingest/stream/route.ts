import { NextRequest, NextResponse } from 'next/server';

/** Heartbeat cadence. Cloudflare and most LBs cut idle SSE connections at ~60s. */
const KEEP_ALIVE_INTERVAL_MS = 15000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const sseHeaders = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  'Connection': 'keep-alive',
  'X-Accel-Buffering': 'no',
  ...corsHeaders,
};

/**
 * SSRF guard for the POST proxy target.
 *
 * This route forwards to a caller-supplied URL, so without validation it is an
 * open proxy into the private network. Reject non-HTTP schemes, credentials in
 * the URL, loopback / RFC1918 / link-local hosts and internal infrastructure
 * ports before any fetch is attempted.
 */
const INTERNAL_PORTS = new Set(['6543', '5432', '8080', '9000', '6379', '11211']);
const IPV4_LOOPBACK = /^127\./;
const IPV4_PRIVATE_10 = /^10\./;
const IPV4_PRIVATE_172 = /^172\.(1[6-9]|2\d|3[01])\./;
const IPV4_PRIVATE_192 = /^192\.168\./;
const IPV4_LINK_LOCAL = /^169\.254\./;
const IPV4_UNSPECIFIED = /^0\./;
const INTERNAL_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata',
  'instance-data',
]);

function isForbiddenHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (INTERNAL_HOSTNAMES.has(host)) return true;
  if (host.endsWith('.local') || host.endsWith('.internal')) return true;

  // IPv6 loopback / unique-local / link-local / unspecified
  if (host === '::1' || host === '::') return true;
  if (/^f[cd][0-9a-f]{2}:/.test(host)) return true;
  if (/^fe80:/.test(host)) return true;

  return (
    IPV4_LOOPBACK.test(host) ||
    IPV4_PRIVATE_10.test(host) ||
    IPV4_PRIVATE_172.test(host) ||
    IPV4_PRIVATE_192.test(host) ||
    IPV4_LINK_LOCAL.test(host) ||
    IPV4_UNSPECIFIED.test(host)
  );
}

function validateUpstreamUrl(rawUrl: string): { ok: true; url: URL } | { ok: false; reason: string } {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: 'invalid_url' };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, reason: 'invalid_scheme' };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, reason: 'credentials_not_allowed' };
  }
  if (isForbiddenHost(parsed.hostname)) {
    return { ok: false, reason: 'internal_address_blocked' };
  }
  if (INTERNAL_PORTS.has(parsed.port)) {
    return { ok: false, reason: 'internal_port_blocked' };
  }
  return { ok: true, url: parsed };
}

/**
 * Creates a bounded SSE writer with a keep-alive heartbeat and idempotent
 * teardown. Every write is guarded so a disconnected client cannot throw into
 * the streaming loop.
 */
function createSseChannel(request: NextRequest) {
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const isAborted = () => closed || request.signal.aborted;

  const write = async (chunk: string) => {
    if (isAborted()) return false;
    try {
      await writer.write(encoder.encode(chunk));
      return true;
    } catch {
      // Client vanished between the guard and the write.
      await close();
      return false;
    }
  };

  const close = async () => {
    if (closed) return;
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = undefined;
    try {
      await writer.close();
    } catch {
      /* already closed by the consumer */
    }
  };

  const startHeartbeat = () => {
    heartbeat = setInterval(() => {
      void write(': keep-alive\n\n');
    }, KEEP_ALIVE_INTERVAL_MS);
  };

  // `signal.aborted` covers the case where the disconnect happened before the
  // listener was attached, which is common on Cloudflare Workers.
  if (request.signal.aborted) {
    void close();
  } else {
    request.signal.addEventListener('abort', () => {
      void close();
    });
  }

  return { readable, write, close, startHeartbeat, isAborted, encoder };
}

/**
 * POST — proxy an upstream SSE feed, re-framing it with our own keep-alives.
 * The caller supplies the upstream URL; it is SSRF-validated first.
 */
export async function POST(request: NextRequest) {
  const { url, headers, body } = await request
    .json()
    .catch(() => ({ url: '', headers: {}, body: null }));

  if (!url || typeof url !== 'string') {
    return new NextResponse('Bad Request', { status: 400, headers: corsHeaders });
  }

  const validated = validateUpstreamUrl(url);
  if (!validated.ok) {
    return new NextResponse(JSON.stringify({ error: 'upstream_rejected', reason: validated.reason }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const channel = createSseChannel(request);
  const decoder = new TextDecoder();

  const pump = async () => {
    try {
      channel.startHeartbeat();

      const upstream = await fetch(validated.url.toString(), {
        method: 'POST',
        headers: headers || {},
        body: body ? JSON.stringify(body) : undefined,
        signal: request.signal,
      });

      if (!upstream.ok) {
        await channel.write(
          `event: upstream-error\ndata: ${JSON.stringify({ status: upstream.status })}\n\n`,
        );
        return;
      }

      if (!upstream.body) return;

      const reader = upstream.body.getReader();
      let buffer = '';

      while (!channel.isAborted()) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const frames = buffer.split('\n\n');
        buffer = frames.pop() || ''; // keep the partial trailing frame

        for (const frame of frames) {
          // Strip upstream keep-alives; we emit our own on a known cadence.
          if (frame.startsWith(': keep-alive')) continue;
          if (!frame.trim()) continue;
          const wrote = await channel.write(`${frame}\n\n`);
          if (!wrote) {
            await reader.cancel().catch(() => {});
            return;
          }
        }
      }

      if (buffer.trim() && !channel.isAborted()) {
        await channel.write(`${buffer}\n\n`);
      }
    } catch (err: any) {
      if (!channel.isAborted()) {
        console.error(JSON.stringify({
          level: 'error',
          message: 'SSE proxy stream error',
          error: err?.message || String(err),
          timestamp: new Date().toISOString(),
        }));
      }
    } finally {
      await channel.close();
    }
  };

  void pump();

  return new NextResponse(channel.readable, { headers: sseHeaders });
}

/**
 * GET — local SSE channel that emits keep-alives and downstream fan-out events.
 */
export async function GET(request: NextRequest) {
  const channel = createSseChannel(request);

  const run = async () => {
    try {
      await channel.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
      channel.startHeartbeat();
    } catch (err: any) {
      console.error('Stream initialization error:', err);
      await channel.close();
    }
  };

  void run();

  return new NextResponse(channel.readable, { headers: sseHeaders });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...corsHeaders,
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
