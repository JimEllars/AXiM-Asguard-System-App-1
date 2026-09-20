import { NextResponse } from 'next/server';

export async function GET() {
  const isReady = true;
  const startTime = Date.now();
  let upstreamLatency = -1;

  try {
    const coreApiUrl = process.env.NEXT_PUBLIC_AXIM_CORE_API_URL || "https://api.axim.us.com";
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500); // 1.5s max blocking for readiness probes

    const res = await fetch(`${coreApiUrl}/ping`, {
      signal: controller.signal,
    }).catch(() => null);

    clearTimeout(timeoutId);

    // We still consider the app "ready" even if upstream is degraded, but we log the latency
    if (res && res.ok) {
       upstreamLatency = Date.now() - startTime;
    }
  } catch (e) {
    // Edge node itself is ready, upstream is degraded
  }

  return NextResponse.json({
    status: 'ready',
    timestamp: new Date().toISOString(),
    upstream_latency_ms: upstreamLatency > -1 ? upstreamLatency : null,
    degraded: upstreamLatency === -1
  }, {
    status: 200,
    headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
    }
  });
}
