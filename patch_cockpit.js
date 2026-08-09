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

const oldState = `const [anomalyQueue, setAnomalyQueue] = useState<AnomalyQueue | null>(null);`;
const newState = `const [anomalyQueue, setAnomalyQueue] = useState<AnomalyQueueItem[]>([]);`;

code = code.replace(oldState, newState);

// fix health parser (there are 3 occurrences)
code = code.replace(/if \(healthData\.anomaly_queue\) setAnomalyQueue\(healthData\.anomaly_queue\);/g, "if (healthData.anomaly_queue) setAnomalyQueue(Array.isArray(healthData.anomaly_queue) ? healthData.anomaly_queue : [healthData.anomaly_queue]);");


fs.writeFileSync(file, code);
