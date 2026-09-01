import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const sessionCookie = request.cookies.get('axim_session');

  if (!sessionCookie) {
    const origin = request.nextUrl.origin;
    const redirectUrl = `https://passport.axim.us.com?redirect=${encodeURIComponent(origin + '/auth/callback')}`;
    return NextResponse.redirect(redirectUrl, 307);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/stream', '/submit'],
};
