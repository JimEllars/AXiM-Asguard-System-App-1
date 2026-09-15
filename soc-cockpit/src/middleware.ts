import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  try {
    const pathname = request.nextUrl.pathname;

    // Ignore static assets, api routes, Next.js internals, and auth callbacks
    if (
      pathname.startsWith('/_next') ||
      pathname.startsWith('/api') ||
      pathname.startsWith('/auth') ||
      pathname === '/favicon.ico' ||
      pathname.startsWith('/public') ||
      pathname.match(/\.(.*)$/) // Ignore files with extensions
    ) {
      return NextResponse.next();
    }

    // Ensure Cloudflare edge standards are met with request.cookies.getAll() and response.cookies.set()
    const allCookies = request.cookies.getAll();
    const sessionCookie = allCookies.find(c => c.name === 'axim_session');
    const tokenQueryParam = request.nextUrl.searchParams?.get('token');
    const token = sessionCookie?.value || tokenQueryParam;

    if (!token) {
      const redirectUrl = `https://passport.axim.us.com/login?redirect_to=https://asguard.axim.us.com`;
      return NextResponse.redirect(redirectUrl, 307);
    }

    // Verify token using AXiM Passport SSO
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    let isSuperUser = false;
    let userEmail = '';

    try {
      const res = await fetch('https://passport.axim.us.com/api/v1/auth/verify-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
        signal: controller.signal as any,
      });

      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        userEmail = data.email || '';

        // Explicitly recognize Super Users
        if (userEmail === 'james.ellars@axim.us.com' || userEmail === 'jrellars@gmail.com') {
           isSuperUser = true;
        } else if (data.role === 'super_user') {
           isSuperUser = true;
        }
      } else {
        const redirectUrl = `https://passport.axim.us.com/login?redirect_to=https://asguard.axim.us.com`;
        return NextResponse.redirect(redirectUrl, 307);
      }
    } catch (e) {
      // In case passport is down, we might need a fallback or redirect
      const redirectUrl = `https://passport.axim.us.com/login?redirect_to=https://asguard.axim.us.com`;
      return NextResponse.redirect(redirectUrl, 307);
    }

    const response = NextResponse.next();

    if (isSuperUser) {
       response.headers.set('x-user-role', 'super_user');
    }
    if (userEmail) {
       response.headers.set('x-user-email', userEmail);
    }

    // Pass down the token as a cookie
    if (token) {
      response.cookies.set({
        name: 'axim_session',
        value: token,
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
      });
      // We also set the auth token for layout guards that require 'asguard_auth_token'
      // although layout guard expects a JWT with specific claims which we might mock/issue.
      response.cookies.set({
        name: 'asguard_auth_token',
        value: token,
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
      });
    }

    return response;
  } catch (error) {
    console.error('Middleware Error:', error);
    return NextResponse.redirect('https://passport.axim.us.com/login?redirect_to=https://asguard.axim.us.com', 307);
  }
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|public/).*)',
  ],
};
