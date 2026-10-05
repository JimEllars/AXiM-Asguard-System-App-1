import { NextResponse } from 'next/server';
import crypto from 'crypto';

export async function POST(req: Request) {
    try {
        const body = await req.json();

        // Construct OnyxDispatchPayload
        const payload = {
            source: "axim-asguard-system",
            task_type: "FIREWALL_RULE_GENERATION",
            priority: "HIGH",
            details: {
                threat_signature: body.threat_signature || 'Unknown',
                target_paths: body.target_paths || [],
                sample_payload: body.sample_payload || '',
                recommended_action: "BLOCK_PATTERN",
                origin_metadata: body.origin_metadata || {},
                severity: body.severity || 'HIGH',
            }
        };

        const stringifiedPayload = JSON.stringify(payload);

        // Generate HMAC-SHA256 signature using mock secret for verification
        const mockSecret = 'super-secret-key-that-is-at-least-32-bytes-long-for-testing';
        const signature = crypto.createHmac('sha256', mockSecret).update(stringifiedPayload).digest('hex');

        // Dispatch to Onyx Agent
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const agentEndpoint = process.env.ONYX_AGENT_ENDPOINT || 'https://coding-lab.axim.us.com/api/v1/tasks/dispatch';

        const res = await fetch(agentEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Axim-Signature': signature
            },
            body: stringifiedPayload,
            signal: controller.signal as any
        }).finally(() => clearTimeout(timeout));

        if (!res.ok) {
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

        const data = await res.json();
        return NextResponse.json({
            success: true,
            task_id: data.task_id || `task_${Date.now()}`,
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
