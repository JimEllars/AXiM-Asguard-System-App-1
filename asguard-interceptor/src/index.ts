import { TelemetryPayloadSchema } from './telemetry';

export interface Env {
  ASGUARD_GLOBAL_BLOCKLIST: KVNamespace;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const clientIp = request.headers.get('cf-connecting-ip') || 'unknown';

    // Fast check against KV for blocked IP
    if (clientIp !== 'unknown') {
      const isBlocked = await env.ASGUARD_GLOBAL_BLOCKLIST.get(`ip:${clientIp}`);
      if (isBlocked) {
        return new Response('Forbidden', { status: 403 });
      }
    }

    // Try reading auth token and check if it's blocked
    const authHeader = request.headers.get('Authorization');
    if (authHeader) {
      const token = authHeader.replace(/^Bearer\s+/, '').trim();
      const isTokenBlocked = await env.ASGUARD_GLOBAL_BLOCKLIST.get(`token:${token}`);
      if (isTokenBlocked) {
         return new Response('Forbidden', { status: 403 });
      }
    }

    // Optionally parse telemetry if it's a telemetry endpoint
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/telemetry') {
      try {
        const payload = await request.json();
        const parseResult = TelemetryPayloadSchema.safeParse(payload);

        if (!parseResult.success) {
          return new Response('Invalid Telemetry Payload', { status: 400 });
        }

        // Securely log telemetry asynchronously
        ctx.waitUntil(logTelemetry(parseResult.data));

        return new Response('Telemetry accepted', { status: 202 });
      } catch (e) {
        return new Response('Bad Request', { status: 400 });
      }
    }

    // Pass-through
    return new Response('OK', { status: 200 });
  },
};

async function logTelemetry(data: any) {
  // In a real scenario, this would send data to Onyx Mk3 or a secure log destination
  console.log('TELEMETRY_LOG:', JSON.stringify(data));
}
