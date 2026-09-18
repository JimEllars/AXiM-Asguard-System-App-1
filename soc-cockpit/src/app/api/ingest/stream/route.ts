import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();

  // Create a TransformStream to handle backpressure and proper piping
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  let interval: NodeJS.Timeout;

  const startStream = async () => {
    try {
      // Send an initial connected message
      await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'connected' })}\n\n`));

      const sendEvent = async (data: any) => {
        try {
          await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch (err: any) {
          console.error(JSON.stringify({
             level: "error",
             message: "Stream write error",
             error: err.message,
             timestamp: new Date().toISOString()
          }));
        }
      };

      // Mock interval for streaming real-time events based on database polling or redis pubsub
      interval = setInterval(() => {
        // Heartbeat ping to prevent Cloudflare edge gateway timeouts
        writer.write(encoder.encode(`: ping\n\n`)).catch(() => {});
        sendEvent({ type: 'ping', timestamp: new Date().toISOString() });
      }, 15000);

      // Handle stream disconnect
      request.signal.addEventListener('abort', () => {
        clearInterval(interval);
        writer.close().catch(() => {});
      });

    } catch (err) {
      console.error('Stream initialization error:', err);
    }
  };

  startStream();

  return new NextResponse(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    }
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }
  });
}
