import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';

const TriageDispatchSchema = z.object({
    threatId: z.string().uuid(),
    action: z.enum(['quarantine_user', 'block_ip', 'revoke_session', 'isolate_host']),
    severity: z.string().optional(),
    analystNotes: z.string().optional(),
    targetValue: z.string()
});

function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL || 'http://localhost:54321';
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.AXIM_SERVICE_ROLE_KEY || 'dummy_key_for_build';
  return createClient(supabaseUrl, supabaseServiceRoleKey, { auth: { persistSession: false } });
}

export async function POST(req: Request) {
    try {
        const body = await req.json();

        const parseResult = TriageDispatchSchema.safeParse(body);
        if (!parseResult.success) {
            return NextResponse.json({ error: "Invalid payload schema", details: parseResult.error }, { status: 400 });
        }

const validatedData = parseResult.data;

        if (validatedData.action === 'block_ip') {
             const interceptorUrl = process.env.ASGUARD_INTERCEPTOR_URL || process.env.NEXT_PUBLIC_INTERCEPTOR_URL;
             const asguardApiKey = process.env.ASGUARD_API_KEY;

             if (interceptorUrl && asguardApiKey) {
               try {
                 await fetch(`${interceptorUrl}/blocklist`, {
                   method: 'POST',
                   headers: {
                     'Content-Type': 'application/json',
                     'X-Asguard-Auth': asguardApiKey
                   },
                   body: JSON.stringify({
                     key: `ip:${validatedData.targetValue}`,
                     action: 'block',
                     ttl: 86400,
                     note: `Blocked via SOC Cockpit by ${validatedData.analystNotes || 'analyst'}`
                   })
                 });
               } catch (err) {
                 console.error('Failed to trigger edge blocklist update:', err);
               }
             }
        }

        // Construct OnyxDispatchPayload
        let targetType = "IP";
        if (validatedData.action === 'quarantine_user' || validatedData.action === 'revoke_session') targetType = "USER_ACCOUNT";
        if (validatedData.targetValue.includes('@')) targetType = "EMAIL_SENDER";

        const payload = {
            specVersion: "1.0",
            source: "axim.asguard.cockpit",
            actionType: "SECURITY_MITIGATION",
            target: {
               type: targetType,
               value: validatedData.targetValue
            },
            threatContext: {
               eventId: validatedData.threatId,
               score: validatedData.severity === 'HIGH' ? 90 : 50,
               category: validatedData.action
            },
            dispatchTimestamp: new Date().toISOString()
        };

        const stringifiedPayload = JSON.stringify(payload);

        // Generate HMAC-SHA256 signature using mock secret for verification
        const mockSecret = 'super-secret-key-that-is-at-least-32-bytes-long-for-testing';
        const signature = crypto.createHmac('sha256', mockSecret).update(stringifiedPayload).digest('hex');

        // Dispatch to Onyx Agent
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const agentEndpoint = process.env.ONYX_AGENT_ENDPOINT || 'https://coding-lab.axim.us.com/api/v1/tasks/dispatch';

        let res;
        let dispatchStatus = 'failed';
        try {
           res = await fetch(agentEndpoint, {
               method: 'POST',
               headers: {
                   'Content-Type': 'application/json',
                   'X-Axim-Signature': signature
               },
               body: stringifiedPayload,
               signal: controller.signal as any
           });

           if (res.ok) dispatchStatus = 'acknowledged';
        } catch(e) {
           console.error("Agent dispatch failed, moving on to audit log");
        } finally {
           clearTimeout(timeout);
        }

        // Record action to Supabase
        const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.AXIM_SERVICE_ROLE_KEY || '';
        if (supabaseServiceRoleKey && supabaseServiceRoleKey !== 'dummy_key_for_build') {
           const supabase = getSupabaseClient();
           await supabase
             .from('triage_actions')
             .insert([{
                event_id: validatedData.threatId,
                analyst_id: 'system_analyst', // Replace with actual user ID from auth context if available
                agent_id: 'onyx_agent_1',
                action_taken: validatedData.action,
                onyx_dispatch_status: dispatchStatus,
                dispatch_payload: payload
             }]);
        }

        if (res && !res.ok) {
           let errorDetail = 'Unknown Error';
           try {
             const errorBody = await res.text();
             errorDetail = errorBody;
           } catch(e) {}
           return NextResponse.json({
              success: false,
              error: 'Onyx Agent dispatch failed',
              status_code: res.status,
              details: errorDetail
           }, { status: 502 });
        }

        return NextResponse.json({
            success: true,
            task_id: `task_${Date.now()}`,
            status: dispatchStatus,
            audit_trace: {
                dispatched_at: new Date().toISOString(),
                endpoint: agentEndpoint,
                payload_hash: crypto.createHash('sha256').update(stringifiedPayload).digest('hex')
            }
        }, { status: 200 });

    } catch (e: any) {
        // Fallback for mock environment testing
        return NextResponse.json({
            success: false,
            error: e.message || 'Dispatch exception occurred',
            task_id: `mock_task_${Date.now()}`
        }, { status: 200 });
    }
}
