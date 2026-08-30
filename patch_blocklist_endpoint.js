const fs = require('fs');
const file = 'asguard-interceptor/src/index.ts';
let content = fs.readFileSync(file, 'utf8');

const newEndpoint = `
    if (request.method === "POST" && url.pathname === "/api/v1/blocklist/add") {
      if (request.headers.get("X-Asguard-Auth") !== env.ASGUARD_API_KEY) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
      }

      try {
        const payload = await request.json() as { ip?: string, reason?: string, duration_hours?: number };
        if (!payload.ip) {
          return new Response(JSON.stringify({ error: "Missing ip" }), { status: 400, headers: corsHeaders });
        }

        const duration_hours = payload.duration_hours || 24;
        const ttl = duration_hours * 3600;

        await env.ASGUARD_BLACKLIST.put(\`ip:\${payload.ip}\`, "1", { expirationTtl: ttl });

        ctx.waitUntil(env.ASGUARD_TELEMETRY.put(\`audit:\${Date.now()}\`, JSON.stringify({
          action: "IP_QUARANTINE_MANUAL",
          operator: "OnyxPipeline",
          targetIp: payload.ip,
          reason: payload.reason || "Manual quarantine",
          duration_hours,
          timestamp: Date.now()
        })));

        return new Response(JSON.stringify({ success: true, quarantined_ip: payload.ip }), {
          status: 200,
          headers: corsHeaders
        });

      } catch (err) {
        return new Response(JSON.stringify({ error: "Invalid payload" }), { status: 400, headers: corsHeaders });
      }
    }
`;

content = content.replace(
  "if ((request.method === \"POST\" || request.method === \"DELETE\") && url.pathname === \"/blocklist\") {",
  `${newEndpoint}\n    if ((request.method === "POST" || request.method === "DELETE") && url.pathname === "/blocklist") {`
);

fs.writeFileSync(file, content);
console.log('patched blocklist endpoint');
