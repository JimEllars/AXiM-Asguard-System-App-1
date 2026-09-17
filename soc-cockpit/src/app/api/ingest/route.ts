import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const expectedKey = process.env.ASGUARD_INGEST_KEY || 'default_ingest_key';

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: "unauthorized", code: 401 }, { status: 401 });
    }

    const token = authHeader.substring(7);
    if (token !== expectedKey) {
      return NextResponse.json({ error: "unauthorized", code: 401 }, { status: 401 });
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return NextResponse.json({ error: "Invalid JSON payload", code: 400 }, { status: 400 });
    }

    const interceptorUrl = process.env.NEXT_PUBLIC_INTERCEPTOR_URL || 'https://asguard.local';
    const pipelineSecret = process.env.ONYX_PIPELINE_SECRET || 'default_pipeline_secret';
    const correlationId = request.headers.get('x-correlation-id') || undefined;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Asguard-Auth': pipelineSecret
    };
    if (correlationId) {
      headers['x-correlation-id'] = correlationId;
    }

    if (typeof body === 'object' && body !== null && correlationId) {
       body.correlationId = correlationId;
    }

    const response = await fetch(`${interceptorUrl}/telemetry`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
       return NextResponse.json({ error: "Failed to ingest" }, { status: response.status });
    }

    const result = await response.text();
    return NextResponse.json({ message: result }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
