const fs = require('fs');
const file = 'asguard-interceptor/src/telemetry.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  "eventType: z.enum(['authentication_failure', 'signature_tampering', 'suspicious_activity', 'client_error']),",
  "eventType: z.enum(['authentication_failure', 'signature_tampering', 'suspicious_activity', 'client_error', 'threat.blocked', 'rate_limit.exceeded', 'bot_challenge.failed', 'ip.quarantined', 'onyx_pipeline_job_executed']),"
);

fs.writeFileSync(file, content);
console.log('patched');
