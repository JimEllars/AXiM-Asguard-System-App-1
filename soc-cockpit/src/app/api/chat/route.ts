import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createDeepSeekChatStream, ChatMessage } from '@/utils/aiClient';

export const runtime = 'edge';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization') || request.headers.get('X-Asguard-Auth');
    const authCookie = request.cookies.get('asguard_auth_token') || request.cookies.get('axim_session');

    // Permit authenticated dashboard operators (via cookie) or valid tokens
    if (!authHeader && !authCookie) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!process.env.DEEPSEEK_API_KEY) {
      return NextResponse.json({ error: "AI service offline: DEEPSEEK_API_KEY not configured" }, { status: 503 });
    }

    let data;
    try {
      data = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const { messages, stream = true } = data;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'messages array is required and must not be empty' }, { status: 400 });
    }

    // Basic validation of messages array
    const validRoles = ['system', 'user', 'assistant'];
    for (const msg of messages) {
      if (!msg.role || !validRoles.includes(msg.role) || typeof msg.content !== 'string') {
        return NextResponse.json({ error: 'invalid message format' }, { status: 400 });
      }
    }

    const startTime = Date.now();
    const chatStream = await createDeepSeekChatStream(messages, {
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    });
    const ttft = Date.now() - startTime;

    // Telemetry log logic, safely async
    try {
      if (process.env.NEXT_PUBLIC_INTERCEPTOR_URL) {
        fetch(`${process.env.NEXT_PUBLIC_INTERCEPTOR_URL}/telemetry`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Asguard-Ingest-Key': process.env.TELEMETRY_INGEST_KEY || ''
          },
          body: JSON.stringify({
            event: 'chat_inference',
            model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
            ttft,
            timestamp: Date.now()
          })
        }).catch(err => console.warn("Failed to dispatch telemetry:", err.message));
      }
    } catch (e) {}

    return new Response(chatStream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache, no-transform'
      }
    });

  } catch (error: any) {
    console.error("Chat route error:", error);

    // graceful fallback
    if (error.message?.includes('AI service offline') || error.message?.includes('DEEPSEEK_API_KEY')) {
        return NextResponse.json({ error: "AI service offline: DEEPSEEK_API_KEY not configured" }, { status: 503 });
    }

    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
