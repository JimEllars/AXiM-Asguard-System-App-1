const fs = require('fs');
const file = 'asguard-interceptor/tests/interceptor.test.ts';
let content = fs.readFileSync(file, 'utf8');

// The tests for "POST /admin/anomaly/triage" need to assert the audit log writes correctly.

// Update block test
const blockTestSearch = `
      const blacklistRecord = await env.ASGUARD_BLACKLIST.get("ip:1.2.3.4");
      expect(blacklistRecord).toBe("1");

      const anomalyQueue = await env.ASGUARD_TELEMETRY.get("anomaly_queue");
      expect(anomalyQueue).toBeNull();
    });`;

const blockTestReplace = `
      const blacklistRecord = await env.ASGUARD_BLACKLIST.get("ip:1.2.3.4");
      expect(blacklistRecord).toBe("1");

      const anomalyQueue = await env.ASGUARD_TELEMETRY.get("anomaly_queue");
      expect(anomalyQueue).toBeNull();

      const auditCalls = customMockTelemetry.put.mock.calls.filter((c: any) => c[0].startsWith("audit:") && c[1].includes("onyx_anomaly_triaged"));
      expect(auditCalls.length).toBe(1);
      const auditPayload = JSON.parse(auditCalls[0][1]);
      expect(auditPayload.decision).toBe("block");
      expect(auditPayload.target).toBe("1.2.3.4");
      expect(auditPayload.authorizedByWallet).toBe("test_api_key_123");
    });`;

if (content.includes(blockTestSearch)) {
  content = content.replace(blockTestSearch, blockTestReplace);
} else {
  console.log("Could not find block test search string.");
}

// Update dismiss test
const dismissTestSearch = `
      const blacklistRecord = await env.ASGUARD_BLACKLIST.get("ip:5.5.5.5");
      expect(blacklistRecord).toBeNull(); // Ensure it didn't block
    });`;

const dismissTestReplace = `
      const blacklistRecord = await env.ASGUARD_BLACKLIST.get("ip:5.5.5.5");
      expect(blacklistRecord).toBeNull(); // Ensure it didn't block

      const auditCalls = customMockTelemetry.put.mock.calls.filter((c: any) => c[0].startsWith("audit:") && c[1].includes("onyx_anomaly_triaged"));
      expect(auditCalls.length).toBe(1);
      const auditPayload = JSON.parse(auditCalls[0][1]);
      expect(auditPayload.decision).toBe("dismiss");
      expect(auditPayload.target).toBe("5.5.5.5");
      expect(auditPayload.authorizedByWallet).toBe("sig123");
    });`;

if (content.includes(dismissTestSearch)) {
  content = content.replace(dismissTestSearch, dismissTestReplace);
} else {
  console.log("Could not find dismiss test search string.");
}

fs.writeFileSync(file, content, 'utf8');
console.log('Done patching tests');
