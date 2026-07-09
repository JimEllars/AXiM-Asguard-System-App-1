import { TelemetryPayloadSchema } from "./telemetry";
const rateLimitMap = new Map();
function pruneRateLimitMap() {
    if (rateLimitMap.size > 10000) {
        const now = Date.now();
        for (const [key, value] of rateLimitMap.entries()) {
            if (now - value.timestamp > 10000) {
                rateLimitMap.delete(key);
            }
        }
    }
}
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Asguard-Auth",
    "Access-Control-Expose-Headers": "Server-Timing",
};
export default {
    async fetch(request, env, ctx) {
        const startTime = Date.now();
        const response = await this.handle(request, env, ctx);
        const duration = Date.now() - startTime;
        const newResponse = new Response(response.body, response);
        newResponse.headers.set("Server-Timing", `edge-exec;dur=${duration};desc="Stateless Perimeter Check"`);
        return newResponse;
    },
    async handle(request, env, ctx) {
        if (request.method === "OPTIONS") {
            return new Response(null, { status: 204, headers: corsHeaders });
        }
        const clientIp = request.headers.get("cf-connecting-ip") || "unknown";
        // Fast check against KV for blocked IP
        if (clientIp !== "unknown") {
            const isBlocked = await env.ASGUARD_BLACKLIST.get(`ip:${clientIp}`);
            if (isBlocked) {
                return new Response("Forbidden", { status: 403, headers: corsHeaders });
            }
        }
        // Flood Control Handler
        if (clientIp !== "unknown") {
            pruneRateLimitMap();
            const rateLimitKey = `rate_limit:${clientIp}`;
            const now = Date.now();
            let record = rateLimitMap.get(rateLimitKey);
            if (record && now - record.timestamp <= 10000) {
                record.count++;
            }
            else {
                record = { count: 1, timestamp: now };
            }
            rateLimitMap.set(rateLimitKey, record);
            let currentCount = record.count;
            if (currentCount > 10) {
                return new Response("Too Many Requests", { status: 429, headers: corsHeaders });
            }
        }
        // Try reading auth token and check if it's blocked
        const authHeader = request.headers.get("Authorization");
        if (authHeader) {
            const token = authHeader.replace(/^Bearer\s+/, "").trim();
            const isTokenBlocked = await env.ASGUARD_BLACKLIST.get(`token:${token}`);
            if (isTokenBlocked) {
                return new Response("Forbidden", { status: 403, headers: corsHeaders });
            }
        }
        const url = new URL(request.url);
        if (request.method === "GET" && url.pathname === "/telemetry") {
            const customAuthHeader = request.headers.get("X-Asguard-Auth");
            if (!env.ASGUARD_API_KEY || customAuthHeader !== env.ASGUARD_API_KEY) {
                return new Response("Unauthorized", {
                    status: 401,
                    headers: corsHeaders,
                });
            }
            try {
                const data = (await env.ASGUARD_TELEMETRY.get("recent_events", {
                    type: "json",
                })) || [];
                return new Response(JSON.stringify(data), {
                    status: 200,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }
            catch (e) {
                return new Response("Internal Server Error", {
                    status: 500,
                    headers: corsHeaders,
                });
            }
        }
        if (request.method === "GET" && url.pathname === "/audit") {
            const customAuthHeader = request.headers.get("X-Asguard-Auth");
            if (!env.ASGUARD_API_KEY || customAuthHeader !== env.ASGUARD_API_KEY) {
                return new Response("Unauthorized", {
                    status: 401,
                    headers: corsHeaders,
                });
            }
            try {
                const listResult = await env.ASGUARD_TELEMETRY.list({
                    prefix: "audit:",
                });
                const values = await Promise.all(listResult.keys.map(key => env.ASGUARD_TELEMETRY.get(key.name, { type: "json" })));
                const auditEvents = values.filter(value => value !== null);
                // Sort in descending order by timestamp
                auditEvents.sort((a, b) => b.timestamp - a.timestamp);
                return new Response(JSON.stringify(auditEvents), {
                    status: 200,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }
            catch (e) {
                return new Response("Internal Server Error", {
                    status: 500,
                    headers: corsHeaders,
                });
            }
        }
        if (request.method === "GET" && url.pathname === "/blocklist") {
            const customAuthHeader = request.headers.get("X-Asguard-Auth");
            if (!env.ASGUARD_API_KEY || customAuthHeader !== env.ASGUARD_API_KEY) {
                return new Response("Unauthorized", {
                    status: 401,
                    headers: corsHeaders,
                });
            }
            try {
                const listResult = await env.ASGUARD_BLACKLIST.list();
                const keys = listResult.keys.map((k) => ({ name: k.name, expiration: k.expiration }));
                return new Response(JSON.stringify(keys), {
                    status: 200,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }
            catch (e) {
                return new Response("Internal Server Error", {
                    status: 500,
                    headers: corsHeaders,
                });
            }
        }
        if (request.method === "POST" && url.pathname === "/blocklist") {
            const customAuthHeader = request.headers.get("X-Asguard-Auth");
            if (!env.ASGUARD_API_KEY || customAuthHeader !== env.ASGUARD_API_KEY) {
                return new Response("Unauthorized", {
                    status: 401,
                    headers: corsHeaders,
                });
            }
            try {
                const payload = (await request.json());
                if (!payload.key || !payload.action) {
                    return new Response("Bad Request", {
                        status: 400,
                        headers: corsHeaders,
                    });
                }
                if (payload.action === "block") {
                    await env.ASGUARD_BLACKLIST.put(payload.key, "1", {
                        expirationTtl: payload.ttl || 86400,
                    });
                }
                else if (payload.action === "unblock") {
                    await env.ASGUARD_BLACKLIST.delete(payload.key);
                }
                else {
                    return new Response("Invalid action", {
                        status: 400,
                        headers: corsHeaders,
                    });
                }
                const timestamp = Date.now();
                const ttl = payload.action === "block" ? payload.ttl || 86400 : undefined;
                await env.ASGUARD_TELEMETRY.put(`audit:${timestamp}`, JSON.stringify({
                    action: payload.action,
                    target: payload.key,
                    ttl: ttl,
                    timestamp: timestamp,
                }));
                return new Response("OK", { status: 200, headers: corsHeaders });
            }
            catch (e) {
                return new Response("Internal Server Error", {
                    status: 500,
                    headers: corsHeaders,
                });
            }
        }
        // Optionally parse telemetry if it's a telemetry endpoint
        if (request.method === "POST" && url.pathname === "/telemetry") {
            try {
                let payload = await request.json();
                // Enrich with Cloudflare metadata
                payload.country = (request.cf && request.cf.country) ? request.cf.country : "XX";
                payload.colo = (request.cf && request.cf.colo) ? request.cf.colo : "UNKNOWN";
                payload.requestMethod = request.method;
                payload.targetResource = url.pathname;
                payload.signatureMetadata = request.headers.get("X-Asguard-Signature") || "UNKNOWN";
                const parseResult = TelemetryPayloadSchema.safeParse(payload);
                if (!parseResult.success) {
                    return new Response("Invalid Telemetry Payload", {
                        status: 400,
                        headers: corsHeaders,
                    });
                }
                // Securely log telemetry asynchronously
                ctx.waitUntil(logTelemetry(parseResult.data, env));
                return new Response("Telemetry accepted", {
                    status: 202,
                    headers: corsHeaders,
                });
            }
            catch (e) {
                return new Response("Bad Request", {
                    status: 400,
                    headers: corsHeaders,
                });
            }
        }
        // Pass-through
        return new Response("OK", { status: 200, headers: corsHeaders });
    },
};
const localEdgeLoggingBuffer = [];
async function logTelemetry(data, env) {
    try {
        // Capture a snapshot of the current buffer
        const bufferSnapshot = [...localEdgeLoggingBuffer];
        const dbOp = async () => {
            const existing = (await env.ASGUARD_TELEMETRY.get("recent_events", { type: "json" })) ||
                [];
            // Combine current data, buffer snapshot, and existing data
            let toSave = [data, ...bufferSnapshot, ...existing];
            const pruned = toSave.slice(0, 50);
            await env.ASGUARD_TELEMETRY.put("recent_events", JSON.stringify(pruned));
        };
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Database connection timeout")), 5000));
        await Promise.race([dbOp(), timeoutPromise]);
        // If successful, remove the successfully flushed items from the local buffer
        if (bufferSnapshot.length > 0) {
            localEdgeLoggingBuffer.splice(0, bufferSnapshot.length);
        }
    }
    catch (err) {
        console.error("Failed to log telemetry, buffering locally:", err);
        localEdgeLoggingBuffer.push(data);
        // Keep local buffer bounded
        if (localEdgeLoggingBuffer.length > 100) {
            localEdgeLoggingBuffer.shift();
        }
    }
}
//# sourceMappingURL=index.js.map