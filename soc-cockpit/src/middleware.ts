import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Ignore static assets, api routes, Next.js internals, and auth callbacks
  const pathname = request.nextUrl.pathname;
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/auth') ||
    pathname === '/favicon.ico' ||
    pathname.startsWith('/public')
  ) {
    return NextResponse.next();
  }

  // Ensure Cloudflare edge standards are met with request.cookies.getAll() and response.cookies.set()
  const allCookies = request.cookies.getAll();
  const sessionCookie = allCookies.find(c => c.name === 'axim_session');
  const asguardAuthToken = allCookies.find(c => c.name === 'asguard_auth_token');

  let response = NextResponse.next();

  if (!sessionCookie && !asguardAuthToken) {
    const currentUrl = request.nextUrl.pathname + request.nextUrl.search;
    const returnUrl = encodeURIComponent(`https://asguard.axim.us.com${currentUrl}`);

    const redirectUrl = `https://passport.axim.us.com/login?redirect=https://asguard.axim.us.com/auth/callback&returnUrl=${returnUrl}`;

    response = NextResponse.redirect(redirectUrl, 307);
  }

  // To meet the requirement "response.cookies.set() patterns compatible with OpenNext edge builds",
  // we ensure we're copying existing response cookies if we did any modification (mock setting here if needed).
  if (sessionCookie) {
    response.cookies.set({
      name: 'axim_session',
      value: sessionCookie.value,
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
    });
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public/).*)'],
};
