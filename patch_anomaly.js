const fs = require('fs');
const file = 'soc-cockpit/src/components/LiveThreatFeed.tsx';
let content = fs.readFileSync(file, 'utf8');

// There's a parse issue, the code was inserted at the very end or wrong place.
// Let's remove it and insert it carefully.
const bannerBlock = `
          {anomalyQueue?.status === 'pending_onyx_triage' && (
            <div
              onClick={() => setShowTriageModal(true)}
              className="mb-6 border border-amber-500/50 bg-amber-500/10 rounded font-mono p-4 text-center text-sm text-amber-500 cursor-pointer hover:bg-amber-500/20 transition-colors animate-pulse"
            >
              [ ONYX ANOMALY QUEUE: IP {anomalyQueue.anomalyIp} ({anomalyQueue.requestCount1h} req/hr) STAGED FOR TRIAGE ]
            </div>
          )}
`;

content = content.replace(bannerBlock, '');

const targetGrid = '<div className="grid grid-cols-1 md:grid-cols-3 gap-6">';
if (content.includes(targetGrid)) {
  content = content.replace(targetGrid, bannerBlock + targetGrid);
} else {
  console.log('could not find target grid');
}

fs.writeFileSync(file, content, 'utf8');
console.log('patched');
