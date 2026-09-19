import { z } from 'zod';

export const TelemetryPayloadSchema = z.object({
  sourceIp: z.string().ip(),
  originCountry: z.string().optional(),
  timestamp: z.union([z.number(), z.string()]),
  threatLevel: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO', 'BENIGN']).optional(),
  targetVector: z.enum(['Email', 'API', 'Auth', 'Pipeline']).optional(),
  eventType: z.enum(['authentication_failure', 'signature_tampering', 'suspicious_activity', 'client_error', 'threat.blocked', 'rate_limit.exceeded', 'bot_challenge.failed', 'ip.quarantined', 'onyx_pipeline_job_executed', 'telephony.threat_evaluated', 'ai_inference_executed']),
  requestId: z.string().optional(),
  correlationId: z.string().optional(),
  clientIp: z.string().optional(),
  rayId: z.string().optional(),
  processingDuration: z.number().optional(),
  executionDuration: z.number().optional(),
  actionTaken: z.enum(['QUARANTINED', 'DROPPED', 'FLAGGED', 'INSPECTED', 'logged']).optional(),
  threatScore: z.number().optional(),
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

export interface ThreatEventPayload {
  id: string;
  timestamp: number | string;
  sourceIp: string;
  originCountry?: string;
  targetVector?: string;
  actionTaken?: string;
  threatLevel?: string;
  threatScore: number;
  classification: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "BENIGN" | "INFO";
  metadata: Record<string, unknown>;
  signature: string;
}


async function hashClientIp(ip: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(ip + "AXiM-Salt-2024");
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
}

export async function logToSupabase(payload: TelemetryPayload, env: any, ctx?: any) {
  const executeLog = async () => {
    try {
      const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock.supabase.co';
      const supabaseKey = env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'mock-key';

      const ts = typeof payload.timestamp === 'number' ? new Date(payload.timestamp).toISOString() : new Date(payload.timestamp).toISOString();
      const hashedIp = payload.sourceIp ? await hashClientIp(payload.sourceIp) : 'unknown';

      // Structured Payload logic:
      const structuredPayload = {
          timestamp: ts,
          clientIpHash: hashedIp,
          geo: payload.originCountry || payload.country || 'XX',
          colo: payload.colo || 'UNKNOWN',
          threatScore: payload.threatScore || payload.edgeBotScore || payload.botScore || 0,
          ruleMatches: payload.details?.ruleMatches || [],
          executionLatencyMs: payload.executionDuration || payload.processingDuration || 0,
          eventType: payload.eventType,
          severity: payload.severity,
          actionTaken: payload.actionTaken || (payload.details?.action_taken as string) || 'logged',
          requestId: payload.requestId,
      };

      let fallbackRes: Promise<any> = Promise.resolve();
      // Fallback Dispatch to central AXiM Core backend ingest
      if (env.AXIM_CORE_INGEST_URL) {
          fallbackRes = fetch(env.AXIM_CORE_INGEST_URL, {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${env.AXIM_CORE_INGEST_KEY || ''}`
              },
              body: JSON.stringify(structuredPayload)
          }).catch(e => {
               console.error(JSON.stringify({
                   level: "warn",
                   message: "Central ingest fallback failed",
                   error: e.message,
                   timestamp: ts
               }));
          });
      }

      const resPromise = fetch(`${supabaseUrl}/rest/v1/telemetry_events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          source_ip: payload.sourceIp,
          timestamp: ts,
          event_type: payload.eventType,
          severity: payload.severity,
          country: payload.originCountry || payload.country,
          action_taken: payload.actionTaken || (payload.details?.action_taken as string) || 'logged',
          threat_score: payload.threatScore || payload.edgeBotScore || payload.botScore || 0,
          request_id: payload.requestId,
          execution_duration: payload.executionDuration,
          payload_details: {
            ...payload.details,
            threatLevel: payload.threatLevel,
            targetVector: payload.targetVector
          }
        })
      });

      const [resSettled, _] = await Promise.allSettled([resPromise, fallbackRes]);

      if (resSettled.status === 'fulfilled') {
          const res = resSettled.value;
          if (!res.ok) {
             console.error(JSON.stringify({
                 level: "error",
                 message: `Supabase write failed`,
                 status: res.status,
                 statusText: res.statusText,
                 timestamp: new Date().toISOString()
             }));
          }
      } else {
          console.error(JSON.stringify({
             level: "error",
             message: `Supabase write failed completely`,
             error: resSettled.reason?.message,
             timestamp: new Date().toISOString()
          }));
      }
    } catch (error: any) {
       console.error(JSON.stringify({
           level: "error",
           message: "Failed to write to Supabase telemetry_events",
           error: error.message,
           timestamp: new Date().toISOString()
       }));
    }
  };

  if (ctx && ctx.waitUntil) {
    ctx.waitUntil(executeLog().catch(e => console.error(JSON.stringify({
       level: "error",
       message: "Unhandled error in logToSupabase background task",
       error: e.message,
       timestamp: new Date().toISOString()
    }))));
  } else {
    await executeLog().catch(e => console.error(JSON.stringify({
       level: "error",
       message: "Unhandled error in logToSupabase execution",
       error: e.message,
       timestamp: new Date().toISOString()
    })));
  }
}

export function logAIInference(usage: any, provider: string, ttft: number, failover: boolean = false, env?: any, ctx?: any) {
  let promptCacheHitRatio = 0;
  let promptCacheHitTokens = 0;
  let promptCacheMissTokens = 0;

  if (usage) {
    // Deepseek reports cache hits in usage.prompt_cache_hit_tokens
    promptCacheHitTokens = usage.prompt_cache_hit_tokens || 0;
    promptCacheMissTokens = usage.prompt_cache_miss_tokens || usage.prompt_tokens - promptCacheHitTokens || 0;
    const totalPromptTokens = promptCacheHitTokens + promptCacheMissTokens;
    if (totalPromptTokens > 0) {
      promptCacheHitRatio = (promptCacheHitTokens / totalPromptTokens) * 100;
    }
  }

  const logEntry = {
    level: "info",
    message: "AI Inference Executed",
    provider,
    ttft_ms: ttft,
    failover_occurred: failover,
    prompt_cache_hit_ratio: promptCacheHitRatio,
    prompt_cache_hit_tokens: promptCacheHitTokens,
    prompt_cache_miss_tokens: promptCacheMissTokens,
    timestamp: new Date().toISOString()
  };

  console.log(JSON.stringify(logEntry));

  if (env) {
      const payload: TelemetryPayload = {
          sourceIp: '127.0.0.1', // Background system task
          timestamp: Date.now(),
          threatLevel: 'INFO',
          eventType: 'ai_inference_executed',
          severity: 'low',
          appOrigin: 'axim-asguard',
          executionDuration: ttft,
          details: {
              provider,
              failover_occurred: failover,
              prompt_cache_hit_ratio: promptCacheHitRatio,
              prompt_cache_hit_tokens: promptCacheHitTokens,
              prompt_cache_miss_tokens: promptCacheMissTokens,
          }
      };

      // non-blockingly dispatch
      if (ctx && ctx.waitUntil) {
          ctx.waitUntil(logToSupabase(payload, env, ctx));
      } else {
          logToSupabase(payload, env, ctx).catch(e => console.error("Failed to log inference telemetry"));
      }
  }

  return logEntry;
}
