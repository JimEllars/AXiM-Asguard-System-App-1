const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'asguard-interceptor/src/index.ts');
let content = fs.readFileSync(filePath, 'utf-8');

const floodControlLogic = `
    const clientIp = request.headers.get("cf-connecting-ip") || "unknown";

    // Flood Control Handler
    if (clientIp !== "unknown") {
      const rateLimitKey = \`rate_limit:\${clientIp}\`;
      const currentCountStr = await env.ASGUARD_TELEMETRY.get(rateLimitKey);
      let currentCount = currentCountStr ? parseInt(currentCountStr, 10) : 0;

      currentCount++;
      await env.ASGUARD_TELEMETRY.put(rateLimitKey, currentCount.toString(), { expirationTtl: 60 });

      if (currentCount > 100) { // arbitrary limit for 429
        const exceptionKey = \`429_exceptions:\${clientIp}\`;
        const exceptionsStr = await env.ASGUARD_TELEMETRY.get(exceptionKey);
        let exceptions = exceptionsStr ? parseInt(exceptionsStr, 10) : 0;

        exceptions++;
        await env.ASGUARD_TELEMETRY.put(exceptionKey, exceptions.toString(), { expirationTtl: 300 });

        if (exceptions > 3) {
          await env.ASGUARD_GLOBAL_BLOCKLIST.put(\`ip:\${clientIp}\`, "1", { expirationTtl: 86400 });

          const timestamp = Date.now();
          await env.ASGUARD_TELEMETRY.put(
            \`audit:\${timestamp}\`,
            JSON.stringify({
              action: "block",
              target: \`ip:\${clientIp}\`,
              ttl: 86400,
              timestamp: timestamp,
              signature: "FLOOD_CONTROL_MITIGATION"
            })
          );
        }

        return new Response("Too Many Requests", { status: 429, headers: corsHeaders });
      }
    }
`;

content = content.replace('const clientIp = request.headers.get("cf-connecting-ip") || "unknown";', floodControlLogic);
fs.writeFileSync(filePath, content);
