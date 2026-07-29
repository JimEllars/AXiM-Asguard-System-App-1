const fs = require('fs');
const path = 'asguard-interceptor/tests/interceptor.test.ts';

let code = fs.readFileSync(path, 'utf8');

const regex = /describe\("Scheduled Handler", \(\) => \{[\s\S]*\}\);\n\}\);/;
const replacement = `describe("Scheduled Handler", () => {
    it("executes hourly scheduled event correctly", async () => {
      const env = {
        ASGUARD_API_KEY: "test-auth-key",
        ASGUARD_BLACKLIST: mockKV,
        ASGUARD_TELEMETRY: mockTelemetryKV,
      };
      const ctx = { waitUntil: vi.fn(p => p) };
      const event = { cron: "0 * * * *" }; // hourly

      (mockKV as any).list = vi.fn().mockResolvedValueOnce({ keys: [{ name: "expired-key", expiration: Date.now() / 1000 - 1000 }] });

      let promiseToWait;
      ctx.waitUntil = vi.fn(p => { promiseToWait = p; });
      await worker.scheduled(event, env as any, ctx as any);
      await promiseToWait;

      expect(mockKV.delete).toHaveBeenCalledWith("expired-key");

      const putCalls = mockTelemetryKV.put.mock.calls;
      const heartbeatCall = putCalls.find(c => c[0] === "system_health_heartbeat");
      expect(heartbeatCall).toBeDefined();
      const heartbeatPayload = JSON.parse(heartbeatCall[1]);
      expect(heartbeatPayload.eventType).toBe("cron_hourly_heartbeat");
      expect(heartbeatPayload.status).toBe("ok");
      expect(heartbeatPayload.cronSchedule).toBe("HOURLY");
      expect(heartbeatPayload.aiThreatCount24h).toBeUndefined(); // Should not be in hourly
    });

    it("executes daily scheduled event and handles threshold alerts", async () => {
      const env = {
        ASGUARD_API_KEY: "test-auth-key",
        ASGUARD_BLACKLIST: mockKV,
        ASGUARD_TELEMETRY: mockTelemetryKV,
        ASGUARD_ALERT_EMAIL: "admin@axim.local",
        RESEND_API_KEY: "test-resend"
      };
      const ctx = { waitUntil: vi.fn(p => p) };
      const event = { cron: "0 0 * * *" }; // daily

      (mockKV as any).list = vi.fn().mockResolvedValueOnce({ keys: [] });
      (mockTelemetryKV as any).list = vi.fn().mockResolvedValueOnce({ keys: [{ name: "dlq:123" }] });

      const now = Date.now();
      mockTelemetryKV.get.mockImplementation(async (key) => {
         if (key === "dlq:123") return JSON.stringify({ timestamp: now - 31 * 86400 * 1000 });
         if (key === "recent_events") {
             return JSON.stringify(Array(5).fill({ aiThreatFlag: true, timestamp: now - 1000 }));
         }
         return null;
      });

      let promiseToWait;
      ctx.waitUntil = vi.fn(p => { promiseToWait = p; });
      await worker.scheduled(event, env as any, ctx as any);
      await promiseToWait;

      expect(mockTelemetryKV.delete).toHaveBeenCalledWith("dlq:123");

      const putCalls = mockTelemetryKV.put.mock.calls;
      const heartbeatCall = putCalls.find(c => c[0] === "system_health_heartbeat");
      expect(heartbeatCall).toBeDefined();
      const heartbeatPayload = JSON.parse(heartbeatCall[1]);
      expect(heartbeatPayload.eventType).toBe("cron_daily_heartbeat");
      expect(heartbeatPayload.status).toBe("ok");
      expect(heartbeatPayload.cronSchedule).toBe("DAILY");
      expect(heartbeatPayload.aiThreatCount24h).toBe(5);

      // Verify the alert was dispatched to DLQ/Alerting via dispatchCriticalAlert
      // Since RESEND_API_KEY is present, it might try to fetch, which is mocked, but we can verify ASGUARD_TELEMETRY.put for the alert
      const alertCall = putCalls.find(c => c[0].startsWith("alert:"));
      expect(alertCall).toBeDefined();
      const alertPayload = JSON.parse(alertCall[1]);
      expect(alertPayload.eventType).toBe("ai_unsafe_threshold_exceeded");
      expect(alertPayload.severity).toBe("high");
    });
  });
});`;

code = code.replace(regex, replacement);

fs.writeFileSync(path, code);
console.log("Patched interceptor.test.ts");
