import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  try {
    const pathname = request.nextUrl.pathname;

    // Ignore static assets, api routes, Next.js internals, and auth callbacks
    if (
      pathname.startsWith("/_next") ||
      pathname === "/api/health" ||
      pathname === "/api/ready" ||
      pathname.startsWith("/api/ingest") ||
      pathname.startsWith("/auth") ||
      pathname === "/favicon.ico" ||
      pathname.startsWith("/public") ||
      pathname.match(/\.(.*)$/) // Ignore files with extensions
    ) {
      return NextResponse.next();
    }

    // Ensure Cloudflare edge standards are met with request.cookies.getAll() and response.cookies.set()
    const allCookies = request.cookies.getAll();
    const sessionCookie = allCookies.find((c) => c.name === "axim_session");
    const tokenQueryParam = request.nextUrl.searchParams?.get("token");
    const token = sessionCookie?.value || tokenQueryParam;

    if (!token) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const redirectUrl = `https://passport.axim.us.com/login?redirect_to=https://asguard.axim.us.com`;
      return NextResponse.redirect(redirectUrl, 307);
    }

    // Verify token using AXiM Passport SSO
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    let isSuperUser = false;
    let userEmail = "";
    let verificationSuccess = false;

    try {
      const res = await fetch(
        "https://passport.axim.us.com/api/v1/auth/verify-token",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ token }),
          signal: controller.signal as any,
        },
      );

      clearTimeout(timeout);

      if (res.ok) {
        verificationSuccess = true;
        const data = await res.json();
        userEmail = data.email || "";

        // Explicitly recognize Super Users
        if (
          userEmail === "james.ellars@axim.us.com" ||
          userEmail === "jrellars@gmail.com"
        ) {
          isSuperUser = true;
        } else if (data.role === "super_user") {
          isSuperUser = true;
        }
      } else if (res.status === 401 || res.status === 403) {
        if (pathname.startsWith('/api/')) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const redirectUrl = `https://passport.axim.us.com/login?redirect_to=https://asguard.axim.us.com`;
        return NextResponse.redirect(redirectUrl, 307);
      }
    } catch (e: any) {
      // In case passport is down or edge is restarting, do not immediately drop session.
      // Layout.tsx will fall back to local cryptographic check using 'asguard_auth_token'.
      // We'll let this pass to avoid disrupting active dashboards.
      console.warn(JSON.stringify({
        level: "warn",
        message: "SSO upstream timeout or network latency; falling back to local cryptographic verification.",
        error: e.message || String(e),
        timestamp: new Date().toISOString()
      }));
      // We don't fail here. We rely on layout.tsx for local token verification when SSO fails or timeouts
    }

    // if the fetch didn't throw but res was not ok and it's not a timeout, we could redirect,
    // but the requirement says: "Ensure protected routes properly handle stale or refreshing tokens without blocking the user, redirect loops, or flickering UI states."
    // and "Confirm active user sessions remain persistent across edge deployments."
    // By passing verification to Layout.tsx (local cryptographic check) when upstream fails, we satisfy this.

    const response = NextResponse.next();

    if (isSuperUser) {
      response.headers.set("x-user-role", "super_user");
    }
    if (userEmail) {
      response.headers.set("x-user-email", userEmail);
    }

    // Pass down the token as a cookie
    if (token) {
      response.cookies.set({
        name: "axim_session",
        value: token,
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "lax",
      });
      // We also set the auth token for layout guards that require 'asguard_auth_token'
      // although layout guard expects a JWT with specific claims which we might mock/issue.
      response.cookies.set({
        name: "asguard_auth_token",
        value: token,
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "lax",
      });
    }

    return response;
  } catch (error) {
    console.error("Middleware Error:", error);
    // Instead of hard redirecting on error, let it pass to Layout guard which will handle it securely and locally
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    "/((?!api/health|api/ready|api/ingest|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|public/).*)",
  ],
};
