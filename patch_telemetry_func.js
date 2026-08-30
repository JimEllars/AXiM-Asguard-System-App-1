const fs = require('fs');
const file = 'asguard-interceptor/src/index.ts';
let content = fs.readFileSync(file, 'utf8');

// Add env vars
content = content.replace(
  "ASGUARD_ALERT_EMAIL?: string;",
  "ASGUARD_ALERT_EMAIL?: string;\n  AXIM_CORE_API_URL?: string;\n  AXIM_INTERNAL_KEY?: string;"
);

// We need to find a place to add the new telemetry function and use it for threat events.
// A good place to add the function is right before getCorsHeaders.
const pushTelemetryFunc = `
async function pushThreatTelemetry(env: Env, eventType: string, ip: string, details: any) {
  if (!env.AXIM_CORE_API_URL || !env.AXIM_INTERNAL_KEY) return;

  // Mask IP last octet
  let maskedIp = ip;
  if (ip && ip.includes('.')) {
    const parts = ip.split('.');
    if (parts.length === 4) {
      parts[3] = '0/24';
      maskedIp = parts.join('.');
    }
  }

  const payload = {
    app_id: "axim-asguard",
    event_type: eventType,
    timestamp: Date.now(),
    sourceIp: maskedIp,
    details
  };

  try {
    await fetch(\`\${env.AXIM_CORE_API_URL}/api/v1/telemetry/micro-app\`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Axim-Signature": env.AXIM_INTERNAL_KEY
      },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    structuredLog("error", "telemetry_push_failed", null, err);
  }
}
`;

content = content.replace(
  "function getCorsHeaders(request: Request, env: Env, isMutation: boolean) {",
  `${pushTelemetryFunc}\nfunction getCorsHeaders(request: Request, env: Env, isMutation: boolean) {`
);

// Now hook pushThreatTelemetry into relevant places:
// rate limit exceeded: HTTP 429
// bot blocked: bot_challenge.failed / HTTP 403 / edgeBotScore < 30
// IP quarantined: blocklist check

// 1. Blocklist check
// We need to see where ASGUARD_BLACKLIST returns 403
// "const isBlocked = await env.ASGUARD_BLACKLIST.get("
// "if (isBlocked) {" -> push ip.quarantined
content = content.replace(
  "if (isBlocked) {",
  "if (isBlocked) {\n        ctx.waitUntil(pushThreatTelemetry(env, \"ip.quarantined\", clientIp, { reason: \"blacklisted\" }).catch(err => { localEdgeLoggingBuffer.push({ ts: Date.now(), level: 'error', msg: 'KV Error', error: err ? String(err) : 'Unknown Error' }); }));"
);

// 2. Rate limit exceeded
// "if (record.count > maxRequests) {" -> returns 429
content = content.replace(
  "if (record.count > maxRequests) {",
  "if (record.count > maxRequests) {\n          ctx.waitUntil(pushThreatTelemetry(env, \"rate_limit.exceeded\", clientIp, { count: record.count }).catch(err => { localEdgeLoggingBuffer.push({ ts: Date.now(), level: 'error', msg: 'KV Error', error: err ? String(err) : 'Unknown Error' }); }));"
);

// 3. Threat blocked (e.g. anomaly queue / signature tampering / bot score)
content = content.replace(
  "if (edgeBotScore < 30) {",
  "if (edgeBotScore < 30) {\n          ctx.waitUntil(pushThreatTelemetry(env, \"bot_challenge.failed\", clientIp, { edgeBotScore }).catch(err => { localEdgeLoggingBuffer.push({ ts: Date.now(), level: 'error', msg: 'KV Error', error: err ? String(err) : 'Unknown Error' }); }));"
);

fs.writeFileSync(file, content);
console.log('patched index.ts for telemetry');
