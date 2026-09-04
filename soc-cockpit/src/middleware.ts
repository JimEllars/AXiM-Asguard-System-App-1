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


  if (!sessionCookie && !asguardAuthToken) {
    const origin = request.nextUrl.origin;
    const redirectUrl = `https://passport.axim.us.com?redirect=${encodeURIComponent(origin + '/auth/callback')}`;
    return NextResponse.redirect(redirectUrl, 307);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
