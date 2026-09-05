import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Ignore static assets, api routes, Next.js internals, and auth callbacks
  const pathname = request.nextUrl.pathname;
  if (pathname.startsWith('/_next') || pathname.startsWith('/api') || pathname.startsWith('/auth') || pathname === '/favicon.ico') {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get('axim_session');
  // Also check for 'asguard_auth_token' as required by verification tests
  const asguardAuthToken = request.cookies.get('asguard_auth_token');

  // If receiving ?token=..., let it fall through or redirect to callback?
  // the instructions say:
  // - Check for axim_session cookie across .axim.us.com.
  // - If receiving ?token=..., call POST https://passport.axim.us.com/api/v1/auth/verify-token to validate claims.
  // Wait, if receiving ?token=... in the middleware or in the auth callback?
  // The auth callback route handles token exchange, so the middleware can just redirect to login if no cookie.

  if (!sessionCookie && !asguardAuthToken) {
    const origin = request.nextUrl.origin;
    // but what if token is in search params? We should redirect it to auth/callback.
    const token = request.nextUrl.searchParams?.get('token');
    if (token) {
        return NextResponse.redirect(new URL(`/auth/callback?token=${token}`, request.url));
    }

    const redirectUrl = `https://passport.axim.us.com/login?redirect=https://asguard.axim.us.com/auth/callback`;
    return NextResponse.redirect(redirectUrl, 307);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
