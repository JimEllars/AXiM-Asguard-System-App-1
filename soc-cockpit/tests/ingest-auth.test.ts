import { describe, it, expect, afterEach } from 'vitest';
import { POST } from '../src/app/api/ingest/route';

/**
 * The ingest route is the write path into `threat_events` — the table behind the
 * live feed, the severity filters and the blocklist triage. It used to fall back
 * to the literal `default_ingest_token` when `ASGUARD_API_KEY` was unset, which
 * turned an unconfigured deployment into an open write endpoint. These cases pin
 * the fail-closed contract.
 */

const ORIGINAL_KEY = process.env.ASGUARD_API_KEY;
const ORIGINAL_INGEST = process.env.TELEMETRY_INGEST_KEY;

function ingestRequest(authorization?: string): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authorization) headers.Authorization = authorization;
  return new Request('https://cockpit.test/api/ingest', {
    method: 'POST',
    headers,
    body: JSON.stringify({ id: 'e1', source_ip: '198.51.100.7' }),
  }) as unknown as any;
}

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.ASGUARD_API_KEY;
  else process.env.ASGUARD_API_KEY = ORIGINAL_KEY;
  if (ORIGINAL_INGEST === undefined) delete process.env.TELEMETRY_INGEST_KEY;
  else process.env.TELEMETRY_INGEST_KEY = ORIGINAL_INGEST;
});

describe('ingest auth is fail-closed', () => {
  it('refuses every request when no secret is configured', async () => {
    delete process.env.ASGUARD_API_KEY;
    delete process.env.TELEMETRY_INGEST_KEY;

    const response = await POST(ingestRequest('Bearer anything') as any);

    expect(response.status).toBe(503);
    expect(((await response.json()) as any).error).toBe('ingest_not_configured');
  });

  it('never accepts the old published default token', async () => {
    delete process.env.ASGUARD_API_KEY;
    delete process.env.TELEMETRY_INGEST_KEY;

    const response = await POST(ingestRequest('Bearer default_ingest_token') as any);

    // The literal from the source tree must not authenticate anything.
    expect(response.status).toBe(503);
  });

  it('rejects a mismatched token with 401', async () => {
    process.env.ASGUARD_API_KEY = 'the-real-shared-secret';

    const response = await POST(ingestRequest('Bearer not-the-secret') as any);

    expect(response.status).toBe(401);
    expect(((await response.json()) as any).error).toBe('unauthorized');
  });

  it('rejects a missing Authorization header with 401', async () => {
    process.env.ASGUARD_API_KEY = 'the-real-shared-secret';

    const response = await POST(ingestRequest() as any);

    expect(response.status).toBe(401);
  });

  it('rejects a token that only matches by prefix', async () => {
    process.env.ASGUARD_API_KEY = 'the-real-shared-secret';

    const response = await POST(ingestRequest('Bearer the-real-shared-secre') as any);

    expect(response.status).toBe(401);
  });

  it('rejects a non-Bearer scheme', async () => {
    process.env.ASGUARD_API_KEY = 'the-real-shared-secret';

    const response = await POST(ingestRequest('Basic the-real-shared-secret') as any);

    expect(response.status).toBe(401);
  });

  it('accepts a matching token and rejects an unparseable body afterwards', async () => {
    process.env.ASGUARD_API_KEY = 'the-real-shared-secret';

    const request = new Request('https://cockpit.test/api/ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer the-real-shared-secret',
      },
      body: 'not-json',
    });

    const response = await POST(request as any);

    // Proves auth passed: the failure is now the payload, not the credential.
    expect(response.status).toBe(400);
    expect(((await response.json()) as any).error).toBe('Invalid JSON payload');
  });
});
