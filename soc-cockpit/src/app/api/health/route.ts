import { NextResponse } from "next/server";

export async function GET() {
  // Wire application health checks (`/api/health`) to report granular status:
  // core connectivity, memory usage, worker queue latency, and AXiM Core API reachability.
  let aximCoreReachability = false;
  let aximCoreLatency = -1;
  const startTime = Date.now();
  try {
    const coreApiUrl =
      (typeof process !== 'undefined' ? process.env : {} as Record<string, string>).NEXT_PUBLIC_AXIM_CORE_API_URL || "https://api.axim.us.com";
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${coreApiUrl}/ping`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    aximCoreReachability = res.ok;
    aximCoreLatency = Date.now() - startTime;
  } catch (e) {
    aximCoreReachability = false;
  }

    const memoryUsage = typeof process !== 'undefined' && process.memoryUsage ? process.memoryUsage() : { rss: 0, heapUsed: 0 };

  // Route structured logs into the primary AXiM ecosystem logger without introducing extraneous database read/writes.
  try {
    const aximCoreUrl =
      (typeof process !== 'undefined' ? process.env : {} as Record<string, string>).NEXT_PUBLIC_AXIM_CORE_API_URL || "https://api.axim.us.com";
    const asguardInternalKey =
      (typeof process !== 'undefined' ? process.env : {} as Record<string, string>).AXIM_INTERNAL_KEY || "development_mock_key";
    const payload = {
      app_id: "axim-asguard",
      event_type: "system_health_check",
      timestamp: Date.now(),
      sourceIp: "127.0.0.1",
      details: {
        memory_rss_mb: Math.round(memoryUsage.rss / 1024 / 1024),
        memory_heap_mb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        core_connectivity: true,
        axim_core_api_reachability: aximCoreReachability,
        axim_core_latency_ms: aximCoreLatency,
      },
    };

    fetch(`${aximCoreUrl}/api/v1/telemetry/micro-app`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Axim-Signature": asguardInternalKey,
      },
      body: JSON.stringify(payload),
    }).catch((e) => {
      /* Ignore failure, do not block health check */
    });
  } catch (e) {
    // Ignore
  }

  return NextResponse.json(
    {
      status: "pass",
      timestamp: new Date().toISOString(),
      metrics: {
        memory_rss_mb: Math.round(memoryUsage.rss / 1024 / 1024),
        memory_heap_mb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        core_connectivity: true, // internal to this server
        worker_queue_latency_ms: 0, // Mock for now, would read from a true worker queue
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
