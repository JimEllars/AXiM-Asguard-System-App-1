import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../src/index';

const mockKV = {
  get: vi.fn(),
  put: vi.fn(),
};

describe('Asguard Interceptor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks request if IP is in blocklist', async () => {
    mockKV.get.mockResolvedValue('blocked');
    const request = new Request('https://example.com/', {
      headers: { 'cf-connecting-ip': '1.2.3.4' }
    });

    const env = { ASGUARD_GLOBAL_BLOCKLIST: mockKV as any };
    const ctx = { waitUntil: vi.fn() } as any;

    const response = await worker.fetch(request, env, ctx);
    expect(response.status).toBe(403);
    expect(mockKV.get).toHaveBeenCalledWith('ip:1.2.3.4');
  });

  it('allows request if IP is not in blocklist', async () => {
    mockKV.get.mockResolvedValue(null);
    const request = new Request('https://example.com/', {
      headers: { 'cf-connecting-ip': '1.2.3.4' }
    });

    const env = { ASGUARD_GLOBAL_BLOCKLIST: mockKV as any };
    const ctx = { waitUntil: vi.fn() } as any;

    const response = await worker.fetch(request, env, ctx);
    expect(response.status).toBe(200);
  });

  it('accepts valid telemetry payload', async () => {
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

    const env = { ASGUARD_GLOBAL_BLOCKLIST: mockKV as any };
    const ctx = { waitUntil: vi.fn() } as any;

    const response = await worker.fetch(request, env, ctx);
    expect(response.status).toBe(202);
    expect(ctx.waitUntil).toHaveBeenCalled();
  });

  it('rejects invalid telemetry payload', async () => {
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

    const env = { ASGUARD_GLOBAL_BLOCKLIST: mockKV as any };
    const ctx = { waitUntil: vi.fn() } as any;

    const response = await worker.fetch(request, env, ctx);
    expect(response.status).toBe(400);
  });
});
