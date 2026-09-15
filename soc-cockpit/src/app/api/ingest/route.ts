import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const interceptorUrl = process.env.NEXT_PUBLIC_INTERCEPTOR_URL || 'https://asguard.local';
    const pipelineSecret = process.env.ONYX_PIPELINE_SECRET || 'default_pipeline_secret';

    // Relay to asguard-interceptor /telemetry (as /api/v1/ingest isn't fully set up in interceptor based on instructions)
    const response = await fetch(`${interceptorUrl}/telemetry`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Asguard-Auth': pipelineSecret
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
       return NextResponse.json({ error: "Failed to ingest" }, { status: response.status });
    }

    const result = await response.text();
    return NextResponse.json({ message: result }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
