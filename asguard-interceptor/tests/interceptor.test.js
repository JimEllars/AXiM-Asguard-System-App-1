import { describe, it, expect, vi, beforeEach } from "vitest";
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
    delete: vi.fn(),
};
describe("Asguard Interceptor", () => {
    it("accepts valid telemetry payload with Web3 wallet address", async () => {
        mockKV.get.mockResolvedValue(null);
        const payload = {
            sourceIp: "192.168.1.1",
            timestamp: Date.now(),
            eventType: "signature_tampering",
            severity: "high",
            web3WalletAddress: "0x1234567890123456789012345678901234567890"
        };
        const request = new Request("https://example.com/telemetry", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Asguard-Auth": "test-auth-key",
            },
            body: JSON.stringify(payload),
        });
        const env = { ASGUARD_API_KEY: "test-auth-key", ASGUARD_BLACKLIST: mockKV, ASGUARD_TELEMETRY: mockTelemetryKV };
        const ctx = { waitUntil: vi.fn() };
        const response = await worker.fetch(request, env, ctx);
        expect(response.status).toBe(202);
        expect(ctx.waitUntil).toHaveBeenCalled();
    });
    it("rejects telemetry payload with invalid Web3 wallet address format", async () => {
        mockKV.get.mockResolvedValue(null);
        const payload = {
            sourceIp: "192.168.1.1",
            timestamp: Date.now(),
            eventType: "signature_tampering",
            severity: "high",
            web3WalletAddress: "0xINVALID123"
        };
        const request = new Request("https://example.com/telemetry", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Asguard-Auth": "test-auth-key",
            },
            body: JSON.stringify(payload),
        });
        const env = { ASGUARD_API_KEY: "test-auth-key", ASGUARD_BLACKLIST: mockKV, ASGUARD_TELEMETRY: mockTelemetryKV };
        const ctx = { waitUntil: vi.fn() };
        const response = await worker.fetch(request, env, ctx);
        expect(response.status).toBe(400);
    });
    beforeEach(() => {
        globalThis.caches = {
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
    it("should trigger client-error throttle circuit breaker returning 429", async () => {
        const env = { ALLOWED_ORIGIN: 'https://production-domain.com',
            ASGUARD_API_KEY: "test-auth-key",
            ASGUARD_BLACKLIST: mockKV,
            ASGUARD_TELEMETRY: mockTelemetryKV,
        };
        // Simulate 6 client-error requests
        const createReq = () => new Request("https://example.com/telemetry/client-error", {
            method: "POST",
            headers: { "cf-connecting-ip": "9.9.9.9" },
            body: JSON.stringify({ message: "test" })
        });
        const ctx = { waitUntil: vi.fn().mockImplementation((p) => p) };
        for (let i = 0; i < 5; i++) {
            const req = createReq();
            const res = await worker.fetch(req, env, ctx);
            expect(res.status).not.toBe(429);
        }
        const req = createReq();
        const res = await worker.fetch(req, env, ctx);
        expect(res.status).toBe(429);
    });
    it("blocks request instantly via KV ledger short-circuiting and returns 403", async () => {
        mockKV.get.mockResolvedValue("1");
        const request = new Request("https://example.com/", {
            headers: { "cf-connecting-ip": "1.2.3.4" },
        });
        const env = { ALLOWED_ORIGIN: 'https://production-domain.com',
            ASGUARD_API_KEY: "test-auth-key",
            ASGUARD_BLACKLIST: mockKV,
            ASGUARD_TELEMETRY: mockTelemetryKV,
        };
        const ctx = { waitUntil: vi.fn().mockImplementation((p) => p) };
        const startTime = Date.now();
        const response = await worker.fetch(request, env, ctx);
        const duration = Date.now() - startTime;
        expect(response.status).toBe(403);
        expect(mockKV.get).toHaveBeenCalledWith("ip:1.2.3.4");
        // Ensure we drop without calling downstream (rate limit is handled natively so we can't easily spy on map size without exporting it, but we can verify status)
    });
    it("handles OPTIONS preflight requests with CORS headers", async () => {
        const request = new Request("https://example.com/", {
            method: "OPTIONS",
        });
        const env = { ALLOWED_ORIGIN: 'https://production-domain.com',
            ASGUARD_API_KEY: "test-auth-key",
            ASGUARD_BLACKLIST: mockKV,
            ASGUARD_TELEMETRY: mockTelemetryKV,
        };
        const ctx = { waitUntil: vi.fn().mockImplementation((p) => p) };
        const response = await worker.fetch(request, env, ctx);
        expect(response.status).toBe(204);
        expect(response.headers.get("Access-Control-Allow-Origin")).toBeDefined();
        expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST, DELETE, OPTIONS");
    });
    it("blocks request if IP is in blocklist and returns CORS headers", async () => {
        mockKV.get.mockResolvedValue("blocked");
        const request = new Request("https://example.com/", {
            headers: { "cf-connecting-ip": "1.2.3.4" },
        });
        const env = { ALLOWED_ORIGIN: 'https://production-domain.com',
            ASGUARD_API_KEY: "test-auth-key",
            ASGUARD_BLACKLIST: mockKV,
            ASGUARD_TELEMETRY: mockTelemetryKV,
        };
        const ctx = { waitUntil: vi.fn().mockImplementation((p) => p) };
        const response = await worker.fetch(request, env, ctx);
        expect(response.status).toBe(403);
        expect(mockKV.get).toHaveBeenCalledWith("ip:1.2.3.4");
        expect(response.headers.get("Access-Control-Allow-Origin")).toBeDefined();
    });
    it("allows request if IP is not in blocklist and returns CORS headers", async () => {
        mockKV.get.mockResolvedValue(null);
        const request = new Request("https://example.com/", {
            headers: { "cf-connecting-ip": "1.2.3.4" },
        });
        const env = { ALLOWED_ORIGIN: 'https://production-domain.com',
            ASGUARD_API_KEY: "test-auth-key",
            ASGUARD_BLACKLIST: mockKV,
            ASGUARD_TELEMETRY: mockTelemetryKV,
        };
        const ctx = { waitUntil: vi.fn().mockImplementation((p) => p) };
        const response = await worker.fetch(request, env, ctx);
        expect(response.status).toBe(200);
        expect(response.headers.get("Access-Control-Allow-Origin")).toBeDefined();
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
            headers: { "cf-connecting-ip": "1.2.3.4" },
        });
        // @ts-ignore
        request.cf = { country: "US", colo: "DFW" };
        const env = { ALLOWED_ORIGIN: 'https://production-domain.com',
            ASGUARD_API_KEY: "test-auth-key",
            ASGUARD_BLACKLIST: mockKV,
            ASGUARD_TELEMETRY: mockTelemetryKV,
        };
        const ctx = { waitUntil: vi.fn().mockImplementation((p) => p) };
        const response = await worker.fetch(request, env, ctx);
        expect(response.status).toBe(202);
        expect(ctx.waitUntil).toHaveBeenCalled();
        expect(response.headers.get("Access-Control-Allow-Origin")).toBeDefined();
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
            headers: { "cf-connecting-ip": "1.2.3.4" },
        });
        const mockSlowTelemetryKV = {
            ...mockTelemetryKV,
            get: vi.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 6000))),
            put: vi.fn().mockResolvedValue(undefined),
        };
        const env = { ALLOWED_ORIGIN: 'https://production-domain.com',
            ASGUARD_API_KEY: "test-auth-key",
            ASGUARD_BLACKLIST: mockKV,
            ASGUARD_TELEMETRY: mockSlowTelemetryKV,
        };
        const ctx = { waitUntil: vi.fn().mockImplementation((p) => p) };
        const response = await worker.fetch(request, env, ctx);
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
            headers: { "cf-connecting-ip": "1.2.3.4" },
        });
        const env = { ALLOWED_ORIGIN: 'https://production-domain.com',
            ASGUARD_API_KEY: "test-auth-key",
            ASGUARD_BLACKLIST: mockKV,
            ASGUARD_TELEMETRY: mockTelemetryKV,
        };
        const ctx = { waitUntil: vi.fn().mockImplementation((p) => p) };
        const response = await worker.fetch(request, env, ctx);
        expect(response.status).toBe(400);
        expect(response.headers.get("Access-Control-Allow-Origin")).toBeDefined();
    });
    it("rejects GET /telemetry without valid auth", async () => {
        const request = new Request("https://example.com/telemetry");
        const env = { ALLOWED_ORIGIN: 'https://production-domain.com',
            ASGUARD_API_KEY: "test-auth-key",
            ASGUARD_BLACKLIST: mockKV,
            ASGUARD_TELEMETRY: mockTelemetryKV,
        };
        const ctx = { waitUntil: vi.fn().mockImplementation((p) => p) };
        const response = await worker.fetch(request, env, ctx);
        expect(response.status).toBe(401);
    });
    it("allows GET /telemetry with valid auth", async () => {
        mockTelemetryKV.get.mockResolvedValue([]);
        const request = new Request("https://example.com/telemetry", {
            headers: { "X-Asguard-Auth": "test-auth-key" },
        });
        const env = { ALLOWED_ORIGIN: 'https://production-domain.com',
            ASGUARD_API_KEY: "test-auth-key",
            ASGUARD_BLACKLIST: mockKV,
            ASGUARD_TELEMETRY: mockTelemetryKV,
        };
        const ctx = { waitUntil: vi.fn().mockImplementation((p) => p) };
        const response = await worker.fetch(request, env, ctx);
        expect(response.status).toBe(200);
    });
    it("rejects GET /blocklist without valid auth", async () => {
        const request = new Request("https://example.com/blocklist");
        const env = { ALLOWED_ORIGIN: 'https://production-domain.com',
            ASGUARD_API_KEY: "test-auth-key",
            ASGUARD_BLACKLIST: mockKV,
            ASGUARD_TELEMETRY: mockTelemetryKV,
        };
        const ctx = { waitUntil: vi.fn().mockImplementation((p) => p) };
        const response = await worker.fetch(request, env, ctx);
        expect(response.status).toBe(401);
    });
    it("allows GET /blocklist with valid auth", async () => {
        mockKV.list = vi
            .fn()
            .mockResolvedValue({
            keys: [{ name: "ip:1.2.3.4", expiration: 1234567890 }, { name: "token:abc" }],
        });
        const request = new Request("https://example.com/blocklist", {
            headers: { "X-Asguard-Auth": "test-auth-key" },
        });
        const env = { ALLOWED_ORIGIN: 'https://production-domain.com',
            ASGUARD_API_KEY: "test-auth-key",
            ASGUARD_BLACKLIST: mockKV,
            ASGUARD_TELEMETRY: mockTelemetryKV,
        };
        const ctx = { waitUntil: vi.fn().mockImplementation((p) => p) };
        const response = await worker.fetch(request, env, ctx);
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data).toEqual([{ name: "ip:1.2.3.4", expiration: 1234567890 }, { name: "token:abc" }]);
    });
    it("handles POST /blocklist to block an IP", async () => {
        const request = new Request("https://example.com/blocklist", {
            method: "POST",
            headers: {
                "X-Asguard-Auth": "test-auth-key",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ key: "ip:10.0.0.1", action: "block" }),
        });
        const env = { ALLOWED_ORIGIN: 'https://production-domain.com',
            ASGUARD_API_KEY: "test-auth-key",
            ASGUARD_BLACKLIST: mockKV,
            ASGUARD_TELEMETRY: mockTelemetryKV,
        };
        const ctx = { waitUntil: vi.fn().mockImplementation((p) => p) };
        const response = await worker.fetch(request, env, ctx);
        expect(response.status).toBe(200);
        expect(mockKV.put).toHaveBeenCalledWith("ip:10.0.0.1", "1", {
            expirationTtl: 86400,
        });
    });
    it("handles POST /blocklist to unblock an IP", async () => {
        const request = new Request("https://example.com/blocklist", {
            method: "POST",
            headers: {
                "X-Asguard-Auth": "test-auth-key",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ key: "ip:10.0.0.1", action: "unblock" }),
        });
        const env = { ALLOWED_ORIGIN: 'https://production-domain.com',
            ASGUARD_API_KEY: "test-auth-key",
            ASGUARD_BLACKLIST: mockKV,
            ASGUARD_TELEMETRY: mockTelemetryKV,
        };
        const ctx = { waitUntil: vi.fn().mockImplementation((p) => p) };
        const response = await worker.fetch(request, env, ctx);
        expect(response.status).toBe(200);
        expect(mockKV.delete).toHaveBeenCalledWith("ip:10.0.0.1");
    });
    it("verifies that POST /blocklist with custom ttl successfully builds valid schema and processes", async () => {
        const request = new Request("https://example.com/blocklist", {
            method: "POST",
            headers: {
                "X-Asguard-Auth": "test-auth-key",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ key: "ip:10.0.0.2", action: "block", ttl: 3600 }),
        });
        const env = { ALLOWED_ORIGIN: 'https://production-domain.com',
            ASGUARD_API_KEY: "test-auth-key",
            ASGUARD_BLACKLIST: mockKV,
            ASGUARD_TELEMETRY: mockTelemetryKV,
        };
        const ctx = { waitUntil: vi.fn().mockImplementation((p) => p) };
        const response = await worker.fetch(request, env, ctx);
        expect(response.status).toBe(200);
        expect(mockKV.put).toHaveBeenCalledWith("ip:10.0.0.2", "1", {
            expirationTtl: 3600,
        });
        // Check that telemetry put was called for audit
        expect(mockTelemetryKV.put).toHaveBeenCalled();
        const auditCallArgs = mockTelemetryKV.put.mock.calls.find((call) => call[0].startsWith("audit:"));
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
        const env = { ALLOWED_ORIGIN: 'https://production-domain.com',
            ASGUARD_API_KEY: "test-auth-key",
            ASGUARD_BLACKLIST: mockKV,
            ASGUARD_TELEMETRY: mockTelemetryKV,
        };
        const ctx = { waitUntil: vi.fn().mockImplementation((p) => p) };
        const response = await worker.fetch(request, env, ctx);
        expect(response.status).toBe(401);
        expect(mockKV.put).not.toHaveBeenCalled();
        // we also want to test that telemetry put wasn't called for audit
        // but the previous test might have called it so mockTelemetryKV needs to be clear
        const auditCallArgs = mockTelemetryKV.put.mock.calls.find((call) => call[0].startsWith("audit:"));
        expect(auditCallArgs).toBeUndefined();
    });
    it("includes Server-Timing header with valid edge-exec duration", async () => {
        mockTelemetryKV.get.mockResolvedValue([]);
        const requestGet = new Request("https://example.com/telemetry", {
            headers: { "X-Asguard-Auth": "test-auth-key" },
        });
        const env = { ALLOWED_ORIGIN: 'https://production-domain.com',
            ASGUARD_API_KEY: "test-auth-key",
            ASGUARD_BLACKLIST: mockKV,
            ASGUARD_TELEMETRY: mockTelemetryKV,
        };
        const ctx = { waitUntil: vi.fn().mockImplementation((p) => p) };
        const responseGet = await worker.fetch(requestGet, env, ctx);
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
            headers: { "cf-connecting-ip": "1.2.3.4" },
        });
        // @ts-ignore
        requestPost.cf = { country: "US", colo: "DFW" };
        const responsePost = await worker.fetch(requestPost, env, ctx);
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
            headers: { "cf-connecting-ip": "1.2.3.4" },
        });
        // @ts-ignore
        request.cf = { country: "US", colo: "DFW" };
        const env = { ALLOWED_ORIGIN: 'https://production-domain.com',
            ASGUARD_API_KEY: "test-auth-key",
            ASGUARD_BLACKLIST: mockKV,
            ASGUARD_TELEMETRY: mockTelemetryKV,
        };
        const ctx = { waitUntil: vi.fn().mockImplementation((p) => p) };
        const response = await worker.fetch(request, env, ctx);
        expect(response.status).toBe(202);
        expect(ctx.waitUntil).toHaveBeenCalled();
    });
    it("handles GET /health and returns ok for healthy bindings", async () => {
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
            ASGUARD_BLACKLIST: mockSuccessKV,
            ASGUARD_TELEMETRY: mockSuccessKV,
        };
        const ctx = { waitUntil: vi.fn() };
        const response = await worker.fetch(request, env, ctx);
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.status).toBe("ok");
        expect(body.blacklist).toBe("ok");
        expect(body.telemetry).toBe("ok");
        expect(response.headers.get("Access-Control-Allow-Origin")).toBeDefined();
    });
    it("handles GET /health and returns degraded for failed bindings", async () => {
        const mockFailedKV = {
            ...mockKV,
            get: vi.fn().mockImplementation(async (key) => {
                if (key === "health-check-key") {
                    throw new Error("KV Storage Timeout Connection Failure");
                }
                return null;
            }),
        };
        const request = new Request("https://example.com/health", {
            method: "GET",
            headers: { "X-Asguard-Auth": "test-auth-key" },
        });
        const env = {
            ALLOWED_ORIGIN: 'https://production-domain.com',
            ASGUARD_API_KEY: "test-auth-key",
            ASGUARD_BLACKLIST: mockFailedKV,
            ASGUARD_TELEMETRY: mockFailedKV,
        };
        const ctx = { waitUntil: vi.fn() };
        const response = await worker.fetch(request, env, ctx);
        expect(response.status).toBe(500);
        const body = await response.json();
        expect(body.status).toBe("degraded");
        expect(body.error).toContain("ASGUARD_BLACKLIST");
    });
    it("rejects illegal CORS origin on mutations and preflight, but allows matching origin array and subdomains", async () => {
        const env = {
            ALLOWED_ORIGIN: 'https://production-domain.com,https://app.production-domain.com',
            ASGUARD_API_KEY: "test-auth-key",
            ASGUARD_BLACKLIST: mockKV,
            ASGUARD_TELEMETRY: mockTelemetryKV,
        };
        const ctx = { waitUntil: vi.fn() };
        const illegalOptions = new Request("https://example.com/blocklist", {
            method: "OPTIONS",
            headers: { "Origin": "https://hacker.com" }
        });
        const illegalOptionsResponse = await worker.fetch(illegalOptions, env, ctx);
        expect(illegalOptionsResponse.status).toBe(403);
        const illegalPost = new Request("https://example.com/blocklist", {
            method: "POST",
            headers: { "Origin": "https://hacker.com", "X-Asguard-Auth": "test-auth-key", "Content-Type": "application/json" },
            body: JSON.stringify({ key: "test", action: "block" })
        });
        const illegalPostResponse = await worker.fetch(illegalPost, env, ctx);
        expect(illegalPostResponse.status).toBe(403);
        const legalOptions = new Request("https://example.com/blocklist", {
            method: "OPTIONS",
            headers: { "Origin": "https://production-domain.com" }
        });
        const legalOptionsResponse = await worker.fetch(legalOptions, env, ctx);
        expect(legalOptionsResponse.status).toBe(204);
        expect(legalOptionsResponse.headers.get("Access-Control-Allow-Origin")).toBe("https://production-domain.com");
        const legalOptionsMulti = new Request("https://example.com/blocklist", {
            method: "OPTIONS",
            headers: { "Origin": "https://app.production-domain.com" }
        });
        const legalOptionsMultiResponse = await worker.fetch(legalOptionsMulti, env, ctx);
        expect(legalOptionsMultiResponse.status).toBe(204);
        expect(legalOptionsMultiResponse.headers.get("Access-Control-Allow-Origin")).toBe("https://app.production-domain.com");
    });
    it("should process authenticated POST /dlq/replay by logging telemetry and dropping the KV record", async () => {
        const env = { ALLOWED_ORIGIN: 'https://production-domain.com',
            ASGUARD_API_KEY: "test-auth-key",
            ASGUARD_BLACKLIST: mockKV,
            ASGUARD_TELEMETRY: mockTelemetryKV,
        };
        const req = new Request("https://example.com/dlq/replay", {
            method: "POST",
            headers: { "X-Asguard-Auth": "test-auth-key" },
            body: JSON.stringify({ id: "dlq-12345" })
        });
        const ctx = { waitUntil: vi.fn().mockImplementation(p => p) };
        const res = await worker.fetch(req, env, ctx);
        // allow microtasks to flush
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(res.status).toBe(200);
        expect(mockTelemetryKV.put).toHaveBeenCalledWith(expect.stringMatching(/^audit:\d+$/), expect.stringContaining('"action":"dlq_replay"'));
        expect(mockTelemetryKV.delete).toHaveBeenCalledWith("dlq:12345");
    });
    it("Task 1: Enforce Multi-Vector Wallet Blacklisting - blocks when wallet is blacklisted", async () => {
        mockKV.get.mockImplementation(async (key) => {
            if (key === "wallet:0x9999999999999999999999999999999999999999")
                return "1";
            return null;
        });
        const bodyData = JSON.stringify({
            sourceIp: "127.0.0.1",
            timestamp: Date.now(),
            eventType: "suspicious_activity",
            severity: "medium",
            web3WalletAddress: "0x9999999999999999999999999999999999999999"
        });
        const request = new Request("https://production-domain.com/telemetry", {
            method: "POST",
            headers: { "Origin": "https://production-domain.com", "Content-Type": "application/json", "Content-Length": bodyData.length.toString() },
            body: bodyData
        });
        const env = { ALLOWED_ORIGIN: 'https://production-domain.com',
            ASGUARD_API_KEY: "test-auth-key",
            ASGUARD_BLACKLIST: mockKV,
            ASGUARD_TELEMETRY: mockTelemetryKV,
        };
        const ctx = { waitUntil: vi.fn().mockImplementation((p) => p) };
        const res = await worker.fetch(request, env, ctx);
        expect(res.status).toBe(403);
    });
});
//# sourceMappingURL=interceptor.test.js.map