const fs = require('fs');
const file = 'asguard-interceptor/src/index.ts';
let code = fs.readFileSync(file, 'utf8');

const search = `
      try {
        const [_, __, heartbeatRaw, summaryRaw, anomalyQueueRaw] = await Promise.all([
          env.ASGUARD_BLACKLIST.get("health-check-key").catch(e => { throw new Error("ASGUARD_BLACKLIST failed") }),
          env.ASGUARD_TELEMETRY.get("health-check-key").catch(e => { throw new Error("ASGUARD_TELEMETRY failed") }),
          env.ASGUARD_TELEMETRY.get("system_health_heartbeat"),
          env.ASGUARD_TELEMETRY.get("telemetry:summary:24h"),
          env.ASGUARD_TELEMETRY.get("anomaly_queue")
        ]);
`;
const replace = `
      try {
        const [_, __, heartbeatRaw, summaryRaw, anomalyQueueRaw, blacklistList] = await Promise.all([
          env.ASGUARD_BLACKLIST.get("health-check-key").catch(e => { throw new Error("ASGUARD_BLACKLIST failed") }),
          env.ASGUARD_TELEMETRY.get("health-check-key").catch(e => { throw new Error("ASGUARD_TELEMETRY failed") }),
          env.ASGUARD_TELEMETRY.get("system_health_heartbeat"),
          env.ASGUARD_TELEMETRY.get("telemetry:summary:24h"),
          env.ASGUARD_TELEMETRY.get("anomaly_queue"),
          env.ASGUARD_BLACKLIST.list({ limit: 1000 }).catch(e => ({ keys: [] }))
        ]);
`;

code = code.replace(search, replace);

const search2 = `
        return new Response(JSON.stringify({
          status: "ok",
          blacklist: "ok",
          telemetry: "ok",
          rateLimitSize: rateLimitMap.size,
          penaltyLedgerSize: penaltyLedger.size,
          lastHeartbeat,
          heartbeatDetails: fullHeartbeat,
          telemetrySummary,
          anomaly_queue,
          timestamp: Date.now()
        }), {
`;
const replace2 = `
        const aiUnsafeCount24h = telemetrySummary?.aiUnsafeCount24h || 0;
        const activeBlocklistCount = blacklistList.keys.length;
        const anomalyQueueLength = anomaly_queue ? anomaly_queue.length : 0;

        let globalThreatLevel = "LOW";
        if (aiUnsafeCount24h >= 10 || anomalyQueueLength >= 5) {
            globalThreatLevel = "CRITICAL";
        } else if (aiUnsafeCount24h >= 5 || anomalyQueueLength >= 1) {
            globalThreatLevel = "HIGH";
        } else if (activeBlocklistCount >= 10 || aiUnsafeCount24h >= 1) {
            globalThreatLevel = "ELEVATED";
        }

        return new Response(JSON.stringify({
          status: "ok",
          blacklist: "ok",
          telemetry: "ok",
          rateLimitSize: rateLimitMap.size,
          penaltyLedgerSize: penaltyLedger.size,
          lastHeartbeat,
          heartbeatDetails: fullHeartbeat,
          telemetrySummary,
          anomaly_queue,
          globalThreatLevel,
          timestamp: Date.now()
        }), {
`;

code = code.replace(search2, replace2);

fs.writeFileSync(file, code);
