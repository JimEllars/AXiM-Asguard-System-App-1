import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams?.get('token');
  const code = request.nextUrl.searchParams?.get('code');

  if (code) {
     // PKCE code exchange placeholder for future Supabase direct auth
     // the route currently handles a custom SSO token
     console.log("Received Supabase Auth Code", code);
     // Note: If using pure Supabase auth, exchange code for session here and redirect.
     // For fail-safe redirection:
     return NextResponse.redirect(new URL('/', request.url));
  }

  if (!token) {
    return NextResponse.redirect(new URL('https://passport.axim.us.com/login?redirect_to=https://asguard.axim.us.com', request.url));
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

      let role = data.role;
      const userEmail = data.email;

      if (userEmail === 'james.ellars@axim.us.com' || userEmail === 'jrellars@gmail.com') {
         role = 'super_user';
      }

      if (role === 'security' || role === 'admin' || role === 'super_user') {
        const response = NextResponse.redirect(new URL('/', request.url));
        response.cookies.set('axim_session', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
        });
        response.cookies.set('asguard_auth_token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
        });
        return response;
      } else {
        return NextResponse.redirect(new URL('https://passport.axim.us.com/login?redirect_to=https://asguard.axim.us.com', request.url));
      }
    } else {
       return NextResponse.redirect(new URL('https://passport.axim.us.com/login?redirect_to=https://asguard.axim.us.com', request.url));
    }
  } catch (error) {
     return NextResponse.redirect(new URL('https://passport.axim.us.com/login?redirect_to=https://asguard.axim.us.com', request.url));
  }
}
