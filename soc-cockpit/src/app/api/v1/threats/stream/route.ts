import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(req: Request) {
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    const sendKeepAlive = async () => {
        try {
            await writer.write(encoder.encode(': keep-alive\n\n'));
        } catch (e) {
            console.error('Keep-alive write failed', e);
        }
    };

    const intervalId = setInterval(sendKeepAlive, 15000);

    const generateMockThreat = async () => {
        try {
            const mockEvent = {
                event_id: `evt_${Date.now()}`,
                timestamp: new Date().toISOString(),
                client_ip: `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
                geo_country: ['US', 'CN', 'RU', 'BR', 'DE'][Math.floor(Math.random() * 5)],
                geo_city: 'Mock City',
                geo_lat: (Math.random() * 180) - 90,
                geo_lon: (Math.random() * 360) - 180,
                request_method: ['GET', 'POST', 'PUT', 'DELETE'][Math.floor(Math.random() * 4)],
                request_path: '/api/v1/data',
                threat_category: ['SQL_INJECTION', 'PATH_TRAVERSAL', 'ANOMALOUS_USER_AGENT', 'RATE_LIMIT_EXCEEDED'][Math.floor(Math.random() * 4)],
                action_taken: ['BLOCKED', 'CHALLENGED', 'FLAGGED'][Math.floor(Math.random() * 3)],
                severity: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'][Math.floor(Math.random() * 4)]
            };

            const payload = `data: ${JSON.stringify(mockEvent)}\n\n`;
            await writer.write(encoder.encode(payload));
        } catch (e) {
            clearInterval(intervalId);
            clearInterval(threatInterval);
        }
    };

    const threatInterval = setInterval(generateMockThreat, 1500);

    req.signal.addEventListener('abort', () => {
        clearInterval(intervalId);
        clearInterval(threatInterval);
        writer.close();
    });

    return new Response(stream.readable, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
        },
    });
}
