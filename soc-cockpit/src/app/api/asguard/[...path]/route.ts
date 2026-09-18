import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import jwt from "jsonwebtoken";

const permittedPaths = new Set(["telemetry", "audit", "blocklist", "analysis"]);

async function proxy(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const targetPath = path.join("/");
  if (!permittedPaths.has(targetPath)) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const { env } = getCloudflareContext();
  const token = (await cookies()).get("asguard_auth_token")?.value;
  if (!token || !env.ASGUARD_JWT_SECRET || !env.AXIM_SERVICE_TOKEN) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const claims = jwt.verify(token, env.ASGUARD_JWT_SECRET, { algorithms: ["HS256"] }) as {
      axim_internal_admin?: boolean;
    };
    if (!claims.axim_internal_admin) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  } catch {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  if (!env.ASGUARD) {
    console.error("ASGUARD service binding is not configured");
    return new NextResponse("Asguard service is unavailable", { status: 503 });
  }

  const headers = new Headers();
  headers.set("X-Asguard-Service-Token", env.AXIM_SERVICE_TOKEN);
  const contentType = request.headers.get("Content-Type");
  if (contentType) {
    headers.set("Content-Type", contentType);
  }

  try {
    const response = await env.ASGUARD.fetch(
      new Request(`https://asguard.internal/${targetPath}`, {
        method: request.method,
        headers,
        body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
      }),
    );
    return new NextResponse(response.body, {
      status: response.status,
      headers: { "Content-Type": response.headers.get("Content-Type") || "text/plain" },
    });
  } catch (error) {
    console.error("Asguard service request failed", error);
    return new NextResponse("Asguard service is unavailable", { status: 503 });
  }
}

export const GET = proxy;
export const POST = proxy;
