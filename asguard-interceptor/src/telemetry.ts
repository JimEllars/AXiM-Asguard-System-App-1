import { z } from 'zod';

export const TelemetryPayloadSchema = z.object({
  sourceIp: z.string().ip(),
  timestamp: z.number(),
  eventType: z.enum(['authentication_failure', 'signature_tampering', 'suspicious_activity', 'client_error', 'threat.blocked', 'rate_limit.exceeded', 'bot_challenge.failed', 'ip.quarantined', 'onyx_pipeline_job_executed', 'telephony.threat_evaluated']),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  requestMethod: z.string().optional(),
  targetResource: z.string().optional(),
  signatureMetadata: z.string().optional(),
  details: z.record(z.unknown()).optional(),
  country: z.string().optional(),
  colo: z.string().optional(),
  web3WalletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  edgeBotScore: z.number().optional(),
  botScore: z.number().optional(),
  aiThreatFlag: z.boolean().optional(),
  appOrigin: z.enum([
    'AXiM Academy',
    'The Green Machine',
    'Nexus CRM',
    'Web3 Frontend',
    'AXiM Macro Core Gateway',
    'AXiM Onyx Pipeline',
    'axim-asguard'
  ]).catch('AXiM Macro Core Gateway'),
});

export type TelemetryPayload = z.infer<typeof TelemetryPayloadSchema>;

export async function logToSupabase(payload: TelemetryPayload, env: any) {
  try {
    const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock.supabase.co';
    const supabaseKey = env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'mock-key';

    const res = await fetch(`${supabaseUrl}/rest/v1/security_events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        source_ip: payload.sourceIp,
        timestamp: new Date(payload.timestamp).toISOString(),
        event_type: payload.eventType,
        severity: payload.severity,
        country: payload.country,
        action_taken: payload.details?.action_taken || 'logged',
        threat_score: payload.edgeBotScore || payload.botScore || 0,
        payload_details: payload.details || {}
      })
    });

    if (!res.ok) {
       console.error(`Supabase write failed: ${res.status} ${res.statusText}`);
    }
  } catch (error) {
     console.error("Failed to write to Supabase security_events:", error);
  }
}
