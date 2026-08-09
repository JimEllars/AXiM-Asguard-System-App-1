const fs = require('fs');
const file = 'asguard-interceptor/tests/interceptor.test.ts';
let code = fs.readFileSync(file, 'utf8');

const search = `  it("handles GET /health and returns ok for healthy bindings", async () => {
    const mockSuccessKV = {
      ...mockKV,
      get: vi.fn().mockResolvedValue(null)
    };
    const request = new Request("https://example.com/health", {
      method: "GET",
      headers: { "X-Asguard-Auth": "test-auth-key" },
    });

    const env = {
      ALLOWED_ORIGIN: 'https://production-domain.com',
      ASGUARD_API_KEY: "test-auth-key",
      ASGUARD_BLACKLIST: mockSuccessKV as any,
      ASGUARD_TELEMETRY: mockSuccessKV as any,
    };
    const ctx = { waitUntil: vi.fn() } as any;

    const response = await worker.fetch(request, env, ctx);
    expect(response.status).toBe(200);
    const body = await response.json() as any;
    expect(body.status).toBe("ok");
    expect(body.blacklist).toBe("ok");
    expect(body.telemetry).toBe("ok");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeDefined();
  });`;

const replace = `  it("handles GET /health and returns ok for healthy bindings", async () => {
    const mockSuccessKV = {
      ...mockKV,
      get: vi.fn().mockResolvedValue(null),
      list: vi.fn().mockResolvedValue({ keys: [] })
    };
    const request = new Request("https://example.com/health", {
      method: "GET",
      headers: { "X-Asguard-Auth": "test-auth-key" },
    });

    const env = {
      ALLOWED_ORIGIN: 'https://production-domain.com',
      ASGUARD_API_KEY: "test-auth-key",
      ASGUARD_BLACKLIST: mockSuccessKV as any,
      ASGUARD_TELEMETRY: mockSuccessKV as any,
    };
    const ctx = { waitUntil: vi.fn() } as any;

    const response = await worker.fetch(request, env, ctx);
    expect(response.status).toBe(200);
    const body = await response.json() as any;
    expect(body.status).toBe("ok");
    expect(body.blacklist).toBe("ok");
    expect(body.telemetry).toBe("ok");
    expect(body.globalThreatLevel).toBe("LOW");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeDefined();
  });

  it("handles GET /health and returns CRITICAL global threat level when AI threats are high", async () => {
    const mockCriticalKV = {
      ...mockKV,
      get: vi.fn().mockImplementation(async (key) => {
        if (key === "telemetry:summary:24h") {
          return JSON.stringify({ aiUnsafeCount24h: 15 });
        }
        return null;
      }),
      list: vi.fn().mockResolvedValue({ keys: [] })
    };

    const request = new Request("https://example.com/health", {
      method: "GET",
      headers: { "X-Asguard-Auth": "test-auth-key" },
    });

    const env = {
      ALLOWED_ORIGIN: 'https://production-domain.com',
      ASGUARD_API_KEY: "test-auth-key",
      ASGUARD_BLACKLIST: mockCriticalKV as any,
      ASGUARD_TELEMETRY: mockCriticalKV as any,
    };
    const ctx = { waitUntil: vi.fn() } as any;

    const response = await worker.fetch(request, env, ctx);
    const body = await response.json() as any;
    expect(body.globalThreatLevel).toBe("CRITICAL");
  });

  it("handles GET /health and returns HIGH global threat level when anomaly queue is populated", async () => {
    const mockHighKV = {
      ...mockKV,
      get: vi.fn().mockImplementation(async (key) => {
        if (key === "anomaly_queue") {
          return JSON.stringify([{ anomalyIp: "1.1.1.1", requestCount1h: 200, timestamp: Date.now() }]);
        }
        return null;
      }),
      list: vi.fn().mockResolvedValue({ keys: [] })
    };

    const request = new Request("https://example.com/health", {
      method: "GET",
      headers: { "X-Asguard-Auth": "test-auth-key" },
    });

    const env = {
      ALLOWED_ORIGIN: 'https://production-domain.com',
      ASGUARD_API_KEY: "test-auth-key",
      ASGUARD_BLACKLIST: mockHighKV as any,
      ASGUARD_TELEMETRY: mockHighKV as any,
    };
    const ctx = { waitUntil: vi.fn() } as any;

    const response = await worker.fetch(request, env, ctx);
    const body = await response.json() as any;
    expect(body.globalThreatLevel).toBe("HIGH");
  });`;

code = code.replace(search, replace);

fs.writeFileSync(file, code);
