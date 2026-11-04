import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * `/api/v1/threats/stream` is the second SSE channel in the cockpit — the one the
 * global threat map and operator chat subscribe to. It was hardened later than
 * `api/ingest/stream/route.ts` and had kept the older lifecycle pattern, which
 * had three consequences:
 *
 *   · no `req.signal.aborted` pre-check, so a client that disconnected before
 *     the handler ran left the 15s keep-alive interval ticking for the
 *     isolate's lifetime and never closed the writer;
 *   · `safeWrite` closed over `cleanup` before it was initialised (a
 *     temporal-dead-zone trap rather than a working guard);
 *   · the bootstrap chain had no rejection path to teardown.
 *
 * These cases pin the lifecycle so it cannot regress again.
 */

const supabaseState = vi.hoisted(() => {
  const state: any = {
    events: [] as any[],
    subscribed: null as null | ((status: string) => void),
    removeChannel: null as any,
    channelCalls: 0,
  };
  return state;
});

vi.mock('@supabase/supabase-js', () => {
  const channel = {
    on: () => channel,
    subscribe: (cb?: (status: string) => void) => {
      supabaseState.subscribed = cb ?? null;
      cb?.('SUBSCRIBED');
      return channel;
    },
  };
  const query: any = {
    select: () => query,
    gte: () => query,
    order: () => query,
    limit: () => Promise.resolve({ data: supabaseState.events, error: null }),
  };
  return {
    createClient: () => ({
      from: () => query,
      channel: () => {
        supabaseState.channelCalls += 1;
        return channel;
      },
      removeChannel: supabaseState.removeChannel,
    }),
  };
});

const decoder = new TextDecoder();

async function readChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs = 1000,
): Promise<string | null> {
  const result = await Promise.race([
    reader.read(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('stream read timed out — teardown never ran')), timeoutMs),
    ),
  ]);
  return result.done ? null : decoder.decode(result.value as Uint8Array);
}

function streamRequest(signal?: AbortSignal): Request {
  return new Request('https://asguard.test/api/v1/threats/stream', { method: 'GET', signal });
}

let removeChannelSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetModules();
  supabaseState.events = [];
  supabaseState.subscribed = null;
  supabaseState.channelCalls = 0;
  removeChannelSpy = vi.fn(async () => 'ok');
  supabaseState.removeChannel = removeChannelSpy;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('threats SSE stream — transport', () => {
  it('advertises an unbuffered, non-cacheable event stream', async () => {
    const { GET } = await import('../src/app/api/v1/threats/stream/route');

    const res = await GET(streamRequest());

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');
    expect(res.headers.get('Cache-Control')).toContain('no-cache');
    expect(res.headers.get('X-Accel-Buffering')).toBe('no');
    await res.body?.cancel();
  });

  it('hydrates the last hour of events in ascending order', async () => {
    supabaseState.events = [
      { id: 'newer', timestamp: '2026-11-04T10:00:00.000Z' },
      { id: 'older', timestamp: '2026-11-04T09:00:00.000Z' },
    ];
    const { GET } = await import('../src/app/api/v1/threats/stream/route');

    const res = await GET(streamRequest());
    const reader = res.body!.getReader();

    const first = await readChunk(reader);
    const second = await readChunk(reader);

    expect(first).toContain('"id":"older"');
    expect(second).toContain('"id":"newer"');
    await reader.cancel();
  });

  it('emits a keep-alive comment every 15s', async () => {
    vi.useFakeTimers();
    const { GET } = await import('../src/app/api/v1/threats/stream/route');

    const res = await GET(streamRequest());
    const reader = res.body!.getReader();

    await vi.advanceTimersByTimeAsync(15000);
    const beat = await readChunk(reader);

    expect(beat).toBe(': keep-alive\n\n');
    await reader.cancel();
  });
});

describe('threats SSE stream — teardown', () => {
  it('closes immediately when the client disconnected before the handler ran', async () => {
    const controller = new AbortController();
    controller.abort();

    const { GET } = await import('../src/app/api/v1/threats/stream/route');

    const res = await GET(streamRequest(controller.signal));
    const reader = res.body!.getReader();

    // The writer must already be closed: no hydration, no heartbeat, done.
    await expect(readChunk(reader)).resolves.toBeNull();
  });

  it('tears down the channel and closes the stream on abort', async () => {
    const controller = new AbortController();
    supabaseState.events = [{ id: 'one', timestamp: '2026-11-04T10:00:00.000Z' }];

    const { GET } = await import('../src/app/api/v1/threats/stream/route');

    const res = await GET(streamRequest(controller.signal));
    const reader = res.body!.getReader();

    // Drain whatever hydration produced first, then make sure the realtime
    // channel actually exists before we pull the plug.
    await readChunk(reader);
    await vi.waitFor(() => expect(supabaseState.channelCalls).toBe(1));

    controller.abort();
    await vi.waitFor(() => expect(removeChannelSpy).toHaveBeenCalledTimes(1));

    await expect(readChunk(reader)).resolves.toBeNull();
  });

  it('survives repeated aborts without double-closing', async () => {
    const controller = new AbortController();
    supabaseState.events = [{ id: 'one', timestamp: '2026-11-04T10:00:00.000Z' }];
    const { GET } = await import('../src/app/api/v1/threats/stream/route');

    const res = await GET(streamRequest(controller.signal));
    const reader = res.body!.getReader();

    await readChunk(reader);
    await vi.waitFor(() => expect(supabaseState.channelCalls).toBe(1));

    controller.abort();
    controller.abort();

    await vi.waitFor(() => expect(removeChannelSpy).toHaveBeenCalledTimes(1));
    await expect(readChunk(reader)).resolves.toBeNull();
  });

  it('never subscribes when the client vanished mid-hydration', async () => {
    const controller = new AbortController();
    supabaseState.events = [{ id: 'one', timestamp: '2026-11-04T10:00:00.000Z' }];
    const { GET } = await import('../src/app/api/v1/threats/stream/route');

    const res = await GET(streamRequest(controller.signal));
    // Abort before hydration's `.then(subscribe)` has had a chance to run.
    controller.abort();

    // Hydration may already have queued a frame into the readable; what matters
    // is that the stream terminates and no realtime channel is ever opened.
    const reader = res.body!.getReader();
    for (let chunk = await readChunk(reader); chunk !== null; chunk = await readChunk(reader)) {
      // drain
    }

    expect(supabaseState.channelCalls).toBe(0);
    expect(removeChannelSpy).not.toHaveBeenCalled();
  });

  it('does not start a realtime channel when the client is already gone', async () => {
    const controller = new AbortController();
    controller.abort();
    const { GET } = await import('../src/app/api/v1/threats/stream/route');

    const res = await GET(streamRequest(controller.signal));
    await res.body!.getReader().read();

    expect(supabaseState.channelCalls).toBe(0);
    expect(removeChannelSpy).not.toHaveBeenCalled();
  });
});
