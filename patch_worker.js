const fs = require('fs');
const file = 'asguard-interceptor/src/index.ts';
let code = fs.readFileSync(file, 'utf8');

// Step 1: Update Hourly Sweep Logic
const oldHourlySweep = `      for (const [ip, count] of Object.entries(ipCounts)) {
        if ((count as number) > 100) {
          const anomalyQueueItem = {
            anomalyIp: ip,
            requestCount1h: count,
            timestamp: now,
            status: "pending_onyx_triage"
          };
          await env.ASGUARD_TELEMETRY.put("anomaly_queue", JSON.stringify(anomalyQueueItem), { expirationTtl: 86400 });
          break; // Since we store one object under "anomaly_queue" for now (or could be list, prompt says "Write an anomaly staging object... under key 'anomaly_queue'")
        }
      }`;

const newHourlySweep = `      let anomalyQueueRaw = await env.ASGUARD_TELEMETRY.get("anomaly_queue");
      let anomalyQueue: any[] = [];
      if (anomalyQueueRaw) {
        try {
          const parsed = JSON.parse(anomalyQueueRaw);
          anomalyQueue = Array.isArray(parsed) ? parsed : [parsed];
        } catch (e) {}
      }

      // Filter out stale entries (older than 24 hours)
      const twentyFourHoursAgo = now - 86400000;
      anomalyQueue = anomalyQueue.filter(item => item.timestamp >= twentyFourHoursAgo);

      for (const [ip, count] of Object.entries(ipCounts)) {
        if ((count as number) > 100) {
          if (!anomalyQueue.find(item => item.anomalyIp === ip)) {
            anomalyQueue.push({
              anomalyIp: ip,
              requestCount1h: count,
              timestamp: now,
              status: "pending_onyx_triage"
            });
          }
        }
      }

      // Cap at 10 entries
      if (anomalyQueue.length > 10) {
        anomalyQueue = anomalyQueue.slice(-10);
      }

      if (anomalyQueue.length > 0) {
        await env.ASGUARD_TELEMETRY.put("anomaly_queue", JSON.stringify(anomalyQueue), { expirationTtl: 86400 });
      } else {
        await env.ASGUARD_TELEMETRY.delete("anomaly_queue");
      }`;

code = code.replace(oldHourlySweep, newHourlySweep);
fs.writeFileSync(file, code);
