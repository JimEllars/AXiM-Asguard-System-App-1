import { describe, it, expect, afterEach, vi } from 'vitest';
import { POST, GET, OPTIONS } from '../src/app/api/ingest/stream/route';

/**
 * The SSE route had no automated coverage at all — it was verified by hand.
 * These cases pin the three properties the perimeter depends on: a real
 * heartbeat cadence, a clean close on client disconnect, and an SSRF guard that
 * runs before any upstream fetch.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Read one chunk, or fail rather than hanging the suite. */
async function readChunk(reader: ReadableStreamDefaultReader<Uint8Array>, timeoutMs = 1000) {
  const result = await Promise.race([
    reader.read(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('stream read timed out')), timeoutMs),
    ),
  ]);
  if (result.done) return null;
  return decoder.decode(result.value as Uint8Array);
}

function sseRequest(body: unknown, signal?: AbortSignal): Request {
  return new Request('https://asguard.test/api/ingest/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  }) as unknown as any;
}

function getRequest(signal?: AbortSignal): Request {
  return new Request('https://asguard.test/api/ingest/stream', {
    method: 'GET',
    signal,
  }) as unknown as any;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('SSE ingest stream — transport', () => {
  it('advertises an unbuffered event-stream', async () => {
    const response = await GET(getRequest() as any);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/event-stream');
    expect(response.headers.get('Cache-Control')).toContain('no-cache');
    expect(response.headers.get('X-Accel-Buffering')).toBe('no');
    await response.body?.cancel();
  });

  it('sends a connected frame then a 15s keep-alive heartbeat', async () => {
    vi.useFakeTimers();

    const response = await GET(getRequest() as any);
    const reader = response.body!.getReader();

    const first = await readChunk(reader);
    expect(first).toContain('"type":"connected"');
    expect(first!.endsWith('\n\n')).toBe(true);

    await vi.advanceTimersByTimeAsync(15000);
    expect(await readChunk(reader)).toBe(': keep-alive\n\n');

    await vi.advanceTimersByTimeAsync(15000);
    expect(await readChunk(reader)).toBe(': keep-alive\n\n');

    await vi.advanceTimersByTimeAsync(14999);
    // Nothing is due yet — cancelling proves the timer had not already fired.
    await reader.cancel().catch(() => {});
  });

  it('closes the channel when the client disconnects', async () => {
    const controller = new AbortController();
    const response = await GET(getRequest(controller.signal) as any);
    const reader = response.body!.getReader();

    expect(await readChunk(reader)).toContain('"type":"connected"');

    controller.abort();

    // Abort drives close(); the reader sees end-of-stream instead of hanging.
    expect(await readChunk(reader)).toBeNull();
  });

  it('closes immediately when the request arrived already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    const response = await GET(getRequest(controller.signal) as any);
    const reader = response.body!.getReader();

    expect(await readChunk(reader)).toBeNull();
  });
});

describe('SSE ingest stream — SSRF guard on the POST proxy', () => {
  const forbidden = [
    'http://127.0.0.1/feed',
    'http://localhost:9000/feed',
    'http://10.1.2.3/feed',
    'http://172.16.0.5/feed',
    'http://192.168.1.10/feed',
    'http://169.254.169.254/latest/meta-data/',
    'http://metadata.google.internal/',
    'http://[::1]/feed',
    'http://db.internal/feed',
    'http://example.com:5432/feed',
    'http://example.com:6543/feed',
    'file:///etc/passwd',
    'http://user:pass@example.com/feed',
  ];

  it.each(forbidden)('rejects %s with 403 and never fetches', async (url) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(sseRequest({ url }) as any);

    expect(response.status).toBe(403);
    const body = (await response.json()) as any;
    expect(body.error).toBe('upstream_rejected');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a missing or non-string url with 400', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(sseRequest({ headers: {} }) as any);

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('proxies an allowed upstream and strips its keep-alives', async () => {
    const upstreamFrames = [
      ': keep-alive\n\n',
      'data: {"id":"t1"}\n\n',
      'data: {"id":"t2"}\n\n',
    ].join('');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode(upstreamFrames));
              controller.close();
            },
          }),
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
        ),
      ),
    );

    const response = await POST(sseRequest({ url: 'https://feeds.example.com/sse' }) as any);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/event-stream');

    const reader = response.body!.getReader();
    let received = '';
    for (;;) {
      const chunk = await readChunk(reader, 2000);
      if (chunk === null) break;
      received += chunk;
    }

    // Upstream heartbeats are dropped; ours are on a known cadence.
    expect(received).not.toContain(': keep-alive');
    expect(received).toContain('data: {"id":"t1"}');
    expect(received).toContain('data: {"id":"t2"}');
  });

  it('answers CORS preflight without touching the proxy', async () => {
    const response = await OPTIONS();
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });
});
