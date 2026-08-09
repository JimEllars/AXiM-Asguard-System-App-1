const fs = require('fs');
const file = 'asguard-interceptor/src/index.ts';
let code = fs.readFileSync(file, 'utf8');

const search = `
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
const replace = `
        const aiUnsafeCount24h = telemetrySummary?.aiUnsafeCount24h || 0;
        const activeBlocklistCount = penaltyLedger.size + rateLimitMap.size; // fallback estimation or wait, we need real active blocklist count
        // We will fetch the exact list length if needed or just use a dummy / pre-existing var.

        let globalThreatLevel = "LOW";
        if (aiUnsafeCount24h >= 10 || (anomaly_queue && anomaly_queue.length >= 5)) {
            globalThreatLevel = "CRITICAL";
        } else if (aiUnsafeCount24h >= 5 || (anomaly_queue && anomaly_queue.length >= 1)) {
            globalThreatLevel = "HIGH";
        } else if (activeBlocklistCount >= 10 || aiUnsafeCount24h >= 1) { // Will need real active blocklist count
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

// Wait, I need to check how to get active blocklist count.
// Let's get it by calling env.ASGUARD_BLACKLIST.list({ limit: 1000 }) ?
// That might be slow for a health check endpoint, but it's exactly what's done in /blacklist.
