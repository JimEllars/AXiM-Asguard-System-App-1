import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams?.get('token');

  if (!token) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

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

      const role = data.role;
      if (role === 'security' || role === 'admin' || role === 'super_user') {
        const response = NextResponse.redirect(new URL('/', request.url));
        response.cookies.set('axim_session', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
        });
        return response;
      } else {
        return NextResponse.redirect(new URL('https://passport.axim.us.com/login?redirect=https://asguard.axim.us.com/auth/callback', request.url));
      }
    } else {
       return NextResponse.redirect(new URL('https://passport.axim.us.com/login?redirect=https://asguard.axim.us.com/auth/callback', request.url));
    }
  } catch (error) {
     return NextResponse.redirect(new URL('https://passport.axim.us.com/login?redirect=https://asguard.axim.us.com/auth/callback', request.url));
  }
}
