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
};
describe("Asguard Interceptor", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    it("blocks request instantly via KV ledger short-circuiting and returns 403", async () => {
        mockKV.get.mockResolvedValue("1");
        const request = new Request("https://example.com/", {
            headers: { "cf-connecting-ip": "1.2.3.4" },
        });
        const env = {
            ASGUARD_API_KEY: "secret-key",
            ASGUARD_BLACKLIST: mockKV,
            ASGUARD_TELEMETRY: mockTelemetryKV,
        };
        const ctx = { waitUntil: vi.fn() };
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
        const env = {
            ASGUARD_API_KEY: "secret-key",
            ASGUARD_BLACKLIST: mockKV,
            ASGUARD_TELEMETRY: mockTelemetryKV,
        };
        const ctx = { waitUntil: vi.fn() };
        const response = await worker.fetch(request, env, ctx);
        expect(response.status).toBe(204);
        expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
        expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST, OPTIONS");
    });
    it("blocks request if IP is in blocklist and returns CORS headers", async () => {
        mockKV.get.mockResolvedValue("blocked");
        const request = new Request("https://example.com/", {
            headers: { "cf-connecting-ip": "1.2.3.4" },
        });
        const env = {
            ASGUARD_API_KEY: "secret-key",
            ASGUARD_BLACKLIST: mockKV,
            ASGUARD_TELEMETRY: mockTelemetryKV,
        };
        const ctx = { waitUntil: vi.fn() };
        const response = await worker.fetch(request, env, ctx);
        expect(response.status).toBe(403);
        expect(mockKV.get).toHaveBeenCalledWith("ip:1.2.3.4");
        expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });
    it("allows request if IP is not in blocklist and returns CORS headers", async () => {
        mockKV.get.mockResolvedValue(null);
        const request = new Request("https://example.com/", {
            headers: { "cf-connecting-ip": "1.2.3.4" },
        });
        const env = {
            ASGUARD_API_KEY: "secret-key",
            ASGUARD_BLACKLIST: mockKV,
            ASGUARD_TELEMETRY: mockTelemetryKV,
        };
        const ctx = { waitUntil: vi.fn() };
        const response = await worker.fetch(request, env, ctx);
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
            headers: { "cf-connecting-ip": "1.2.3.4" },
        });
        // @ts-ignore
        request.cf = { country: "US", colo: "DFW" };
        const env = {
            ASGUARD_API_KEY: "secret-key",
            ASGUARD_BLACKLIST: mockKV,
            ASGUARD_TELEMETRY: mockTelemetryKV,
        };
        const ctx = { waitUntil: vi.fn() };
        const response = await worker.fetch(request, env, ctx);
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
            headers: { "cf-connecting-ip": "1.2.3.4" },
        });
        const mockSlowTelemetryKV = {
            ...mockTelemetryKV,
            get: vi.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 6000))),
            put: vi.fn().mockResolvedValue(undefined),
        };
        const env = {
            ASGUARD_API_KEY: "secret-key",
            ASGUARD_BLACKLIST: mockKV,
            ASGUARD_TELEMETRY: mockSlowTelemetryKV,
        };
        const ctx = { waitUntil: vi.fn() };
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
        const env = {
            ASGUARD_API_KEY: "secret-key",
            ASGUARD_BLACKLIST: mockKV,
            ASGUARD_TELEMETRY: mockTelemetryKV,
        };
        const ctx = { waitUntil: vi.fn() };
        const response = await worker.fetch(request, env, ctx);
        expect(response.status).toBe(400);
        expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });
    it("rejects GET /telemetry without valid auth", async () => {
        const request = new Request("https://example.com/telemetry");
        const env = {
            ASGUARD_API_KEY: "secret-key",
            ASGUARD_BLACKLIST: mockKV,
            ASGUARD_TELEMETRY: mockTelemetryKV,
        };
        const ctx = { waitUntil: vi.fn() };
        const response = await worker.fetch(request, env, ctx);
        expect(response.status).toBe(401);
    });
    it("allows GET /telemetry with valid auth", async () => {
        mockTelemetryKV.get.mockResolvedValue([]);
        const request = new Request("https://example.com/telemetry", {
            headers: { "X-Asguard-Auth": "secret-key" },
        });
        const env = {
            ASGUARD_API_KEY: "secret-key",
            ASGUARD_BLACKLIST: mockKV,
            ASGUARD_TELEMETRY: mockTelemetryKV,
        };
        const ctx = { waitUntil: vi.fn() };
        const response = await worker.fetch(request, env, ctx);
        expect(response.status).toBe(200);
    });
    it("rejects GET /blocklist without valid auth", async () => {
        const request = new Request("https://example.com/blocklist");
        const env = {
            ASGUARD_API_KEY: "secret-key",
            ASGUARD_BLACKLIST: mockKV,
            ASGUARD_TELEMETRY: mockTelemetryKV,
        };
        const ctx = { waitUntil: vi.fn() };
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
            headers: { "X-Asguard-Auth": "secret-key" },
        });
        const env = {
            ASGUARD_API_KEY: "secret-key",
            ASGUARD_BLACKLIST: mockKV,
            ASGUARD_TELEMETRY: mockTelemetryKV,
        };
        const ctx = { waitUntil: vi.fn() };
        const response = await worker.fetch(request, env, ctx);
        expect(response.status).toBe(200);
        const data = await response.json();
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
            ASGUARD_BLACKLIST: mockKV,
            ASGUARD_TELEMETRY: mockTelemetryKV,
        };
        const ctx = { waitUntil: vi.fn() };
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
                "X-Asguard-Auth": "secret-key",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ key: "ip:10.0.0.1", action: "unblock" }),
        });
        const env = {
            ASGUARD_API_KEY: "secret-key",
            ASGUARD_BLACKLIST: mockKV,
            ASGUARD_TELEMETRY: mockTelemetryKV,
        };
        const ctx = { waitUntil: vi.fn() };
        const response = await worker.fetch(request, env, ctx);
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
            ASGUARD_BLACKLIST: mockKV,
            ASGUARD_TELEMETRY: mockTelemetryKV,
        };
        const ctx = { waitUntil: vi.fn() };
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
        const env = {
            ASGUARD_API_KEY: "secret-key",
            ASGUARD_BLACKLIST: mockKV,
            ASGUARD_TELEMETRY: mockTelemetryKV,
        };
        const ctx = { waitUntil: vi.fn() };
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
            headers: { "X-Asguard-Auth": "secret-key" },
        });
        const env = {
            ASGUARD_API_KEY: "secret-key",
            ASGUARD_BLACKLIST: mockKV,
            ASGUARD_TELEMETRY: mockTelemetryKV,
        };
        const ctx = { waitUntil: vi.fn() };
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
        const env = {
            ASGUARD_API_KEY: "secret-key",
            ASGUARD_BLACKLIST: mockKV,
            ASGUARD_TELEMETRY: mockTelemetryKV,
        };
        const ctx = { waitUntil: vi.fn() };
        const response = await worker.fetch(request, env, ctx);
        expect(response.status).toBe(202);
        expect(ctx.waitUntil).toHaveBeenCalled();
    });
});
//# sourceMappingURL=interceptor.test.js.map