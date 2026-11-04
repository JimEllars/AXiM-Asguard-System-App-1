import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';

/**
 * The interceptor proxy is the cockpit's write path into the edge blocklist:
 * `POST /api/asguard/blocklist` blocks an IP, `DELETE` purges, `GET` lists the
 * blocks and the audit trail. It was reachable without any credential.
 *
 * The old gate was `isSuperUser || (token && jwtSecret) || serviceToken`, where
 * `isSuperUser` came from the caller-controlled `x-user-role` request header and
 * `serviceToken` was the *server's own* `AXIM_SERVICE_TOKEN`. On a correctly
 * provisioned deployment that second disjunct was always true, so the proxy
 * attached its service credential for anonymous callers. These cases pin the
 * fail-closed contract in both directions: no credential is rejected, and a
 * verified admin JWT still works.
 */

const JWT_SECRET = 'test-jwt-secret-for-asguard-proxy';

// The route reads `cookies()` from next/headers; drive it from a mutable holder.
const cookieJar = new Map<string, string>();

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined),
  }),
}));

// Never reach the loopback network from a unit test.
vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => ({ env: {} }),
}));

const upstreamFetch = vi.fn();

async function loadProxy() {
  return import('../src/app/api/asguard/[...path]/route');
}

function proxyRequest(
  path: string,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Request {
  return new Request(`https://cockpit.test/api/asguard/${path}`, {
    method: init.method ?? 'GET',
    headers: init.headers ?? {},
    body: init.body,
  });
}

function context(path: string) {
  return { params: Promise.resolve({ path: path.split('/') }) };
}

function adminToken(claims: Record<string, unknown> = { axim_internal_admin: true }) {
  return jwt.sign(claims, JWT_SECRET, { algorithm: 'HS256' });
}

beforeEach(() => {
  cookieJar.clear();
  upstreamFetch.mockReset();
  upstreamFetch.mockResolvedValue(
    new Response(JSON.stringify([{ key: 'ip:203.0.113.7', note: 'seeded' }]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', upstreamFetch);

  // A fully provisioned production deployment: this is precisely the shape in
  // which the old gate silently opened up.
  process.env.AXIM_SERVICE_TOKEN = 'server-side-service-token';
  process.env.ASGUARD_JWT_SECRET = JWT_SECRET;
  process.env.NEXT_PUBLIC_INTERCEPTOR_URL = 'https://asguard.test';
  delete process.env.NEXT_PUBLIC_DEMO_MODE;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.AXIM_SERVICE_TOKEN;
  delete process.env.ASGUARD_JWT_SECRET;
  delete process.env.NEXT_PUBLIC_INTERCEPTOR_URL;
  cookieJar.clear();
});

describe('asguard proxy — fail-closed authorisation', () => {
  it('rejects an anonymous request even when AXIM_SERVICE_TOKEN is configured', async () => {
    const { GET } = await loadProxy();

    const res = await GET(proxyRequest('blocklist') as any, context('blocklist'));

    expect(res.status).toBe(401);
    // The decisive assertion: no upstream call, so nothing was blocked or unblocked.
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it('does not treat the inbound x-user-role header as a credential', async () => {
    const { POST } = await loadProxy();

    const res = await POST(
      proxyRequest('blocklist', {
        method: 'POST',
        headers: { 'x-user-role': 'super_user' },
      }) as any,
      context('blocklist'),
    );

    expect(res.status).toBe(401);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it('rejects a forged x-user-role header sent alongside an unsigned cookie', async () => {
    cookieJar.set('asguard_auth_token', 'not-a-jwt');
    const { GET } = await loadProxy();

    const res = await GET(
      proxyRequest('audit', { headers: { 'x-user-role': 'super_user' } }) as any,
      context('audit'),
    );

    expect(res.status).toBe(401);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it('rejects a JWT signed with the wrong key', async () => {
    cookieJar.set('asguard_auth_token', jwt.sign({ axim_internal_admin: true }, 'wrong-secret', { algorithm: 'HS256' }));
    const { GET } = await loadProxy();

    const res = await GET(proxyRequest('blocklist') as any, context('blocklist'));

    expect(res.status).toBe(401);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it('fails closed when ASGUARD_JWT_SECRET is not configured', async () => {
    delete process.env.ASGUARD_JWT_SECRET;
    cookieJar.set('asguard_auth_token', adminToken());
    const { GET } = await loadProxy();

    const res = await GET(proxyRequest('blocklist') as any, context('blocklist'));

    expect(res.status).toBe(401);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it('forbids a verified operator who is not an internal admin', async () => {
    cookieJar.set('asguard_auth_token', adminToken({ axim_internal_admin: false, sub: 'operator' }));
    const { GET } = await loadProxy();

    const res = await GET(proxyRequest('blocklist') as any, context('blocklist'));

    expect(res.status).toBe(403);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it('allows a verified internal admin through to the interceptor', async () => {
    cookieJar.set('asguard_auth_token', adminToken());
    const { GET } = await loadProxy();

    const res = await GET(proxyRequest('blocklist') as any, context('blocklist'));

    expect(res.status).toBe(200);
    expect(upstreamFetch).toHaveBeenCalledTimes(1);
    expect(await res.json()).toEqual([{ key: 'ip:203.0.113.7', note: 'seeded' }]);
  });

  it('attaches the service token upstream only after the caller is authorised', async () => {
    cookieJar.set('asguard_auth_token', adminToken());
    const { POST } = await loadProxy();

    await POST(
      proxyRequest('blocklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'ip:198.51.100.9', action: 'block' }),
      }) as any,
      context('blocklist'),
    );

    const [, init] = upstreamFetch.mock.calls[0];
    const sent = new Headers(init.headers);
    expect(sent.get('X-Asguard-Service-Token')).toBe('server-side-service-token');
  });

  it('still refuses paths outside the permitted surface', async () => {
    cookieJar.set('asguard_auth_token', adminToken());
    const { GET } = await loadProxy();

    const res = await GET(proxyRequest('secrets') as any, context('secrets'));

    expect(res.status).toBe(404);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });
});
