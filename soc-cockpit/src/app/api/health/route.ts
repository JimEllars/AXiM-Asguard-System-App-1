import { NextResponse } from "next/server";

export async function GET() {
  let aximCoreReachability = false;
  let aximCoreLatency = -1;
  const startTime = Date.now();

  try {
    const coreApiUrl = process.env.NEXT_PUBLIC_AXIM_CORE_API_URL || "https://api.axim.us.com";
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500); // Tighter timeout bounds for readiness probes

    // We ping an open endpoint if available or just check tcp/tls via a quick root fetch
    const res = await fetch(`${coreApiUrl}/ping`, {
      signal: controller.signal,
    }).catch(() => null);

    clearTimeout(timeoutId);
    if (res && res.ok) {
       aximCoreReachability = true;
       aximCoreLatency = Date.now() - startTime;
    }
  } catch (e) {
    aximCoreReachability = false;
  }

  // Edge environments won't have process.memoryUsage(), so conditionally handle
  const memoryUsage = typeof process !== 'undefined' && process.memoryUsage ? process.memoryUsage() : { rss: 0, heapUsed: 0 };
  const rssMb = Math.round(memoryUsage.rss / 1024 / 1024);
  const heapMb = Math.round(memoryUsage.heapUsed / 1024 / 1024);

  return NextResponse.json(
    {
      status: "healthy",
      timestamp: new Date().toISOString(),
      metrics: {
        memory_rss_mb: rssMb,
        memory_heap_mb: heapMb,
        core_connectivity: true,
        worker_queue_latency_ms: 0,
        axim_core_api_reachability: aximCoreReachability,
        axim_core_latency_ms: aximCoreLatency,
      },
    },
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    },
  );
}
