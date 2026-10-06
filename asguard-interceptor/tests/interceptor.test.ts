import { Env } from "../src/index";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const originalFetch = global.fetch;
import worker from "../src/index";

const mockKV = {
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};

const mockTelemetryKV = {
  get: vi.fn(),
  put: vi.fn(),
  list: vi.fn(),
};

describe("Asguard Interceptor", () => {
  beforeEach(() => {
    (globalThis as any).caches = {
      default: {
        match: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(true)
      }
    };
  });
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });


  it("should trigger client-error throttle circuit breaker returning 429", async () => {
    const env = {
      ASGUARD_API_KEY: "secret-key",
      TELEMETRY_INGEST_KEY: "ingest-key",
      ASGUARD_BLACKLIST: mockKV as any,
      ASGUARD_TELEMETRY: mockTelemetryKV as any,
    };

    // Simulate 6 client-error requests
    const createReq = () => new Request("https://example.com/telemetry/client-error", {
      method: "POST",
      headers: { "cf-connecting-ip": "9.9.9.9", "X-Asguard-Ingest-Key": "ingest-key" },
      body: JSON.stringify({ message: "test" })
    });
    const ctx = { waitUntil: vi.fn() } as any;

    for (let i = 0; i < 5; i++) {
       const req = createReq();
       const res = await worker.fetch(req, env as any as Env, ctx);
       expect(res.status).not.toBe(429);
    }

    const req = createReq();
    const res = await worker.fetch(req, env as any as Env, ctx);
    expect(res.status).toBe(429);
  });



  it("blocks request instantly via KV ledger short-circuiting and returns 403", async () => {
    mockKV.get.mockResolvedValue("1");
    const request = new Request("https://example.com/", {
      headers: { "cf-connecting-ip": "1.2.3.4", "X-Asguard-Ingest-Key": "ingest-key" },
    });

    const env = {
      ASGUARD_API_KEY: "secret-key",
      TELEMETRY_INGEST_KEY: "ingest-key",
      ASGUARD_BLACKLIST: mockKV as any,
      ASGUARD_TELEMETRY: mockTelemetryKV as any,
    };
    const ctx = { waitUntil: vi.fn() } as any;

    const startTime = Date.now();
    const response = await worker.fetch(request, env as any as Env, ctx);
    const duration = Date.now() - startTime;

    expect(response.status).toBe(403);
    expect(mockKV.get).toHaveBeenCalledWith("ip:1.2.3.4");
    // Ensure we drop without calling downstream (rate limit is handled natively so we can't easily spy on map size without exporting it, but we can verify status)
  });

  it("handles OPTIONS preflight requests with CORS headers", async () => {
    const request = new Request("https://example.com/", {
      method: "OPTIONS",
    });

    const env = {
      ASGUARD_API_KEY: "secret-key",
      TELEMETRY_INGEST_KEY: "ingest-key",
      ASGUARD_BLACKLIST: mockKV as any,
      ASGUARD_TELEMETRY: mockTelemetryKV as any,
    };
    const ctx = { waitUntil: vi.fn() } as any;

    const response = await worker.fetch(request, env as any as Env, ctx);
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
      "GET, POST, OPTIONS",
    );
  });

  it("blocks request if IP is in blocklist and returns CORS headers", async () => {
    mockKV.get.mockResolvedValue("blocked");
    const request = new Request("https://example.com/", {
      headers: { "cf-connecting-ip": "1.2.3.4", "X-Asguard-Ingest-Key": "ingest-key" },
    });

    const env = {
      ASGUARD_API_KEY: "secret-key",
      TELEMETRY_INGEST_KEY: "ingest-key",
      ASGUARD_BLACKLIST: mockKV as any,
      ASGUARD_TELEMETRY: mockTelemetryKV as any,
    };
    const ctx = { waitUntil: vi.fn() } as any;

    const response = await worker.fetch(request, env as any as Env, ctx);
    expect(response.status).toBe(403);
    expect(mockKV.get).toHaveBeenCalledWith("ip:1.2.3.4");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("allows request if IP is not in blocklist and returns CORS headers", async () => {
    mockKV.get.mockResolvedValue(null);
    const request = new Request("https://example.com/", {
      headers: { "cf-connecting-ip": "1.2.3.4", "X-Asguard-Ingest-Key": "ingest-key" },
    });

    const env = {
      ASGUARD_API_KEY: "secret-key",
      TELEMETRY_INGEST_KEY: "ingest-key",
      ASGUARD_BLACKLIST: mockKV as any,
      ASGUARD_TELEMETRY: mockTelemetryKV as any,
    };
    const ctx = { waitUntil: vi.fn() } as any;

    const response = await worker.fetch(request, env as any as Env, ctx);
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("accepts valid telemetry payload and returns CORS headers", async () => {
    mockKV.get.mockResolvedValue(null);
    const payload = {
      sourceIp: "192.168.1.1",
      timestamp: Date.now(),
      eventType: "signature_tampering",
      severity: "high",
    };

    const request = new Request("https://example.com/telemetry", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "cf-connecting-ip": "1.2.3.4", "X-Asguard-Ingest-Key": "ingest-key" },
    });
    // @ts-ignore
    request.cf = { country: "US", colo: "DFW" };

    const env = {
      ASGUARD_API_KEY: "secret-key",
      TELEMETRY_INGEST_KEY: "ingest-key",
      ASGUARD_BLACKLIST: mockKV as any,
      ASGUARD_TELEMETRY: mockTelemetryKV as any,
    };
    const ctx = { waitUntil: vi.fn() } as any;

    const response = await worker.fetch(request, env as any as Env, ctx);
    expect(response.status).toBe(202);
    expect(ctx.waitUntil).toHaveBeenCalled();
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("returns 202 immediately even if database logging bottlenecks", async () => {
    const payload = {
      sourceIp: "192.168.1.2",
      timestamp: Date.now(),
      eventType: "suspicious_activity",
      severity: "low",
    };

    const request = new Request("https://example.com/telemetry", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "cf-connecting-ip": "1.2.3.4", "X-Asguard-Ingest-Key": "ingest-key" },
    });

    const mockSlowTelemetryKV = {
      ...mockTelemetryKV,
      get: vi.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 6000))),
      put: vi.fn().mockResolvedValue(undefined),
    };

    const env = {
      ASGUARD_API_KEY: "secret-key",
      TELEMETRY_INGEST_KEY: "ingest-key",
      ASGUARD_BLACKLIST: mockKV as any,
      ASGUARD_TELEMETRY: mockSlowTelemetryKV as any,
    };
    const ctx = { waitUntil: vi.fn() } as any;

    const response = await worker.fetch(request, env as any as Env, ctx);
    expect(response.status).toBe(202);
    expect(ctx.waitUntil).toHaveBeenCalled();
  });

  it("rejects invalid telemetry payload and returns CORS headers", async () => {
    mockKV.get.mockResolvedValue(null);
    const payload = {
      sourceIp: "invalid-ip",
      timestamp: Date.now(),
      eventType: "unknown",
      severity: "high",
    };

    const request = new Request("https://example.com/telemetry", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "cf-connecting-ip": "1.2.3.4", "X-Asguard-Ingest-Key": "ingest-key" },
    });

    const env = {
      ASGUARD_API_KEY: "secret-key",
      TELEMETRY_INGEST_KEY: "ingest-key",
      ASGUARD_BLACKLIST: mockKV as any,
      ASGUARD_TELEMETRY: mockTelemetryKV as any,
    };
    const ctx = { waitUntil: vi.fn() } as any;

    const response = await worker.fetch(request, env as any as Env, ctx);
    expect(response.status).toBe(400);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
  it("rejects GET /telemetry without valid auth", async () => {
    const request = new Request("https://example.com/telemetry");
    const env = {
      ASGUARD_API_KEY: "secret-key",
      TELEMETRY_INGEST_KEY: "ingest-key",
      ASGUARD_BLACKLIST: mockKV as any,
      ASGUARD_TELEMETRY: mockTelemetryKV as any,
    };
    const ctx = { waitUntil: vi.fn() } as any;

    const response = await worker.fetch(request, env as any as Env, ctx);
    expect(response.status).toBe(401);
  });

  it("allows GET /telemetry with valid auth", async () => {
    mockTelemetryKV.get.mockResolvedValue([]);
    const request = new Request("https://example.com/telemetry", {
      headers: { "X-Asguard-Auth": "secret-key" },
    });
    const env = {
      ASGUARD_API_KEY: "secret-key",
      TELEMETRY_INGEST_KEY: "ingest-key",
      ASGUARD_BLACKLIST: mockKV as any,
      ASGUARD_TELEMETRY: mockTelemetryKV as any,
    };
    const ctx = { waitUntil: vi.fn() } as any;

    const response = await worker.fetch(request, env as any as Env, ctx);
    expect(response.status).toBe(200);
  });

  it("rejects GET /blocklist without valid auth", async () => {
    const request = new Request("https://example.com/blocklist");
    const env = {
      ASGUARD_API_KEY: "secret-key",
      TELEMETRY_INGEST_KEY: "ingest-key",
      ASGUARD_BLACKLIST: mockKV as any,
      ASGUARD_TELEMETRY: mockTelemetryKV as any,
    };
    const ctx = { waitUntil: vi.fn() } as any;

    const response = await worker.fetch(request, env as any as Env, ctx);
    expect(response.status).toBe(401);
  });

  it("allows GET /blocklist with valid auth", async () => {
    (mockKV as any).list = vi
      .fn()
      .mockResolvedValue({
        keys: [{ name: "ip:1.2.3.4", expiration: 1234567890 }, { name: "token:abc" }],
      });
    const request = new Request("https://example.com/blocklist", {
      headers: { "X-Asguard-Auth": "secret-key" },
    });
    const env = {
      ASGUARD_API_KEY: "secret-key",
      TELEMETRY_INGEST_KEY: "ingest-key",
      ASGUARD_BLACKLIST: mockKV as any,
      ASGUARD_TELEMETRY: mockTelemetryKV as any,
    };
    const ctx = { waitUntil: vi.fn() } as any;

    const response = await worker.fetch(request, env as any as Env, ctx);
    expect(response.status).toBe(200);
    const data = (await response.json()) as any;
    expect(data).toEqual([{ name: "ip:1.2.3.4", expiration: 1234567890 }, { name: "token:abc" }]);
  });

  it("handles POST /blocklist to block an IP", async () => {
    const request = new Request("https://example.com/blocklist", {
      method: "POST",
      headers: {
        "X-Asguard-Auth": "secret-key",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ key: "ip:10.0.0.1", action: "block" }),
    });
    const env = {
      ASGUARD_API_KEY: "secret-key",
      TELEMETRY_INGEST_KEY: "ingest-key",
      ASGUARD_BLACKLIST: mockKV as any,
      ASGUARD_TELEMETRY: mockTelemetryKV as any,
    };
    const ctx = { waitUntil: vi.fn() } as any;

    const response = await worker.fetch(request, env as any as Env, ctx);
    expect(response.status).toBe(200);
    expect(mockKV.put).toHaveBeenCalledWith("ip:10.0.0.1", "1", {
      expirationTtl: 86400,
    });
  });

  it("handles POST /blocklist to unblock an IP", async () => {
    const request = new Request("https://example.com/blocklist", {
      method: "POST",
      headers: {
        "X-Asguard-Auth": "secret-key",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ key: "ip:10.0.0.1", action: "unblock" }),
    });
    const env = {
      ASGUARD_API_KEY: "secret-key",
      TELEMETRY_INGEST_KEY: "ingest-key",
      ASGUARD_BLACKLIST: mockKV as any,
      ASGUARD_TELEMETRY: mockTelemetryKV as any,
    };
    const ctx = { waitUntil: vi.fn() } as any;

    const response = await worker.fetch(request, env as any as Env, ctx);
    expect(response.status).toBe(200);
    expect(mockKV.delete).toHaveBeenCalledWith("ip:10.0.0.1");
  });

  it("verifies that POST /blocklist with custom ttl successfully builds valid schema and processes", async () => {
    const request = new Request("https://example.com/blocklist", {
      method: "POST",
      headers: {
        "X-Asguard-Auth": "secret-key",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ key: "ip:10.0.0.2", action: "block", ttl: 3600 }),
    });
    const env = {
      ASGUARD_API_KEY: "secret-key",
      TELEMETRY_INGEST_KEY: "ingest-key",
      ASGUARD_BLACKLIST: mockKV as any,
      ASGUARD_TELEMETRY: mockTelemetryKV as any,
    };
    const ctx = { waitUntil: vi.fn() } as any;

    const response = await worker.fetch(request, env as any as Env, ctx);
    expect(response.status).toBe(200);
    expect(mockKV.put).toHaveBeenCalledWith("ip:10.0.0.2", "1", {
      expirationTtl: 3600,
    });

    // Check that telemetry put was called for audit
    expect(mockTelemetryKV.put).toHaveBeenCalled();
    const auditCallArgs = mockTelemetryKV.put.mock.calls.find((call) =>
      call[0].startsWith("audit:"),
    );
    expect(auditCallArgs).toBeDefined();
    if (auditCallArgs) {
      const payload = JSON.parse(auditCallArgs[1]);
      expect(payload.action).toBe("block");
      expect(payload.target).toBe("ip:10.0.0.2");
      expect(payload.ttl).toBe(3600);
    }
  });

  it("asserts that unauthenticated mutation dispatch triggers 401 Unauthorized without modifying state", async () => {
    const request = new Request("https://example.com/blocklist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "ip:10.0.0.3", action: "block" }),
    });
    const env = {
      ASGUARD_API_KEY: "secret-key",
      TELEMETRY_INGEST_KEY: "ingest-key",
      ASGUARD_BLACKLIST: mockKV as any,
      ASGUARD_TELEMETRY: mockTelemetryKV as any,
    };
    const ctx = { waitUntil: vi.fn() } as any;

    const response = await worker.fetch(request, env as any as Env, ctx);
    expect(response.status).toBe(401);
    expect(mockKV.put).not.toHaveBeenCalled();
    // we also want to test that telemetry put wasn't called for audit
    // but the previous test might have called it so mockTelemetryKV needs to be clear
    const auditCallArgs = mockTelemetryKV.put.mock.calls.find((call) =>
      call[0].startsWith("audit:"),
    );
    expect(auditCallArgs).toBeUndefined();
  });

  it("includes Server-Timing header with valid edge-exec duration", async () => {
    mockTelemetryKV.get.mockResolvedValue([]);
    const requestGet = new Request("https://example.com/telemetry", {
      headers: { "X-Asguard-Auth": "secret-key" },
    });
    const env = {
      ASGUARD_API_KEY: "secret-key",
      TELEMETRY_INGEST_KEY: "ingest-key",
      ASGUARD_BLACKLIST: mockKV as any,
      ASGUARD_TELEMETRY: mockTelemetryKV as any,
    };
    const ctx = { waitUntil: vi.fn() } as any;

    const responseGet = await worker.fetch(requestGet, env as any as Env, ctx);
    expect(responseGet.status).toBe(200);
    const serverTimingGet = responseGet.headers.get("Server-Timing");
    expect(serverTimingGet).toBeDefined();
    expect(serverTimingGet).toMatch(/edge-exec;dur=[0-9]+(\.[0-9]+)?;desc="Stateless Perimeter Check"/);

    const payload = {
      sourceIp: "192.168.1.1",
      timestamp: Date.now(),
      eventType: "signature_tampering",
      severity: "high",
    };

    const requestPost = new Request("https://example.com/telemetry", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "cf-connecting-ip": "1.2.3.4", "X-Asguard-Ingest-Key": "ingest-key" },
    });
    // @ts-ignore
    requestPost.cf = { country: "US", colo: "DFW" };

    const responsePost = await worker.fetch(requestPost, env as any as Env, ctx);
    expect(responsePost.status).toBe(202);
    const serverTimingPost = responsePost.headers.get("Server-Timing");
    expect(serverTimingPost).toBeDefined();
    expect(serverTimingPost).toMatch(/edge-exec;dur=[0-9]+(\.[0-9]+)?;desc="Stateless Perimeter Check"/);
  });


  it("handles POST /telemetry/client-error and returns 202 without interrupting edge routing", async () => {
    const payload = {
      message: "React render error",
      fileTrace: "app/component.tsx:12",
      timestamp: Date.now()
    };

    const request = new Request("https://example.com/telemetry/client-error", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "cf-connecting-ip": "1.2.3.4", "X-Asguard-Ingest-Key": "ingest-key" },
    });
    // @ts-ignore
    request.cf = { country: "US", colo: "DFW" };

    const env = {
      ASGUARD_API_KEY: "secret-key",
      TELEMETRY_INGEST_KEY: "ingest-key",
      ASGUARD_BLACKLIST: mockKV as any,
      ASGUARD_TELEMETRY: mockTelemetryKV as any,
    };
    const ctx = { waitUntil: vi.fn() } as any;

    const response = await worker.fetch(request, env as any as Env, ctx);
    expect(response.status).toBe(202);
    expect(ctx.waitUntil).toHaveBeenCalled();
  });



  it("asserts logToSupabase formats payload correctly and includes geo coords", async () => {
    const { logToSupabase } = await import('../src/telemetry.js');

    const payload = {
      sourceIp: "192.168.1.1",
      timestamp: Date.now(),
      eventType: "threat.blocked",
      severity: "critical" as any,
      actionTaken: "DROPPED" as any,
      targetVector: "API" as any,
      requestMethod: "POST",
      targetResource: "/api/login",
      correlationId: "corr-123",
      appOrigin: "axim-asguard" as any,
      details: {
        ruleMatches: ["SQLi"]
      }
    };

    const env = {
      SUPABASE_URL: "https://db.axim.us.com",
      AXIM_SERVICE_ROLE_KEY: "secret",
      TELEMETRY_FALLBACK_QUEUE: { put: vi.fn().mockResolvedValue(undefined) }
    };

    const ctx = {
      waitUntil: vi.fn(),
      request: {
        cf: {
          latitude: 37.7749,
          longitude: -122.4194,
          city: "San Francisco",
          country: "US",
          colo: "SFO"
        }
      }
    };

    let fetchBody = "";
    let fetchUrl = "";

    global.fetch = vi.fn().mockImplementation((url, options) => {
        fetchUrl = url;
        if (options && options.body) {
            fetchBody = options.body;
        }
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    });

    await logToSupabase(payload, env, ctx);

    // Allow promises to resolve
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(fetchUrl).toBe("https://db.axim.us.com/rest/v1/threat_events");
    const parsed = JSON.parse(fetchBody);

    expect(parsed.source_ip).toBeDefined();
    expect(parsed.verdict).toBe("block");
    expect(parsed.threat_type).toBe("API");
    expect(parsed.indicators).toEqual(["SQLi"]);
    expect(parsed.metadata.geo_lat).toBe(37.7749);
    expect(parsed.metadata.geo_lon).toBe(-122.4194);
    expect(parsed.metadata.geo_city).toBe("San Francisco");
  });



  it("executes POST /analysis successfully and returns 200 JSON", async () => {
    const payload = {
      sourceIp: "192.168.1.1",
      timestamp: Date.now(),
      eventType: "signature_tampering",
      severity: "high"
    };

    const mockResponse = {
      risk: "high",
      summary: "Signature tampering detected",
      recommendedActions: ["Block IP"],
      rationale: "Suspicious behavior"
    };

    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(mockResponse), {
       status: 200,
       headers: { "Content-Type": "application/json" }
    }));

    const request = new Request("https://example.com/analysis", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "X-Asguard-Auth": "secret-key", "Content-Type": "application/json" }
    });

    const env = {
      ASGUARD_API_KEY: "secret-key",
      DEEPSEEK_API_KEY: "ds-key",
      ASGUARD_BLACKLIST: mockKV as any,
      ASGUARD_TELEMETRY: mockTelemetryKV as any,
    };
    const ctx = { waitUntil: vi.fn() } as any;

    const response = await worker.fetch(request, env as any as Env, ctx);
    expect(response.status).toBe(200);
    const data = (await response.json()) as any;
    expect(data.risk).toBe("high");
    expect(response.headers.get("X-Asguard-Analysis-Provider")).toBe("deepseek");
  });

  it("falls back to Anthropic when DeepSeek returns recoverable HTTP 429", async () => {
    const payload = {
      sourceIp: "192.168.1.2",
      timestamp: Date.now(),
      eventType: "authentication_failure",
      severity: "critical"
    };

    const mockAnthropicResponse = {
      risk: "critical",
      summary: "Brute force attack",
      recommendedActions: ["Block immediately"],
      rationale: "High frequency login attempts"
    };

    // First call to deepseek returns 429, second call to anthropic returns 200
    global.fetch = vi.fn()
      .mockResolvedValueOnce(new Response("Rate limited", { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(mockAnthropicResponse), { status: 200, headers: { "Content-Type": "application/json" } }));

    const request = new Request("https://example.com/analysis", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "X-Asguard-Auth": "secret-key", "Content-Type": "application/json" }
    });

    const env = {
      ASGUARD_API_KEY: "secret-key",
      DEEPSEEK_API_KEY: "ds-key",
      ANTHROPIC_API_KEY: "anth-key",
      ASGUARD_BLACKLIST: mockKV as any,
      ASGUARD_TELEMETRY: mockTelemetryKV as any,
    };
    const ctx = { waitUntil: vi.fn() } as any;

    const response = await worker.fetch(request, env as any as Env, ctx);
    expect(response.status).toBe(200);
    const data = (await response.json()) as any;
    expect(data.risk).toBe("critical");
    expect(response.headers.get("X-Asguard-Analysis-Provider")).toBe("anthropic");
  });


  it("handles obfuscated XSS payloads correctly via threatEngine fallback", async () => {
    const payload = {
      sourceIp: "192.168.1.3",
      timestamp: Date.now(),
      eventType: "suspicious_activity",
      severity: "high",
      payload: "<script>alert(1)</script>"
    };

    global.fetch = vi.fn()
      .mockResolvedValueOnce(new Response("Gateway Timeout", { status: 504 }))
      .mockResolvedValueOnce(new Response("Gateway Timeout", { status: 504 }));

    const request = new Request("https://example.com/analysis", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "X-Asguard-Auth": "secret-key", "Content-Type": "application/json" }
    });

    const env = {
      ASGUARD_API_KEY: "secret-key",
      DEEPSEEK_API_KEY: "ds-key",
      ANTHROPIC_API_KEY: "anth-key",
      ASGUARD_BLACKLIST: mockKV as any,
      ASGUARD_TELEMETRY: mockTelemetryKV as any,
    };
    const ctx = { waitUntil: vi.fn() } as any;

    const response = await worker.fetch(request, env as any as Env, ctx);

    expect(response.status).toBe(200);
    const data = (await response.json()) as any;
    expect(data.risk).toBe("medium"); // Fallback defaults to medium
    expect(data.summary).toBe("Automated heuristic fallback triggered");
    expect(data.recommendedActions).toContain("Monitor IP");
  });

  it("enforces rate limiting behavior during sudden request spikes", async () => {
    const env = {
      ASGUARD_API_KEY: "secret-key",
      TELEMETRY_INGEST_KEY: "ingest-key",
      ASGUARD_BLACKLIST: mockKV as any,
      ASGUARD_TELEMETRY: mockTelemetryKV as any,
    };
    const ctx = { waitUntil: vi.fn() } as any;

    let response;
    for (let i = 0; i < 7; i++) {
      const request = new Request("https://example.com/telemetry/client-error", {
        method: "POST",
        body: JSON.stringify({ message: "test", timestamp: Date.now() }),
        headers: { "cf-connecting-ip": "1.2.3.99", "X-Asguard-Ingest-Key": "ingest-key" },
      });
      // @ts-ignore
      request.cf = { country: "US", colo: "DFW" };

      response = await worker.fetch(request, env as any as Env, ctx);
    }

    expect(response?.status).toBe(429);
    expect(await response?.text()).toBe("Too Many Requests");
  });

});
