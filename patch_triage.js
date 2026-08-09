const fs = require('fs');
const file = 'asguard-interceptor/src/index.ts';
let code = fs.readFileSync(file, 'utf8');

const oldTriage = `        const payload = await request.json() as { ip: string, action: "block" | "dismiss", ttl?: number };
        const { ip, action, ttl = 86400 } = payload;
        const now = Date.now();

        if (action === "block") {
          await env.ASGUARD_BLACKLIST.put(\`ip:\${ip}\`, "1", { expirationTtl: ttl });
        }

        await env.ASGUARD_TELEMETRY.delete("anomaly_queue");

        const authorizedByWallet = request.headers.get("X-Asguard-Signature") || customAuthHeader || "UNKNOWN";
        const auditLog = {
          action: "onyx_anomaly_triaged",
          target: ip,
          decision: action,
          authorizedByWallet,
          timestamp: now
        };
        await env.ASGUARD_TELEMETRY.put(\`audit:\${now}\`, JSON.stringify(auditLog));

        return new Response(JSON.stringify({ success: true, ip, decision: action }), {
          status: 200,
          headers: { ...getCorsHeaders(request, env, isMutation), "Content-Type": "application/json" }
        });`;

const newTriage = `        const payload = await request.json() as { ip: string | string[], action: "block" | "dismiss", ttl?: number };
        const { ip, action, ttl = 86400 } = payload;
        const now = Date.now();
        const authorizedByWallet = request.headers.get("X-Asguard-Signature") || customAuthHeader || "UNKNOWN";

        let anomalyQueueRaw = await env.ASGUARD_TELEMETRY.get("anomaly_queue");
        let anomalyQueue: any[] = [];
        if (anomalyQueueRaw) {
          try {
            const parsed = JSON.parse(anomalyQueueRaw);
            anomalyQueue = Array.isArray(parsed) ? parsed : [parsed];
          } catch (e) {}
        }

        let targets: string[] = [];
        if (ip === "ALL") {
          targets = anomalyQueue.map(item => item.anomalyIp);
        } else if (Array.isArray(ip)) {
          targets = ip;
        } else {
          targets = [ip];
        }

        let triagedCount = 0;
        let auditPromises: Promise<any>[] = [];
        for (const target of targets) {
          if (action === "block") {
            await env.ASGUARD_BLACKLIST.put(\`ip:\${target}\`, "1", { expirationTtl: ttl });
          }

          anomalyQueue = anomalyQueue.filter(item => item.anomalyIp !== target);
          triagedCount++;

          const auditLog = {
            action: "onyx_anomaly_triaged",
            target: target,
            decision: action,
            authorizedByWallet,
            timestamp: now + triagedCount // slight offset for unique keys
          };
          auditPromises.push(env.ASGUARD_TELEMETRY.put(\`audit:\${auditLog.timestamp}\`, JSON.stringify(auditLog)));
        }

        await Promise.all(auditPromises);

        if (anomalyQueue.length > 0) {
          await env.ASGUARD_TELEMETRY.put("anomaly_queue", JSON.stringify(anomalyQueue), { expirationTtl: 86400 });
        } else {
          await env.ASGUARD_TELEMETRY.delete("anomaly_queue");
        }

        return new Response(JSON.stringify({ success: true, count: triagedCount, decision: action }), {
          status: 200,
          headers: { ...getCorsHeaders(request, env, isMutation), "Content-Type": "application/json" }
        });`;

code = code.replace(oldTriage, newTriage);
fs.writeFileSync(file, code);
