const fs = require('fs');
const file = 'soc-cockpit/src/components/LiveThreatFeed.tsx';
let code = fs.readFileSync(file, 'utf8');

const interfaceQueue = `interface AnomalyQueue {`;
const newInterfaceQueue = `interface AnomalyQueueItem {`;

code = code.replace(interfaceQueue, newInterfaceQueue);
fs.writeFileSync(file, code);
