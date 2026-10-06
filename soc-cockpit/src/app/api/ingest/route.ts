import { NextRequest, NextResponse } from 'next/server';
import { ThreatEventSchema } from '../../../lib/schemas/threatEvent';
import { createClient } from '@supabase/supabase-js';

// Avoid initializing at the top level to prevent build-time crashes if env vars are missing
function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL || 'http://localhost:54321';
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.AXIM_SERVICE_ROLE_KEY || 'dummy_key_for_build';
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false }
  });
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  try {
    const authHeader = request.headers.get('authorization');
    const expectedKey = process.env.ASGUARD_API_KEY || 'default_ingest_token';

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
    let bodyData: any;
    try {
      bodyData = JSON.parse(rawBody);
    } catch (e) {
      return NextResponse.json({ error: "Invalid JSON payload", code: 400 }, { status: 400, headers: corsHeaders });
    }

    // Validate with Zod
    const parseResult = ThreatEventSchema.safeParse(bodyData);
    if (!parseResult.success) {
      return NextResponse.json({ error: "Invalid payload schema", code: 400, details: parseResult.error }, { status: 400, headers: corsHeaders });
    }

    const validatedData = parseResult.data;

    // Persist to Supabase
    let eventId = validatedData.id;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.AXIM_SERVICE_ROLE_KEY || '';
    if (supabaseServiceRoleKey && supabaseServiceRoleKey !== 'dummy_key_for_build') {
       const supabase = getSupabaseClient();
       const mappedVerdict = validatedData.verdict || (validatedData.action_taken === 'QUARANTINE' ? 'quarantine' : validatedData.action_taken === 'DELIVER' ? 'allow' : 'block');
       const mappedScore = validatedData.threat_score || validatedData.score || 0;

       const { data, error } = await supabase
         .from('threat_events')
         .insert([{
             id: validatedData.id,
             timestamp: validatedData.timestamp ? new Date(validatedData.timestamp).toISOString() : new Date().toISOString(),
             source_ip: validatedData.source_ip || validatedData.sender,
             sender_email: validatedData.sender_email || validatedData.sender,
             recipient: validatedData.recipient,
             subject: validatedData.subject,
             verdict: mappedVerdict.toLowerCase(),
             threat_score: mappedScore,
             threat_type: validatedData.threat_type || validatedData.threat_level?.toLowerCase() || 'unknown',
             indicators: validatedData.indicators || [],
             raw_headers: {},
             metadata: validatedData
         }])
         .select()
         .single();

       if (!error && data) {
          eventId = data.id;
       } else if (error) {
          console.error("Supabase insert error:", error);
       }
    }

    // Attempt to broadcast to internal edge stream url to support SSE
    try {
        const streamBase = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
        await fetch(`${streamBase}/api/ingest/stream`, {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({...validatedData, id: eventId})
        });
    } catch(e) {
        console.warn("SSE Broadcast failed", e);
    }

    const latencyMs = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      ingestedId: eventId,
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
