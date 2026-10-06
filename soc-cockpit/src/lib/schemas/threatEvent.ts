import { z } from 'zod';

export const ThreatEventSchema = z.object({
  id: z.string().uuid().optional(),
  timestamp: z.string().or(z.number()).optional(),
  source_ip: z.string().optional(),
  sender_email: z.string().optional(),
  recipient: z.string().optional(),
  subject: z.string().optional(),
  threat_level: z.enum(['BENIGN', 'SUSPICIOUS', 'MALICIOUS']).optional(),
  score: z.number().optional(),
  action_taken: z.enum(['DELIVER', 'FLAG', 'QUARANTINE', 'block', 'allow', 'quarantine']).optional(),
  indicators: z.array(z.string()).optional(),
  raw_snippet: z.string().optional(),

  // Aligning with older AsguardTelemetryEvent payload if needed
  threat_type: z.string().optional(),
  verdict: z.enum(['allow', 'quarantine', 'block']).optional(),
  threat_score: z.number().optional()
}).catchall(z.unknown());
