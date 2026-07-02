import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../src/index';

const mockKV = {
  get: vi.fn(),
  put: vi.fn(),
};

const mockTelemetryKV = {
  get: vi.fn(),
  put: vi.fn(),
};

describe('Asguard Interceptor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles OPTIONS preflight requests with CORS headers', async () => {
    const request = new Request('https://example.com/', {
      method: 'OPTIONS'
    });

    const env = { ASGUARD_GLOBAL_BLOCKLIST: mockKV as any, ASGUARD_TELEMETRY: mockTelemetryKV as any };
    const ctx = { waitUntil: vi.fn() } as any;

    const response = await worker.fetch(request, env, ctx);
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, OPTIONS');
  });

  it('blocks request if IP is in blocklist and returns CORS headers', async () => {
    mockKV.get.mockResolvedValue('blocked');
    const request = new Request('https://example.com/', {
      headers: { 'cf-connecting-ip': '1.2.3.4' }
    });

    const env = { ASGUARD_GLOBAL_BLOCKLIST: mockKV as any, ASGUARD_TELEMETRY: mockTelemetryKV as any };
    const ctx = { waitUntil: vi.fn() } as any;

    const response = await worker.fetch(request, env, ctx);
    expect(response.status).toBe(403);
    expect(mockKV.get).toHaveBeenCalledWith('ip:1.2.3.4');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('allows request if IP is not in blocklist and returns CORS headers', async () => {
    mockKV.get.mockResolvedValue(null);
    const request = new Request('https://example.com/', {
      headers: { 'cf-connecting-ip': '1.2.3.4' }
    });

    const env = { ASGUARD_GLOBAL_BLOCKLIST: mockKV as any, ASGUARD_TELEMETRY: mockTelemetryKV as any };
    const ctx = { waitUntil: vi.fn() } as any;

    const response = await worker.fetch(request, env, ctx);
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('accepts valid telemetry payload and returns CORS headers', async () => {
    mockKV.get.mockResolvedValue(null);
    const payload = {
      sourceIp: '192.168.1.1',
      timestamp: Date.now(),
      eventType: 'signature_tampering',
      severity: 'high'
    };

    const request = new Request('https://example.com/telemetry', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'cf-connecting-ip': '1.2.3.4' }
    });

    const env = { ASGUARD_GLOBAL_BLOCKLIST: mockKV as any, ASGUARD_TELEMETRY: mockTelemetryKV as any };
    const ctx = { waitUntil: vi.fn() } as any;

    const response = await worker.fetch(request, env, ctx);
    expect(response.status).toBe(202);
    expect(ctx.waitUntil).toHaveBeenCalled();
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('rejects invalid telemetry payload and returns CORS headers', async () => {
    mockKV.get.mockResolvedValue(null);
    const payload = {
      sourceIp: 'invalid-ip',
      timestamp: Date.now(),
      eventType: 'unknown',
      severity: 'high'
    };

    const request = new Request('https://example.com/telemetry', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'cf-connecting-ip': '1.2.3.4' }
    });

    const env = { ASGUARD_GLOBAL_BLOCKLIST: mockKV as any, ASGUARD_TELEMETRY: mockTelemetryKV as any };
    const ctx = { waitUntil: vi.fn() } as any;

    const response = await worker.fetch(request, env, ctx);
    expect(response.status).toBe(400);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});
