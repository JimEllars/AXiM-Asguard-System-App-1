const fs = require('fs');
const file = 'asguard-interceptor/src/index.ts';
let code = fs.readFileSync(file, 'utf8');

const oldHealthQueue = `        let anomaly_queue = null;
        if (anomalyQueueRaw) {
          try {
            anomaly_queue = JSON.parse(anomalyQueueRaw);
          } catch(e) {}
        }`;

const newHealthQueue = `        let anomaly_queue = null;
        if (anomalyQueueRaw) {
          try {
            const parsed = JSON.parse(anomalyQueueRaw);
            anomaly_queue = Array.isArray(parsed) ? parsed : [parsed];
          } catch(e) {}
        }`;

code = code.replace(oldHealthQueue, newHealthQueue);
fs.writeFileSync(file, code);
