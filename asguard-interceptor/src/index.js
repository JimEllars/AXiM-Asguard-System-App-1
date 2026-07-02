import { TelemetryPayloadSchema } from './telemetry';
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Asguard-Auth',
};
export default {
    async fetch(request, env, ctx) {
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }
        const clientIp = request.headers.get('cf-connecting-ip') || 'unknown';
        // Fast check against KV for blocked IP
        if (clientIp !== 'unknown') {
            const isBlocked = await env.ASGUARD_GLOBAL_BLOCKLIST.get(`ip:${clientIp}`);
            if (isBlocked) {
                return new Response('Forbidden', { status: 403, headers: corsHeaders });
            }
        }
        // Try reading auth token and check if it's blocked
        const authHeader = request.headers.get('Authorization');
        if (authHeader) {
            const token = authHeader.replace(/^Bearer\s+/, '').trim();
            const isTokenBlocked = await env.ASGUARD_GLOBAL_BLOCKLIST.get(`token:${token}`);
            if (isTokenBlocked) {
                return new Response('Forbidden', { status: 403, headers: corsHeaders });
            }
        }
        const url = new URL(request.url);
        if (request.method === 'GET' && url.pathname === '/telemetry') {
            const customAuthHeader = request.headers.get('X-Asguard-Auth');
            if (!env.ASGUARD_API_KEY || customAuthHeader !== env.ASGUARD_API_KEY) {
                return new Response('Unauthorized', { status: 401, headers: corsHeaders });
            }
            try {
                const data = await env.ASGUARD_TELEMETRY.get('recent_events', { type: 'json' }) || [];
                return new Response(JSON.stringify(data), {
                    status: 200,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }
            catch (e) {
                return new Response('Internal Server Error', { status: 500, headers: corsHeaders });
            }
        }
        if (request.method === 'GET' && url.pathname === '/blocklist') {
            const customAuthHeader = request.headers.get('X-Asguard-Auth');
            if (!env.ASGUARD_API_KEY || customAuthHeader !== env.ASGUARD_API_KEY) {
                return new Response('Unauthorized', { status: 401, headers: corsHeaders });
            }
            try {
                const listResult = await env.ASGUARD_GLOBAL_BLOCKLIST.list();
                const keys = listResult.keys.map(k => k.name);
                return new Response(JSON.stringify(keys), {
                    status: 200,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }
            catch (e) {
                return new Response('Internal Server Error', { status: 500, headers: corsHeaders });
            }
        }
        // Optionally parse telemetry if it's a telemetry endpoint
        if (request.method === 'POST' && url.pathname === '/telemetry') {
            try {
                const payload = await request.json();
                const parseResult = TelemetryPayloadSchema.safeParse(payload);
                if (!parseResult.success) {
                    return new Response('Invalid Telemetry Payload', { status: 400, headers: corsHeaders });
                }
                // Securely log telemetry asynchronously
                ctx.waitUntil(logTelemetry(parseResult.data, env));
                return new Response('Telemetry accepted', { status: 202, headers: corsHeaders });
            }
            catch (e) {
                return new Response('Bad Request', { status: 400, headers: corsHeaders });
            }
        }
        // Pass-through
        return new Response('OK', { status: 200, headers: corsHeaders });
    },
};
async function logTelemetry(data, env) {
    try {
        const existing = await env.ASGUARD_TELEMETRY.get('recent_events', { type: 'json' }) || [];
        existing.unshift(data);
        // Keep rotating recent events list up to a certain limit e.g. 100
        if (existing.length > 100) {
            existing.pop();
        }
        await env.ASGUARD_TELEMETRY.put('recent_events', JSON.stringify(existing));
    }
    catch (err) {
        console.error('Failed to log telemetry:', err);
    }
}
//# sourceMappingURL=index.js.map