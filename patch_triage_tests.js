const fs = require('fs');
const file = 'asguard-interceptor/tests/interceptor.test.ts';
let code = fs.readFileSync(file, 'utf8');

const newTriageTests = `
    it("returns 200 OK and batch blocks ALL IPs when action is block", async () => {
      let memoryStore = new Map<string, string>();
      const customMockKV = {
        get: vi.fn(async (key: string) => memoryStore.get(key) || null),
        put: vi.fn(async (key: string, val: string) => { memoryStore.set(key, val); }),
        delete: vi.fn(async (key: string) => { memoryStore.delete(key); }),
      };
      const customMockTelemetry = {
        get: vi.fn(async (key: string) => memoryStore.get(key) || null),
        put: vi.fn(async (key: string, val: string) => { memoryStore.set(key, val); }),
        delete: vi.fn(async (key: string) => { memoryStore.delete(key); }),
      };

      const env = { ASGUARD_API_KEY: "test_api_key_123", ASGUARD_BLACKLIST: customMockKV as any, ASGUARD_TELEMETRY: customMockTelemetry as any };
      const ctx = { waitUntil: vi.fn() } as any;

      // Stage queue with 2 IPs
      await env.ASGUARD_TELEMETRY.put("anomaly_queue", JSON.stringify([
         { anomalyIp: "10.0.0.1", requestCount1h: 120, timestamp: Date.now(), status: "pending_onyx_triage" },
         { anomalyIp: "10.0.0.2", requestCount1h: 150, timestamp: Date.now(), status: "pending_onyx_triage" }
      ]));

      const req = new Request("https://asguard.local/admin/anomaly/triage", {
        method: "POST",
        headers: { "X-Asguard-Auth": "test_api_key_123" },
        body: JSON.stringify({ ip: "ALL", action: "block" }),
      });
      const res = await worker.fetch(req, env as unknown as any, ctx as ExecutionContext);
      expect(res.status).toBe(200);

      const resBody: any = await res.json();
      expect(resBody.count).toBe(2);

      const b1 = await env.ASGUARD_BLACKLIST.get("ip:10.0.0.1");
      const b2 = await env.ASGUARD_BLACKLIST.get("ip:10.0.0.2");
      expect(b1).toBe("1");
      expect(b2).toBe("1");

      const anomalyQueue = await env.ASGUARD_TELEMETRY.get("anomaly_queue");
      expect(anomalyQueue).toBeNull();
    });
`;

// Insert the new test right before the existing "returns 200 OK and blocks IP when action is block" test
code = code.replace(`it("returns 200 OK and blocks IP when action is block", async () => {`, newTriageTests + `\n    it("returns 200 OK and blocks IP when action is block", async () => {`);
fs.writeFileSync(file, code);
