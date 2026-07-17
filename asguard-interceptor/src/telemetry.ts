import { z } from 'zod';

export const TelemetryPayloadSchema = z.object({
  sourceIp: z.string().ip(), // z.string().ip() works with zod 3.22.0
  timestamp: z.number(),
  eventType: z.enum(['authentication_failure', 'signature_tampering', 'suspicious_activity', 'client_error']),
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
  appOrigin: z.enum([
    'AXiM Academy',
    'The Green Machine',
    'Nexus CRM',
    'Web3 Frontend',
    'AXiM Macro Core Gateway'
  ]).catch('AXiM Macro Core Gateway'),
});

export type TelemetryPayload = z.infer<typeof TelemetryPayloadSchema>;
