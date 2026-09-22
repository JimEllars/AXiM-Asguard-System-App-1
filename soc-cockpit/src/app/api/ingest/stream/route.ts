import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  // If we receive a POST request to this endpoint with a target upstream URL,
  // we proxy it and apply the transform stream for SSE keep-alives and \n\n framing.
  const { url, headers, body } = await request.json().catch(() => ({ url: '', headers: {}, body: null }));

  if (!url) {
      return new NextResponse("Bad Request", { status: 400 });
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  let interval: NodeJS.Timeout;
  let isAborted = false;

  const startStream = async () => {
    try {
      interval = setInterval(() => {
        if (!isAborted) writer.write(encoder.encode(`: keepalive\n\n`)).catch(() => {});
      }, 20000);

      const upstream = await fetch(url, {
         method: "POST",
         headers: headers || {},
         body: body ? JSON.stringify(body) : undefined
      });

      if (upstream.body) {
         const reader = upstream.body.getReader();
         let buffer = '';
         while(!isAborted) {
            const { done, value } = await reader.read();
            if (done) {
               if (buffer.trim() && !isAborted) {
                  await writer.write(encoder.encode(`${buffer}\n\n`)).catch(() => {});
               }
               break;
            }
            const text = decoder.decode(value, { stream: true });
            buffer += text;

            // Handle raw \n\n frames and SSE comments
            const parts = buffer.split('\n\n');
            buffer = parts.pop() || ''; // Keep the incomplete chunk in the buffer

            for (let i = 0; i < parts.length; i++) {
               const part = parts[i];
               if (part.startsWith(': keepalive')) continue; // Strip SSE keep-alive comments from upstream

               if (part.trim() && !isAborted) {
                  await writer.write(encoder.encode(`${part}\n\n`)).catch(() => {});
               }
            }
         }
      }

    } catch (err) {
      console.error('Stream processing error:', err);
    } finally {
      clearInterval(interval);
      if (!isAborted) writer.close().catch(() => {});
    }
  };

  request.signal.addEventListener('abort', () => {
    isAborted = true;
    clearInterval(interval);
    writer.close().catch(() => {});
  });

  startStream();

  return new NextResponse(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    }
  });
}

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();

  // Create a TransformStream to handle backpressure and proper piping
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  let isAborted = false;
  let interval: NodeJS.Timeout;

  const startStream = async () => {
    try {
      // Send an initial connected message
      if (!isAborted) await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'connected' })}\n\n`)).catch(() => {});

      const sendEvent = async (data: any) => {
        try {
          if (!isAborted) await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch (err: any) {
          console.error(JSON.stringify({
             level: "error",
             message: "Stream write error",
             error: err.message,
             timestamp: new Date().toISOString()
          }));
        }
      };

      // Heartbeat ping to prevent Cloudflare edge gateway timeouts every 20 seconds
      interval = setInterval(() => {
        if (!isAborted) {
           writer.write(encoder.encode(`: keepalive\n\n`)).catch(() => {});
           sendEvent({ type: 'ping', timestamp: new Date().toISOString() });
        }
      }, 20000);

    } catch (err) {
      console.error('Stream initialization error:', err);
      clearInterval(interval);
      if (!isAborted) writer.close().catch(() => {});
    }
  };

  request.signal.addEventListener('abort', () => {
    isAborted = true;
    clearInterval(interval);
    writer.close().catch(() => {});
  });

  startStream();

  return new NextResponse(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    }
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }
  });
}
