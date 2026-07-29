const fs = require('fs');
const path = 'asguard-interceptor/src/index.ts';

let code = fs.readFileSync(path, 'utf8');

const regex = /async scheduled\(\s*event:\s*any,\s*env:\s*Env,\s*ctx:\s*ExecutionContext\s*\)\s*\{\s*ctx\.waitUntil\(\s*\(\s*async\s*\(\)\s*=>\s*\{([\s\S]*?)try\s*\{\s*await\s*env\.ASGUARD_TELEMETRY\.put\("system_health_heartbeat"/;

const replacement = `async scheduled(
    event: any,
    env: Env,
    ctx: ExecutionContext
  ) {
    ctx.waitUntil(
      (async () => {
        let expiredKeysPurged = 0;
        let bufferFlushedCount = 0;
        let aiThreatCount24h = 0;
        const now = Date.now();
        const isDaily = event.cron === "0 0 * * *";
        const isHourly = !isDaily; // Default to hourly

        // --- COMMON HOURLY SWEEP TASKS ---
        try {
          const listResult = await env.ASGUARD_BLACKLIST.list({ limit: 100 });
          const expiredKeys = listResult.keys.filter(k => k.expiration && k.expiration < now / 1000);

          if (expiredKeys.length > 0) {
            await Promise.all(expiredKeys.map(k => env.ASGUARD_BLACKLIST.delete(k.name)));
            expiredKeysPurged = expiredKeys.length;
          }
        } catch (e) {
          structuredLog("error", "Scheduled cleanup failed", null, e);
        }

        if (localEdgeLoggingBuffer.length > 0) {
          if (localEdgeLoggingBuffer.length > 50) {
             structuredLog("warn", "Local edge logging buffer exceeded 50 items during scheduled flush", null, { bufferSize: localEdgeLoggingBuffer.length });
          }
          try {
            const bufferSnapshot = [...localEdgeLoggingBuffer];
            const promises = bufferSnapshot.map(async (item) => {
              if (item.type === 'blacklist_put' || item.type === 'blacklist_put_autonomous') {
                return env.ASGUARD_BLACKLIST.put(item.key, "1", item.options || { expirationTtl: 86400 });
              } else if (item.type === 'blacklist_delete') {
                return env.ASGUARD_BLACKLIST.delete(item.key);
              } else if (item.type === 'audit' || item.type === 'audit_error') {
                const recentEventsStr = await env.ASGUARD_TELEMETRY.get("recent_events", { type: "json" }) || [];
                const existing = Array.isArray(recentEventsStr) ? recentEventsStr : [];
                const payload = item.payload || item;
                const toSave = [payload, ...existing].slice(0, 50);
                return env.ASGUARD_TELEMETRY.put("recent_events", JSON.stringify(toSave));
              } else if (item.type === 'dlq_replay_error') {
                return Promise.resolve();
              } else {
                const recentEventsStr = await env.ASGUARD_TELEMETRY.get("recent_events", { type: "json" }) || [];
                const existing = Array.isArray(recentEventsStr) ? recentEventsStr : [];
                const toSave = [item, ...existing].slice(0, 50);
                return env.ASGUARD_TELEMETRY.put("recent_events", JSON.stringify(toSave));
              }
            });

            const results = await Promise.allSettled(promises);
            for (let i = results.length - 1; i >= 0; i--) {
               if (results[i].status === 'fulfilled') {
                  const idx = localEdgeLoggingBuffer.indexOf(bufferSnapshot[i]);
                  if (idx !== -1) {
                     localEdgeLoggingBuffer.splice(idx, 1);
                     bufferFlushedCount++;
                  }
               }
            }
          } catch (err) {
            structuredLog("error", "Scheduled buffer flush failed", null, err);
          }
        }

        // --- DAILY SWEEP TASKS ---
        if (isDaily) {
          try {
            const thirtyDaysAgo = now - 30 * 86400 * 1000;
            let dlqList = await env.ASGUARD_TELEMETRY.list({ prefix: "dlq:" });
            const dlqExpired = [];
            for (const key of dlqList.keys) {
               const itemStr = await env.ASGUARD_TELEMETRY.get(key.name);
               if (itemStr) {
                  try {
                     const itemObj = JSON.parse(itemStr);
                     if (itemObj.timestamp && itemObj.timestamp < thirtyDaysAgo) {
                        dlqExpired.push(key.name);
                     }
                  } catch(e) {}
               }
            }
            if (dlqExpired.length > 0) {
               await Promise.all(dlqExpired.map(k => env.ASGUARD_TELEMETRY.delete(k)));
            }
          } catch (e) {
            structuredLog("error", "Scheduled DLQ quarantine cleanup failed", null, e);
          }

          try {
            const twentyFourHoursAgo = now - 86400 * 1000;
            const recentEventsStr = await env.ASGUARD_TELEMETRY.get("recent_events", { type: "json" }) || [];
            const recentEvents = Array.isArray(recentEventsStr) ? recentEventsStr : [];

            aiThreatCount24h = recentEvents.filter(event =>
               event.aiThreatFlag === true &&
               event.timestamp &&
               event.timestamp >= twentyFourHoursAgo
            ).length;

            if (aiThreatCount24h >= 5) {
               const alertPayload = {
                  eventType: "ai_unsafe_threshold_exceeded",
                  severity: "high",
                  timestamp: now,
                  details: {
                     message: "AI threat threshold exceeded in the last 24 hours.",
                     aiThreatCount24h: aiThreatCount24h
                  }
               };
               // We fake a request to pass to dispatchCriticalAlert
               const fakeRequest = new Request("https://asguard.local/cron", {
                  method: "POST",
                  headers: { "cf-connecting-ip": "127.0.0.1" }
               });
               await dispatchCriticalAlert(env, alertPayload, fakeRequest, ctx);
            }
          } catch (e) {
             structuredLog("error", "Scheduled AI threat check failed", null, e);
          }
        }

        try {
          await env.ASGUARD_TELEMETRY.put("system_health_heartbeat",`;

const parts = code.split(/async scheduled\(\s*event:\s*any,\s*env:\s*Env,\s*ctx:\s*ExecutionContext\s*\)\s*\{\s*ctx\.waitUntil\(\s*\(\s*async\s*\(\)\s*=>\s*\{/);

if (parts.length === 2) {
    const endParts = parts[1].split(/try\s*\{\s*await\s*env\.ASGUARD_TELEMETRY\.put\("system_health_heartbeat",/);
    if (endParts.length === 2) {
        let newCode = parts[0] + replacement + endParts[1];

        // update the eventType and add properties to system_health_heartbeat
        newCode = newCode.replace(
            /JSON\.stringify\(\{\s*eventType:\s*"cron_daily_heartbeat",\s*status:\s*"ok",\s*timestamp:\s*now,\s*expiredKeysPurged:\s*expiredKeysPurged,\s*bufferFlushedCount:\s*0,\s*colo:\s*"EDGE_CRON_SCHEDULER"\s*\}\)/,
            `JSON.stringify({
            eventType: isDaily ? "cron_daily_heartbeat" : "cron_hourly_heartbeat",
            status: "ok",
            timestamp: now,
            expiredKeysPurged: expiredKeysPurged,
            bufferFlushedCount: bufferFlushedCount,
            aiThreatCount24h: isDaily ? aiThreatCount24h : undefined,
            lastDailySweepTimestamp: isDaily ? now : undefined,
            cronSchedule: isDaily ? "DAILY" : "HOURLY",
            colo: "EDGE_CRON_SCHEDULER"
          })`
        );

        fs.writeFileSync(path, newCode);
        console.log("Successfully patched asguard-interceptor/src/index.ts");
    } else {
        console.log("Could not find system_health_heartbeat");
    }
} else {
    console.log("Could not find scheduled block");
}
