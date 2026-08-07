import os

onyx_path = 'soc-cockpit/src/components/Submit/OnyxPipeline.jsx'
with open(onyx_path, 'r') as f:
    onyx = f.read()

onyx = onyx.replace(
    "alert('Media successfully submitted to the Onyx Pipeline.');",
    """setToast({ type: 'success', message: '[ MEDIA SUBMITTED TO ONYX PIPELINE ]' });
      setTimeout(() => setToast(null), 5000);

      // Dispatch completion telemetry
      fetch(`${process.env.NEXT_PUBLIC_INTERCEPTOR_URL}/telemetry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'onyx_pipeline_job_executed',
          severity: 'info',
          appOrigin: 'AXiM Onyx Pipeline',
          details: {
            fileName: file.name,
            fileSize: file.size,
            location: { lat: latitude, lng: longitude },
            status: 'completed',
            timestamp: Date.now()
          }
        })
      }).catch(console.error);"""
)

onyx = onyx.replace(
    "const [location, setLocation] = useState(null);",
    "const [location, setLocation] = useState(null);\n  const [toast, setToast] = useState(null);"
)

onyx = onyx.replace(
    "// Mock payload construction",
    """// Dispatch initial telemetry
      fetch(`${process.env.NEXT_PUBLIC_INTERCEPTOR_URL}/telemetry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'onyx_pipeline_job_executed',
          severity: 'info',
          appOrigin: 'AXiM Onyx Pipeline',
          details: {
            fileName: file.name,
            fileSize: file.size,
            location: { lat: latitude, lng: longitude },
            status: 'submitted',
            timestamp: Date.now()
          }
        })
      }).catch(console.error);

      // Mock payload construction"""
)

onyx = onyx.replace(
    "setError(err.message || 'Failed to capture location or upload file.');",
    """setError(err.message || 'Failed to capture location or upload file.');

      if (file) {
        // Dispatch failure telemetry
        fetch(`${process.env.NEXT_PUBLIC_INTERCEPTOR_URL}/telemetry`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventType: 'onyx_pipeline_job_executed',
            severity: 'info',
            appOrigin: 'AXiM Onyx Pipeline',
            details: {
              fileName: file.name,
              fileSize: file.size,
              location: null,
              status: 'failed',
              timestamp: Date.now(),
              errorReason: err.message
            }
          })
        }).catch(console.error);
      }

      setToast({ type: 'error', message: `[ ERROR ] ${err.message || 'Failed to upload'}` });
      setTimeout(() => setToast(null), 5000);"""
)

onyx = onyx.replace(
    """{error && (
          <div className="bg-red-950/50 border border-red-900 text-red-400 px-4 py-3 rounded text-sm font-mono">
            [ERROR] {error}
          </div>
        )}""",
    """{error && (
          <div className="bg-red-950/50 border border-red-900 text-red-400 px-4 py-3 rounded text-sm font-mono flex justify-between items-center">
            <span>[ERROR] {error}</span>
            <button type="button" onClick={handleSubmit} className="text-xs bg-red-900 hover:bg-red-800 px-2 py-1 rounded transition-colors">Retry</button>
          </div>
        )}"""
)

onyx = onyx.replace(
    """return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 shadow-xl max-w-2xl mx-auto">""",
    """return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 shadow-xl max-w-2xl mx-auto relative">
      {toast && (
        <div className={`absolute top-4 right-4 px-4 py-2 rounded text-sm font-mono z-50 shadow-lg border ${toast.type === 'success' ? 'bg-emerald-950/90 text-emerald-400 border-emerald-900' : 'bg-red-950/90 text-red-400 border-red-900'}`}>
          {toast.message}
        </div>
      )}"""
)

with open(onyx_path, 'w') as f:
    f.write(onyx)


live_path = 'soc-cockpit/src/components/LiveThreatFeed.tsx'
with open(live_path, 'r') as f:
    live = f.read()

live = live.replace(
    "const [realtimeStatus, setRealtimeStatus] = useState<'CONNECTED' | 'DISCONNECTED' | 'ERROR'>('DISCONNECTED');",
    "const [realtimeStatus, setRealtimeStatus] = useState<'CONNECTED' | 'DISCONNECTED' | 'ERROR'>('DISCONNECTED');\n  const [retryCount, setRetryCount] = useState<number>(0);"
)

live = live.replace(
    """                setRealtimeStatus('CONNECTED');

                currentRetry = 0;""",
    """                setRealtimeStatus('CONNECTED');

                currentRetry = 0;
                setRetryCount(0);"""
)

live = live.replace(
    """                    currentRetry++;
                    setupRealtime();
                }, delay);""",
    """                    currentRetry++;
                    setRetryCount(currentRetry);
                    setupRealtime();
                }, delay);"""
)

live = live.replace(
    """        <div className={`text-xs font-mono border px-2 py-1.5 md:px-3 md:py-2 rounded transition-colors duration-300 flex items-center gap-2 ${
          realtimeStatus === 'CONNECTED'
            ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300'
            : 'bg-amber-950/80 border-amber-500 text-amber-300'
        }`}>
          {realtimeStatus === 'CONNECTED' ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>LIVE SYNC</span>
            </>
          ) : (
            <span>Realtime Sync Interrupted — Re-establishing Edge Uplink...</span>
          )}
        </div>""",
    """        <div className={`text-xs font-mono border px-2 py-1.5 md:px-3 md:py-2 rounded transition-colors duration-300 flex items-center gap-2 ${
          realtimeStatus === 'CONNECTED'
            ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300'
            : realtimeStatus === 'ERROR'
            ? 'bg-red-950/80 border-red-500 text-red-300'
            : 'bg-amber-950/80 border-amber-500 text-amber-300'
        }`}>
          {realtimeStatus === 'CONNECTED' ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>CONNECTED</span>
            </>
          ) : realtimeStatus === 'ERROR' ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
              <span>OFFLINE</span>
            </>
          ) : (
            <>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
              <span>RECONNECTING (ATTEMPT {retryCount})</span>
            </>
          )}
        </div>"""
)

with open(live_path, 'w') as f:
    f.write(live)


test_path = 'asguard-interceptor/tests/interceptor.test.ts'
with open(test_path, 'r') as f:
    test = f.read()

test_to_inject = """  it("handles POST /telemetry with onyx_pipeline_job_executed event and stores in KV", async () => {
    const payload = {
      eventType: "onyx_pipeline_job_executed",
      severity: "info",
      appOrigin: "AXiM Onyx Pipeline",
      details: {
        fileName: "test_image.png",
        fileSize: 1024,
        location: { lat: 0, lng: 0 },
        status: "submitted",
        timestamp: Date.now()
      }
    };

    const request = new Request("https://example.com/telemetry", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" }
    });

    const env = { ASGUARD_TELEMETRY: mockTelemetryKV };
    const ctx = { waitUntil: vi.fn(p => p) };

    const response = await worker.fetch(request, env as any, ctx as any);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect((body as any).success).toBe(true);

    const putCalls = mockTelemetryKV.put.mock.calls;
    const kvPut = putCalls.find(c => (c[0] as string).includes("recent_events"));
    expect(kvPut).toBeDefined();
  });
"""

test = test.replace(
    '  describe("POST /telemetry", () => {',
    f'  describe("POST /telemetry", () => {{\n{test_to_inject}'
)

with open(test_path, 'w') as f:
    f.write(test)
