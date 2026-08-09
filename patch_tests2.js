const fs = require('fs');
const file = 'asguard-interceptor/tests/interceptor.test.ts';
let code = fs.readFileSync(file, 'utf8');

const oldAssertAnomaly = `      const anomalyCall = putCalls.find(c => c[0] === "anomaly_queue");
      expect(anomalyCall).toBeDefined();
      const anomalyPayload = JSON.parse(anomalyCall[1]);
      expect(anomalyPayload.anomalyIp).toBe("192.168.1.100");
      expect(anomalyPayload.requestCount1h).toBe(105);
      expect(anomalyPayload.status).toBe("pending_onyx_triage");`;

const newAssertAnomaly = `      const anomalyCall = putCalls.find(c => c[0] === "anomaly_queue");
      expect(anomalyCall).toBeDefined();
      const anomalyPayloadArray = JSON.parse(anomalyCall[1]);
      expect(Array.isArray(anomalyPayloadArray)).toBe(true);
      expect(anomalyPayloadArray.length).toBe(1);
      const anomalyPayload = anomalyPayloadArray[0];
      expect(anomalyPayload.anomalyIp).toBe("192.168.1.100");
      expect(anomalyPayload.requestCount1h).toBe(105);
      expect(anomalyPayload.status).toBe("pending_onyx_triage");`;

code = code.replace(oldAssertAnomaly, newAssertAnomaly);
fs.writeFileSync(file, code);
