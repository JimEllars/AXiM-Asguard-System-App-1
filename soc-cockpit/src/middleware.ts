import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
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
    const asguardAuthToken = allCookies.find(c => c.name === 'asguard_auth_token');

    let response = NextResponse.next();

    // Only protect SOC operator routes, which are essentially anything not ignored above
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

    if (asguardAuthToken) {
      response.cookies.set({
        name: 'asguard_auth_token',
        value: asguardAuthToken.value,
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
      });
    }

    return response;
  } catch (error) {
    // If environment variables are missing or Edge cookie parsing encounters network drops,
    // fall back to a graceful redirect or allow cached public asset bypass without throwing uncaught 500 runtime errors.
    console.error('Middleware Error:', error);
    return NextResponse.redirect('https://passport.axim.us.com/login', 307);
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     * - public (public assets)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|public/).*)',
  ],
};
