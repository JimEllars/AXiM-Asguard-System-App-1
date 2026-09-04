Okay, let's create a solid plan for all these tasks:

1. **Subnet Sliding-Window Rate Limiter (`asguard-interceptor/src/index.ts`)**:
   - Add `threat.subnet_throttled` to `TelemetryPayloadSchema` in `asguard-interceptor/src/telemetry.ts`.
   - In `index.ts`, define `subnetRateLimitMap` and update `pruneRateLimitMap()` to clean it up.
   - Implement `getSubnet(ip: string)` to compute `/24` or `/48`.
   - Add a check in `handle` (after IP extraction): if the request velocity per subnet exceeds 100 within 10 seconds, block it.
   - Dispatch telemetry and return HTTP 429 JSON response.

2. **Critical Threat SIEM Webhook Dispatch (`asguard-interceptor/src/index.ts`)**:
   - Add `AXIM_SUPPORT_WEBHOOK_URL` and `AXIM_SHARED_SECRET` to `Env`.
   - Create `calculateThreatScore` or just inline logic in `dispatchCriticalAlert` to compute threat score (from `details.risk_score` for telephony, or mapped from `severity`).
   - If `threat_score >= 85` and `AXIM_SUPPORT_WEBHOOK_URL` and `AXIM_SHARED_SECRET` are defined, dispatch the specified webhook payload, sign it using HMAC-SHA256, and send it asynchronously with `ctx.waitUntil`.

3. **Header Sanitization Gateway (`asguard-interceptor/src/index.ts`)**:
   - Instead of just returning `"OK"` at the end of `handle`, clone the request, strip the headers (`X-Internal-Token`, `X-User-Role`, `X-Axim-Override`), set `X-Real-IP`, and run `fetch(proxyRequest)` downstream? But wait, this interceptor doesn't have an origin! Oh wait! "Before proxying traffic downstream to origin micro-apps... strip any spoofed internal headers". If I just strip the headers from a `Request` but then I return a `new Response("OK")`, that doesn't proxy anything.
   - Is there a proxy fetch at the very end of `index.ts`?
   Wait, if it is deployed as a "Custom Domain" Worker, the proxying happens automatically if you pass-through (`fetch(request)`), but `return new Response("OK")` terminates the request. Wait... if `return new Response("OK")` is hit, it intercepts and just says "OK" ? But it says `// Pass-through \n return new Response("OK", { status: 200, headers: getCorsHeaders(request, env, isMutation) });`. I guess this is used as a pre-flight or something. Wait, in Cloudflare Workers, `fetch(request)` proxies the request to the origin matching the route! So I will change the end of `handle` to return `fetch(proxyRequest)`. Actually, wait. It says "Before proxying traffic downstream to origin micro-apps...". So I will just use `fetch(proxyRequest)`. No, wait! If I `return fetch(proxyRequest)`, what about the `Server-Timing` headers that the `fetch()` handler appends? The `fetch()` function in the `export default` block does:
     ```typescript
     let response = await this.handle(request, env, ctx);
     const newResponse = new Response(response.body, response);
     newResponse.headers.set("Server-Timing", serverTiming);
     return newResponse;
     ```
     So if I return `fetch(proxyRequest)` from `handle()`, `response` will be the upstream response! Then the `fetch()` block will wrap it and append the `Server-Timing` header! This is perfect. Let me do this.

4. **SOC Cockpit Incident Audit Exporter (`soc-cockpit/src/components/LiveThreatFeed.tsx`)**:
   - Create a dropdown using a generic HTML `<select>` or a custom UI for exporting JSON/CSV.
   - Update `handleExportAuditCSV` or create a new export function to format threats appropriately and include the required columns.

5. Pre-commit check and test runs.

Let's do a set_plan!
