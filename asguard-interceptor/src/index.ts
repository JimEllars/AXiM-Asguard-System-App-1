import { TelemetryPayloadSchema } from "./telemetry";

const rateLimitMap = new Map<string, { count: number; timestamp: number }>();
const penaltyLedger = new Map<string, { consecutive: number; timestamp: number }>();
const clientErrorThrottleMap = new Map<string, number[]>();
const webhookRateLimitMap = new Map<string, number[]>();

function pruneRateLimitMap() {
  const now = Date.now();

  // Sweep unconditionally regardless of size to prevent stale keys across interval spikes
  for (const [key, value] of rateLimitMap.entries()) {
    if (now - value.timestamp > 10000) {
      rateLimitMap.delete(key);
    }
  }

  for (const [key, value] of penaltyLedger.entries()) {
    if (now - value.timestamp > 10000) {
      penaltyLedger.delete(key);
    }
  }

  for (const [key, timestamps] of webhookRateLimitMap.entries()) {
    const valid = timestamps.filter(t => now - t <= 60000); // 60s sliding window
    if (valid.length === 0) {
      webhookRateLimitMap.delete(key);
    } else {
      webhookRateLimitMap.set(key, valid);
    }
  }

  for (const [key, timestamps] of clientErrorThrottleMap.entries()) {
    const valid = timestamps.filter(t => now - t <= 10000);
    if (valid.length === 0) {
      clientErrorThrottleMap.delete(key);
    } else {
      clientErrorThrottleMap.set(key, valid);
    }
  }
}


function structuredLog(level: "error" | "warn", event: string, request: Request | null, details: any) {
  let colo = "UNKNOWN";
  let clientIp = "UNKNOWN";
  if (request) {
    colo = (request.cf?.colo as string) || "UNKNOWN";
    clientIp = request.headers.get("CF-Connecting-IP") || "UNKNOWN";
  }

  // Format the details safely
  const formattedDetails = details instanceof Error
    ? { message: details.message, stack: details.stack }
    : details;

  console.error(JSON.stringify({
    timestamp: Date.now(),
    level,
    colo,
    clientIp,
    event,
    details: formattedDetails
  }));
}

export interface Env {
  AI?: any;
  ASGUARD_BLACKLIST: KVNamespace;
  ASGUARD_TELEMETRY: KVNamespace;
  ASGUARD_API_KEY: string;
  ALLOWED_ORIGIN?: string;
  ASGUARD_AI_MUTATION_KEY?: string;
  ASGUARD_ALERT_WEBHOOK_URL?: string;
  ASGUARD_ALERT_EMAIL?: string;
}

function getCorsHeaders(request: Request, env: Env, isMutation: boolean) {
  let origin = request.headers.get("Origin");
  let allowedOrigin = "*";

  if (isMutation || request.method === "OPTIONS") {
    if (!env.ALLOWED_ORIGIN && origin) {
      allowedOrigin = origin;
    } else {
      const allowedOriginsStr = env.ALLOWED_ORIGIN || "https://production-domain.com";
      const allowedOriginsArray = allowedOriginsStr.split(',').map(s => s.trim());

      if (origin) {
        if (allowedOriginsArray.includes(origin)) {
          allowedOrigin = origin;
        } else if (
          origin === "http://localhost:3000" ||
          origin.endsWith('.staging.domain.com') ||
          origin.endsWith('.testing.domain.com')
        ) {
          // If testing subdomains or local loopback are dynamically allowed
          allowedOrigin = origin;
        } else {
          allowedOrigin = "DENY";
        }
      }
    }
  }

  return {
    "Access-Control-Allow-Origin": allowedOrigin !== "DENY" ? allowedOrigin : "",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Asguard-Auth, X-Asguard-Signature",
    "Access-Control-Expose-Headers": "Server-Timing, X-Asguard-RateLimit-Remaining, X-Asguard-Colo, X-Asguard-Req-Id",
  };
}



async function evaluateEdgeSafety(env: Env, inputContent: string) {
  if (!env.AI) return { safe: true, threatCategory: null };
  try {
    const response = await env.AI.run('@cf/meta/llama-guard-3-8b', {
      messages: [{ role: 'user', content: inputContent }]
    });

    const output = typeof response === 'string' ? response : (response as any)?.response || '';
    if (output.toLowerCase().includes('unsafe')) {
      return { safe: false, threatCategory: output };
    }
    return { safe: true, threatCategory: null };
  } catch (err) {
    console.warn('[WORKERS_AI] Llama Guard evaluation bypassed on exception:', err);
    return { safe: true, threatCategory: null };
  }
}

async function dispatchCriticalAlert(env: Env, eventPayload: any, request: Request | null, ctx: ExecutionContext) {
  try {
    if (!env.ASGUARD_ALERT_WEBHOOK_URL) return;
    if (eventPayload.severity !== "critical" && eventPayload.severity !== "high") return;

    let webhookSuccess = false;
    try {
      // Non-blocking fetch
      const response = await fetch(env.ASGUARD_ALERT_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          alert: "Critical Security Incident",
          event: eventPayload
        })
      });
      if (response.ok) {
        webhookSuccess = true;
      }
    } catch (e) {
      structuredLog("error", "Webhook dispatch failed", request, e);
    }

    if (!webhookSuccess) {
      if (env.ASGUARD_ALERT_EMAIL) {
        structuredLog("warn", "critical_alert_webhook_failed_fallback_triggered", request, {
          event: eventPayload,
          fallbackEmail: env.ASGUARD_ALERT_EMAIL
        });

        ctx.waitUntil((async () => {
          // Out-of-band alert payload dispatch simulation
          console.log(`[ALERT FALLBACK] Dispatching alert to ${env.ASGUARD_ALERT_EMAIL} for payload:`, eventPayload);
        })());
      }
    }
  } catch (e) {
    structuredLog("error", "Critical alert fallback failed", request, e);
  }
}

export default {
  async scheduled(
    event: any,
    env: Env,
    ctx: ExecutionContext
  ) {
    ctx.waitUntil(
      (async () => {
        try {
          const listResult = await env.ASGUARD_BLACKLIST.list({ limit: 100 });
          const now = Date.now();
          const expiredKeys = listResult.keys.filter(k => k.expiration && k.expiration < now / 1000);

          await Promise.all(expiredKeys.map(k => env.ASGUARD_BLACKLIST.delete(k.name)));
        } catch (e) {
          structuredLog("error", "Scheduled cleanup failed", null, e);
        }

        if (localEdgeLoggingBuffer.length > 0) {
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
                // Not standard, skip or treat as telemetry
                return Promise.resolve();
              } else {
                // Default telemetry event
                const recentEventsStr = await env.ASGUARD_TELEMETRY.get("recent_events", { type: "json" }) || [];
                const existing = Array.isArray(recentEventsStr) ? recentEventsStr : [];
                const toSave = [item, ...existing].slice(0, 50);
                return env.ASGUARD_TELEMETRY.put("recent_events", JSON.stringify(toSave));
              }
            });

            const results = await Promise.allSettled(promises);

            // Remove successful items from local buffer
            for (let i = results.length - 1; i >= 0; i--) {
               if (results[i].status === 'fulfilled') {
                  const idx = localEdgeLoggingBuffer.indexOf(bufferSnapshot[i]);
                  if (idx !== -1) {
                     localEdgeLoggingBuffer.splice(idx, 1);
                  }
               }
            }
          } catch (err) {
            structuredLog("error", "Scheduled buffer flush failed", null, err);
          }
        }
      })()
    );
  },

  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const startTime = Date.now();
    let response: Response;
    try {
      response = await this.handle(request, env, ctx);
    } catch (error) {
      // In case handle throws an error not caught within it
      response = new Response("Internal Server Error", { status: 500 });
    }
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
    const isMutation = request.method === 'POST' || request.method === 'DELETE';

    // Task 2: Cryptographic Signature Verification for Webhooks
    const url = new URL(request.url);
    if (request.method === "POST" && (url.pathname === "/webhooks/stripe" || url.pathname === "/api/v1/credentials/mint")) {

      // Rate limiting for cryptographic routes (60-second window, max 3 requests)
      const clientIp = request.headers.get("cf-connecting-ip") || "unknown";
      if (clientIp !== "unknown") {
        const now = Date.now();
        let timestamps = webhookRateLimitMap.get(clientIp) || [];
        timestamps = timestamps.filter(t => now - t <= 60000);
        timestamps.push(now);
        webhookRateLimitMap.set(clientIp, timestamps);

        if (timestamps.length > 3) {
            return new Response("Too Many Requests", { status: 429, headers: getCorsHeaders(request, env, isMutation) });
        }
      }

      const isStripe = url.pathname === "/webhooks/stripe";
      const sigHeader = isStripe ? "Stripe-Signature" : "X-Axim-Signature";
      const secretKey = isStripe ? "stripe_secret" : "axim_secret";

      const signature = request.headers.get(sigHeader);
      if (!signature) {
        return new Response("Unauthorized", { status: 401, headers: getCorsHeaders(request, env, isMutation) });
      }

      const secret = await env.ASGUARD_BLACKLIST.get(secretKey);
      if (!secret) {
        return new Response("Unauthorized", { status: 401, headers: getCorsHeaders(request, env, isMutation) });
      }

      const clonedRequest = request.clone();
      const bodyText = await clonedRequest.text();

      try {
        const bodyData = JSON.parse(bodyText);
        const incomingTimestamp: number = bodyData.timestamp;

        if (!incomingTimestamp || typeof incomingTimestamp !== 'number') {
          throw new Error("Invalid timestamp");
        }

        const currentTime = Date.now();
        if (Math.abs(currentTime - incomingTimestamp) > 300000) {
          throw new Error("Timestamp out of bounds");
        }

        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
          "raw", encoder.encode(secret),
          { name: "HMAC", hash: "SHA-256" },
          false, ["sign"]
        );
        const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(bodyText));
        const signatureArray = Array.from(new Uint8Array(signatureBuffer));
        const validSignature = signatureArray.map(b => b.toString(16).padStart(2, '0')).join('');

        if (signature !== validSignature) {
          throw new Error("Signature mismatch");
        }
      } catch (err) {
        const timestamp = Date.now();
        const payload = {
          sourceIp: request.headers.get("cf-connecting-ip") || "unknown",
          timestamp: timestamp,
          eventType: "signature_tampering",
          severity: "high",
          requestMethod: request.method,
          targetResource: url.pathname,
          appOrigin: (() => {
            const appId = request.headers.get("X-Axim-App-ID");
            const VALID_APP_IDS = ["AXiM Academy", "The Green Machine", "Nexus CRM", "Web3 Frontend"];
            return (appId && VALID_APP_IDS.includes(appId)) ? appId : "AXiM Macro Core Gateway";
          })(),
          details: {
            error: err instanceof Error ? err.message : String(err)
          },
          country: (request.cf && request.cf.country) ? request.cf.country : "XX",
          colo: (request.cf && request.cf.colo) ? request.cf.colo : "UNKNOWN"
        };
        ctx.waitUntil(logTelemetry(payload, env));

        return new Response("Unauthorized", { status: 401, headers: getCorsHeaders(request, env, isMutation) });
      }
    }

    if (request.method === "OPTIONS") {
      const headers = getCorsHeaders(request, env, true);
      if (!headers["Access-Control-Allow-Origin"]) {
        return new Response("Forbidden", { status: 403 });
      }
      return new Response(null, { status: 204, headers });
    }


    const headers = getCorsHeaders(request, env, isMutation);
    if ((isMutation) && !headers["Access-Control-Allow-Origin"]) {
      return new Response("Forbidden", { status: 403 });
    }
    const clientIp = request.headers.get("cf-connecting-ip") || "unknown";

    // Task 1: Multi-Vector Wallet Blacklisting (Moved up)
    let extractedWalletAddress: string | null = null;
    if (request.method === "POST" && request.body) {
      try {
        const contentLengthHeader = request.headers.get("content-length");
        let bypassParsing = false;
        if (contentLengthHeader) {
          const contentLength = parseInt(contentLengthHeader, 10);
          if (isNaN(contentLength) || contentLength > 65536) {
             bypassParsing = true;
          }
        } else {

           bypassParsing = true;
        }

        if (!bypassParsing) {
          // We must clone the request to avoid consuming the body for downstream handlers
          const clonedRequest = request.clone();
          const bodyText = await clonedRequest.text();
          if (bodyText) {
            const bodyData = JSON.parse(bodyText);
            if (bodyData && bodyData.web3WalletAddress && typeof bodyData.web3WalletAddress === 'string') {
              extractedWalletAddress = bodyData.web3WalletAddress;
              const isWalletBlocked = await env.ASGUARD_BLACKLIST.get(`wallet:${extractedWalletAddress}`);
              if (isWalletBlocked) {
                return new Response("Forbidden", { status: 403, headers: getCorsHeaders(request, env, isMutation) });
              }
            }
          }
        }
      } catch (err) {
        // Ignore parse errors here, downstream will handle invalid JSON
      }
    }

    // Fast check against KV for blocked IP
    if (clientIp !== "unknown") {
      const isBlocked = await env.ASGUARD_BLACKLIST.get(
        `ip:${clientIp}`,
      );
      if (isBlocked) {
        return new Response("Forbidden", { status: 403, headers: getCorsHeaders(request, env, isMutation) });
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
          ctx.waitUntil(env.ASGUARD_BLACKLIST.put(`ip:${clientIp}`, "1", { expirationTtl: 86400 }).catch(err => {
            structuredLog("error", "Flood control block failed", request, err);
            localEdgeLoggingBuffer.push({ type: 'blacklist_put', key: `ip:${clientIp}` });
          }));

          if (extractedWalletAddress) {
            ctx.waitUntil(env.ASGUARD_BLACKLIST.put(`wallet:${extractedWalletAddress}`, "1", { expirationTtl: 86400 }).catch(err => {
              structuredLog("error", "Flood control wallet block failed", request, err);
              localEdgeLoggingBuffer.push({ type: 'blacklist_put', key: `wallet:${extractedWalletAddress}` });
            }));
          }
        }

        return new Response("Too Many Requests", { status: 429, headers: getCorsHeaders(request, env, isMutation) });
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
        return new Response("Forbidden", { status: 403, headers: getCorsHeaders(request, env, isMutation) });
      }
    }


    if (request.method === "GET" && url.pathname === "/health") {
      const customAuthHeader = request.headers.get("X-Asguard-Auth");
      if (!env.ASGUARD_API_KEY || customAuthHeader !== env.ASGUARD_API_KEY) {
        return new Response("Unauthorized", {
          status: 401,
          headers: getCorsHeaders(request, env, isMutation),
        });
      }

      try {
        await Promise.all([
          env.ASGUARD_BLACKLIST.get("health-check-key").catch(e => { throw new Error("ASGUARD_BLACKLIST failed") }),
          env.ASGUARD_TELEMETRY.get("health-check-key").catch(e => { throw new Error("ASGUARD_TELEMETRY failed") })
        ]);

        return new Response(JSON.stringify({
          status: "ok",
          blacklist: "ok",
          telemetry: "ok",
          rateLimitSize: rateLimitMap.size,
          penaltyLedgerSize: penaltyLedger.size,
          timestamp: Date.now()
        }), {
          status: 200,
          headers: { ...getCorsHeaders(request, env, isMutation), "Content-Type": "application/json", "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({
          status: "degraded",
          error: err.message,
          timestamp: Date.now()
        }), {
          status: 500,
          headers: { ...getCorsHeaders(request, env, isMutation), "Content-Type": "application/json", "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" }
        });
      }
    }
    if (request.method === "POST" && url.pathname === "/dlq/unquarantine") {
      const customAuthHeader = request.headers.get("X-Asguard-Auth");
      if (!env.ASGUARD_API_KEY || customAuthHeader !== env.ASGUARD_API_KEY) {
        return new Response("Unauthorized", {
          status: 401,
          headers: getCorsHeaders(request, env, isMutation),
        });
      }

      try {
        const body = await request.json() as { id: string };
        if (!body || !body.id) {
          return new Response("Missing id in payload", {
            status: 400,
            headers: getCorsHeaders(request, env, isMutation),
          });
        }

        const targetKvKey = body.id.replace('dlq-', 'dlq:');
        const existingDataStr = await env.ASGUARD_TELEMETRY.get(targetKvKey);

        if (!existingDataStr) {
          return new Response("DLQ item not found", {
            status: 404,
            headers: getCorsHeaders(request, env, isMutation),
          });
        }

        const existingData = JSON.parse(existingDataStr);
        existingData.status = "active";
        existingData.retryCount = 0;

        await env.ASGUARD_TELEMETRY.put(targetKvKey, JSON.stringify(existingData));

        const authorizedByWallet = request.headers.get("X-Asguard-Signature") || "UNKNOWN";
        const timestamp = Date.now();

        ctx.waitUntil((async () => {
            try {
              const auditDbOp = async () => {
                const existing: any[] = (await env.ASGUARD_TELEMETRY.get("recent_events", { type: "json" })) || [];
                await env.ASGUARD_TELEMETRY.put(
                  "recent_events",
                  JSON.stringify([{
                    timestamp: timestamp,
                    eventType: "audit_log",
                    severity: "low",
                    sourceIp: "internal",
                    details: {
                      action: "dlq_unquarantined",
                      target: body.id,
                      timestamp: timestamp,
                      authorizedByWallet: authorizedByWallet
                    }
                  }, ...existing].slice(0, 50))
                );

                await env.ASGUARD_TELEMETRY.put(
                  `audit:${timestamp}`,
                  JSON.stringify({
                    action: "dlq_unquarantined",
                    target: body.id,
                    timestamp: timestamp,
                    authorizedByWallet: authorizedByWallet
                  })
                );
              };
              const auditTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Database connection timeout")), 5000));
              await Promise.race([auditDbOp(), auditTimeout]);
            } catch (err) {
              structuredLog("error", "Failed to log audit telemetry for dlq_unquarantined", request, err);
              localEdgeLoggingBuffer.push({
                type: "audit",
                key: `audit:${timestamp}`,
                payload: {
                  action: "dlq_unquarantined",
                  target: body.id,
                  timestamp: timestamp,
                  authorizedByWallet: authorizedByWallet,
                }
              });
              if (localEdgeLoggingBuffer.length > 100) localEdgeLoggingBuffer.shift();
            }
        })());

        return new Response("OK", { status: 200, headers: getCorsHeaders(request, env, isMutation) });
      } catch (e) {
        return new Response("Internal Server Error", {
          status: 500,
          headers: getCorsHeaders(request, env, isMutation),
        });
      }
    }



    if (request.method === "POST" && url.pathname === "/dlq/replay") {
      const customAuthHeader = request.headers.get("X-Asguard-Auth");
      if (!env.ASGUARD_API_KEY || customAuthHeader !== env.ASGUARD_API_KEY) {
        return new Response("Unauthorized", {
          status: 401,
          headers: getCorsHeaders(request, env, isMutation),
        });
      }

      try {
        const body = await request.json() as { id: string };
        if (!body || !body.id) {
          return new Response("Missing id in payload", {
            status: 400,
            headers: getCorsHeaders(request, env, isMutation),
          });
        }

        // The id returned to the client matches the original id inside the json payload, e.g., 'dlq-1234'.
        // We need to map it back to the KV key which is 'dlq:1234' for deletion.
        const targetKvKey = body.id.replace('dlq-', 'dlq:');

        const timestamp = Date.now();

        try {
          const existingDlqDataStr = await env.ASGUARD_TELEMETRY.get(targetKvKey);
          if (existingDlqDataStr) {
            const existingDlqData = JSON.parse(existingDlqDataStr);
            if (existingDlqData.retryCount && existingDlqData.retryCount >= 3) {
              existingDlqData.status = "quarantined";

              ctx.waitUntil(
                (async () => {
                  try {
                    await Promise.all([
                      env.ASGUARD_TELEMETRY.put(targetKvKey, JSON.stringify(existingDlqData)),
                      env.ASGUARD_TELEMETRY.put(
                        `audit:${timestamp}`,
                        JSON.stringify({
                          action: "dlq_quarantined",
                          target: body.id,
                          timestamp: timestamp
                        })
                      )
                    ]);
                  } catch (e) {
                    localEdgeLoggingBuffer.push({
                      type: "dlq_quarantine_error",
                      key: `audit:${timestamp}`,
                      payload: {
                        action: "dlq_quarantined",
                        target: body.id,
                        timestamp: timestamp
                      }
                    });
                  }
                })()
              );

              return new Response("Unprocessable Entity: DLQ item quarantined", {
                status: 422,
                headers: getCorsHeaders(request, env, isMutation),
              });
            }
          }
        } catch (err) {
          // Ignore fetch error, proceed with replay attempt
        }

        ctx.waitUntil(
          (async () => {
             try {
                await Promise.all([
                  env.ASGUARD_TELEMETRY.put(
                    `audit:${timestamp}`,
                    JSON.stringify({
                      action: "dlq_replay",
                      target: body.id,
                      timestamp: timestamp
                    })
                  ),
                  env.ASGUARD_TELEMETRY.delete(targetKvKey)
                ]);
             } catch (err) {
                structuredLog("error", "Failed to process DLQ replay", request, err);

                // Track cumulative replay retries on DLQ failures
                try {
                  const existingDlqDataStr = await env.ASGUARD_TELEMETRY.get(targetKvKey);
                  if (existingDlqDataStr) {
                    const existingDlqData = JSON.parse(existingDlqDataStr);
                    existingDlqData.retryCount = (existingDlqData.retryCount || 0) + 1;
                    await env.ASGUARD_TELEMETRY.put(targetKvKey, JSON.stringify(existingDlqData));
                  }
                } catch (retryErr) {
                  structuredLog("error", "Failed to update DLQ retry count", request, retryErr);
                }

                localEdgeLoggingBuffer.push({
                  type: "dlq_replay_error",
                  key: `audit:${timestamp}`,
                  payload: {
                    action: "dlq_replay",
                    target: body.id,
                    timestamp: timestamp
                  }
                });
             }
          })()
        );

        return new Response("OK", {
          status: 200,
          headers: getCorsHeaders(request, env, isMutation),
        });
      } catch(e) {
        return new Response("Bad Request", {
          status: 400,
          headers: getCorsHeaders(request, env, isMutation),
        });
      }
    }

    if (request.method === "GET" && url.pathname === "/dlq") {
      const customAuthHeader = request.headers.get("X-Asguard-Auth");
      if (!env.ASGUARD_API_KEY || customAuthHeader !== env.ASGUARD_API_KEY) {
        return new Response("Unauthorized", {
          status: 401,
          headers: getCorsHeaders(request, env, isMutation),
        });
      }

      try {
        const listResult = await env.ASGUARD_TELEMETRY.list({ prefix: "dlq:", limit: 100 });
        const records = await Promise.all(
          listResult.keys.map(async (key) => {
             const data = await env.ASGUARD_TELEMETRY.get(key.name);
             try {
                return data ? JSON.parse(data) : null;
             } catch(e) {
                return null;
             }
          })
        );
        const validRecords = records.filter(r => r !== null && r.status !== "quarantined");
        return new Response(JSON.stringify(validRecords), {
          status: 200,
          headers: { ...getCorsHeaders(request, env, isMutation), "Content-Type": "application/json", "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
        });
      } catch (e) {
        return new Response("Internal Server Error", {
          status: 500,
          headers: getCorsHeaders(request, env, isMutation),
        });
      }
    }

    if (request.method === "DELETE" && (url.pathname === "/dlq" || url.pathname === "/api/dlq")) {
      const customAuthHeader = request.headers.get("X-Asguard-Auth");
      if (!env.ASGUARD_API_KEY || customAuthHeader !== env.ASGUARD_API_KEY) {
        return new Response("Unauthorized", {
          status: 401,
          headers: getCorsHeaders(request, env, isMutation),
        });
      }

      let idToPurge = url.searchParams.get("id");

      if (!idToPurge) {
        try {
          const body = await request.json() as { id?: string };
          idToPurge = body.id || null;
        } catch (e) {
          // Body might be empty or invalid json
        }
      }

      if (!idToPurge) {
        return new Response("Missing id parameter", {
          status: 400,
          headers: getCorsHeaders(request, env, isMutation),
        });
      }

      const authorizedByWallet = request.headers.get("X-Asguard-Signature") || "UNKNOWN";
      const targetKvKey = idToPurge.replace('dlq-', 'dlq:');
      const timestamp = Date.now();

      ctx.waitUntil(
        (async () => {
          try {
            await Promise.all([
              env.ASGUARD_TELEMETRY.put(
                `audit:${timestamp}`,
                JSON.stringify({
                  action: "dlq_purge",
                  target: targetKvKey,
                  timestamp: timestamp,
                  authorizedByWallet: authorizedByWallet
                })
              ),
              env.ASGUARD_TELEMETRY.delete(targetKvKey)
            ]);
          } catch (err) {
            structuredLog("error", "Failed to process DLQ purge", request, err);
            localEdgeLoggingBuffer.push({
              type: "dlq_purge_error",
              key: `audit:${timestamp}`,
              payload: {
                action: "dlq_purge",
                target: targetKvKey,
                timestamp: timestamp,
                authorizedByWallet: authorizedByWallet
              }
            });
          }
        })()
      );

      return new Response("OK", {
        status: 200,
        headers: getCorsHeaders(request, env, isMutation),
      });
    }

    if (request.method === "POST" && url.pathname === "/dlq/bulk-replay") {
      const customAuthHeader = request.headers.get("X-Asguard-Auth");
      if (!env.ASGUARD_API_KEY || customAuthHeader !== env.ASGUARD_API_KEY) {
        return new Response("Unauthorized", {
          status: 401,
          headers: getCorsHeaders(request, env, isMutation),
        });
      }

      try {
        const body = await request.json() as any[];
        if (!Array.isArray(body)) {
          return new Response("Payload must be an array", {
            status: 400,
            headers: getCorsHeaders(request, env, isMutation),
          });
        }

        const timestamp = Date.now();
        let replayed = 0;
        let failed = 0;

        const replayPromises = body.map(async (record) => {
          let targetKvKey = '';
          let payloadToReplay = null;

          if (typeof record === 'string') {
             targetKvKey = record.replace('dlq-', 'dlq:');
          } else if (record && record.id) {
             targetKvKey = record.id.replace('dlq-', 'dlq:');
             payloadToReplay = record.payload || null;
          }

          if (!targetKvKey) {
             failed++;
             return;
          }

          try {
            const existingDataStr = await env.ASGUARD_TELEMETRY.get(targetKvKey);
            if (existingDataStr) {
               const existingData = JSON.parse(existingDataStr);
               if (existingData.status === "quarantined") {
                  // Skip quarantined items
                  return;
               }
            }
          } catch (e) {
            // Ignore fetch error
          }

          try {
            if (payloadToReplay) {
                // If payload is provided in the record, try to re-dispatch it
                await logTelemetry(payloadToReplay, env);
            }

            await Promise.all([
              env.ASGUARD_TELEMETRY.put(
                `audit:${timestamp}-${Math.random()}`,
                JSON.stringify({
                  action: "dlq_replay",
                  target: targetKvKey,
                  timestamp: timestamp
                })
              ),
              env.ASGUARD_TELEMETRY.delete(targetKvKey)
            ]);
            replayed++;
          } catch (err) {
            structuredLog("error", "Failed to process DLQ bulk replay item", request, err);
            failed++;
          }
        });

        await Promise.all(replayPromises);

        return new Response(JSON.stringify({ replayed, failed }), {
          status: 200,
          headers: { ...getCorsHeaders(request, env, isMutation), "Content-Type": "application/json", "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
        });

      } catch(e) {
        return new Response("Bad Request", {
          status: 400,
          headers: getCorsHeaders(request, env, isMutation),
        });
      }
    }


    if (request.method === "GET" && url.pathname === "/telemetry") {
      const customAuthHeader = request.headers.get("X-Asguard-Auth");
      if (!env.ASGUARD_API_KEY || customAuthHeader !== env.ASGUARD_API_KEY) {
        return new Response("Unauthorized", {
          status: 401,
          headers: getCorsHeaders(request, env, isMutation),
        });
      }
      try {
        const data =
          (await env.ASGUARD_TELEMETRY.get("recent_events", {
            type: "json",
          })) || [];
        return new Response(JSON.stringify(data), {
          status: 200,
          headers: { ...getCorsHeaders(request, env, isMutation), "Content-Type": "application/json", "Cache-Control": "private, no-cache, no-transform" },
        });
      } catch (e) {
        return new Response("Internal Server Error", {
          status: 500,
          headers: getCorsHeaders(request, env, isMutation),
        });
      }
    }

    if (request.method === "GET" && url.pathname === "/audit") {
      const customAuthHeader = request.headers.get("X-Asguard-Auth");
      if (!env.ASGUARD_API_KEY || customAuthHeader !== env.ASGUARD_API_KEY) {
        return new Response("Unauthorized", {
          status: 401,
          headers: getCorsHeaders(request, env, isMutation),
        });
      }
      try {
        const listResult = await env.ASGUARD_TELEMETRY.list({
          prefix: "audit:",
          limit: 100
        });
        const values = await Promise.all(
          listResult.keys.map(key => env.ASGUARD_TELEMETRY.get(key.name, { type: "json" }))
        );
        const auditEvents = values.filter(value => value !== null);

        // Sort in descending order by timestamp
        auditEvents.sort((a: any, b: any) => b.timestamp - a.timestamp);

        return new Response(JSON.stringify(auditEvents), {
          status: 200,
          headers: { ...getCorsHeaders(request, env, isMutation), "Content-Type": "application/json", "Cache-Control": "private, no-cache, no-transform" },
        });
      } catch (e) {
        return new Response("Internal Server Error", {
          status: 500,
          headers: getCorsHeaders(request, env, isMutation),
        });
      }
    }

    if (request.method === "GET" && url.pathname === "/blocklist") {
      const customAuthHeader = request.headers.get("X-Asguard-Auth");
      if (!env.ASGUARD_API_KEY || customAuthHeader !== env.ASGUARD_API_KEY) {
        return new Response("Unauthorized", {
          status: 401,
          headers: getCorsHeaders(request, env, isMutation),
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
        const listResult = await env.ASGUARD_BLACKLIST.list({ limit: 100 });
        const keys = listResult.keys.map((k) => {
          let note = undefined;
          if (k.metadata && typeof k.metadata === 'object' && 'note' in k.metadata) {
            note = (k.metadata as any).note;
          }
          return { name: k.name, expiration: k.expiration, note };
        });
        const responsePayload = new Response(JSON.stringify(keys), {
          status: 200,
          headers: { ...getCorsHeaders(request, env, isMutation), "Content-Type": "application/json", "Cache-Control": "public, max-age=15, stale-while-revalidate=45" },
        });

        ctx.waitUntil(cache.put(cacheKey, responsePayload.clone()));

        return responsePayload;
      } catch (e) {
        return new Response("Internal Server Error", {
          status: 500,
          headers: getCorsHeaders(request, env, isMutation),
        });
      }
    }

    if (request.method === "POST" && url.pathname === "/blocklist/autonomous") {
      const authHeader = request.headers.get("Authorization");
      if (!env.ASGUARD_AI_MUTATION_KEY || authHeader !== `Bearer ${env.ASGUARD_AI_MUTATION_KEY}`) {
        return new Response("Unauthorized", {
          status: 401,
          headers: getCorsHeaders(request, env, isMutation),
        });
      }

      try {
        const payload = (await request.json()) as {
          key?: string;
          ttl?: number;
          note?: string;
        };

        if (!payload.key || payload.key.startsWith("wallet:")) {
          return new Response("Bad Request: Invalid key structural fence", {
            status: 400,
            headers: getCorsHeaders(request, env, isMutation),
          });
        }

        const maxTtl = 604800; // 7 days in seconds
        const ttl = (payload.ttl && payload.ttl <= maxTtl) ? payload.ttl : maxTtl;

        const options: KVNamespacePutOptions = {
          expirationTtl: ttl,
        };

        if (payload.note !== undefined) {
          options.metadata = { note: payload.note };
        } else {
          options.metadata = { note: "Autonomous AI Triage Mitigation" };
        }

        let isExtension = false;
        try {
          const existing = await env.ASGUARD_BLACKLIST.get(payload.key!);
          if (existing !== null) {
            isExtension = true;
          }
        } catch(err) {
          // Ignore
        }

        ctx.waitUntil(
          (async () => {
            try {
              await Promise.race([
                env.ASGUARD_BLACKLIST.put(payload.key!, "1", options),
                new Promise((_, r) => setTimeout(() => r(new Error("Timeout")), 5000))
              ]);
            } catch (e) {
              structuredLog("error", "Failed to update blocklist", request, e);
              localEdgeLoggingBuffer.push({ type: 'blacklist_put_autonomous', key: payload.key, options });
            }
          })()
        );

        if (isExtension) {
          return new Response("Autonomous Mitigation Extended", {
            status: 200,
            headers: getCorsHeaders(request, env, isMutation),
          });
        } else {
          return new Response("Autonomous Mitigation Applied", {
            status: 201,
            headers: getCorsHeaders(request, env, isMutation),
          });
        }
      } catch (e) {
        return new Response("Bad Request", {
          status: 400,
          headers: getCorsHeaders(request, env, isMutation),
        });
      }
    }

    if ((request.method === "POST" || request.method === "DELETE") && url.pathname === "/blocklist") {
      const customAuthHeader = request.headers.get("X-Asguard-Auth");
      if (!env.ASGUARD_API_KEY || customAuthHeader !== env.ASGUARD_API_KEY) {
        return new Response("Unauthorized", {
          status: 401,
          headers: getCorsHeaders(request, env, isMutation),
        });
      }

      const operatorWallet = request.headers.get("X-Asguard-Signature");
      if (operatorWallet) {
        const isRevoked = await env.ASGUARD_BLACKLIST.get(`wallet:${operatorWallet}`);
        if (isRevoked) {
          return new Response("Forbidden: Admin wallet revoked", {
            status: 403,
            headers: getCorsHeaders(request, env, isMutation),
          });
        }
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
            headers: getCorsHeaders(request, env, isMutation),
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
          ctx.waitUntil(
            (async () => {
              try {
                await Promise.race([
                  env.ASGUARD_BLACKLIST.put(payload.key!, "1", options),
                  new Promise((_, r) => setTimeout(() => r(new Error("Timeout")), 5000))
                ]);
              } catch (e) {
                structuredLog("error", "Failed to update blocklist", request, e);
                localEdgeLoggingBuffer.push({ type: 'blacklist_put', key: payload.key, options });
              }
            })()
          );

          if (payload.action === "update_note") {
             const ts = Date.now();
             ctx.waitUntil(
                (async () => {
                  try {
                    await env.ASGUARD_TELEMETRY.put(
                      `audit:${ts}`,
                      JSON.stringify({
                        action: payload.action,
                        target: payload.key,
                        timestamp: ts,
                      })
                    );
                  } catch (e) {
                    structuredLog("error", "Failed to log update_note audit", request, e);
                    localEdgeLoggingBuffer.push({
                      type: "audit_error",
                      key: `audit:${ts}`,
                      payload: {
                        action: payload.action,
                        target: payload.key,
                        timestamp: ts,
                      }
                    });
                  }
                })()
             );
          }
        } else if (payload.action === "unblock") {
          ctx.waitUntil(
            (async () => {
              try {
                await Promise.race([
                  env.ASGUARD_BLACKLIST.delete(payload.key!),
                  new Promise((_, r) => setTimeout(() => r(new Error("Timeout")), 5000))
                ]);
              } catch (e) {
                structuredLog("error", "Failed to delete from blocklist", request, e);
                localEdgeLoggingBuffer.push({ type: 'blacklist_delete', key: payload.key });
              }
            })()
          );
        } else {
          return new Response("Invalid action", {
            status: 400,
            headers: getCorsHeaders(request, env, isMutation),
          });
        }

        const timestamp = Date.now();
        const authorizedByWallet = request.headers.get("X-Asguard-Signature") || "UNKNOWN";
        const ttl =
          payload.action === "block" ? payload.ttl || 86400 : undefined;
        ctx.waitUntil(
          (async () => {
            try {
              const auditDbOp = async () => {
                await env.ASGUARD_TELEMETRY.put(
                  `audit:${timestamp}`,
                  JSON.stringify({
                    action: payload.action,
                    target: payload.key,
                    ttl: ttl,
                    timestamp: timestamp,
                    authorizedByWallet: payload.action === "unblock" ? authorizedByWallet : undefined,
                  })
                );
              };
              const auditTimeout = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Database connection timeout")), 5000)
              );
              await Promise.race([auditDbOp(), auditTimeout]);
            } catch (err) {
              structuredLog("error", "Failed to log audit telemetry", request, err);
              localEdgeLoggingBuffer.push({
                type: "audit",
                key: `audit:${timestamp}`,
                payload: {
                  action: payload.action,
                  target: payload.key,
                  ttl: ttl,
                  timestamp: timestamp,
                  authorizedByWallet: payload.action === "unblock" ? authorizedByWallet : undefined,
                }
              });
              if (localEdgeLoggingBuffer.length > 100) {
                localEdgeLoggingBuffer.shift();
              }
            }
          })()
        );

        return new Response("OK", { status: 200, headers: getCorsHeaders(request, env, isMutation) });
      } catch (e) {
        return new Response("Internal Server Error", {
          status: 500,
          headers: getCorsHeaders(request, env, isMutation),
        });
      }
    }

    // Optionally parse telemetry if it's a telemetry endpoint


    if (request.method === "POST" && url.pathname === "/telemetry/client-error") {
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
          headers: getCorsHeaders(request, env, isMutation),
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
          colo: (request.cf && request.cf.colo) ? request.cf.colo : "UNKNOWN",
          appOrigin: (() => {
            const appId = request.headers.get("X-Axim-App-ID");
            const VALID_APP_IDS = ["AXiM Academy", "The Green Machine", "Nexus CRM", "Web3 Frontend"];
            return (appId && VALID_APP_IDS.includes(appId)) ? appId : "AXiM Macro Core Gateway";
          })()
        };

        // evaluate AI Threat
        let contentToEvaluate = "";
        if (payload.details) {
            contentToEvaluate = typeof payload.details === 'string' ? payload.details : JSON.stringify(payload.details);
        }

        if (contentToEvaluate) {
            const aiSafety = await evaluateEdgeSafety(env, contentToEvaluate);
            if (!aiSafety.safe) {
                payload.severity = "critical";
                payload.aiThreatFlag = true;
                if (!payload.details) payload.details = {};
                if (typeof payload.details === 'object') {
                    payload.details.aiThreatCategory = aiSafety.threatCategory;
                }
            }
        }

        const parseResult = TelemetryPayloadSchema.safeParse(payload);
        if (!parseResult.success) {
           ctx.waitUntil(env.ASGUARD_TELEMETRY.put(`dlq:${Date.now()}`, JSON.stringify({
              id: `dlq-${Date.now()}`,
              timestamp: Date.now(),
              originNode: payload.colo || "UNKNOWN",
              droppedRoute: url.pathname,
              errorReason: "Schema validation failure",
              payload: payload
           })));
           return new Response("Invalid Telemetry Payload", {
            status: 400,
            headers: getCorsHeaders(request, env, isMutation),
          });
        }

        ctx.waitUntil(logTelemetry(parseResult.data, env));
        ctx.waitUntil(dispatchCriticalAlert(env, parseResult.data, request, ctx));

        return new Response("OK", {
          status: 202,
          headers: getCorsHeaders(request, env, isMutation),
        });
      } catch(e) {
        return new Response("Bad Request", {
          status: 400,
          headers: getCorsHeaders(request, env, isMutation),
        });
      }
    }

    if (request.method === "POST" && url.pathname === "/telemetry") {
      try {
        let payload = await request.json() as any;

        // Enrich with Cloudflare metadata
        payload.country = (request.cf && request.cf.country) ? request.cf.country : "XX";
        payload.colo = (request.cf && request.cf.colo) ? request.cf.colo : "UNKNOWN";

        // Task 1: Map Tenant App-ID Headers
        const VALID_APP_IDS = ["AXiM Academy", "The Green Machine", "Nexus CRM", "Web3 Frontend"];
        const appIdHeader = request.headers.get("X-Axim-App-ID");
        if (appIdHeader && VALID_APP_IDS.includes(appIdHeader)) {
            payload.appOrigin = appIdHeader;
        } else {
            payload.appOrigin = "AXiM Macro Core Gateway";
        }

        // Task 2: Cloudflare Bot Management Telemetry Metrics
        if (request.cf && (request.cf as any).botManagement && (request.cf as any).botManagement.score !== undefined) {
            payload.botScore = (request.cf as any).botManagement.score;
            if (!payload.details) payload.details = {};
            payload.details.edgeBotScore = payload.botScore; // Inject into details block as per instructions
        }

        payload.requestMethod = request.method;
        payload.targetResource = url.pathname;
        payload.signatureMetadata = request.headers.get("X-Asguard-Signature") || "UNKNOWN";

        // evaluate AI Threat
        let contentToEvaluate = "";
        if (payload.details) {
            contentToEvaluate = typeof payload.details === 'string' ? payload.details : JSON.stringify(payload.details);
        }

        if (contentToEvaluate) {
            const aiSafety = await evaluateEdgeSafety(env, contentToEvaluate);
            if (!aiSafety.safe) {
                payload.severity = "critical";
                payload.aiThreatFlag = true;
                if (!payload.details) payload.details = {};
                if (typeof payload.details === 'object') {
                    payload.details.aiThreatCategory = aiSafety.threatCategory;
                }
            }
        }

        const parseResult = TelemetryPayloadSchema.safeParse(payload);

        if (!parseResult.success) {
          ctx.waitUntil(env.ASGUARD_TELEMETRY.put(`dlq:${Date.now()}`, JSON.stringify({
             id: `dlq-${Date.now()}`,
             timestamp: Date.now(),
             originNode: payload.colo || "UNKNOWN",
             droppedRoute: url.pathname,
             errorReason: "Schema validation failure",
             payload: payload
          })));
          return new Response("Invalid Telemetry Payload", {
            status: 400,
            headers: getCorsHeaders(request, env, isMutation),
          });
        }

        // Securely log telemetry asynchronously
        if (parseResult.data.aiThreatFlag) {
            // Divert to DLQ automatically
            ctx.waitUntil(env.ASGUARD_TELEMETRY.put(`dlq:${Date.now()}`, JSON.stringify({
               id: `dlq-${Date.now()}`,
               timestamp: Date.now(),
               originNode: payload.colo || "UNKNOWN",
               droppedRoute: url.pathname,
               errorReason: "AI Threat Detected - Quarantined",
               payload: parseResult.data
            })));
        } else {
            ctx.waitUntil(logTelemetry(parseResult.data, env));
        }
        ctx.waitUntil(dispatchCriticalAlert(env, parseResult.data, request, ctx));

        return new Response("Telemetry accepted", {
          status: 202,
          headers: getCorsHeaders(request, env, isMutation),
        });
      } catch (e) {
        return new Response("Bad Request", {
          status: 400,
          headers: getCorsHeaders(request, env, isMutation),
        });
      }
    }

    // Pass-through
    return new Response("OK", { status: 200, headers: getCorsHeaders(request, env, isMutation) });
  },
};

const localEdgeLoggingBuffer: any[] = [];

async function logTelemetry(data: any, env: Env) {
  try {
    // Age-based eviction: remove items older than 15 minutes (900,000ms)
    const now = Date.now();
    for (let i = localEdgeLoggingBuffer.length - 1; i >= 0; i--) {
      const item = localEdgeLoggingBuffer[i];
      let itemTimestamp = 0;
      if (item && item.type && item.payload && item.payload.timestamp) {
        itemTimestamp = item.payload.timestamp;
      } else if (item && item.timestamp) {
        itemTimestamp = item.timestamp;
      }

      if (itemTimestamp > 0 && now - itemTimestamp > 900000) {
        localEdgeLoggingBuffer.splice(i, 1);
      }
    }

    // Capture a snapshot of the current buffer
    const bufferSnapshot = [...localEdgeLoggingBuffer];

    // Filter out mutation errors (which have a "type" field like blacklist_put or audit)
    const telemetryEvents = bufferSnapshot.filter(item => !item.type);
    const mutationErrors = bufferSnapshot.filter(item => item.type);

    const dbOp = async () => {
      const existing: any[] =
        (await env.ASGUARD_TELEMETRY.get("recent_events", { type: "json" })) ||
        [];

      // Combine current data, filtered buffer snapshot, and existing data
      let toSave = [data, ...telemetryEvents, ...existing];

      const pruned = toSave.slice(0, 50);
      await env.ASGUARD_TELEMETRY.put("recent_events", JSON.stringify(pruned));

      // Divert mutation error frames to a secondary background queue handler (DLQ pattern)
      if (mutationErrors.length > 0) {
        await Promise.all(mutationErrors.map(async (errFrame) => {
           await env.ASGUARD_TELEMETRY.put(`dlq:${Date.now()}-${Math.random()}`, JSON.stringify({
              id: `dlq-${Date.now()}-${Math.random()}`,
              timestamp: Date.now(),
              originNode: "UNKNOWN", // Could be enriched if available
              droppedRoute: "worker_buffer",
              errorReason: "Mutation Error Diverted from Buffer",
              payload: errFrame
           }));
        }));
      }
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
    structuredLog("error", "Failed to log telemetry", null, err);
    localEdgeLoggingBuffer.push(data);
    // Keep local buffer bounded
    if (localEdgeLoggingBuffer.length > 100) {
        localEdgeLoggingBuffer.shift();
    }
  }
}
