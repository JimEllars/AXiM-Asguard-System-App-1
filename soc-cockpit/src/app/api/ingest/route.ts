import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { z } from 'zod';

const ThreatEventPayloadSchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  sourceIp: z.string().ip().or(z.string()), // Accept standard strings for flexibility, but could be strict ip()
  threatScore: z.number(),
  classification: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW", "BENIGN"]),
  metadata: z.record(z.string(), z.unknown()),
  signature: z.string()
});

export type ThreatEventPayload = z.infer<typeof ThreatEventPayloadSchema>;

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  try {
    const authHeader = request.headers.get('authorization');
    const expectedKey = process.env.ASGUARD_INGEST_KEY || 'default_ingest_key';
    const telemetrySecret = process.env.AXIM_TELEMETRY_SECRET || 'default_telemetry_secret';

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-correlation-id',
    };

    if (request.method === 'OPTIONS') {
      return new NextResponse(null, { status: 204, headers: corsHeaders });
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: "unauthorized", code: 401 }, { status: 401, headers: corsHeaders });
    }

    const token = authHeader.substring(7);
    if (token.length !== expectedKey.length || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expectedKey))) {
      return NextResponse.json({ error: "unauthorized", code: 401 }, { status: 401, headers: corsHeaders });
    }

    const rawBody = await request.text();
    let bodyData: unknown;
    try {
      bodyData = JSON.parse(rawBody);
    } catch (e) {
      return NextResponse.json({ error: "Invalid JSON payload", code: 400 }, { status: 400, headers: corsHeaders });
    }

    const parseResult = ThreatEventPayloadSchema.safeParse(bodyData);
    if (!parseResult.success) {
      return NextResponse.json({
        error: "Malformed payload schema",
        code: 400,
        issues: parseResult.error.issues
      }, { status: 400, headers: corsHeaders });
    }

    const body = parseResult.data;

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
      console.warn(JSON.stringify({
         level: "warn",
         message: "Signature mismatch",
         expected: expectedSignature,
         got: body.signature,
         timestamp: new Date().toISOString()
      }));
      return NextResponse.json({ error: "Invalid signature", code: 401 }, { status: 401, headers: corsHeaders });
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

    const fetchBody: Record<string, unknown> = { ...body };
    if (correlationId) {
       fetchBody.correlationId = correlationId;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    let response;
    try {
       response = await fetch(`${interceptorUrl}/telemetry`, {
         method: 'POST',
         headers,
         body: JSON.stringify(fetchBody),
         signal: controller.signal as any
       });
       clearTimeout(timeout);
    } catch (e: any) {
       clearTimeout(timeout);
       console.error(JSON.stringify({
          level: "error",
          message: "Interceptor connection failed",
          error: e.message,
          timestamp: new Date().toISOString()
       }));
       return NextResponse.json({ error: "Interceptor unreachable", code: 502 }, { status: 502, headers: corsHeaders });
    }

    if (!response.ok) {
       return NextResponse.json({ error: "Failed to ingest" }, { status: response.status, headers: corsHeaders });
    }

    const latencyMs = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      ingestedId: body.id,
      latencyMs
    }, { status: 200, headers: corsHeaders });
  } catch (err: any) {
    console.error(JSON.stringify({
       level: "error",
       message: "Internal Server Error",
       error: err.message,
       timestamp: new Date().toISOString()
    }));
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-correlation-id',
    }
  });
}
