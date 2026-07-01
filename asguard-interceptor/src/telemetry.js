import { z } from 'zod';
export const TelemetryPayloadSchema = z.object({
    sourceIp: z.string().ip(), // z.string().ip() works with zod 3.22.0
    timestamp: z.number(),
    eventType: z.enum(['authentication_failure', 'signature_tampering', 'suspicious_activity']),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    details: z.record(z.unknown()).optional(),
});
//# sourceMappingURL=telemetry.js.map