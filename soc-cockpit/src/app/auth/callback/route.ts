import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams?.get('token');

  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }

  // Mock token validation. In this sprint we assume the token is a JWT or simply a string that we decode
  // Let's assume the token has a format like base64 encoded JSON or we just trust it.
  // For the UI to read it, we'll set a secure http-only axim_session cookie.
  // We'll also set a non-http-only cookie with the user identity so the client can display the HUD.

  let userIdentifier = "jrellars@gmail.com"; // fallback
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
       const payload = JSON.parse(atob(parts[1]));
       if (payload.email) userIdentifier = payload.email;
       else if (payload.wallet) userIdentifier = payload.wallet;
       else if (payload.sub) userIdentifier = payload.sub;
    } else {
       userIdentifier = token;
    }
  } catch(e) {}

  // Validate token against AXiM Core session endpoints
  try {
    const aximCoreUrl = process.env.NEXT_PUBLIC_AXIM_CORE_URL || 'https://core.axim.us.com';
    const verifyRes = await fetch(`${aximCoreUrl}/api/v1/session/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });

    if (!verifyRes.ok) {
      // For development, we fallback if it fails, but in production we should reject
      if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Invalid session token' }, { status: 401 });
      }
    } else {
      const data = await verifyRes.json();
      if (data.identifier) {
        userIdentifier = data.identifier;
      }
    }
  } catch (e) {
    if (process.env.NODE_ENV === 'production') {
       return NextResponse.json({ error: 'Session verification failed' }, { status: 500 });
    }
  }

  // Next.js redirect correctly clearing query params is done via URL object
  const redirectUrl = new URL('/', request.nextUrl.origin);
  const response = NextResponse.redirect(redirectUrl);


  response.cookies.set('axim_session', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/'
  });

  response.cookies.set('axim_user', userIdentifier, {
    httpOnly: false,
    secure: true,
    sameSite: 'lax',
    path: '/'
  });

  return response;
}
