const fs = require('fs');
const file = 'soc-cockpit/src/components/LiveThreatFeed.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  "eventType: z.enum(['authentication_failure', 'signature_tampering', 'suspicious_activity']),",
  "eventType: z.enum(['authentication_failure', 'signature_tampering', 'suspicious_activity', 'threat.blocked', 'rate_limit.exceeded', 'bot_challenge.failed', 'ip.quarantined']),"
);

fs.writeFileSync(file, content);
console.log('patched LiveThreatFeed.tsx schema');
