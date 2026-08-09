const fs = require('fs');
const file = 'soc-cockpit/src/components/LiveThreatFeed.tsx';
let content = fs.readFileSync(file, 'utf8');

// Replace workerUrl with the correct value
content = content.replace('${workerUrl}/admin/anomaly/triage', '${process.env.NEXT_PUBLIC_ASGUARD_WORKER_URL}/admin/anomaly/triage');

fs.writeFileSync(file, content, 'utf8');
console.log('Fixed workerUrl');
