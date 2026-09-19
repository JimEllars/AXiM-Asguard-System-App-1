import { TelemetryPayloadSchema } from "./telemetry";

const rateLimitMap = new Map<string, { count: number; timestamp: number }>();
const penaltyLedger = new Map<string, { consecutive: number; timestamp: number }>();
const clientErrorThrottleMap = new Map<string, number[]>();

function pruneRateLimitMap() {
  const now = Date.now();
  if (rateLimitMap.size > 10000) {
    for (const [key, value] of rateLimitMap.entries()) {
      if (now - value.timestamp > 10000) {
        rateLimitMap.delete(key);
      }
    }
  }
  if (penaltyLedger.size > 1000) {
    for (const [key, value] of penaltyLedger.entries()) {
      if (now - value.timestamp > 10000) {
        penaltyLedger.delete(key);
      }
    }
  }
  if (clientErrorThrottleMap.size > 10000) {
    for (const [key, timestamps] of clientErrorThrottleMap.entries()) {
      const valid = timestamps.filter(t => now - t <= 10000);
      if (valid.length === 0) {
        clientErrorThrottleMap.delete(key);
      } else {
        clientErrorThrottleMap.set(key, valid);
      }
    }
  }
}

export interface Env {
  ASGUARD_BLACKLIST: KVNamespace;
  ASGUARD_TELEMETRY: KVNamespace;
  ASGUARD_API_KEY: string;
  ASGUARD_SERVICE_TOKEN?: string;
  TELEMETRY_INGEST_KEY?: string;
  DEEPSEEK_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Asguard-Auth",
  "Access-Control-Expose-Headers": "Server-Timing",
};

function hasSecret(request: Request, header: string, expected: string | undefined) {
  const received = request.headers.get(header);
  if (!received || !expected || received.length !== expected.length) {
    return false;
  }

  let difference = 0;
  for (let index = 0; index < received.length; index++) {
    difference |= received.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

function isAdminRequest(request: Request, env: Env) {
  return (
    hasSecret(request, "X-Asguard-Auth", env.ASGUARD_API_KEY) ||
    hasSecret(request, "X-Asguard-Service-Token", env.ASGUARD_SERVICE_TOKEN)
  );
}

async function analyzeThreat(payload: unknown, env: Env): Promise<Response> {
  const parsedPayload = TelemetryPayloadSchema.safeParse(payload);
  if (!parsedPayload.success) {
    return new Response("Invalid analysis payload", { status: 400, headers: corsHeaders });
  }

  const prompt = [
    "You are AXiM Asguard, a security operations analyst.",
    "Assess the following security event. Return concise JSON with exactly these fields:",
    "risk (low|medium|high|critical), summary, recommendedActions (array of strings), and rationale.",
    "Do not include markdown fences or any text outside the JSON object.",
    JSON.stringify(parsedPayload.data),
  ].join("\n");

  const providers = [
    {
      name: "deepseek",
      key: env.DEEPSEEK_API_KEY,
      request: () =>
        fetch("https://api.deepseek.com/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "deepseek-chat",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
            temperature: 0,
          }),
        }),
      extract: (body: { choices?: Array<{ message?: { content?: string } }> }) =>
        body.choices?.[0]?.message?.content,
    },
    {
      name: "anthropic",
      key: env.ANTHROPIC_API_KEY,
      request: () =>
        fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": env.ANTHROPIC_API_KEY || "",
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 512,
            temperature: 0,
            messages: [{ role: "user", content: prompt }],
          }),
        }),
      extract: (body: { content?: Array<{ type?: string; text?: string }> }) =>
        body.content?.find((part) => part.type === "text")?.text,
    },
  ];

  for (const provider of providers) {
    if (!provider.key) {
      continue;
    }

    try {
      const response = await provider.request();
      if (!response.ok) {
        console.error(`Asguard ${provider.name} analysis provider returned ${response.status}`);
        continue;
      }

      const content = provider.extract(await response.json());
      if (!content) {
        console.error(`Asguard ${provider.name} analysis provider returned no content`);
        continue;
      }

      return new Response(content, {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json", "X-Asguard-Analysis-Provider": provider.name },
      });
    } catch (error) {
      console.error(`Asguard ${provider.name} analysis provider failed`, error);
    }
  }

  return new Response("Threat analysis is unavailable", { status: 503, headers: corsHeaders });
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const startTime = Date.now();
    const response = await this.handle(request, env, ctx);
    const duration = Date.now() - startTime;

    const newResponse = new Response(response.body, response);
    newResponse.headers.set("Server-Timing", `edge-exec;dur=${duration};desc="Stateless Perimeter Check"`);
    return newResponse;
  },

  async handle(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }


    const clientIp = request.headers.get("cf-connecting-ip") || "unknown";

    // Fast check against KV for blocked IP
    if (clientIp !== "unknown") {
      const isBlocked = await env.ASGUARD_BLACKLIST.get(
        `ip:${clientIp}`,
      );
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
      } else {
        record = { count: 1, timestamp: now };
      }
      rateLimitMap.set(rateLimitKey, record);

      let currentCount = record.count;

      if (currentCount > 10) {
        let penalty = penaltyLedger.get(clientIp);
        if (penalty && now - penalty.timestamp <= 60000) {
          penalty.consecutive++;
          penalty.timestamp = now;
        } else {
          penalty = { consecutive: 1, timestamp: now };
        }
        penaltyLedger.set(clientIp, penalty);

        if (penalty.consecutive > 3) {
          await env.ASGUARD_BLACKLIST.put(`ip:${clientIp}`, "1", { expirationTtl: 86400 });
        }

        return new Response("Too Many Requests", { status: 429, headers: corsHeaders });
      } else {
        penaltyLedger.delete(clientIp);
      }
    }


    // Try reading auth token and check if it's blocked
    const authHeader = request.headers.get("Authorization");
    if (authHeader) {
      const token = authHeader.replace(/^Bearer\s+/, "").trim();
      const isTokenBlocked = await env.ASGUARD_BLACKLIST.get(
        `token:${token}`,
      );
      if (isTokenBlocked) {
        return new Response("Forbidden", { status: 403, headers: corsHeaders });
      }
    }

    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/telemetry") {
      if (!isAdminRequest(request, env)) {
        return new Response("Unauthorized", {
          status: 401,
          headers: corsHeaders,
        });
      }
      try {
        const data =
          (await env.ASGUARD_TELEMETRY.get("recent_events", {
            type: "json",
          })) || [];
        return new Response(JSON.stringify(data), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e) {
        return new Response("Internal Server Error", {
          status: 500,
          headers: corsHeaders,
        });
      }
    }

    if (request.method === "GET" && url.pathname === "/audit") {
      if (!isAdminRequest(request, env)) {
        return new Response("Unauthorized", {
          status: 401,
          headers: corsHeaders,
        });
      }
      try {
        const listResult = await env.ASGUARD_TELEMETRY.list({
          prefix: "audit:",
        });
        const values = await Promise.all(
          listResult.keys.map(key => env.ASGUARD_TELEMETRY.get(key.name, { type: "json" }))
        );
        const auditEvents = values.filter(value => value !== null);

        // Sort in descending order by timestamp
        auditEvents.sort((a: any, b: any) => b.timestamp - a.timestamp);

        return new Response(JSON.stringify(auditEvents), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e) {
        return new Response("Internal Server Error", {
          status: 500,
          headers: corsHeaders,
        });
      }
    }

    if (request.method === "GET" && url.pathname === "/blocklist") {
      if (!isAdminRequest(request, env)) {
        return new Response("Unauthorized", {
          status: 401,
          headers: corsHeaders,
        });
      }

      const cacheUrl = new URL(request.url);
      const cacheKey = new Request(cacheUrl.toString(), request);
      const cache = (caches as any).default;
      const cachedResponse = await cache.match(cacheKey);

      if (cachedResponse) {
        const response = new Response(cachedResponse.body, cachedResponse);
        response.headers.set("Cloudflare-Cache", "HIT");
        return response;
      }

      try {
        const listResult = await env.ASGUARD_BLACKLIST.list();
        const keys = listResult.keys.map((k) => {
          let note = undefined;
          if (k.metadata && typeof k.metadata === 'object' && 'note' in k.metadata) {
            note = (k.metadata as any).note;
          }
          return { name: k.name, expiration: k.expiration, note };
        });
        const responsePayload = new Response(JSON.stringify(keys), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=30" },
        });

        ctx.waitUntil(cache.put(cacheKey, responsePayload.clone()));

        return responsePayload;
      } catch (e) {
        return new Response("Internal Server Error", {
          status: 500,
          headers: corsHeaders,
        });
      }
    }

    if ((request.method === "POST" || request.method === "DELETE") && url.pathname === "/blocklist") {
      if (!isAdminRequest(request, env)) {
        return new Response("Unauthorized", {
          status: 401,
          headers: corsHeaders,
        });
      }

      const invalidateCacheUrl = new URL(request.url);
      ctx.waitUntil((caches as any).default.delete(new Request(invalidateCacheUrl.toString())));

      try {
        const payload = (await request.json()) as {
          key?: string;
          action?: string;
          ttl?: number;
          note?: string;
        };
        if (!payload.key || !payload.action) {
          return new Response("Bad Request", {
            status: 400,
            headers: corsHeaders,
          });
        }

        if (payload.action === "block" || payload.action === "update_note") {
          const options: KVNamespacePutOptions = {};
          if (payload.ttl) {
             options.expirationTtl = payload.ttl;
          } else if (payload.action === "block") {
             options.expirationTtl = 86400;
          }
          if (payload.note !== undefined) {
             options.metadata = { note: payload.note };
          }
          await env.ASGUARD_BLACKLIST.put(payload.key, "1", options);
        } else if (payload.action === "unblock") {
          await env.ASGUARD_BLACKLIST.delete(payload.key);
        } else {
          return new Response("Invalid action", {
            status: 400,
            headers: corsHeaders,
          });
        }

        const timestamp = Date.now();
        const ttl =
          payload.action === "block" ? payload.ttl || 86400 : undefined;
        await env.ASGUARD_TELEMETRY.put(
          `audit:${timestamp}`,
          JSON.stringify({
            action: payload.action,
            target: payload.key,
            ttl: ttl,
            timestamp: timestamp,
          }),
        );

        return new Response("OK", { status: 200, headers: corsHeaders });
      } catch (e) {
        return new Response("Internal Server Error", {
          status: 500,
          headers: corsHeaders,
        });
      }
    }

    // Optionally parse telemetry if it's a telemetry endpoint


    if (request.method === "POST" && url.pathname === "/telemetry/client-error") {
      if (!hasSecret(request, "X-Asguard-Ingest-Key", env.TELEMETRY_INGEST_KEY)) {
        return new Response("Unauthorized", { status: 401, headers: corsHeaders });
      }
      const now = Date.now();
      const ipKey = clientIp;

      // Prune occasionally or handle inline
      let timestamps = clientErrorThrottleMap.get(ipKey) || [];
      // Keep only timestamps within the last 10 seconds (10000ms)
      timestamps = timestamps.filter(t => now - t <= 10000);
      timestamps.push(now);
      clientErrorThrottleMap.set(ipKey, timestamps);

      if (timestamps.length > 5) {
        return new Response("Too Many Requests", {
          status: 429,
          headers: corsHeaders,
        });
      }

      try {
        const rawPayload = await request.json() as any;

        // Ensure payload has the expected schema format and enforce correct properties.
        const payload = {
          sourceIp: clientIp, // Use standard client IP from connection
          timestamp: rawPayload.timestamp || Date.now(),
          eventType: "client_error",
          severity: "medium", // Default to medium severity for client errors
          requestMethod: request.method,
          targetResource: url.pathname,
          signatureMetadata: request.headers.get("X-Asguard-Signature") || "UNKNOWN",
          details: {
            message: rawPayload.message || "Unknown Error",
            fileTrace: rawPayload.fileTrace || "Unknown Stack Trace"
          },
          country: (request.cf && request.cf.country) ? request.cf.country : "XX",
          colo: (request.cf && request.cf.colo) ? request.cf.colo : "UNKNOWN"
        };

        const parseResult = TelemetryPayloadSchema.safeParse(payload);
        if (!parseResult.success) {
           return new Response("Invalid Telemetry Payload", {
            status: 400,
            headers: corsHeaders,
          });
        }

        ctx.waitUntil(logTelemetry(parseResult.data, env));

        return new Response("OK", {
          status: 202,
          headers: corsHeaders,
        });
      } catch(e) {
        return new Response("Bad Request", {
          status: 400,
          headers: corsHeaders,
        });
      }
    }

    if (request.method === "POST" && url.pathname === "/telemetry") {
      if (!hasSecret(request, "X-Asguard-Ingest-Key", env.TELEMETRY_INGEST_KEY)) {
        return new Response("Unauthorized", { status: 401, headers: corsHeaders });
      }
      try {
        let payload = await request.json() as any;

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
      } catch (e) {
        return new Response("Bad Request", {
          status: 400,
          headers: corsHeaders,
        });
      }
    }

    if (request.method === "POST" && url.pathname === "/analysis") {
      if (!isAdminRequest(request, env)) {
        return new Response("Unauthorized", { status: 401, headers: corsHeaders });
      }

      try {
        return await analyzeThreat(await request.json(), env);
      } catch {
        return new Response("Bad Request", { status: 400, headers: corsHeaders });
      }
    }


    if (request.method === "GET" && url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "OK", timestamp: Date.now() }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (request.method === "GET" && url.pathname === "/telemetry/summary") {
      if (!isAdminRequest(request, env)) {
        return new Response("Unauthorized", { status: 401, headers: corsHeaders });
      }
      return new Response(JSON.stringify({
        status: "OK",
        metrics: {
            uptime: process?.uptime ? process.uptime() : 'N/A', // Assuming standard env or worker doesn't have process, maybe just static
            totalEvents: 0,
            activeBlocks: 0
        }
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pass-through
    return new Response("OK", { status: 200, headers: corsHeaders });
  },
};

const localEdgeLoggingBuffer: any[] = [];

async function logTelemetry(data: any, env: Env) {
  try {
    // Capture a snapshot of the current buffer
    const bufferSnapshot = [...localEdgeLoggingBuffer];

    const dbOp = async () => {
      const existing: any[] =
        (await env.ASGUARD_TELEMETRY.get("recent_events", { type: "json" })) ||
        [];

      // Combine current data, buffer snapshot, and existing data
      let toSave = [data, ...bufferSnapshot, ...existing];

      const pruned = toSave.slice(0, 50);
      await env.ASGUARD_TELEMETRY.put("recent_events", JSON.stringify(pruned));
    };

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Database connection timeout")), 5000)
    );

    await Promise.race([dbOp(), timeoutPromise]);

    // If successful, proactive check executes to determine if old items reside within the local buffer queue
    if (bufferSnapshot.length > 0) {
      // immediately flush and append them into the underlying storage block concurrently, clearing out the localized memory stack cleanly
      localEdgeLoggingBuffer.splice(0, bufferSnapshot.length);
    }
  } catch (err) {
    console.error("Failed to log telemetry, buffering locally:", err);
    localEdgeLoggingBuffer.push(data);
    // Keep local buffer bounded
    if (localEdgeLoggingBuffer.length > 100) {
        localEdgeLoggingBuffer.shift();
    }
  }
}
