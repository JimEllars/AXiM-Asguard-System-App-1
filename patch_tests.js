const fs = require('fs');
const file = 'asguard-interceptor/tests/interceptor.test.ts';
let code = fs.readFileSync(file, 'utf8');

const targetStr = `  describe("DELETE /dlq", () => {`;
const insertStr = `  describe("GET /dlq", () => {
    it("returns active items when view is omitted or active", async () => {
      const env = { ASGUARD_API_KEY: "test-auth-key", ASGUARD_AI_MUTATION_KEY: "test-ai-mutation-key", ASGUARD_BLACKLIST: mockKV as any, ASGUARD_TELEMETRY: mockTelemetryKV as any };
      const ctx = { waitUntil: vi.fn() } as any;

      mockTelemetryKV.list.mockResolvedValueOnce({ keys: [{ name: "dlq:1" }, { name: "dlq:2" }] });
      mockTelemetryKV.get.mockResolvedValueOnce(JSON.stringify({ status: "active", id: "1" }));
      mockTelemetryKV.get.mockResolvedValueOnce(JSON.stringify({ status: "quarantined", id: "2" }));

      const request = new Request("https://asguard.local/dlq", {
        headers: { "X-Asguard-Auth": "test-auth-key" }
      });
      const response = await worker.fetch(request, env as any, ctx as any);
      expect(response.status).toBe(200);
      const data = await (response as any).json();
      expect(data.length).toBe(1);
      expect(data[0].id).toBe("1");
    });

    it("returns quarantined items when view is quarantined", async () => {
      const env = { ASGUARD_API_KEY: "test-auth-key", ASGUARD_AI_MUTATION_KEY: "test-ai-mutation-key", ASGUARD_BLACKLIST: mockKV as any, ASGUARD_TELEMETRY: mockTelemetryKV as any };
      const ctx = { waitUntil: vi.fn() } as any;

      mockTelemetryKV.list.mockResolvedValueOnce({ keys: [{ name: "dlq:1" }, { name: "dlq:2" }] });
      mockTelemetryKV.get.mockResolvedValueOnce(JSON.stringify({ status: "active", id: "1" }));
      mockTelemetryKV.get.mockResolvedValueOnce(JSON.stringify({ status: "quarantined", id: "2" }));

      const request = new Request("https://asguard.local/dlq?view=quarantined", {
        headers: { "X-Asguard-Auth": "test-auth-key" }
      });
      const response = await worker.fetch(request, env as any, ctx as any);
      expect(response.status).toBe(200);
      const data = await (response as any).json();
      expect(data.length).toBe(1);
      expect(data[0].id).toBe("2");
    });
  });

  describe("DELETE /dlq", () => {`;

code = code.replace(targetStr, insertStr);
fs.writeFileSync(file, code);
