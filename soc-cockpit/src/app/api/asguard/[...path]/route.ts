import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import jwt from "jsonwebtoken";

const permittedPaths = new Set(["telemetry", "audit", "blocklist", "analysis"]);

function unavailableResponse() {
  return NextResponse.json(
    { status: "degraded", error: "upstream_unreachable", data: [] },
    { status: 503 },
  );
}

type AdminAuth = "admin" | "forbidden" | "unauthenticated";

/**
 * Authorises an operator against the interceptor admin API.
 *
 * Corrected 2026-11-04. The previous gate accepted two values that are not
 * caller credentials:
 *
 *   1. `x-user-role` — an *inbound request header*. `middleware.ts` sets that
 *      header on the outgoing **response**, never on the request, so whatever a
 *      client sends here reaches this handler untouched. `x-user-role:
 *      super_user` from curl was therefore a super-user grant.
 *   2. `AXIM_SERVICE_TOKEN` — *our own* outbound credential. It was OR-ed into
 *      the gate, so merely having it configured (a required production
 *      variable) authorised every request; the proxy then attached the token to
 *      the upstream call on the caller's behalf.
 *
 * Together that left `GET/POST/DELETE /api/asguard/blocklist` reachable without
 * any credential, so an anonymous caller could lift an edge block or enumerate
 * the audit trail. Authorisation now rests solely on the signed session cookie:
 * a JWT verified with `ASGUARD_JWT_SECRET` that carries
 * `axim_internal_admin: true` — the same claim `app/layout.tsx` uses to decide
 * whether the console renders at all. Everything else fails closed.
 */
async function authorizeAdmin(env: any): Promise<AdminAuth> {
  const token = (await cookies()).get("asguard_auth_token")?.value;
  const jwtSecret = env.ASGUARD_JWT_SECRET || process?.env?.ASGUARD_JWT_SECRET;

  // No session and/or no signing key means we cannot prove anything.
  if (!token || !jwtSecret) return "unauthenticated";

  try {
    const claims = jwt.verify(token, jwtSecret, { algorithms: ["HS256"] }) as {
      axim_internal_admin?: boolean;
    };
    return claims.axim_internal_admin === true ? "admin" : "forbidden";
  } catch {
    // Bad signature, expired, or malformed — indistinguishable from anonymous
    // on the wire, and deliberately so.
    return "unauthenticated";
  }
}

// Fallback handlers
async function fallbackProxy(request: Request, targetPath: string, env: any) {
  if (targetPath === "telemetry") {
    return NextResponse.json({ status: "mocked", message: "Telemetry accepted (mock)" }, { status: 202 });
  } else if (targetPath === "blocklist") {
    return NextResponse.json({ status: "mocked", message: "Blocklist updated (mock)" }, { status: 200 });
  } else if (targetPath === "analysis") {
    return NextResponse.json({ risk: "low", summary: "Mocked analysis", recommendedActions: [], rationale: "Upstream unavailable, using mock" }, { status: 200 });
  }
  return unavailableResponse();
}
async function proxy(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const targetPath = path.join("/");
  if (!permittedPaths.has(targetPath)) {
    return new NextResponse("Not Found", { status: 404 });
  }

  let env: any = {};
  try {
    const cf = getCloudflareContext();
    env = cf.env || {};
  } catch (e) {
    // Fallback to process.env in local Node environment
    env = process?.env || {};
  }
  // `serviceToken` is our credential to the interceptor, not the caller's. It is
  // attached to the upstream request below and never used to authorise anyone.
  const serviceToken = env.AXIM_SERVICE_TOKEN || process?.env?.AXIM_SERVICE_TOKEN;

  const isDemoMode = env.NEXT_PUBLIC_DEMO_MODE === 'true' || process?.env?.NEXT_PUBLIC_DEMO_MODE === 'true' || env.NODE_ENV === 'development' || process?.env?.NODE_ENV === 'development';

  const auth = await authorizeAdmin(env);

  if (auth !== "admin") {
    if (isDemoMode) {
      return fallbackProxy(request, targetPath, env);
    }
    return new NextResponse(auth === "forbidden" ? "Forbidden" : "Unauthorized", {
      status: auth === "forbidden" ? 403 : 401,
    });
  }


  const asguardBinding = env.ASGUARD;
  const interceptorUrl = env.NEXT_PUBLIC_INTERCEPTOR_URL || process?.env?.NEXT_PUBLIC_INTERCEPTOR_URL;
  if (!asguardBinding && !interceptorUrl) {
    console.error("ASGUARD service binding and interceptor URL are not configured");
    return new NextResponse("Asguard service is unavailable", { status: 503 });
  }

  const headers = new Headers();
  // Only ever attach a real credential: `set("…", undefined)` serialises to the
  // literal string "undefined", which the interceptor would then treat as a
  // (wrong) token instead of a missing one.
  if (serviceToken) headers.set("X-Asguard-Service-Token", serviceToken);
  const contentType = request.headers.get("Content-Type");
  if (contentType) headers.set("Content-Type", contentType);

  const authHeader = request.headers.get("Authorization");
  if (authHeader) headers.set("Authorization", authHeader);

  const threatSig = request.headers.get("X-Threat-Signature");
  if (threatSig) headers.set("X-Threat-Signature", threatSig);

  const xForwardedFor = request.headers.get("X-Forwarded-For");
  if (xForwardedFor) headers.set("X-Forwarded-For", xForwardedFor);

  const requestIdHeader = request.headers.get("X-Asguard-Request-ID");
  if (requestIdHeader) headers.set("X-Asguard-Request-ID", requestIdHeader);

  const asguardApiKey = env.ASGUARD_API_KEY || process?.env?.ASGUARD_API_KEY;
  if (asguardApiKey) headers.set("X-Asguard-Auth", asguardApiKey);


  const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();

  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);

      try {
        let response;
        if (asguardBinding) {
          response = await asguardBinding.fetch(
            new Request(`https://asguard.internal/${targetPath}`, {
              method: request.method,
              headers,
              body,
              signal: controller.signal as any,
            })
          );
        } else {
          response = await fetch(`${interceptorUrl}/${targetPath}`, {
            method: request.method,
            headers,
            body,
            signal: controller.signal as any,
          });
        }

        const isGetAndCacheable = request.method === "GET" && (targetPath === "blocklist" || targetPath === "audit");

        const responseHeaders: HeadersInit = {
            "Content-Type": response.headers.get("Content-Type") || "application/json"
        };

        if (isGetAndCacheable) {
            responseHeaders["Cache-Control"] = "public, s-maxage=5, stale-while-revalidate=15";
        }

        return new NextResponse(response.body, {
          status: response.status,
          headers: responseHeaders,
        });
      } finally {
        clearTimeout(timeout);
      }
    } catch (error: unknown) {
      if (attempt < maxRetries) {
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 500));
        continue;
      }
      console.error("Asguard service request failed after retries", error);
      return fallbackProxy(request, targetPath, env);
    }
  }

  return fallbackProxy(request, targetPath, env);}

export const GET = proxy;
export const POST = proxy;

export const DELETE = proxy;
