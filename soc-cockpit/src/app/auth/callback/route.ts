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

  // Try to parse as JWT if possible (mock parsing)
  let userIdentifier = "jrellars@gmail.com"; // fallback
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
       const payload = JSON.parse(atob(parts[1]));
       if (payload.email) userIdentifier = payload.email;
       else if (payload.wallet) userIdentifier = payload.wallet;
       else if (payload.sub) userIdentifier = payload.sub;
    } else {
       // if not jwt, assume token is the identifier for testing
       userIdentifier = token;
    }
  } catch(e) {
    // ignore
  }

  const response = NextResponse.redirect(request.nextUrl.origin + '/');

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
