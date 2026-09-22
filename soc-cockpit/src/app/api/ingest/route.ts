import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Replicate the shared type here since they are separate repos
export interface AsguardTelemetryEvent {
  id: string;
  timestamp: string;
  sender: string;
  recipient: string;
  subject: string;
  threat_level: 'BENIGN' | 'SUSPICIOUS' | 'MALICIOUS';
  score: number;
  action_taken: 'DELIVER' | 'FLAG' | 'QUARANTINE';
  indicators: string[];
  raw_snippet?: string;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  try {
    const authHeader = request.headers.get('authorization');
    const expectedKey = process.env.INGEST_TOKEN || 'default_ingest_token';

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new NextResponse(null, { status: 204, headers: corsHeaders });
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: "unauthorized", code: 401 }, { status: 401, headers: corsHeaders });
    }

    const token = authHeader.substring(7);

    // Constant time bitwise comparison for edge
    let isMatch = token.length === expectedKey.length;
    if (isMatch) {
        for (let i = 0; i < expectedKey.length; i++) {
           if (token[i] !== expectedKey[i]) {
               isMatch = false;
           }
        }
    }

    if (!isMatch) {
      return NextResponse.json({ error: "unauthorized", code: 401 }, { status: 401, headers: corsHeaders });
    }

    const rawBody = await request.text();
    let bodyData: AsguardTelemetryEvent;
    try {
      bodyData = JSON.parse(rawBody) as AsguardTelemetryEvent;
    } catch (e) {
      return NextResponse.json({ error: "Invalid JSON payload", code: 400 }, { status: 400, headers: corsHeaders });
    }

    // Attempt to broadcast to internal edge stream url to support SSE
    try {
        const streamBase = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
        await fetch(`${streamBase}/api/ingest/stream`, {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify(bodyData)
        });
    } catch(e) {
        // Broadcast failure shouldn't fail ingestion
        console.warn("SSE Broadcast failed", e);
    }

    const latencyMs = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      ingestedId: bodyData.id,
      latencyMs
    }, { status: 202, headers: corsHeaders });
  } catch (err: any) {
    console.error(JSON.stringify({
       level: "error",
       message: "Internal Server Error",
       error: err.message,
       timestamp: new Date().toISOString()
    }));
    return NextResponse.json({ error: "Internal Server Error", code: 500 }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }
  });
}
