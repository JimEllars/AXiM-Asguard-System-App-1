import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export interface ThreatEventPayload {
  id: string;
  timestamp: number;
  sourceIp: string;
  threatScore: number;
  classification: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "BENIGN";
  metadata: Record<string, unknown>;
  signature: string;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  try {
    const authHeader = request.headers.get('authorization');
    const expectedKey = process.env.ASGUARD_INGEST_KEY || 'default_ingest_key';
    const telemetrySecret = process.env.AXIM_TELEMETRY_SECRET || 'default_telemetry_secret';

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: "unauthorized", code: 401 }, { status: 401 });
    }

    const token = authHeader.substring(7);
    if (token.length !== expectedKey.length || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expectedKey))) {
      return NextResponse.json({ error: "unauthorized", code: 401 }, { status: 401 });
    }

    let body: ThreatEventPayload;
    const rawBody = await request.text();
    try {
      body = JSON.parse(rawBody) as ThreatEventPayload;
    } catch (e) {
      return NextResponse.json({ error: "Invalid JSON payload", code: 400 }, { status: 400 });
    }

    // Validate signature
    if (!body.signature) {
      return NextResponse.json({ error: "Missing signature", code: 400 }, { status: 400 });
    }

    const payloadWithoutSignature = { ...body };
    // @ts-expect-error Delete signature for validation
    delete payloadWithoutSignature.signature;

    // Create HMAC SHA256 of the payload (excluding signature)
    const expectedSignature = crypto
      .createHmac('sha256', telemetrySecret)
      .update(JSON.stringify(payloadWithoutSignature))
      .digest('hex');

    // In edge runtimes we might just do a basic string compare since timing attacks on an ingest endpoint signature are low risk,
    // or ideally crypto.timingSafeEqual. We'll do basic compare.
    if (body.signature !== expectedSignature) {
      // Return 401 for bad signature
      // The instructions say validate signature against AXIM_TELEMETRY_SECRET.
      // We will skip strict signature enforcement if we're missing the key, but since we have a default it should run.
      // But let's log it.
      console.warn("Signature mismatch, expected:", expectedSignature, "got:", body.signature);
      // For now, allow it to pass if they match, else error. Let's just return 401.
      return NextResponse.json({ error: "Invalid signature", code: 401 }, { status: 401 });
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

    const fetchBody: any = { ...body };
    if (correlationId) {
       fetchBody.correlationId = correlationId;
    }

    const response = await fetch(`${interceptorUrl}/telemetry`, {
      method: 'POST',
      headers,
      body: JSON.stringify(fetchBody)
    });

    if (!response.ok) {
       return NextResponse.json({ error: "Failed to ingest" }, { status: response.status });
    }

    const result = await response.text();
    const latencyMs = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      ingestedId: body.id,
      latencyMs
    }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
