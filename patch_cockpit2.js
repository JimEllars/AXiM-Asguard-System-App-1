const fs = require('fs');
const file = 'soc-cockpit/src/components/LiveThreatFeed.tsx';
let code = fs.readFileSync(file, 'utf8');

const oldInterface = `interface AnomalyQueue {
  anomalyIp: string;
  requestCount1h: number;
  timestamp: number;
  status: "pending_onyx_triage";
}`;

const newInterface = `interface AnomalyQueueItem {
  anomalyIp: string;
  requestCount1h: number;
  timestamp: number;
  status: "pending_onyx_triage";
}`;

code = code.replace(oldInterface, newInterface);
fs.writeFileSync(file, code);
